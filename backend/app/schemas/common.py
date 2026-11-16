from enum import Enum


class FileFormat(str, Enum):
    CSV = "csv"
    GEOTIFF = "geotiff"
    GEOJSON = "geojson"
    SHAPEFILE_ZIP = "shapefile_zip"


class DataSource(str, Enum):
    ESA_WORLDCOVER = "esa_worldcover"
    NASA_FIRMS = "nasa_firms"
    SENTINEL2_L2A = "sentinel2_l2a"
    SRTM = "srtm"
    CUSTOM_BOUNDARY = "custom_boundary"
    OTHER = "other"


class ProcessingStatus(str, Enum):
    UPLOADED = "uploaded"
    VALIDATED = "validated"
    MAPPED = "mapped"
    PROCESSED = "processed"
    ERROR = "error"


class StudyAreaVerificationStatus(str, Enum):
    AWAITING_BOUNDARY_VERIFICATION = "awaiting_boundary_verification"
    BOUNDARY_IMPORTED_UNVERIFIED = "boundary_imported_unverified"
    VERIFIED_BOUNDARY = "verified_boundary"
