from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.database.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_format: Mapped[str] = mapped_column(String(32), nullable=False)  # csv | geotiff | geojson | shapefile_zip
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Provenance & Real Data Source tracking
    data_source: Mapped[str] = mapped_column(String(64), default="other", nullable=False)
    provenance_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    license_or_citation: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    acquisition_date: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    processing_status: Mapped[str] = mapped_column(String(32), default="uploaded", nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    metadata_record: Mapped[Optional["DatasetMetadata"]] = relationship(
        "DatasetMetadata",
        back_populates="dataset",
        uselist=False,
        cascade="all, delete-orphan",
    )
    processing_jobs: Mapped[list["ProcessingJob"]] = relationship(
        "ProcessingJob",
        back_populates="dataset",
        cascade="all, delete-orphan",
    )
    processing_logs: Mapped[list["ProcessingLog"]] = relationship(
        "ProcessingLog",
        back_populates="dataset",
        cascade="all, delete-orphan",
    )
    historical_observations: Mapped[list["HistoricalObservation"]] = relationship(
        "HistoricalObservation",
        back_populates="source_dataset",
        cascade="all, delete-orphan",
    )


class DatasetMetadata(Base):
    __tablename__ = "dataset_metadata"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), unique=True, nullable=False)

    crs: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    epsg_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bounds_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    wgs84_bounds_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Raster metadata
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    band_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    resolution_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    resolution_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nodata_value: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    driver: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    dtype: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # Vector / Tabular metadata
    geometry_types_json: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    feature_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    invalid_geometry_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    column_schema_json: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    csv_mapping_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    preview_rows_json: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    landcover_summary_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    extra_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    dataset: Mapped["Dataset"] = relationship("Dataset", back_populates="metadata_record")


class StudyArea(Base):
    __tablename__ = "study_areas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    region_label: Mapped[str] = mapped_column(String(255), nullable=False)
    verification_status: Mapped[str] = mapped_column(
        String(64),
        default="awaiting_boundary_verification",
        nullable=False,
    )  # awaiting_boundary_verification | boundary_imported_unverified | verified_boundary
    source_dataset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    crs: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    area_sq_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bounds_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    geometry_geojson_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    vertex_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_type: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=True)
    study_area_id: Mapped[Optional[int]] = mapped_column(ForeignKey("study_areas.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False)
    parameters_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    result_summary_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    dataset: Mapped[Optional["Dataset"]] = relationship("Dataset", back_populates="processing_jobs")
    logs: Mapped[list["ProcessingLog"]] = relationship("ProcessingLog", back_populates="job", cascade="all, delete-orphan")


class ProcessedGrid(Base):
    __tablename__ = "processed_grids"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    elevation_dataset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    study_area_id: Mapped[Optional[int]] = mapped_column(ForeignKey("study_areas.id", ondelete="SET NULL"), nullable=True)
    processing_job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("processing_jobs.id", ondelete="SET NULL"), nullable=True)

    crs: Mapped[str] = mapped_column(String(128), nullable=False)
    resolution_meters: Mapped[float] = mapped_column(Float, nullable=False)
    source_resolution_native: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    rows: Mapped[int] = mapped_column(Integer, nullable=False)
    cols: Mapped[int] = mapped_column(Integer, nullable=False)
    cell_count: Mapped[int] = mapped_column(Integer, nullable=False)
    valid_cell_count: Mapped[int] = mapped_column(Integer, nullable=False)
    nodata_cell_count: Mapped[int] = mapped_column(Integer, nullable=False)
    bounds_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    clipped_to_boundary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    grid_geojson_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ready", nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    cells: Mapped[list["GridCell"]] = relationship(
        "GridCell",
        back_populates="grid",
        cascade="all, delete-orphan",
    )


