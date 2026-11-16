import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Eye,
  FileSpreadsheet,
  Map as MapIcon,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '../services/apiClient';
import type { CsvMappingPayload, Dataset, DatasetPreview } from '../types/api';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';

const DATA_SOURCE_OPTIONS = [
  { value: 'esa_worldcover', label: 'ESA WorldCover 2021 v200 (10m Land Cover GeoTIFF)' },
  { value: 'nasa_firms', label: 'NASA FIRMS (MODIS / VIIRS Fire Observations)' },
  { value: 'sentinel2_l2a', label: 'Copernicus Sentinel-2 Level-2A (Vegetation / Bands)' },
  { value: 'srtm', label: 'SRTM Digital Elevation Model (DEM GeoTIFF)' },
  { value: 'custom_boundary', label: 'Study-Area Boundary Vector' },
  { value: 'other', label: 'Other Geospatial / Research Dataset' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DatasetCentrePage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [dataSource, setDataSource] = useState('esa_worldcover');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [provenanceNotes, setProvenanceNotes] = useState('');
  const [licenseOrCitation, setLicenseOrCitation] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Selected dataset preview & mapping
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // CSV Mapping Form
  const [csvMapping, setCsvMapping] = useState<CsvMappingPayload>({
    latitude_column: '',
    longitude_column: '',
    cell_id_column: '',
    landcover_column: '',
    elevation_column: '',
    date_column: '',
    time_column: '',
    brightness_column: '',
    frp_column: '',
    confidence_column: '',
    satellite_column: '',
    instrument_column: '',
    record_type_column: '',
    crs: 'EPSG:4326',
    interpret_as: 'points',
  });
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingMessage, setMappingMessage] = useState<string | null>(null);

  // Delete confirmation modal
  const [confirmDelete, setConfirmDelete] = useState<Dataset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadDatasets = async (selectLatestId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listDatasets();
      setDatasets(res.items);
      const targetId = selectLatestId ?? selectedId ?? (res.items[0]?.id ?? null);
      if (targetId && res.items.some((d) => d.id === targetId)) {
        void openPreview(targetId);
      } else {
        setSelectedId(null);
        setPreview(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load datasets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDatasets();
  }, []);

  const openPreview = async (datasetId: number) => {
    setSelectedId(datasetId);
    setPreviewLoading(true);
    setMappingMessage(null);
    try {
      const data = await apiClient.getDatasetPreview(datasetId);
      setPreview(data);

      // Initialize CSV mapping form from existing mapping or sensible column guesses
      if (data.file_format === 'csv') {
        const colNames = data.columns.map((c) => c.name);
        const findCol = (patterns: string[]) =>
          colNames.find((c) => patterns.some((p) => c.toLowerCase().includes(p))) || '';

        const existing = data.csv_mapping || {};
        setCsvMapping({
          latitude_column: existing.latitude_column || findCol(['lat', 'latitude', 'y']),
          longitude_column: existing.longitude_column || findCol(['lon', 'lng', 'longitude', 'x']),
          cell_id_column: existing.cell_id_column || findCol(['cell_id', 'cell', 'id']),
          landcover_column: existing.landcover_column || findCol(['landcover', 'land_cover', 'cover', 'class', 'category']),
          elevation_column: existing.elevation_column || findCol(['elev', 'alt', 'dem']),
          date_column: existing.date_column || findCol(['acq_date', 'date']),
          time_column: existing.time_column || findCol(['acq_time', 'time']),
          brightness_column: existing.brightness_column || findCol(['bright', 'temp']),
          frp_column: existing.frp_column || findCol(['frp', 'power']),
          confidence_column: existing.confidence_column || findCol(['conf']),
          satellite_column: existing.satellite_column || findCol(['satellite', 'sat']),
          instrument_column: existing.instrument_column || findCol(['instrument', 'sensor']),
          record_type_column: existing.record_type_column || findCol(['record_type', 'incident_type', 'type']),
          crs: existing.crs || 'EPSG:4326',
          interpret_as: (existing.interpret_as as CsvMappingPayload['interpret_as']) || 'points',
        });
      }
    } catch (err) {
      setPreview(null);
      setUploadFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load dataset preview.',
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setUploadFeedback({ type: 'error', text: 'Select a CSV, GeoTIFF, GeoJSON, or Shapefile ZIP file before uploading.' });
      return;
    }
    const datasetName = name.trim() || file.name.replace(/\.[^/.]+$/, '');
    setUploading(true);
    setUploadFeedback(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', datasetName);
    formData.append('data_source', dataSource);
    if (acquisitionDate) formData.append('acquisition_date', acquisitionDate);
    if (provenanceNotes) formData.append('provenance_notes', provenanceNotes);
    if (licenseOrCitation) formData.append('license_or_citation', licenseOrCitation);

    try {
      const created = await apiClient.uploadDataset(formData);
      setUploadFeedback({
        type: 'success',
        text: `Dataset "${created.name}" (${created.file_format}) uploaded and validated.`,
      });
      setFile(null);
      setName('');
      setProvenanceNotes('');
      setLicenseOrCitation('');
      await loadDatasets(created.id);
    } catch (err) {
      setUploadFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Dataset upload failed validation.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveCsvMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    if (!csvMapping.latitude_column || !csvMapping.longitude_column) {
      setMappingMessage('Both Latitude and Longitude columns must be selected.');
      return;
    }
    setMappingSaving(true);
    setMappingMessage(null);
    try {
      const updated = await apiClient.applyCsvMapping(selectedId, {
        ...csvMapping,
        cell_id_column: csvMapping.cell_id_column || null,
        landcover_column: csvMapping.landcover_column || null,
        elevation_column: csvMapping.elevation_column || null,
        date_column: csvMapping.date_column || null,
        time_column: csvMapping.time_column || null,
        brightness_column: csvMapping.brightness_column || null,
        frp_column: csvMapping.frp_column || null,
        confidence_column: csvMapping.confidence_column || null,
        satellite_column: csvMapping.satellite_column || null,
        instrument_column: csvMapping.instrument_column || null,
        record_type_column: csvMapping.record_type_column || null,
      });
      setMappingMessage(
        updated.processing_status === 'processed'
          ? 'Mapping saved and historical fire observations ingested into SQLite.'
          : 'CSV column mapping validated and saved.',
      );
      await loadDatasets(selectedId);
    } catch (err) {
      setMappingMessage(err instanceof Error ? err.message : 'Failed to validate CSV mapping.');
    } finally {
      setMappingSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await apiClient.deleteDataset(confirmDelete.id);
      setConfirmDelete(null);
      await loadDatasets();
    } catch (err) {
      setUploadFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete dataset.',
      });
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const selectedDataset = datasets.find((d) => d.id === selectedId) || null;

  const landcoverChartData =
    preview?.raster_summary?.landcover_summary
      ? Object.entries(preview.raster_summary.landcover_summary).map(([category, count]) => ({
          category,
          count,
        }))
      : [];

  return (
    <div className="space-y-8">
      {/* Upload & Provenance Form */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-[#E7EBE6]">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#151B18]">Import Geospatial Dataset</h2>
            <p className="text-xs text-[#5B6861]">
              Supported formats: CSV (.csv), GeoTIFF (.tif, .tiff), GeoJSON (.geojson, .json), and Shapefile ZIP (.zip)
            </p>
          </div>
        </div>

        <form onSubmit={handleUpload} className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-[#2A332E] mb-1.5" htmlFor="dataset-file">
              Dataset File *
            </label>
            <input
              id="dataset-file"
              type="file"
              accept=".csv,.tif,.tiff,.geojson,.json,.zip"
              onChange={(e) => {
                const chosen = e.target.files?.[0] || null;
                setFile(chosen);
                if (chosen && !name) {
                  setName(chosen.name.replace(/\.[^/.]+$/, ''));
                }
              }}
              className="block w-full rounded-md border border-[#C6CFC8] bg-[#FAFBF9] px-3 py-2 text-xs text-[#151B18] file:mr-3 file:rounded file:border-0 file:bg-[#1B4332] file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[#143326]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2A332E] mb-1.5" htmlFor="dataset-name">
              Dataset Title *
            </label>
            <input
              id="dataset-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nagarhole ESA WorldCover 2021"
              className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2 text-xs text-[#151B18] focus:border-[#1B4332] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2A332E] mb-1.5" htmlFor="dataset-source">
              Data Source & Provenance
            </label>
            <select
              id="dataset-source"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2 text-xs text-[#151B18] focus:border-[#1B4332] focus:outline-none"
            >
              {DATA_SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2A332E] mb-1.5" htmlFor="dataset-date">
              Acquisition Date (Optional)
            </label>
            <input
              id="dataset-date"
              type="text"
              value={acquisitionDate}
              onChange={(e) => setAcquisitionDate(e.target.value)}
              placeholder="e.g. 2021-01-01 to 2021-12-31"
              className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2 text-xs text-[#151B18] focus:border-[#1B4332] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2A332E] mb-1.5" htmlFor="dataset-citation">
              License / Citation (Optional)
            </label>
            <input
              id="dataset-citation"
              type="text"
              value={licenseOrCitation}
              onChange={(e) => setLicenseOrCitation(e.target.value)}
              placeholder="e.g. Zanaga et al. 2022, CC-BY-4.0"
              className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2 text-xs text-[#151B18] focus:border-[#1B4332] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2A332E] mb-1.5" htmlFor="dataset-notes">
              Provenance Notes (Optional)
            </label>
            <input
              id="dataset-notes"
              type="text"
              value={provenanceNotes}
              onChange={(e) => setProvenanceNotes(e.target.value)}
              placeholder="Processing history or tile ID"
              className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2 text-xs text-[#151B18] focus:border-[#1B4332] focus:outline-none"
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3 flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="text-xs">
              {uploadFeedback && (
                <span
                  className={`inline-flex items-center gap-1.5 font-medium ${
                    uploadFeedback.type === 'success' ? 'text-[#1E6B45]' : 'text-[#B42318]'
                  }`}
                >
                  {uploadFeedback.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{uploadFeedback.text}</span>
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-md bg-[#1B4332] px-4 py-2 text-xs font-medium text-white hover:bg-[#143326] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{uploading ? 'Validating & Uploading...' : 'Upload & Validate Dataset'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Dataset Listing & Preview Split */}
      {loading ? (
        <LoadingState message="Loading registered datasets..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadDatasets()} />
      ) : datasets.length === 0 ? (
        <EmptyState
          title="Dataset catalogue is empty"
          description="Upload a GeoTIFF raster, GeoJSON vector, Shapefile ZIP archive, or CSV observation table above to inspect metadata, preview attributes, and prepare structured grids."
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left: Dataset Table */}
          <section className="xl:col-span-5 rounded-lg border border-[#DCE2DC] bg-white overflow-hidden">
            <div className="border-b border-[#DCE2DC] px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-[#151B18]">
                Registered Datasets ({datasets.length})
              </h3>
              <Database className="h-4 w-4 text-[#5B6861]" />
            </div>
            <div className="divide-y divide-[#E7EBE6]">
              {datasets.map((ds) => {
                const isSelected = ds.id === selectedId;
                return (
                  <div
                    key={ds.id}
                    className={`px-5 py-4 transition-colors ${isSelected ? 'bg-[#EEF3EF]' : 'hover:bg-[#FAFBF9]'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openPreview(ds.id)}
                        className="text-left min-w-0 flex-1"
                      >
                        <div className="text-sm font-semibold text-[#151B18] truncate">{ds.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#5B6861] font-mono tabular-nums">
                          <span>{ds.file_format.toUpperCase()}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatBytes(ds.file_size_bytes)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{ds.metadata_record?.crs || 'CRS Pending'}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#6B7871]">
                          <span>Source: {ds.data_source}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-medium ${
                              ds.processing_status === 'error'
                                ? 'text-[#B42318]'
                                : ds.processing_status === 'uploaded' && ds.file_format === 'csv'
                                  ? 'text-[#9A5B13]'
                                  : 'text-[#1E6B45]'
                            }`}
                          >
                            {ds.processing_status === 'uploaded' && ds.file_format === 'csv'
                              ? 'Awaiting CSV mapping'
                              : ds.processing_status}
                          </span>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openPreview(ds.id)}
                          className="rounded p-1.5 text-[#4B5851] hover:bg-white hover:text-[#151B18]"
                          title="Inspect metadata and preview"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(ds)}
                          className="rounded p-1.5 text-[#6B7871] hover:bg-[#FDF6F6] hover:text-[#B42318]"
                          title="Delete dataset"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Right: Metadata & Preview Workspace */}
          <section className="xl:col-span-7 rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-6">
            {!selectedDataset ? (
              <p className="text-sm text-[#6B7871]">Select a dataset from the registry to inspect its metadata and preview.</p>
            ) : previewLoading ? (
              <LoadingState message="Extracting geospatial metadata and preview rows..." />
            ) : (
              <>
                <div className="border-b border-[#E7EBE6] pb-4 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-[#151B18]">{selectedDataset.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#5B6861] font-mono tabular-nums">
                      <span>{selectedDataset.original_filename}</span>
                      <span aria-hidden="true">·</span>
                      <span>SHA256: {selectedDataset.sha256_hash.slice(0, 12)}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-[#5B6861]">
                    <div>Status: <span className="font-medium text-[#151B18]">{selectedDataset.processing_status}</span></div>
                    <div className="font-mono tabular-nums mt-0.5">
                      Uploaded {new Date(selectedDataset.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* GeoTIFF Metadata Summary */}
                {preview?.raster_summary && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#151B18]">
                      <MapIcon className="h-4 w-4 text-[#1B4332]" />
                      <span>GeoTIFF Raster Metadata</span>
                    </div>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-md bg-[#F5F6F3] p-4 text-xs">
                      <div>
                        <dt className="text-[#6B7871]">CRS / EPSG</dt>
                        <dd className="mt-1 font-mono font-medium text-[#151B18]">
                          {preview.raster_summary.crs || 'Undefined'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#6B7871]">Dimensions</dt>
                        <dd className="mt-1 font-mono tabular-nums font-medium text-[#151B18]">
                          {preview.raster_summary.width} × {preview.raster_summary.height} px
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#6B7871]">Pixel Resolution</dt>
                        <dd className="mt-1 font-mono tabular-nums font-medium text-[#151B18]">
                          {preview.raster_summary.resolution_x?.toFixed(6)} ×{' '}
                          {preview.raster_summary.resolution_y?.toFixed(6)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#6B7871]">Bands / NoData</dt>
                        <dd className="mt-1 font-mono tabular-nums font-medium text-[#151B18]">
                          {preview.raster_summary.band_count} band · {preview.raster_summary.nodata_value ?? 'None'}
                        </dd>
                      </div>
                    </dl>

                    {preview.raster_summary.band_stats.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-[#E7EBE6] text-[#5B6861]">
                              <th className="py-2 font-medium">Band</th>
                              <th className="py-2 font-medium">Type</th>
                              <th className="py-2 font-medium text-right">Min</th>
                              <th className="py-2 font-medium text-right">Max</th>
                              <th className="py-2 font-medium text-right">Mean</th>
                              <th className="py-2 font-medium text-right">Valid Sample %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F0F2EF] font-mono tabular-nums">
                            {preview.raster_summary.band_stats.map((b) => (
                              <tr key={b.band}>
                                <td className="py-2">{b.band}</td>
                                <td className="py-2">{b.dtype}</td>
                                <td className="py-2 text-right">{b.min ?? '—'}</td>
                                <td className="py-2 text-right">{b.max ?? '—'}</td>
                                <td className="py-2 text-right">{b.mean !== null ? b.mean.toFixed(3) : '—'}</td>
                                <td className="py-2 text-right">{(b.valid_sample_ratio * 100).toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {landcoverChartData.length > 0 && (
                      <div className="pt-2">
                        <div className="text-xs font-medium text-[#4B5851] mb-2">
                          Sampled Land-Cover Value Distribution
                        </div>
                        <div className="h-48 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={landcoverChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE6" />
                              <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#4B5851' }} />
                              <YAxis tick={{ fontSize: 11, fill: '#4B5851' }} />
                              <Tooltip />
                              <Bar dataKey="count" fill="#1B4332" radius={[3, 3, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Vector Metadata Summary */}
                {preview?.vector_summary && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#151B18]">
                      <MapIcon className="h-4 w-4 text-[#1B4332]" />
                      <span>Vector Dataset Inspection</span>
                    </div>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-md bg-[#F5F6F3] p-4 text-xs">
                      <div>
                        <dt className="text-[#6B7871]">CRS</dt>
                        <dd className="mt-1 font-mono font-medium text-[#151B18]">
                          {preview.vector_summary.crs || 'Undefined'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#6B7871]">Geometry Types</dt>
                        <dd className="mt-1 font-mono font-medium text-[#151B18]">
                          {preview.vector_summary.geometry_types.join(', ') || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#6B7871]">Feature Count</dt>
                        <dd className="mt-1 font-mono tabular-nums font-medium text-[#151B18]">
                          {preview.vector_summary.feature_count ?? 0}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#6B7871]">Invalid Geometries</dt>
                        <dd
                          className={`mt-1 font-mono tabular-nums font-medium ${
                            (preview.vector_summary.invalid_geometry_count || 0) > 0
                              ? 'text-[#B42318]'
                              : 'text-[#1E6B45]'
                          }`}
                        >
                          {preview.vector_summary.invalid_geometry_count ?? 0}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}

                {/* CSV Column Mapping Interface */}
                {preview?.file_format === 'csv' && (
                  <form onSubmit={handleSaveCsvMapping} className="rounded-md border border-[#DCE2DC] bg-[#FAFBF9] p-4 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#151B18]">
                        <SlidersHorizontal className="h-4 w-4 text-[#1B4332]" />
                        <span>CSV Column Mapping & Spatial Interpretation</span>
                      </div>
                      <span className="text-[11px] text-[#5B6861]">
                        CSV files are not assumed to be rasters
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block text-[#4B5851] mb-1">Interpretation Mode</label>
                        <select
                          value={csvMapping.interpret_as}
                          onChange={(e) =>
                            setCsvMapping({
                              ...csvMapping,
                              interpret_as: e.target.value as CsvMappingPayload['interpret_as'],
                            })
                          }
                          className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                        >
                          <option value="points">Spatial Point Samples</option>
                          <option value="grid_cells">Pre-indexed Cell Table</option>
                          <option value="historical_observations">Historical Wildfire Observations (FIRMS)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[#4B5851] mb-1">Latitude Column *</label>
                        <select
                          value={csvMapping.latitude_column}
                          onChange={(e) => setCsvMapping({ ...csvMapping, latitude_column: e.target.value })}
                          className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                        >
                          <option value="">Select column...</option>
                          {preview.columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name} ({c.dtype})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[#4B5851] mb-1">Longitude Column *</label>
                        <select
                          value={csvMapping.longitude_column}
                          onChange={(e) => setCsvMapping({ ...csvMapping, longitude_column: e.target.value })}
                          className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                        >
                          <option value="">Select column...</option>
                          {preview.columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name} ({c.dtype})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[#4B5851] mb-1">Cell ID Column</label>
                        <select
                          value={csvMapping.cell_id_column || ''}
                          onChange={(e) => setCsvMapping({ ...csvMapping, cell_id_column: e.target.value })}
                          className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                        >
                          <option value="">None</option>
                          {preview.columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[#4B5851] mb-1">Land-Cover Category Column</label>
                        <select
                          value={csvMapping.landcover_column || ''}
                          onChange={(e) => setCsvMapping({ ...csvMapping, landcover_column: e.target.value })}
                          className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                        >
                          <option value="">None</option>
                          {preview.columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[#4B5851] mb-1">CRS</label>
                        <input
                          type="text"
                          value={csvMapping.crs}
                          onChange={(e) => setCsvMapping({ ...csvMapping, crs: e.target.value })}
                          className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5 font-mono"
                        />
                      </div>

                      {csvMapping.interpret_as === 'historical_observations' && (
                        <>
                          <div>
                            <label className="block text-[#4B5851] mb-1">Acquisition Date Column</label>
                            <select
                              value={csvMapping.date_column || ''}
                              onChange={(e) => setCsvMapping({ ...csvMapping, date_column: e.target.value })}
                              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                            >
                              <option value="">None</option>
                              {preview.columns.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[#4B5851] mb-1">FRP (MW) Column</label>
                            <select
                              value={csvMapping.frp_column || ''}
                              onChange={(e) => setCsvMapping({ ...csvMapping, frp_column: e.target.value })}
                              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                            >
                              <option value="">None</option>
                              {preview.columns.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[#4B5851] mb-1">Confidence Column</label>
                            <select
                              value={csvMapping.confidence_column || ''}
                              onChange={(e) => setCsvMapping({ ...csvMapping, confidence_column: e.target.value })}
                              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                            >
                              <option value="">None</option>
                              {preview.columns.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[#4B5851] mb-1">Acquisition Time Column</label>
                            <select
                              value={csvMapping.time_column || ''}
                              onChange={(e) => setCsvMapping({ ...csvMapping, time_column: e.target.value })}
                              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                            >
                              <option value="">None</option>
                              {preview.columns.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[#4B5851] mb-1">Satellite Column</label>
                            <select
                              value={csvMapping.satellite_column || ''}
                              onChange={(e) => setCsvMapping({ ...csvMapping, satellite_column: e.target.value })}
                              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                            >
                              <option value="">None</option>
                              {preview.columns.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[#4B5851] mb-1">Instrument Column</label>
                            <select
                              value={csvMapping.instrument_column || ''}
                              onChange={(e) => setCsvMapping({ ...csvMapping, instrument_column: e.target.value })}
                              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                            >
                              <option value="">None</option>
                              {preview.columns.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[#4B5851] mb-1">Record Type (Hotspot vs Confirmed)</label>
                            <select
                              value={csvMapping.record_type_column || ''}
                              onChange={(e) => setCsvMapping({ ...csvMapping, record_type_column: e.target.value })}
                              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                            >
                              <option value="">Default: Satellite Hotspot</option>
                              {preview.columns.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <span className="text-xs font-medium text-[#1E6B45]">{mappingMessage || ''}</span>
                      <button
                        type="submit"
                        disabled={mappingSaving}
                        className="rounded-md bg-[#1B4332] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#143326] disabled:opacity-50"
                      >
                        {mappingSaving ? 'Saving Mapping...' : 'Apply Column Mapping'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Preview Table for CSV / Vector */}
                {preview && preview.rows.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#151B18]">
                      <FileSpreadsheet className="h-4 w-4 text-[#1B4332]" />
                      <span>Attribute Preview (First {preview.rows.length} Records)</span>
                    </div>
                    <div className="overflow-x-auto rounded border border-[#E7EBE6]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F5F6F3] text-[#4B5851]">
                          <tr>
                            {Object.keys(preview.rows[0]).map((col) => (
                              <th key={col} className="px-3 py-2 font-medium whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0F2EF] font-mono tabular-nums">
                          {preview.rows.map((row, rIdx) => (
                            <tr key={rIdx}>
                              {Object.keys(preview.rows[0]).map((col) => (
                                <td key={col} className="px-3 py-1.5 whitespace-nowrap text-[#151B18]">
                                  {row[col] !== null && row[col] !== undefined ? String(row[col]) : '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-lg border border-[#DCE2DC] bg-white p-6">
            <h3 className="font-display text-base font-semibold text-[#151B18]">Confirm Dataset Deletion</h3>
            <p className="mt-2 text-sm text-[#4B5851]">
              Are you sure you want to delete <span className="font-semibold text-[#151B18]">{confirmDelete.name}</span>?
              This removes the stored file, extracted metadata, and any derived grids or observations linked to it.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-md border border-[#C6CFC8] bg-white px-3.5 py-2 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="rounded-md bg-[#B42318] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#911C13] disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Dataset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
