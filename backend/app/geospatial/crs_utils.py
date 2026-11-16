from typing import Optional
from pyproj import CRS, Transformer
from shapely.geometry import box
from shapely.ops import transform as shapely_transform


def parse_crs(crs_input: object) -> Optional[CRS]:
    if crs_input is None:
        return None
    try:
        return CRS.from_user_input(crs_input)
    except Exception:
        return None


def extract_epsg(crs_obj: Optional[CRS]) -> Optional[int]:
    if crs_obj is None:
        return None
    try:
        return crs_obj.to_epsg()
    except Exception:
        return None


def transform_bounds_to_wgs84(bounds: tuple[float, float, float, float], src_crs_str: Optional[str]) -> Optional[dict[str, float]]:
    if not src_crs_str:
        return None
    src_crs = parse_crs(src_crs_str)
    if src_crs is None:
        return None
    dst_crs = CRS.from_epsg(4326)
    if src_crs == dst_crs:
        return {
            "minx": float(bounds[0]),
            "miny": float(bounds[1]),
            "maxx": float(bounds[2]),
            "maxy": float(bounds[3]),
        }
    transformer = Transformer.from_crs(src_crs, dst_crs, always_xy=True)
    geom = box(*bounds)
    reprojected = shapely_transform(transformer.transform, geom)
    minx, miny, maxx, maxy = reprojected.bounds
    return {
        "minx": float(minx),
        "miny": float(miny),
        "maxx": float(maxx),
        "maxy": float(maxy),
    }


def compute_geometry_area_sq_km(geom, src_crs_str: str) -> float:
    src_crs = parse_crs(src_crs_str)
    if src_crs is None:
        return 0.0
    # Use UTM Zone 43N (EPSG:32643) for accurate metric area in Karnataka / Nagarhole
    target_crs = CRS.from_epsg(32643)
    if src_crs != target_crs:
        transformer = Transformer.from_crs(src_crs, target_crs, always_xy=True)
        metric_geom = shapely_transform(transformer.transform, geom)
    else:
        metric_geom = geom
    return round(float(metric_geom.area) / 1_000_000.0, 4)