class GridCell(Base):
    __tablename__ = "grid_cells"
    __table_args__ = (
        UniqueConstraint("grid_id", "cell_uid", name="uq_grid_cell_uid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    grid_id: Mapped[int] = mapped_column(ForeignKey("processed_grids.id", ondelete="CASCADE"), nullable=False, index=True)
    cell_uid: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    row_idx: Mapped[int] = mapped_column(Integer, nullable=False)
    col_idx: Mapped[int] = mapped_column(Integer, nullable=False)

    center_lon: Mapped[float] = mapped_column(Float, nullable=False)
    center_lat: Mapped[float] = mapped_column(Float, nullable=False)
    native_x: Mapped[float] = mapped_column(Float, nullable=False)
    native_y: Mapped[float] = mapped_column(Float, nullable=False)
    geometry_wkt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    landcover_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    landcover_category: Mapped[str] = mapped_column(String(128), nullable=False)
    original_source_value: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    source_dataset_id: Mapped[int] = mapped_column(Integer, nullable=False)
    spatial_resolution: Mapped[float] = mapped_column(Float, nullable=False)
    crs: Mapped[str] = mapped_column(String(128), nullable=False)
    quality_status: Mapped[str] = mapped_column(String(32), default="valid", nullable=False)

    elevation_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vegetation_index: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    graph_vertex_id: Mapped[int] = mapped_column(Integer, nullable=False)
    neighbors_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    grid: Mapped["ProcessedGrid"] = relationship("ProcessedGrid", back_populates="cells")


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    module_type: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    grid_id: Mapped[Optional[int]] = mapped_column(ForeignKey("processed_grids.id", ondelete="SET NULL"), nullable=True)
    study_area_id: Mapped[Optional[int]] = mapped_column(ForeignKey("study_areas.id", ondelete="SET NULL"), nullable=True)
    dataset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    dataset_version_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="configured", nullable=False)
    results_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    configurations: Mapped[list["ExperimentConfiguration"]] = relationship(
        "ExperimentConfiguration",
        back_populates="experiment",
        cascade="all, delete-orphan",
    )


class ExperimentConfiguration(Base):
    __tablename__ = "experiment_configurations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    parameters_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    experiment: Mapped["Experiment"] = relationship("Experiment", back_populates="configurations")


class HistoricalObservation(Base):
    __tablename__ = "historical_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    study_area_id: Mapped[Optional[int]] = mapped_column(ForeignKey("study_areas.id", ondelete="SET NULL"), nullable=True)

    observation_date: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    observation_time: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    observation_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    observation_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    record_type: Mapped[str] = mapped_column(String(64), default="satellite_hotspot", nullable=False)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    brightness: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    frp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    satellite: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    instrument: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    daynight: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    geometry_wkt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attributes_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    source_dataset: Mapped["Dataset"] = relationship("Dataset", back_populates="historical_observations")


class ProcessingLog(Base):
    __tablename__ = "processing_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("processing_jobs.id", ondelete="CASCADE"), nullable=True)
    dataset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=True)
    level: Mapped[str] = mapped_column(String(16), default="INFO", nullable=False)
    stage: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    details_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    job: Mapped[Optional["ProcessingJob"]] = relationship("ProcessingJob", back_populates="logs")
    dataset: Mapped[Optional["Dataset"]] = relationship("Dataset", back_populates="processing_logs")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    report_type: Mapped[str] = mapped_column(String(64), nullable=False)
    experiment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("experiments.id", ondelete="SET NULL"), nullable=True)
    grid_id: Mapped[Optional[int]] = mapped_column(ForeignKey("processed_grids.id", ondelete="SET NULL"), nullable=True)
    file_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    format: Mapped[str] = mapped_column(String(32), default="json", nullable=False)
    summary_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    grid_id: Mapped[int] = mapped_column(ForeignKey("processed_grids.id", ondelete="CASCADE"), nullable=False, index=True)
    experiment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("experiments.id", ondelete="SET NULL"), nullable=True)

    # Strict provenance boundary: always hypothetical_simulation, never real observation
    data_classification: Mapped[str] = mapped_column(String(64), default="hypothetical_simulation", nullable=False)
    neighborhood: Mapped[str] = mapped_column(String(32), default="moore_8", nullable=False)  # moore_8 | von_neumann_4
    boundary_condition: Mapped[str] = mapped_column(String(32), default="absorbing", nullable=False)  # absorbing | reflective | periodic
    status: Mapped[str] = mapped_column(String(32), default="initialized", nullable=False)  # initialized | running | paused | completed
    current_generation: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_generations: Mapped[int] = mapped_column(Integer, default=40, nullable=False)

    parameters_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    seed_cells_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    initial_summary_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    disclaimer: Mapped[str] = mapped_column(
        Text,
        default=(
            "Controlled educational cellular automaton output using bounded abstract rules. "
            "Not a real-world observation, calibrated operational spread forecast, or emergency guidance."
        ),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    steps: Mapped[list["SimulationStep"]] = relationship(
        "SimulationStep",
        back_populates="simulation",
        cascade="all, delete-orphan",
        order_by="SimulationStep.generation",
    )


class SimulationStep(Base):
    __tablename__ = "simulation_steps"
    __table_args__ = (
        UniqueConstraint("simulation_id", "generation", name="uq_sim_generation"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    simulation_id: Mapped[int] = mapped_column(ForeignKey("simulation_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    generation: Mapped[int] = mapped_column(Integer, nullable=False)
    state_counts_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    affected_cell_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    newly_ignited_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cell_states_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    metrics_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    simulation: Mapped["SimulationRun"] = relationship("SimulationRun", back_populates="steps")

