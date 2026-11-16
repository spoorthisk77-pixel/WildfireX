import csv
import io
import json
from collections import defaultdict
from typing import Any, Optional

from fastapi.responses import Response
from shapely.geometry import Point, shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.constants import HOTSPOT_DISTINCTION_NOTE, SCIENTIFIC_DISCLAIMER
from backend.app.models.entities import Dataset, HistoricalObservation
from backend.app.services.study_area_service import get_active_study_area, get_study_area_geojson

MONTH_NAMES = [
    "",
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]


def _extract_year_month(obs: HistoricalObservation) -> tuple[Optional[int], Optional[int]]:
    if obs.observation_year and obs.observation_month:
        return obs.observation_year, obs.observation_month
    if obs.observation_date:
        parts = obs.observation_date.strip().split("-")
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            y = int(parts[0])
            m = int(parts[1])
            if 1 <= m <= 12:
                return y, m
    return obs.observation_year, obs.observation_month


def _filter_observations(
    db: Session,
    dataset_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    satellite: Optional[str] = None,
    confidence: Optional[str] = None,
    record_type: Optional[str] = None,
    exclude_duplicates: bool = False,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lon: Optional[float] = None,
    max_lon: Optional[float] = None,
    clip_to_study_area: bool = False,
) -> tuple[list[HistoricalObservation], dict[int, Dataset], Optional[dict]]:
    stmt = select(HistoricalObservation).order_by(
        HistoricalObservation.observation_date.desc(),
        HistoricalObservation.id.desc(),
    )
    if dataset_id is not None:
        stmt = stmt.where(HistoricalObservation.source_dataset_id == dataset_id)
    if exclude_duplicates:
        stmt = stmt.where(HistoricalObservation.is_duplicate.is_(False))
    if satellite:
        stmt = stmt.where(HistoricalObservation.satellite == satellite)
    if confidence:
        stmt = stmt.where(HistoricalObservation.confidence == confidence)
    if record_type:
        stmt = stmt.where(HistoricalObservation.record_type == record_type)
    if min_lat is not None:
        stmt = stmt.where(HistoricalObservation.latitude >= min_lat)
    if max_lat is not None:
        stmt = stmt.where(HistoricalObservation.latitude <= max_lat)
    if min_lon is not None:
        stmt = stmt.where(HistoricalObservation.longitude >= min_lon)
    if max_lon is not None:
        stmt = stmt.where(HistoricalObservation.longitude <= max_lon)

    rows = list(db.execute(stmt).scalars().all())

    # Apply year/month filter robustly (works for legacy rows parsed before year/month columns)
    if year is not None or month is not None:
        filtered: list[HistoricalObservation] = []
        for r in rows:
            ry, rm = _extract_year_month(r)
            if year is not None and ry != year:
                continue
            if month is not None and rm != month:
                continue
            filtered.append(r)
        rows = filtered

    # Optional spatial filter against active StudyArea polygon
    study_geojson: Optional[dict] = None
    try:
        area = get_active_study_area(db)
        study_geojson = get_study_area_geojson(area)
    except Exception:
        study_geojson = None

    if clip_to_study_area and study_geojson and study_geojson.get("features"):
        polys = [shape(feat["geometry"]) for feat in study_geojson["features"] if feat.get("geometry")]
        if polys:
            clipped_rows = []
            for r in rows:
                pt = Point(r.longitude, r.latitude)
                if any(poly.covers(pt) for poly in polys):
                    clipped_rows.append(r)
            rows = clipped_rows

    datasets = {
        d.id: d
        for d in db.execute(select(Dataset)).scalars().all()
    }
    return rows, datasets, study_geojson


