import json
from pathlib import Path
from typing import Any, Optional
import geopandas as gpd
import networkx as nx
import numpy as np
import pandas as pd
import rasterio
from fastapi import HTTPException
from pyproj import CRS, Transformer
from rasterio.mask import mask as rasterio_mask
from rasterio.warp import Resampling, calculate_default_transform, reproject
from shapely.geometry import Point, box

from backend.app.core.config import settings
from backend.app.geospatial.landcover import resolve_landcover
from backend.app.utils.file_storage import get_processed_output_path, validate_shapefile_zip


def _compute_neighbors(
    cell_lookup: dict[tuple[int, int], str],
    rows: int,
    cols: int,
    connectivity: int,
) -> dict[str, list[str]]:
    offsets = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if connectivity == 8:
        offsets.extend([(-1, -1), (-1, 1), (1, -1), (1, 1)])

    adjacency: dict[str, list[str]] = {}
    for (r, c), uid in cell_lookup.items():
        nbrs = []
        for dr, dc in offsets:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) in cell_lookup:
                nbrs.append(cell_lookup[(nr, nc)])
        adjacency[uid] = nbrs
    return adjacency


def _sample_elevation_at_points(
    elevation_raster_path: Optional[Path],
    coords_wgs84: list[tuple[float, float]],
) -> list[Optional[float]]:
    if not elevation_raster_path or not elevation_raster_path.exists():
        return [None] * len(coords_wgs84)

    with rasterio.open(elevation_raster_path) as elev_src:
        if not elev_src.crs:
            return [None] * len(coords_wgs84)
        transformer = Transformer.from_crs("EPSG:4326", elev_src.crs, always_xy=True)
        transformed_pts = [transformer.transform(lon, lat) for lon, lat in coords_wgs84]
        nodata = elev_src.nodata
        values: list[Optional[float]] = []
        for sample_arr in elev_src.sample(transformed_pts):
            val = float(sample_arr[0])
            if np.isnan(val) or (nodata is not None and val == float(nodata)):
                values.append(None)
            else:
                values.append(round(val, 2))
        return values


