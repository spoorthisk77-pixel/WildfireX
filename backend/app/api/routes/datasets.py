from typing import Optional
from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.schemas.common import DataSource
from backend.app.schemas.dataset import (
    CsvColumnMappingRequest,
    DatasetListResponse,
    DatasetOut,
    DatasetPreviewResponse,
)
from backend.app.services.dataset_service import (
    apply_csv_mapping,
    delete_dataset,
    get_dataset_by_id,
    ingest_uploaded_dataset,
    list_datasets,
)

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.get("", response_model=DatasetListResponse)
def get_datasets(db: Session = Depends(get_db)):
    items = list_datasets(db)
    return DatasetListResponse(items=items, total=len(items))


@router.post("/upload", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    data_source: str = Form(default=DataSource.OTHER.value),
    description: Optional[str] = Form(default=None),
    provenance_notes: Optional[str] = Form(default=None),
    license_or_citation: Optional[str] = Form(default=None),
    acquisition_date: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
):
    return await ingest_uploaded_dataset(
        db=db,
        file=file,
        name=name,
        data_source=data_source,
        description=description,
        provenance_notes=provenance_notes,
        license_or_citation=license_or_citation,
        acquisition_date=acquisition_date,
    )


@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    return get_dataset_by_id(db, dataset_id)


@router.get("/{dataset_id}/preview", response_model=DatasetPreviewResponse)
def preview_dataset(dataset_id: int, db: Session = Depends(get_db)):
    ds = get_dataset_by_id(db, dataset_id)
    meta = ds.metadata_record
    raster_summary = None
    vector_summary = None
    if meta:
        if ds.file_format == "geotiff":
            raster_summary = {
                "crs": meta.crs,
                "epsg_code": meta.epsg_code,
                "width": meta.width,
                "height": meta.height,
                "band_count": meta.band_count,
                "resolution_x": meta.resolution_x,
                "resolution_y": meta.resolution_y,
                "nodata_value": meta.nodata_value,
                "driver": meta.driver,
                "dtype": meta.dtype,
                "bounds": meta.bounds_json,
                "wgs84_bounds": meta.wgs84_bounds_json,
                "landcover_summary": meta.landcover_summary_json,
                "band_stats": (meta.extra_json or {}).get("band_stats", []),
            }
        elif ds.file_format in ("geojson", "shapefile_zip"):
            vector_summary = {
                "crs": meta.crs,
                "epsg_code": meta.epsg_code,
                "geometry_types": meta.geometry_types_json or [],
                "feature_count": meta.feature_count,
                "invalid_geometry_count": meta.invalid_geometry_count,
                "bounds": meta.bounds_json,
                "wgs84_bounds": meta.wgs84_bounds_json,
            }

    return DatasetPreviewResponse(
        dataset_id=ds.id,
        file_format=ds.file_format,
        columns=(meta.column_schema_json or []) if meta else [],
        rows=(meta.preview_rows_json or []) if meta else [],
        raster_summary=raster_summary,
        vector_summary=vector_summary,
        csv_mapping=meta.csv_mapping_json if meta else None,
    )


@router.post("/{dataset_id}/csv-mapping", response_model=DatasetOut)
def map_csv_columns(dataset_id: int, payload: CsvColumnMappingRequest, db: Session = Depends(get_db)):
    return apply_csv_mapping(db, dataset_id, payload)


@router.delete("/{dataset_id}")
def remove_dataset(dataset_id: int, db: Session = Depends(get_db)):
    return delete_dataset(db, dataset_id)