def query_observations_analytics(
    db: Session,
    limit: int = 100,
    offset: int = 0,
    dataset_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    satellite: Optional[str] = None,
    confidence: Optional[str] = None,
    record_type: Optional[str] = None,
    exclude_duplicates: bool = False,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lon: Optional[float] = None,
    max_lon: Optional[float] = None,
    clip_to_study_area: bool = False,
) -> dict[str, Any]:
    rows, datasets, study_geojson = _filter_observations(
        db,
        dataset_id=dataset_id,
        year=year,
        month=month,
        satellite=satellite,
        confidence=confidence,
        record_type=record_type,
        exclude_duplicates=exclude_duplicates,
        min_lat=min_lat,
        max_lat=max_lat,
        min_lon=min_lon,
        max_lon=max_lon,
        clip_to_study_area=clip_to_study_area,
    )

    total = len(rows)
    duplicate_count = sum(1 for r in rows if r.is_duplicate)
    unique_count = total - duplicate_count

    yearly_buckets: dict[int, dict[str, Any]] = {}
    monthly_buckets: dict[str, dict[str, Any]] = {}
    sat_buckets: dict[tuple[str, str], int] = defaultdict(int)
    confidence_buckets: dict[str, int] = defaultdict(int)
    record_type_counts = {"satellite_hotspot": 0, "confirmed_incident": 0}
    contributing_ds_ids: set[int] = set()

    for r in rows:
        contributing_ds_ids.add(r.source_dataset_id)
        if r.record_type == "confirmed_incident":
            record_type_counts["confirmed_incident"] += 1
        else:
            record_type_counts["satellite_hotspot"] += 1

        sat_key = (r.satellite or "Unspecified", r.instrument or "Unspecified")
        sat_buckets[sat_key] += 1
        confidence_buckets[r.confidence or "unspecified"] += 1

        ry, rm = _extract_year_month(r)
        if ry is not None:
            yb = yearly_buckets.setdefault(
                ry,
                {"year": ry, "count": 0, "unique_count": 0, "total_frp": 0.0, "_frp_n": 0},
            )
            yb["count"] += 1
            if not r.is_duplicate:
                yb["unique_count"] += 1
            if r.frp is not None:
                yb["total_frp"] += r.frp
                yb["_frp_n"] += 1

        if ry is not None and rm is not None:
            ym_key = f"{ry:04d}-{rm:02d}"
            mb = monthly_buckets.setdefault(
                ym_key,
                {
                    "year_month": ym_key,
                    "year": ry,
                    "month": rm,
                    "month_label": f"{MONTH_NAMES[rm]} {ry}",
                    "count": 0,
                    "unique_count": 0,
                    "total_frp": 0.0,
                },
            )
            mb["count"] += 1
            if not r.is_duplicate:
                mb["unique_count"] += 1
            if r.frp is not None:
                mb["total_frp"] += r.frp

    yearly_summary = []
    for yr in sorted(yearly_buckets.keys()):
        b = yearly_buckets[yr]
        yearly_summary.append({
            "year": b["year"],
            "count": b["count"],
            "unique_count": b["unique_count"],
            "total_frp": round(b["total_frp"], 2),
            "mean_frp": round(b["total_frp"] / b["_frp_n"], 2) if b["_frp_n"] > 0 else None,
        })

    monthly_summary = [
        {
            **monthly_buckets[k],
            "total_frp": round(monthly_buckets[k]["total_frp"], 2),
        }
        for k in sorted(monthly_buckets.keys())
    ]

    satellite_breakdown = [
        {"satellite": k[0], "instrument": k[1], "count": v}
        for k, v in sorted(sat_buckets.items(), key=lambda x: -x[1])
    ]

    # Collect provenance summary across all datasets that have observations or matching dataset_id
    obs_datasets = [
        d for d in datasets.values()
        if d.id in contributing_ds_ids
        or (
            d.metadata_record
            and d.metadata_record.csv_mapping_json
            and d.metadata_record.csv_mapping_json.get("interpret_as") == "historical_observations"
        )
    ]
    provenance_summary = []
    total_invalid_skipped = 0
    for d in obs_datasets:
        extra = (d.metadata_record.extra_json if d.metadata_record else None) or {}
        inv = int(extra.get("invalid_rows_skipped", 0) or 0)
        total_invalid_skipped += inv
        provenance_summary.append({
            "dataset_id": d.id,
            "name": d.name,
            "data_source": d.data_source,
            "acquisition_date": d.acquisition_date,
            "license_or_citation": d.license_or_citation,
            "sha256_hash": d.sha256_hash,
            "observations_ingested": extra.get("observations_ingested"),
            "duplicate_rows_detected": extra.get("duplicate_rows_detected", 0),
            "invalid_rows_skipped": inv,
            "unparsed_date_rows": extra.get("unparsed_date_rows", 0),
        })

    bounds = None
    if rows:
        bounds = {
            "min_lat": min(r.latitude for r in rows),
            "max_lat": max(r.latitude for r in rows),
            "min_lon": min(r.longitude for r in rows),
            "max_lon": max(r.longitude for r in rows),
        }

    # Available filter options across unfiltered dataset
    all_satellites = sorted({s for s in db.execute(select(HistoricalObservation.satellite).distinct()).scalars().all() if s})
    all_years = sorted({y for y in db.execute(select(HistoricalObservation.observation_year).distinct()).scalars().all() if y})
    all_confidences = sorted({c for c in db.execute(select(HistoricalObservation.confidence).distinct()).scalars().all() if c})

    page_rows = rows[offset : offset + limit]
    items = [
        {
            "id": r.id,
            "source_dataset_id": r.source_dataset_id,
            "source_dataset_name": datasets[r.source_dataset_id].name if r.source_dataset_id in datasets else None,
            "observation_date": r.observation_date,
            "observation_time": r.observation_time,
            "observation_year": _extract_year_month(r)[0],
            "observation_month": _extract_year_month(r)[1],
            "record_type": r.record_type,
            "is_duplicate": bool(r.is_duplicate),
            "latitude": r.latitude,
            "longitude": r.longitude,
            "brightness": r.brightness,
            "frp": r.frp,
            "confidence": r.confidence,
            "satellite": r.satellite,
            "instrument": r.instrument,
            "daynight": r.daynight,
        }
        for r in page_rows
    ]

    map_points = [
        {
            "id": r.id,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "frp": r.frp,
            "observation_date": r.observation_date,
            "satellite": r.satellite,
            "instrument": r.instrument,
            "confidence": r.confidence,
            "record_type": r.record_type,
            "is_duplicate": bool(r.is_duplicate),
        }
        for r in rows[:2000]
    ]

    return {
        "total": total,
        "unique_count": unique_count,
        "duplicate_count": duplicate_count,
        "invalid_rows_skipped": total_invalid_skipped,
        "limit": limit,
        "offset": offset,
        "items": items,
        "map_points": map_points,
        "yearly_summary": yearly_summary,
        "monthly_summary": monthly_summary,
        "satellite_breakdown": satellite_breakdown,
        "confidence_breakdown": dict(confidence_buckets),
        "record_type_breakdown": record_type_counts,
        "provenance_summary": provenance_summary,
        "bounds": bounds,
        "study_area_geojson": study_geojson,
        "filter_options": {
            "years": all_years,
            "satellites": all_satellites,
            "confidences": all_confidences,
            "datasets": [{"id": d.id, "name": d.name} for d in obs_datasets],
        },
        "hotspot_distinction_note": HOTSPOT_DISTINCTION_NOTE,
        "disclaimer": SCIENTIFIC_DISCLAIMER,
    }


