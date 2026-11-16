from pathlib import Path
from typing import Any, Optional
import numpy as np
import rasterio
from rasterio.mask import mask as rasterio_mask
from rasterio.warp import Resampling, calculate_default_transform, reproject
from fastapi import HTTPException
import geopandas as gpd

from backend.app.geospatial.crs_utils import extract_epsg, parse_crs, transform_bounds_to_wgs84
from backend.app.geospatial.landcover import ESA_WORLDCOVER_CLASSES


def inspect_raster_metadata(file_path: Path) -> dict[str, Any]:
    try:
        with rasterio.open(file_path) as src:
            crs_str = src.crs.to_string() if src.crs else None
            crs_obj = parse_crs(crs_str)
            epsg_code = extract_epsg(crs_obj)
            bounds = (float(src.bounds.left), float(src.bounds.bottom), float(src.bounds.right), float(src.bounds.top))
            bounds_dict = {
                "minx": bounds[0],
                "miny": bounds[1],
                "maxx": bounds[2],
                "maxy": bounds[3],
            }
            wgs84_bounds = transform_bounds_to_wgs84(bounds, crs_str) if crs_str else None
            res_x, res_y = src.res

            band_stats: list[dict[str, Any]] = []
            landcover_summary: dict[str, int] = {}

            # Sample band 1 efficiently (strided read for very large rasters so inspection stays fast)
            decimation = max(1, max(src.width, src.height) // 512)
            out_h = max(1, src.height // decimation)
            out_w = max(1, src.width // decimation)

            for band_idx in range(1, src.count + 1):
                arr = src.read(
                    band_idx,
                    out_shape=(out_h, out_w),
                    resampling=Resampling.nearest,
                )
                nodata = src.nodata
                if nodata is not None:
                    valid_mask = arr != nodata
                else:
                    valid_mask = np.isfinite(arr)

                valid_vals = arr[valid_mask]
                if valid_vals.size > 0:
                    band_stats.append({
                        "band": band_idx,
                        "dtype": str(src.dtypes[band_idx - 1]),
                        "min": float(np.min(valid_vals)),
                        "max": float(np.max(valid_vals)),
                        "mean": float(np.mean(valid_vals)),
                        "valid_sample_ratio": round(float(valid_vals.size) / float(arr.size), 4),
                    })
                else:
                    band_stats.append({
                        "band": band_idx,
                        "dtype": str(src.dtypes[band_idx - 1]),
                        "min": None,
                        "max": None,
                        "mean": None,
                        "valid_sample_ratio": 0.0,
                    })

                if band_idx == 1 and valid_vals.size > 0 and np.issubdtype(arr.dtype, np.integer):
                    unique_vals, counts = np.unique(valid_vals, return_counts=True)
                    if len(unique_vals) <= 32:
                        for val, cnt in zip(unique_vals, counts):
                            ival = int(val)
                            label = ESA_WORLDCOVER_CLASSES.get(ival, {}).get("name", f"Class {ival}")
                            landcover_summary[label] = int(cnt)

            return {
                "crs": crs_str,
                "epsg_code": epsg_code,
                "bounds_json": bounds_dict,
                "wgs84_bounds_json": wgs84_bounds,
                "width": int(src.width),
                "height": int(src.height),
                "band_count": int(src.count),
                "resolution_x": float(res_x),
                "resolution_y": float(res_y),
                "nodata_value": str(src.nodata) if src.nodata is not None else None,
                "driver": str(src.driver),
                "dtype": str(src.dtypes[0]) if src.dtypes else None,
                "landcover_summary_json": landcover_summary or None,
                "extra_json": {
                    "band_stats": band_stats,
                    "decimated_preview_factor": decimation,
                    "crs_units": crs_obj.axis_info[0].unit_name if crs_obj and crs_obj.axis_info else None,
                },
            }
    except rasterio.errors.RasterioIOError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid or unreadable GeoTIFF file: {exc}") from exc


def reproject_raster(src_path: Path, dst_path: Path, target_crs: str) -> dict[str, Any]:
    dst_crs = parse_crs(target_crs)
    if dst_crs is None:
        raise HTTPException(status_code=400, detail=f"Invalid target CRS: '{target_crs}'.")

    with rasterio.open(src_path) as src:
        if not src.crs:
            raise HTTPException(status_code=400, detail="Source raster has no CRS defined; cannot reproject.")

        transform, width, height = calculate_default_transform(
            src.crs,
            dst_crs,
            src.width,
            src.height,
            *src.bounds,
        )
        kwargs = src.meta.copy()
        kwargs.update({
            "crs": dst_crs,
            "transform": transform,
            "width": width,
            "height": height,
        })

        resampling_method = (
            Resampling.nearest if np.issubdtype(np.dtype(src.dtypes[0]), np.integer) else Resampling.bilinear
        )

        with rasterio.open(dst_path, "w", **kwargs) as dst:
            for i in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=dst_crs,
                    resampling=resampling_method,
                )

    return inspect_raster_metadata(dst_path)


def clip_raster_to_boundary(src_path: Path, boundary_geojson_path: Path, dst_path: Path) -> dict[str, Any]:
    boundary_gdf = gpd.read_file(boundary_geojson_path)
    if boundary_gdf.empty:
        raise HTTPException(status_code=400, detail="Study-area boundary file contains no geometry features.")

    with rasterio.open(src_path) as src:
        if not src.crs:
            raise HTTPException(status_code=400, detail="Source raster has no CRS defined; cannot clip to boundary.")

        if boundary_gdf.crs is None:
            boundary_gdf = boundary_gdf.set_crs("EPSG:4326")

        if boundary_gdf.crs != src.crs:
            boundary_gdf = boundary_gdf.to_crs(src.crs)

        geoms = [geom.__geo_interface__ for geom in boundary_gdf.geometry if geom is not None and not geom.is_empty]
        if not geoms:
            raise HTTPException(status_code=400, detail="Study-area boundary contains no valid polygon geometries.")

        try:
            out_image, out_transform = rasterio_mask(src, geoms, crop=True, filled=True)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Raster extent does not overlap the supplied study-area boundary: {exc}",
            ) from exc

        out_meta = src.meta.copy()
        out_meta.update({
            "driver": "GTiff",
            "height": out_image.shape[1],
            "width": out_image.shape[2],
            "transform": out_transform,
        })

        with rasterio.open(dst_path, "w", **out_meta) as dest:
            dest.write(out_image)

    return inspect_raster_metadata(dst_path)
