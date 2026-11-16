import hashlib
import os
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Tuple

from fastapi import HTTPException, UploadFile

from backend.app.core.config import BOUNDARIES_DIR, EXPORTS_DIR, PROCESSED_DIR, UPLOADS_DIR, settings
from backend.app.schemas.common import FileFormat


ALLOWED_EXTENSIONS = {
    ".csv": FileFormat.CSV,
    ".tif": FileFormat.GEOTIFF,
    ".tiff": FileFormat.GEOTIFF,
    ".geojson": FileFormat.GEOJSON,
    ".json": FileFormat.GEOJSON,
    ".zip": FileFormat.SHAPEFILE_ZIP,
}


def detect_file_format(filename: str) -> FileFormat:
    lower = filename.lower().strip()
    for ext, fmt in ALLOWED_EXTENSIONS.items():
        if lower.endswith(ext):
            return fmt
    raise HTTPException(
        status_code=400,
        detail=(
            f"Unsupported file format for '{filename}'. "
            "Supported formats: CSV (.csv), GeoTIFF (.tif, .tiff), GeoJSON (.geojson, .json), Shapefile ZIP (.zip)."
        ),
    )


async def save_upload_file(upload_file: UploadFile, target_dir: Path = UPLOADS_DIR) -> Tuple[Path, int, str]:
    if not upload_file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a valid filename.")

    target_dir.mkdir(parents=True, exist_ok=True)
    safe_name = os.path.basename(upload_file.filename).replace(" ", "_")
    unique_name = f"{uuid.uuid4().hex[:12]}_{safe_name}"
    dest_path = target_dir / unique_name

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    total_bytes = 0
    sha256 = hashlib.sha256()

    try:
        with open(dest_path, "wb") as out:
            while True:
                chunk = await upload_file.read(1024 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds maximum allowed size of {settings.max_upload_size_mb} MB.",
                    )
                sha256.update(chunk)
                out.write(chunk)
    except HTTPException:
        if dest_path.exists():
            dest_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        if dest_path.exists():
            dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to persist uploaded file: {exc}") from exc

    if total_bytes == 0:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

    return dest_path, total_bytes, sha256.hexdigest()


def validate_shapefile_zip(zip_path: Path) -> Path:
    if not zipfile.ZipFile or not zipfile.is_zipfile(zip_path):
        raise HTTPException(status_code=400, detail="Uploaded .zip file is not a valid ZIP archive.")

    extract_dir = PROCESSED_DIR / f"shp_{zip_path.stem}"
    if extract_dir.exists():
        shutil.rmtree(extract_dir)
    extract_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            member_path = Path(member.filename)
            if member_path.is_absolute() or ".." in member_path.parts:
                shutil.rmtree(extract_dir, ignore_errors=True)
                raise HTTPException(status_code=400, detail="ZIP archive contains unsafe relative paths.")
        zf.extractall(extract_dir)

    shp_files = list(extract_dir.rglob("*.shp"))
    if not shp_files:
        shutil.rmtree(extract_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail="Shapefile ZIP archive does not contain a .shp geometry file.",
        )

    primary_shp = shp_files[0]
    stem = primary_shp.with_suffix("")
    missing_sidecars = [ext for ext in (".dbf", ".shx") if not stem.with_suffix(ext).exists()]
    if missing_sidecars:
        shutil.rmtree(extract_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail=f"Shapefile ZIP archive is missing required sidecar file(s): {', '.join(missing_sidecars)}.",
        )

    return primary_shp


def delete_stored_file(path_str: str | None) -> None:
    if not path_str:
        return
    p = Path(path_str)
    try:
        if p.exists() and p.is_file():
            p.unlink(missing_ok=True)
        # Clean extracted shapefile directory if present
        shp_dir = PROCESSED_DIR / f"shp_{p.stem}"
        if shp_dir.exists() and shp_dir.is_dir():
            shutil.rmtree(shp_dir, ignore_errors=True)
    except Exception:
        pass


def get_processed_output_path(prefix: str, suffix: str) -> Path:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    return PROCESSED_DIR / f"{prefix}_{uuid.uuid4().hex[:10]}{suffix}"


def get_boundary_output_path(prefix: str) -> Path:
    BOUNDARIES_DIR.mkdir(parents=True, exist_ok=True)
    return BOUNDARIES_DIR / f"{prefix}_{uuid.uuid4().hex[:10]}.geojson"


def get_export_output_path(prefix: str, suffix: str) -> Path:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    return EXPORTS_DIR / f"{prefix}_{uuid.uuid4().hex[:10]}{suffix}"
