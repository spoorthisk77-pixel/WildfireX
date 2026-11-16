from pathlib import Path
from typing import Any
import geopandas as gpd
from fastapi import HTTPException

from backend.app.geospatial.crs_utils import compute_geometry_area_sq_km, extract_epsg, parse_crs, transform_bounds_to_wgs84


def inspect_vector_dataset(vector_path: Path) -> dict[str, Any]:
    try:
        gdf = gpd.read_file(vector_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to read vector dataset: {exc}") from exc

    if gdf.empty:
        raise HTTPException(status_code=400, detail="Vector dataset contains zero features.")

    crs_str = gdf.crs.to_string() if gdf.crs else None
    crs_obj = parse_crs(crs_str)
    epsg_code = extract_epsg(crs_obj)

    geom_series = gdf.geometry
    invalid_mask = ~geom_series.is_valid | geom_series.is_empty | geom_series.isna()
    invalid_indices = [int(idx) for idx in gdf.index[invalid_mask].tolist()[:100]]
    invalid_count = int(invalid_mask.sum())

    geom_types = sorted({str(gt) for gt in geom_series.dropna().geom_type.tolist()})

    bounds_tuple = tuple(float(x) for x in gdf.total_bounds)
    bounds_dict = {
        "minx": bounds_tuple[0],
        "miny": bounds_tuple[1],
        "maxx": bounds_tuple[2],
        "maxy": bounds_tuple[3],
    }
    wgs84_bounds = transform_bounds_to_wgs84(bounds_tuple, crs_str) if crs_str else None

    non_geom_cols = [col for col in gdf.columns if col != gdf.geometry.name]
    column_schema = [
        {"name": str(col), "dtype": str(gdf[col].dtype)}
        for col in non_geom_cols
    ]

    preview_df = gdf[non_geom_cols].head(15).copy() if non_geom_cols else None
    preview_rows: list[dict[str, Any]] = []
    if preview_df is not None:
        for _, row in preview_df.iterrows():
            preview_rows.append({
                str(k): (None if str(v) == "nan" else (v.item() if hasattr(v, "item") else str(v)))
                for k, v in row.items()
            })

    return {
        "crs": crs_str,
        "epsg_code": epsg_code,
        "bounds_json": bounds_dict,
        "wgs84_bounds_json": wgs84_bounds,
        "geometry_types_json": geom_types,
        "feature_count": int(len(gdf)),
        "invalid_geometry_count": invalid_count,
        "column_schema_json": column_schema,
        "preview_rows_json": preview_rows,
        "extra_json": {
            "invalid_feature_indices": invalid_indices,
        },
    }


def extract_boundary_geojson(vector_path: Path, out_geojson_path: Path) -> dict[str, Any]:
    gdf = gpd.read_file(vector_path)
    if gdf.empty:
        raise HTTPException(status_code=400, detail="Boundary file contains zero features.")

    # Keep only polygon / multipolygon geometries
    poly_mask = gdf.geometry.notna() & ~gdf.geometry.is_empty & gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])
    poly_gdf = gdf.loc[poly_mask].copy()
    if poly_gdf.empty:
        raise HTTPException(
            status_code=400,
            detail="Study-area boundary must contain at least one Polygon or MultiPolygon feature.",
        )

    if not poly_gdf.geometry.is_valid.all():
        poly_gdf["geometry"] = poly_gdf.geometry.buffer(0)

    if poly_gdf.crs is None:
        poly_gdf = poly_gdf.set_crs("EPSG:4326")

    wgs84_gdf = poly_gdf.to_crs("EPSG:4326")
    wgs84_gdf.to_file(out_geojson_path, driver="GeoJSON")

    union_geom = wgs84_gdf.geometry.unary_union
    bounds = union_geom.bounds
    area_sq_km = compute_geometry_area_sq_km(union_geom, "EPSG:4326")

    vertex_count = 0
    if union_geom.geom_type == "Polygon":
        vertex_count = len(union_geom.exterior.coords)
    elif union_geom.geom_type == "MultiPolygon":
        vertex_count = sum(len(p.exterior.coords) for p in union_geom.geoms)

    return {
        "crs": poly_gdf.crs.to_string(),
        "area_sq_km": area_sq_km,
        "bounds_json": {
            "minx": float(bounds[0]),
            "miny": float(bounds[1]),
            "maxx": float(bounds[2]),
            "maxy": float(bounds[3]),
        },
        "vertex_count": int(vertex_count),
        "feature_count": int(len(wgs84_gdf)),
    }


def reproject_vector(src_path: Path, dst_path: Path, target_crs: str) -> dict[str, Any]:
    dst_crs = parse_crs(target_crs)
    if dst_crs is None:
        raise HTTPException(status_code=400, detail=f"Invalid target CRS: '{target_crs}'.")
    gdf = gpd.read_file(src_path)
    if gdf.crs is None:
        raise HTTPException(status_code=400, detail="Source vector dataset has no CRS defined; cannot reproject.")
    reprojected = gdf.to_crs(dst_crs)
    reprojected.to_file(dst_path, driver="GeoJSON")
    return inspect_vector_dataset(dst_path)


def clip_vector_to_boundary(src_path: Path, boundary_geojson_path: Path, dst_path: Path) -> dict[str, Any]:
    gdf = gpd.read_file(src_path)
    boundary = gpd.read_file(boundary_geojson_path)
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    if boundary.crs is None:
        boundary = boundary.set_crs("EPSG:4326")
    if gdf.crs != boundary.crs:
        boundary = boundary.to_crs(gdf.crs)
    clipped = gpd.clip(gdf, boundary)
    if clipped.empty:
        raise HTTPException(status_code=400, detail="No vector features intersect the active study-area boundary.")
    clipped.to_file(dst_path, driver="GeoJSON")
    return inspect_vector_dataset(dst_path)