def build_grid_from_raster(
    source_dataset_id: int,
    raster_path: Path,
    target_resolution_meters: float,
    max_dimension: int,
    connectivity: int,
    boundary_geojson_path: Optional[Path] = None,
    clip_to_boundary: bool = True,
    elevation_raster_path: Optional[Path] = None,
) -> dict[str, Any]:
    working_raster = raster_path
    clipped_applied = False
    temp_clipped_path: Optional[Path] = None

    with rasterio.open(raster_path) as src:
        if not src.crs:
            raise HTTPException(status_code=400, detail="Source GeoTIFF has no CRS; assign or reproject before grid generation.")
        native_res_str = f"{round(abs(src.res[0]), 6)} x {round(abs(src.res[1]), 6)} ({src.crs.to_string()})"

    if clip_to_boundary and boundary_geojson_path and boundary_geojson_path.exists():
        boundary_gdf = gpd.read_file(boundary_geojson_path)
        if not boundary_gdf.empty:
            with rasterio.open(raster_path) as src:
                if boundary_gdf.crs is None:
                    boundary_gdf = boundary_gdf.set_crs("EPSG:4326")
                if boundary_gdf.crs != src.crs:
                    boundary_gdf = boundary_gdf.to_crs(src.crs)
                geoms = [g.__geo_interface__ for g in boundary_gdf.geometry if g is not None and not g.is_empty]
                try:
                    out_image, out_transform = rasterio_mask(src, geoms, crop=True, filled=True)
                except ValueError as exc:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Source raster does not overlap the active study-area boundary: {exc}",
                    ) from exc

                out_meta = src.meta.copy()
                out_meta.update({
                    "driver": "GTiff",
                    "height": out_image.shape[1],
                    "width": out_image.shape[2],
                    "transform": out_transform,
                })
                temp_clipped_path = get_processed_output_path("clipped_tmp", ".tif")
                with rasterio.open(temp_clipped_path, "w", **out_meta) as dst:
                    dst.write(out_image)
                working_raster = temp_clipped_path
                clipped_applied = True

    metric_crs = CRS.from_string(settings.target_metric_crs)

    with rasterio.open(working_raster) as src:
        # Calculate metric dimensions in EPSG:32643
        dst_transform, dst_w, dst_h = calculate_default_transform(
            src.crs,
            metric_crs,
            src.width,
            src.height,
            *src.bounds,
        )

        minx, miny, maxx, maxy = rasterio.transform.array_bounds(dst_h, dst_w, dst_transform)
        width_m = max(1.0, maxx - minx)
        height_m = max(1.0, maxy - miny)

        raw_cols = max(1, int(np.ceil(width_m / target_resolution_meters)))
        raw_rows = max(1, int(np.ceil(height_m / target_resolution_meters)))

        scale_factor = max(raw_cols / max_dimension, raw_rows / max_dimension, 1.0)
        cols = max(2, int(round(raw_cols / scale_factor)))
        rows = max(2, int(round(raw_rows / scale_factor)))

        effective_res_x = width_m / cols
        effective_res_y = height_m / rows
        effective_res = round((effective_res_x + effective_res_y) / 2.0, 2)

        grid_transform = rasterio.transform.from_bounds(minx, miny, maxx, maxy, cols, rows)
        nodata_val = src.nodata

        # Choose destination array dtype carefully
        band1_dtype = np.dtype(src.dtypes[0])
        is_integer_src = np.issubdtype(band1_dtype, np.integer)
        resampling = Resampling.nearest if is_integer_src else Resampling.bilinear

        dest_band1 = np.empty((rows, cols), dtype=np.float32)
        src_nodata_for_warp = nodata_val if nodata_val is not None else np.nan
        reproject(
            source=rasterio.band(src, 1),
            destination=dest_band1,
            src_transform=src.transform,
            src_crs=src.crs,
            src_nodata=src_nodata_for_warp,
            dst_transform=grid_transform,
            dst_crs=metric_crs,
            dst_nodata=np.nan,
            resampling=resampling,
        )

        # Optional NDVI estimation if multi-band imagery (>=4 bands, e.g. Sentinel-2 B4=Red, B8=NIR or 4-band RGBN)
        ndvi_grid: Optional[np.ndarray] = None
        if src.count >= 4:
            red = np.empty((rows, cols), dtype=np.float32)
            nir = np.empty((rows, cols), dtype=np.float32)
            reproject(
                source=rasterio.band(src, 3),
                destination=red,
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=grid_transform,
                dst_crs=metric_crs,
                dst_nodata=np.nan,
                resampling=Resampling.bilinear,
            )
            reproject(
                source=rasterio.band(src, 4),
                destination=nir,
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=grid_transform,
                dst_crs=metric_crs,
                dst_nodata=np.nan,
                resampling=Resampling.bilinear,
            )
            denom = nir + red
            with np.errstate(divide="ignore", invalid="ignore"):
                ndvi_grid = np.where(np.abs(denom) > 1e-6, (nir - red) / denom, np.nan)

    if temp_clipped_path and temp_clipped_path.exists():
        temp_clipped_path.unlink(missing_ok=True)

    to_wgs84 = Transformer.from_crs(metric_crs, "EPSG:4326", always_xy=True)

    cell_records: list[dict[str, Any]] = []
    valid_lookup: dict[tuple[int, int], str] = {}
    wgs84_centroids: list[tuple[float, float]] = []

    vertex_counter = 0
    for r in range(rows):
        for c in range(cols):
            val = float(dest_band1[r, c])
            is_nodata = bool(np.isnan(val) or (nodata_val is not None and val == float(nodata_val)))
            nx_center = minx + (c + 0.5) * effective_res_x
            ny_center = maxy - (r + 0.5) * effective_res_y
            lon, lat = to_wgs84.transform(nx_center, ny_center)

            cell_box = box(
                minx + c * effective_res_x,
                maxy - (r + 1) * effective_res_y,
                minx + (c + 1) * effective_res_x,
                maxy - r * effective_res_y,
            )
            cell_uid = f"R{r:03d}C{c:03d}"

            if is_nodata:
                lc_code, lc_cat = None, "NoData"
                quality = "nodata"
                orig_str = "NoData"
            else:
                lc_code, lc_cat = resolve_landcover(int(round(val)) if is_integer_src else round(val, 4))
                quality = "valid"
                orig_str = str(int(round(val)) if is_integer_src else round(val, 4))
                valid_lookup[(r, c)] = cell_uid

            ndvi_val = None
            if ndvi_grid is not None and not np.isnan(ndvi_grid[r, c]):
                ndvi_val = round(float(np.clip(ndvi_grid[r, c], -1.0, 1.0)), 4)

            wgs84_centroids.append((float(lon), float(lat)))
            cell_records.append({
                "cell_uid": cell_uid,
                "row_idx": r,
                "col_idx": c,
                "center_lon": round(float(lon), 6),
                "center_lat": round(float(lat), 6),
                "native_x": round(float(nx_center), 2),
                "native_y": round(float(ny_center), 2),
                "geometry_wkt": cell_box.wkt,
                "landcover_code": lc_code,
                "landcover_category": lc_cat,
                "original_source_value": orig_str,
                "source_dataset_id": source_dataset_id,
                "spatial_resolution": effective_res,
                "crs": metric_crs.to_string(),
                "quality_status": quality,
                "elevation_m": None,
                "vegetation_index": ndvi_val,
                "graph_vertex_id": vertex_counter,
                "neighbors_json": [],
                "metadata_json": {"resampled_from": native_res_str},
            })
            vertex_counter += 1

    elevations = _sample_elevation_at_points(elevation_raster_path, wgs84_centroids)
    adjacency = _compute_neighbors(valid_lookup, rows, cols, connectivity)

    graph = nx.Graph()
    for idx, rec in enumerate(cell_records):
        rec["elevation_m"] = elevations[idx]
        if rec["quality_status"] == "valid":
            nbrs = adjacency.get(rec["cell_uid"], [])
            rec["neighbors_json"] = nbrs
            graph.add_node(rec["cell_uid"])
            for nbr in nbrs:
                graph.add_edge(rec["cell_uid"], nbr)

    wgs84_bounds = to_wgs84.transform_bounds(minx, miny, maxx, maxy)
    return _finalize_grid_payload(
        cell_records=cell_records,
        rows=rows,
        cols=cols,
        effective_res=effective_res,
        native_res_str=native_res_str,
        crs_str=metric_crs.to_string(),
        wgs84_bounds=wgs84_bounds,
        clipped_applied=clipped_applied,
        connectivity=connectivity,
        graph=graph,
    )


