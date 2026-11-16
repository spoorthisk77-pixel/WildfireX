from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.database.session import get_db

router = APIRouter(prefix="/health", tags=["System Health"])


@router.get("")
def health_check(db: Session = Depends(get_db)):
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    libs = {}
    for mod in ("rasterio", "geopandas", "shapely", "pyproj", "numpy", "scipy", "pandas", "networkx"):
        try:
            m = __import__(mod)
            libs[mod] = getattr(m, "__version__", "installed")
        except Exception:
            libs[mod] = "unavailable"

    return {
        "status": "healthy" if db_ok else "degraded",
        "service": settings.app_name,
        "version": settings.app_version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": "connected" if db_ok else "error",
        "study_region": settings.default_study_region,
        "libraries": libs,
    }