def export_observations_response(
    db: Session,
    export_format: str = "csv",
    **filters: Any,
) -> Response:
    rows, datasets, _ = _filter_observations(db, **filters)
    if export_format.lower() == "json":
        payload = {
            "data_classification": "historical_observations",
            "hotspot_distinction_note": HOTSPOT_DISTINCTION_NOTE,
            "disclaimer": SCIENTIFIC_DISCLAIMER,
            "total": len(rows),
            "items": [
                {
                    "id": r.id,
                    "source_dataset": datasets[r.source_dataset_id].name if r.source_dataset_id in datasets else None,
                    "observation_date": r.observation_date,
                    "observation_time": r.observation_time,
                    "record_type": r.record_type,
                    "is_duplicate": bool(r.is_duplicate),
                    "latitude": r.latitude,
                    "longitude": r.longitude,
                    "brightness": r.brightness,
                    "frp": r.frp,
                    "confidence": r.confidence,
                    "satellite": r.satellite,
                    "instrument": r.instrument,
                    "daynight": r.daynight,
                }
                for r in rows
            ],
        }
        return Response(
            content=json.dumps(payload, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="wildfirex_historical_observations.json"'},
        )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id",
        "source_dataset",
        "observation_date",
        "observation_time",
        "record_type",
        "is_duplicate",
        "latitude",
        "longitude",
        "brightness",
        "frp_mw",
        "confidence",
        "satellite",
        "instrument",
        "daynight",
    ])
    for r in rows:
        writer.writerow([
            r.id,
            datasets[r.source_dataset_id].name if r.source_dataset_id in datasets else "",
            r.observation_date or "",
            r.observation_time or "",
            r.record_type,
            r.is_duplicate,
            r.latitude,
            r.longitude,
            r.brightness if r.brightness is not None else "",
            r.frp if r.frp is not None else "",
            r.confidence or "",
            r.satellite or "",
            r.instrument or "",
            r.daynight or "",
        ])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="wildfirex_historical_observations.csv"'},
    )