def build_grid_from_tabular_or_vector(
    source_dataset_id: int,
    file_path: Path,
    file_format: str,
    csv_mapping: Optional[dict[str, Any]],
    target_resolution_meters: float,
    max_dimension: int,
    connectivity: int,
    boundary_geojson_path: Optional[Path] = None,
    clip_to_boundary: bool = True,
    elevation_raster_path: Optional[Path] = None,
) -> dict[str, Any]:
    if file_format == "csv":
        if not csv_mapping or not csv_mapping.get("latitude_column") or not csv_mapping.get("longitude_column"):
            raise HTTPException(
                status_code=400,
                detail="CSV dataset must have latitude and longitude column mapping configured before grid generation.",
            )
        df = pd.read_csv(file_path)
        lat_col = csv_mapping["latitude_column"]
        lon_col = csv_mapping["longitude_column"]
        df[lat_col] = pd.to_numeric(df[lat_col], errors="coerce")
        df[lon_col] = pd.to_numeric(df[lon_col], errors="coerce")
        df = df.dropna(subset=[lat_col, lon_col])
        if df.empty:
            raise HTTPException(status_code=400, detail="CSV contains no valid spatial coordinates.")
        geometry = [Point(xy) for xy in zip(df[lon_col], df[lat_col])]
        gdf = gpd.GeoDataFrame(df, geometry=geometry, crs=csv_mapping.get("crs") or "EPSG:4326")
        lc_col = csv_mapping.get("landcover_column")
        elev_col = csv_mapping.get("elevation_column")
    else:
        read_path = validate_shapefile_zip(file_path) if file_format == "shapefile_zip" else file_path
        gdf = gpd.read_file(read_path)
        if gdf.empty:
            raise HTTPException(status_code=400, detail="Vector dataset is empty.")
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:4326")
        lc_col = None
        for cand in ["landcover", "land_cover", "category", "class", "lc_code", "type", "DN"]:
            if cand in gdf.columns:
                lc_col = cand
                break
        elev_col = None
        for cand in ["elevation", "elev_m", "elev", "dem"]:
            if cand in gdf.columns:
                elev_col = cand
                break

    clipped_applied = False
    if clip_to_boundary and boundary_geojson_path and boundary_geojson_path.exists():
        boundary_gdf = gpd.read_file(boundary_geojson_path)
        if not boundary_gdf.empty:
            if boundary_gdf.crs is None:
                boundary_gdf = boundary_gdf.set_crs("EPSG:4326")
            if boundary_gdf.crs != gdf.crs:
                boundary_gdf = boundary_gdf.to_crs(gdf.crs)
            gdf = gpd.clip(gdf, boundary_gdf)
            if gdf.empty:
                raise HTTPException(
                    status_code=400,
                    detail="No features in dataset intersect the active study-area boundary.",
                )
            clipped_applied = True

    metric_crs = CRS.from_string(settings.target_metric_crs)
    gdf_metric = gdf.to_crs(metric_crs)
    minx, miny, maxx, maxy = [float(v) for v in gdf_metric.total_bounds]

    # Expand point bounds slightly if degenerate
    if maxx - minx < target_resolution_meters:
        maxx += target_resolution_meters
        minx -= target_resolution_meters
    if maxy - miny < target_resolution_meters:
        maxy += target_resolution_meters
        miny -= target_resolution_meters

    width_m = maxx - minx
    height_m = maxy - miny

    raw_cols = max(2, int(np.ceil(width_m / target_resolution_meters)))
    raw_rows = max(2, int(np.ceil(height_m / target_resolution_meters)))
    scale_factor = max(raw_cols / max_dimension, raw_rows / max_dimension, 1.0)
    cols = max(2, int(round(raw_cols / scale_factor)))
    rows = max(2, int(round(raw_rows / scale_factor)))

    res_x = width_m / cols
    res_y = height_m / rows
    effective_res = round((res_x + res_y) / 2.0, 2)

    to_wgs84 = Transformer.from_crs(metric_crs, "EPSG:4326", always_xy=True)

    # Spatial index lookup via sjoin
    grid_polys = []
    grid_meta = []
    for r in range(rows):
        for c in range(cols):
            x0 = minx + c * res_x
            x1 = minx + (c + 1) * res_x
            y1 = maxy - r * res_y
            y0 = maxy - (r + 1) * res_y
            grid_polys.append(box(x0, y0, x1, y1))
            grid_meta.append((r, c, (x0 + x1) / 2.0, (y0 + y1) / 2.0))

    grid_gdf = gpd.GeoDataFrame(
        {"cell_idx": list(range(len(grid_polys)))},
        geometry=grid_polys,
        crs=metric_crs,
    )
    joined = gpd.sjoin(grid_gdf, gdf_metric, how="left", predicate="intersects")

    grouped = joined.groupby("cell_idx")
    cell_records: list[dict[str, Any]] = []
    valid_lookup: dict[tuple[int, int], str] = {}
    wgs84_centroids: list[tuple[float, float]] = []

    for idx, (r, c, nx_center, ny_center) in enumerate(grid_meta):
        lon, lat = to_wgs84.transform(nx_center, ny_center)
        wgs84_centroids.append((float(lon), float(lat)))
        cell_uid = f"R{r:03d}C{c:03d}"

        sub = grouped.get_group(idx)
        has_feature = sub["index_right"].notna().any()

        if not has_feature:
            lc_code, lc_cat = None, "NoData"
            orig_val = "NoData"
            quality = "nodata"
            elev_val = None
        else:
            quality = "valid"
            valid_lookup[(r, c)] = cell_uid
            if lc_col and lc_col in sub.columns:
                non_null_lc = sub[lc_col].dropna()
                raw_lc = non_null_lc.mode().iloc[0] if not non_null_lc.empty else "Unclassified"
            else:
                raw_lc = "Observed Feature"
            lc_code, lc_cat = resolve_landcover(raw_lc)
            orig_val = str(raw_lc)
            if elev_col and elev_col in sub.columns:
                nums = pd.to_numeric(sub[elev_col], errors="coerce").dropna()
                elev_val = round(float(nums.mean()), 2) if not nums.empty else None
            else:
                elev_val = None

        cell_records.append({
            "cell_uid": cell_uid,
            "row_idx": r,
            "col_idx": c,
            "center_lon": round(float(lon), 6),
            "center_lat": round(float(lat), 6),
            "native_x": round(float(nx_center), 2),
            "native_y": round(float(ny_center), 2),
            "geometry_wkt": grid_polys[idx].wkt,
            "landcover_code": lc_code,
            "landcover_category": lc_cat,
            "original_source_value": orig_val,
            "source_dataset_id": source_dataset_id,
            "spatial_resolution": effective_res,
            "crs": metric_crs.to_string(),
            "quality_status": quality,
            "elevation_m": elev_val,
            "vegetation_index": None,
            "graph_vertex_id": idx,
            "neighbors_json": [],
            "metadata_json": {"source_format": file_format},
        })

    if elevation_raster_path:
        sampled_elevs = _sample_elevation_at_points(elevation_raster_path, wgs84_centroids)
        for idx, rec in enumerate(cell_records):
            if rec["elevation_m"] is None and sampled_elevs[idx] is not None:
                rec["elevation_m"] = sampled_elevs[idx]

    adjacency = _compute_neighbors(valid_lookup, rows, cols, connectivity)
    graph = nx.Graph()
    for rec in cell_records:
        if rec["quality_status"] == "valid":
            nbrs = adjacency.get(rec["cell_uid"], [])
            rec["neighbors_json"] = nbrs
            graph.add_node(rec["cell_uid"])
            for nbr in nbrs:
                graph.add_edge(rec["cell_uid"], nbr)

    wgs84_bounds = to_wgs84.transform_bounds(minx, miny, maxx, maxy)
    return _finalize_grid_payload(
        cell_records=cell_records,
        rows=rows,
        cols=cols,
        effective_res=effective_res,
        native_res_str=f"Vector/Tabular ({file_format})",
        crs_str=metric_crs.to_string(),
        wgs84_bounds=wgs84_bounds,
        clipped_applied=clipped_applied,
        connectivity=connectivity,
        graph=graph,
    )


