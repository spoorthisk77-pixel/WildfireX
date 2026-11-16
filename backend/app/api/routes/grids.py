from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.schemas.grid import GridCellsPageResponse, GridGenerateRequest, ProcessedGridOut
from backend.app.services.grid_service import (
    delete_grid,
    generate_structured_grid,
    get_grid_by_id,
    get_grid_cells,
    list_grids,
)

router = APIRouter(prefix="/grids", tags=["Structured Grids"])


@router.get("", response_model=list[ProcessedGridOut])
def get_grids(db: Session = Depends(get_db)):
    return list_grids(db)


@router.post("/generate", response_model=ProcessedGridOut, status_code=status.HTTP_201_CREATED)
def generate_grid(payload: GridGenerateRequest, db: Session = Depends(get_db)):
    return generate_structured_grid(db, payload)


@router.get("/{grid_id}", response_model=ProcessedGridOut)
def get_grid(grid_id: int, db: Session = Depends(get_db)):
    return get_grid_by_id(db, grid_id)


@router.get("/{grid_id}/cells", response_model=GridCellsPageResponse)
def get_cells(
    grid_id: int,
    limit: int = Query(default=2500, ge=1, le=16000),
    offset: int = Query(default=0, ge=0),
    landcover_filter: Optional[str] = Query(default=None),
    include_nodata: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    return get_grid_cells(
        db=db,
        grid_id=grid_id,
        limit=limit,
        offset=offset,
        landcover_filter=landcover_filter,
        include_nodata=include_nodata,
    )


@router.delete("/{grid_id}")
def remove_grid(grid_id: int, db: Session = Depends(get_db)):
    return delete_grid(db, grid_id)
