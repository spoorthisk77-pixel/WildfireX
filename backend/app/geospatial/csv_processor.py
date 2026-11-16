from pathlib import Path
from typing import Any, Optional
import math
import pandas as pd
from fastapi import HTTPException

from backend.app.schemas.dataset import CsvColumnMappingRequest


def parse_observation_date(raw_value: Any) -> tuple[Optional[str], Optional[int], Optional[int]]:
    """Parse raw observation date into (YYYY-MM-DD, year, month) without guessing."""
    if raw_value is None or (isinstance(raw_value, float) and math.isnan(raw_value)):
        return None, None, None
    text = str(raw_value).strip()
    if not text or text.lower() in {"nan", "nat", "none", "null"}:
        return None, None, None
    parsed = pd.to_datetime(text, errors="coerce", format="mixed")
    if pd.isna(parsed):
        return None, None, None
    return parsed.strftime("%Y-%m-%d"), int(parsed.year), int(parsed.month)


def format_acq_time(raw_value: Any) -> Optional[str]:
    if raw_value is None or (isinstance(raw_value, float) and math.isnan(raw_value)):
        return None
    text = str(raw_value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return None
    # Handle NASA FIRMS HHMM integers like 830 or 0830 or 1425
    if text.isdigit():
        padded = text.zfill(4)
        if len(padded) == 4:
            return f"{padded[:2]}:{padded[2:]}"
    return text[:16]


def inspect_csv_metadata(csv_path: Path) -> dict[str, Any]:
    try:
        df = pd.read_csv(csv_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid or unreadable CSV file: {exc}") from exc

    if df.empty or len(df.columns) == 0:
        raise HTTPException(status_code=400, detail="CSV file contains no rows or columns.")

    column_schema = []
    null_counts: dict[str, int] = {}
    for col in df.columns:
        sample_non_null = df[col].dropna().head(3).tolist()
        non_null = int(df[col].notna().sum())
        null_counts[str(col)] = int(len(df) - non_null)
        column_schema.append({
            "name": str(col),
            "dtype": str(df[col].dtype),
            "non_null_count": non_null,
            "sample_values": [str(v) for v in sample_non_null],
        })

    preview_df = df.head(15)
    preview_rows: list[dict[str, Any]] = []
    for _, row in preview_df.iterrows():
        preview_rows.append({
            str(k): (None if pd.isna(v) else (v.item() if hasattr(v, "item") else v))
            for k, v in row.items()
        })

    return {
        "feature_count": int(len(df)),
        "column_schema_json": column_schema,
        "preview_rows_json": preview_rows,
        "extra_json": {
            "total_columns": int(len(df.columns)),
            "csv_requires_mapping": True,
            "null_counts_by_column": null_counts,
        },
    }


def validate_csv_mapping(csv_path: Path, mapping: CsvColumnMappingRequest) -> dict[str, Any]:
    df = pd.read_csv(csv_path)
    cols = set(str(c) for c in df.columns)

    selected_cols = {
        "latitude_column": mapping.latitude_column,
        "longitude_column": mapping.longitude_column,
        "cell_id_column": mapping.cell_id_column,
        "landcover_column": mapping.landcover_column,
        "elevation_column": mapping.elevation_column,
        "date_column": mapping.date_column,
        "time_column": mapping.time_column,
        "brightness_column": mapping.brightness_column,
        "frp_column": mapping.frp_column,
        "confidence_column": mapping.confidence_column,
        "satellite_column": mapping.satellite_column,
        "instrument_column": mapping.instrument_column,
        "record_type_column": mapping.record_type_column,
    }
    for field_name, col_name in selected_cols.items():
        if col_name and col_name not in cols:
            raise HTTPException(
                status_code=400,
                detail=f"Mapped column '{col_name}' for {field_name} does not exist in CSV headers.",
            )

    if not mapping.latitude_column or not mapping.longitude_column:
        raise HTTPException(
            status_code=400,
            detail="Both latitude_column and longitude_column must be mapped to register spatial coordinates.",
        )

    lat_series = pd.to_numeric(df[mapping.latitude_column], errors="coerce")
    lon_series = pd.to_numeric(df[mapping.longitude_column], errors="coerce")
    is_wgs84_like = mapping.crs.upper() in {"EPSG:4326", "WGS84", "CRS84"}
    if is_wgs84_like:
        valid_coords = (
            lat_series.notna()
            & lon_series.notna()
            & (lat_series >= -90.0)
            & (lat_series <= 90.0)
            & (lon_series >= -180.0)
            & (lon_series <= 180.0)
        )
    else:
        valid_coords = lat_series.notna() & lon_series.notna()

    if int(valid_coords.sum()) == 0:
        raise HTTPException(
            status_code=400,
            detail="Mapped latitude/longitude columns contain no valid coordinates within range.",
        )

    bounds = {
        "minx": float(lon_series[valid_coords].min()),
        "miny": float(lat_series[valid_coords].min()),
        "maxx": float(lon_series[valid_coords].max()),
        "maxy": float(lat_series[valid_coords].max()),
    }

    return {
        "total_rows": int(len(df)),
        "valid_coordinate_rows": int(valid_coords.sum()),
        "invalid_coordinate_rows": int((~valid_coords).sum()),
        "bounds": bounds,
        "mapping": mapping.model_dump(),
    }