def _finalize_grid_payload(
    cell_records: list[dict[str, Any]],
    rows: int,
    cols: int,
    effective_res: float,
    native_res_str: str,
    crs_str: str,
    wgs84_bounds: tuple[float, float, float, float],
    clipped_applied: bool,
    connectivity: int,
    graph: nx.Graph,
) -> dict[str, Any]:
    valid_count = sum(1 for c in cell_records if c["quality_status"] == "valid")
    nodata_count = len(cell_records) - valid_count

    geojson_features = []
    for rec in cell_records:
        if rec["quality_status"] != "valid":
            continue
        geojson_features.append({
            "type": "Feature",
            "properties": {
                "cell_uid": rec["cell_uid"],
                "row_idx": rec["row_idx"],
                "col_idx": rec["col_idx"],
                "landcover_code": rec["landcover_code"],
                "landcover_category": rec["landcover_category"],
                "elevation_m": rec["elevation_m"],
                "graph_vertex_id": rec["graph_vertex_id"],
            },
            "geometry": {
                "type": "Point",
                "coordinates": [rec["center_lon"], rec["center_lat"]],
            },
        })

    geojson_path = get_processed_output_path("grid_centroids", ".geojson")
    geojson_path.write_text(json.dumps({"type": "FeatureCollection", "features": geojson_features}))

    components = nx.number_connected_components(graph) if graph.number_of_nodes() > 0 else 0

    return {
        "rows": rows,
        "cols": cols,
        "cell_count": len(cell_records),
        "valid_cell_count": valid_count,
        "nodata_cell_count": nodata_count,
        "resolution_meters": effective_res,
        "source_resolution_native": native_res_str,
        "crs": crs_str,
        "bounds_json": {
            "minx": float(wgs84_bounds[0]),
            "miny": float(wgs84_bounds[1]),
            "maxx": float(wgs84_bounds[2]),
            "maxy": float(wgs84_bounds[3]),
        },
        "clipped_to_boundary": clipped_applied,
        "grid_geojson_path": str(geojson_path),
        "metadata_json": {
            "connectivity": connectivity,
            "graph_nodes": int(graph.number_of_nodes()),
            "graph_edges": int(graph.number_of_edges()),
            "connected_components": int(components),
        },
        "cells": cell_records,
    }
