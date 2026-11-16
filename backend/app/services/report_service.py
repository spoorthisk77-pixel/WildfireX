import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException
from fastapi.responses import FileResponse, Response
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.core.constants import HOTSPOT_DISTINCTION_NOTE, SCIENTIFIC_DISCLAIMER
from backend.app.models.entities import (
    Dataset,
    Experiment,
    GridCell,
    HistoricalObservation,
    ProcessedGrid,
    Report,
    SimulationRun,
)
from backend.app.services.data_quality_service import build_data_quality_report
from backend.app.services.study_area_service import get_active_study_area
from backend.app.utils.file_storage import get_export_output_path


def _gather_report_context(
    db: Session,
    title: str,
    report_type: str,
    grid_id: Optional[int] = None,
    simulation_id: Optional[int] = None,
    experiment_id: Optional[int] = None,
) -> dict[str, Any]:
    area = get_active_study_area(db)
    datasets = list(
        db.execute(select(Dataset).options(selectinload(Dataset.metadata_record)).order_by(Dataset.created_at.desc()))
        .scalars()
        .all()
    )
    grids = list(db.execute(select(ProcessedGrid).order_by(ProcessedGrid.created_at.desc())).scalars().all())
    sims = list(
        db.execute(select(SimulationRun).options(selectinload(SimulationRun.steps)).order_by(SimulationRun.created_at.desc()))
        .scalars()
        .all()
    )
    exps = list(
        db.execute(select(Experiment).options(selectinload(Experiment.configurations)).order_by(Experiment.created_at.desc()))
        .scalars()
        .all()
    )

    target_grid = next((g for g in grids if g.id == grid_id), grids[0] if grids else None)
    target_sim = next((s for s in sims if s.id == simulation_id), sims[0] if sims else None)
    target_exp = next((e for e in exps if e.id == experiment_id), exps[0] if exps else None)

    landcover_breakdown: dict[str, int] = {}
    if target_grid:
        cells = list(db.execute(select(GridCell).where(GridCell.grid_id == target_grid.id)).scalars().all())
        for c in cells:
            landcover_breakdown[c.landcover_category] = landcover_breakdown.get(c.landcover_category, 0) + 1

    obs_rows = list(db.execute(select(HistoricalObservation)).scalars().all())
    hotspot_count = sum(1 for o in obs_rows if o.record_type != "confirmed_incident")
    confirmed_count = sum(1 for o in obs_rows if o.record_type == "confirmed_incident")
    duplicate_obs_count = sum(1 for o in obs_rows if o.is_duplicate)
    year_counts: dict[str, int] = {}
    for o in obs_rows:
        if o.observation_year:
            yr = str(o.observation_year)
            year_counts[yr] = year_counts.get(yr, 0) + 1

    dq = build_data_quality_report(db)
    generated_at = datetime.now(timezone.utc).isoformat()

    sim_final_counts = {}
    sim_steps_summary = []
    if target_sim and target_sim.steps:
        ordered_steps = sorted(target_sim.steps, key=lambda s: s.generation)
        sim_final_counts = ordered_steps[-1].state_counts_json
        for s in ordered_steps[:12]:
            sim_steps_summary.append({
                "generation": s.generation,
                "affected": s.affected_cell_count,
                "newly_ignited": s.newly_ignited_count,
                "states": s.state_counts_json,
            })

    sections = [
        {
            "number": 1,
            "title": "Project Title",
            "content": f"{title} — WildfireX Geospatial Research & Discrete Mathematics Platform",
        },
        {
            "number": 2,
            "title": "Study Area",
            "content": (
                f"Region: {area.region_label}. Name: {area.name}. "
                f"Verification Status: {area.verification_status}. "
                f"CRS: {area.crs or 'Awaiting verified boundary CRS'}. "
                f"Area: {f'{area.area_sq_km:.2f} sq km' if area.area_sq_km is not None else 'Not computed without boundary'}. "
                f"Boundary Vertices: {area.vertex_count or 0}."
            ),
        },
        {
            "number": 3,
            "title": "Dataset Information",
            "content": (
                f"{len(datasets)} registered dataset(s) in SQLite provenance store. "
                + (
                    "; ".join(
                        f"[DS-{d.id}] {d.name} ({d.file_format}, {d.file_size_bytes} bytes, SHA-256 {d.sha256_hash[:12]}, status={d.processing_status})"
                        for d in datasets[:8]
                    )
                    if datasets
                    else "No datasets uploaded yet."
                )
            ),
        },
        {
            "number": 4,
            "title": "Data Sources",
            "content": (
                "Supported authentic sources: ESA WorldCover 2021 v200 (10m land cover), NASA FIRMS (MODIS/VIIRS active-fire hotspots), "
                "Copernicus Sentinel-2 L2A (multispectral NDVI), and SRTM 30m DEM. "
                + (
                    "Imported sources: " + ", ".join(sorted({d.data_source for d in datasets}))
                    if datasets
                    else "No external data sources currently imported."
                )
            ),
        },
        {
            "number": 5,
            "title": "Geospatial Processing Method",
            "content": (
                "Vector/raster ingestion validates CRS, bounds, and geometry integrity via Rasterio, GeoPandas, Shapely, and PyProj. "
                "Metric analysis reprojects layers to WGS 84 / UTM Zone 43N (EPSG:32643), optionally clips to imported study-area polygons, "
                "and discretizes continuous rasters/vectors into indexed cellular grids without synthetic imputation."
            ),
        },
        {
            "number": 6,
            "title": "Mathematical Foundations",
            "content": (
                "WildfireX implements five Discrete Mathematics modules backed by NetworkX and SymPy: "
                "(I) Combinatorics & Inclusion-Exclusion (sum/product rules, nPr, nCr, pigeonhole, derangements, rook polynomials); "
                "(II) Propositional & Predicate Logic (safe AST truth tables, equivalences, De Morgan laws, inference, finite quantifiers); "
                "(III) Generating Functions & Recurrence Relations (OGF, EGF, integer partitions, 1st/2nd-order closed-form verification); "
                "(IV) Graph Theory G=(V,E) (Handshaking Lemma sum(deg)=2|E|, VF2 isomorphism, walks/paths, Euler/Hamiltonian, planarity & coloring); "
                "(V) Trees & Algorithms (Kruskal/Prim MST, Dijkstra shortest paths, Huffman prefix-free coding, binary tree traversals, sorting)."
            ),
        },
        {
            "number": 7,
            "title": "Grid Structure",
            "content": (
                f"Active Grid #{target_grid.id} '{target_grid.name}': {target_grid.rows}x{target_grid.cols} cells "
                f"({target_grid.cell_count} total, {target_grid.valid_cell_count} valid, {target_grid.nodata_cell_count} NoData), "
                f"resolution {target_grid.resolution_meters:.1f}m, CRS {target_grid.crs}, boundary_clipped={target_grid.clipped_to_boundary}."
                if target_grid
                else "No structured grid generated in current workspace."
            ),
        },
        {
            "number": 8,
            "title": "Graph Analysis",
            "content": (
                f"Cellular adjacency graph G=(V,E): |V|={(target_grid.metadata_json or {}).get('graph_nodes', target_grid.valid_cell_count)} vertices, "
                f"|E|={(target_grid.metadata_json or {}).get('graph_edges', 0)} edges, "
                f"connected_components={(target_grid.metadata_json or {}).get('connected_components', 'N/A')}, "
                f"connectivity={(target_grid.metadata_json or {}).get('connectivity', 4)}-neighbor stencil."
                if target_grid
                else "No cellular graph constructed yet."
            ),
        },
        {
            "number": 9,
            "title": "Controlled Simulation Configuration",
            "content": (
                f"SimulationRun #{target_sim.id} '{target_sim.name}' [classification={target_sim.data_classification}]: "
                f"neighborhood={target_sim.neighborhood}, boundary={target_sim.boundary_condition}, "
                f"seed_count={len(target_sim.seed_cells_json)}, generations={target_sim.current_generation}/{target_sim.max_generations}, "
                f"parameters={json.dumps(target_sim.parameters_json)}."
                if target_sim
                else (
                    f"Experiment #{target_exp.id} '{target_exp.name}' (module={target_exp.module_type}, status={target_exp.status})."
                    if target_exp
                    else "No controlled cellular automaton run recorded yet."
                )
            ),
        },
        {
            "number": 10,
            "title": "Results",
            "content": (
                (
                    f"CA Final State Counts (Gen {target_sim.current_generation}): {json.dumps(sim_final_counts)}. "
                    if target_sim
                    else "No simulation steps recorded. "
                )
                + (
                    f"Experiment #{target_exp.id} Results: {json.dumps(target_exp.results_json)}. "
                    if target_exp and target_exp.results_json
                    else ""
                )
                + f"Historical Observations Summary: {len(obs_rows)} total records "
                f"({hotspot_count} satellite hotspots, {confirmed_count} separately marked confirmed incidents, "
                f"{duplicate_obs_count} flagged duplicates)."
            ),
        },
        {
            "number": 11,
            "title": "Charts & Visualizations Summary",
            "content": (
                (
                    "Land-Cover Breakdown: "
                    + ", ".join(f"{k}: {v} cells" for k, v in sorted(landcover_breakdown.items(), key=lambda x: -x[1]))
                    + ". "
                    if landcover_breakdown
                    else "No land-cover distribution table available. "
                )
                + (
                    "Observations by Year: "
                    + ", ".join(f"{yr}: {cnt}" for yr, cnt in sorted(year_counts.items()))
                    if year_counts
                    else "No yearly observation series ingested."
                )
            ),
        },
        {
            "number": 12,
            "title": "Data Quality Information",
            "content": (
                f"{dq['imputation_policy']} "
                f"Audited {len(dq['datasets'])} dataset(s) and {len(dq['grids'])} grid(s); "
                f"recorded {len(dq['processing_history'])} processing job(s)."
            ),
        },
        {
            "number": 13,
            "title": "Assumptions",
            "content": (
                "Discrete uniform 2D cellular grid geometry; binary/categorical land-cover fuel capability masks; "
                "explicit absorbing/reflective/periodic boundary conditions; deterministic or bounded discrete-time transition steps; "
                "planar neighborhood graph G=(V,E) weighted on cell centroids."
            ),
        },
        {
            "number": 14,
            "title": "Limitations",
            "content": f"{SCIENTIFIC_DISCLAIMER} {HOTSPOT_DISTINCTION_NOTE}",
        },
        {
            "number": 15,
            "title": "References",
            "content": (
                "1. Zanaga, D. et al. (2022). ESA WorldCover 10 m 2021 v200. DOI: 10.5281/zenodo.7254221. "
                "2. NASA FIRMS (MODIS/VIIRS Active Fire Data). Earth Observing System Data and Information System (EOSDIS). "
                "3. Copernicus Sentinel-2 L2A & NASA SRTM 30m DEM. "
                "4. Rosen, K. H. Discrete Mathematics and Its Applications."
            ),
        },
    ]

    return {
        "title": title,
        "report_type": report_type,
        "generated_at": generated_at,
        "study_region": area.region_label,
        "grid_id": target_grid.id if target_grid else None,
        "simulation_id": target_sim.id if target_sim else None,
        "experiment_id": target_exp.id if target_exp else None,
        "sections": sections,
        "landcover_breakdown": landcover_breakdown,
        "sim_steps_summary": sim_steps_summary,
        "dataset_count": len(datasets),
        "observation_count": len(obs_rows),
        "disclaimer": SCIENTIFIC_DISCLAIMER,
    }


def _render_pdf(report_id: int, ctx: dict[str, Any], out_path: Path) -> None:
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=ctx["title"],
        author="WildfireX Research Platform",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "WXTitle",
        parent=styles["Heading1"],
        fontSize=17,
        leading=21,
        textColor=colors.HexColor("#1B4332"),
        spaceAfter=4,
    )
    meta_style = ParagraphStyle(
        "WXMeta",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#4B5851"),
        spaceAfter=10,
    )
    sec_heading_style = ParagraphStyle(
        "WXSecHeading",
        parent=styles["Heading2"],
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#141B18"),
        spaceBefore=8,
        spaceAfter=3,
    )
    body_style = ParagraphStyle(
        "WXBody",
        parent=styles["Normal"],
        fontSize=9.2,
        leading=13.2,
        textColor=colors.HexColor("#1F2923"),
        spaceAfter=4,
    )
    disclaimer_style = ParagraphStyle(
        "WXDisclaimer",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#7A1811"),
        backColor=colors.HexColor("#FDF6F6"),
        borderColor=colors.HexColor("#E5B8B4"),
        borderWidth=0.6,
        borderPadding=6,
        spaceAfter=10,
    )

    story: list[Any] = [
        Paragraph(ctx["title"], title_style),
        Paragraph(
            f"Report ID: WXR-{report_id} | Type: {ctx['report_type']} | "
            f"Generated (UTC): {ctx['generated_at']} | Study Region: {ctx['study_region']} | "
            f"Grid ID: {ctx['grid_id'] or 'None'} | Simulation ID: {ctx['simulation_id'] or 'None'} | "
            f"Experiment ID: {ctx['experiment_id'] or 'None'}",
            meta_style,
        ),
        Paragraph(f"<b>Scientific Limitations & Responsible Use:</b> {SCIENTIFIC_DISCLAIMER}", disclaimer_style),
    ]

    for sec in ctx["sections"]:
        story.append(Paragraph(f"{sec['number']:02d}. {sec['title']}", sec_heading_style))
        safe_text = (
            str(sec["content"])
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        story.append(Paragraph(safe_text, body_style))

    # Optional numeric table & bar chart in Section 11 visualizations
    lc = ctx.get("landcover_breakdown") or {}
    if lc:
        story.append(Spacer(1, 6))
        story.append(Paragraph("Land-Cover Cell Distribution Summary Table", sec_heading_style))
        table_data = [["Land-Cover Category", "Cell Count", "Share (%)"]]
        total_cells = max(1, sum(lc.values()))
        top_items = sorted(lc.items(), key=lambda x: -x[1])[:8]
        for cat, cnt in top_items:
            table_data.append([cat, str(cnt), f"{(cnt / total_cells) * 100:.1f}%"])
        t = Table(table_data, colWidths=[95 * mm, 35 * mm, 35 * mm])
        t.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1B4332")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#DCE2DC")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F6F3")]),
            ])
        )
        story.append(t)

        # Compact Vector Bar Chart for top land-cover classes
        drawing = Drawing(420, 145)
        drawing.add(String(0, 130, "Top Land-Cover Classes (Cell Counts)", fontSize=9, fillColor=colors.HexColor("#151B18")))
        bc = VerticalBarChart()
        bc.x = 35
        bc.y = 25
        bc.width = 365
        bc.height = 95
        bc.data = [[cnt for _, cnt in top_items[:6]]]
        bc.categoryAxis.categoryNames = [cat[:14] for cat, _ in top_items[:6]]
        bc.categoryAxis.labels.fontSize = 7
        bc.valueAxis.labels.fontSize = 7
        bc.valueAxis.valueMin = 0
        bc.bars[0].fillColor = colors.HexColor("#1B4332")
        drawing.add(bc)
        story.append(Spacer(1, 6))
        story.append(drawing)

    doc.build(story)


def _render_csv(report_id: int, ctx: dict[str, Any], out_path: Path) -> None:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["metadata_key", "value"])
    writer.writerow(["report_id", f"WXR-{report_id}"])
    writer.writerow(["title", ctx["title"]])
    writer.writerow(["report_type", ctx["report_type"]])
    writer.writerow(["generated_at_utc", ctx["generated_at"]])
    writer.writerow(["study_region", ctx["study_region"]])
    writer.writerow(["grid_id", ctx["grid_id"] or ""])
    writer.writerow(["simulation_id", ctx["simulation_id"] or ""])
    writer.writerow(["experiment_id", ctx["experiment_id"] or ""])
    writer.writerow(["disclaimer", SCIENTIFIC_DISCLAIMER])
    writer.writerow([])
    writer.writerow(["section_number", "section_title", "content"])
    for sec in ctx["sections"]:
        writer.writerow([sec["number"], sec["title"], sec["content"]])
    if ctx.get("landcover_breakdown"):
        writer.writerow([])
        writer.writerow(["landcover_category", "cell_count", ""])
        for k, v in sorted(ctx["landcover_breakdown"].items(), key=lambda x: -x[1]):
            writer.writerow([k, v, ""])
    out_path.write_text(buf.getvalue(), encoding="utf-8")


def generate_report(
    db: Session,
    title: str,
    report_format: str = "pdf",
    report_type: str = "comprehensive_research",
    grid_id: Optional[int] = None,
    simulation_id: Optional[int] = None,
    experiment_id: Optional[int] = None,
) -> Report:
    fmt = report_format.lower().strip()
    if fmt not in {"pdf", "csv"}:
        raise HTTPException(status_code=400, detail="Supported report formats are 'pdf' and 'csv'.")

    ctx = _gather_report_context(
        db=db,
        title=title.strip() or "WildfireX Research Report",
        report_type=report_type,
        grid_id=grid_id,
        simulation_id=simulation_id,
        experiment_id=experiment_id,
    )

    rep = Report(
        title=ctx["title"],
        report_type=report_type,
        experiment_id=ctx["experiment_id"],
        grid_id=ctx["grid_id"],
        format=fmt,
        summary_json={
            "generated_at": ctx["generated_at"],
            "study_region": ctx["study_region"],
            "simulation_id": ctx["simulation_id"],
            "dataset_count": ctx["dataset_count"],
            "observation_count": ctx["observation_count"],
            "section_count": len(ctx["sections"]),
            "sections": ctx["sections"],
        },
    )
    db.add(rep)
    db.flush()

    out_path = get_export_output_path(f"report_{rep.id}", f".{fmt}")
    if fmt == "pdf":
        _render_pdf(rep.id, ctx, out_path)
    else:
        _render_csv(rep.id, ctx, out_path)

    rep.file_path = str(out_path)
    db.commit()
    db.refresh(rep)
    return rep


def list_reports(db: Session) -> list[Report]:
    return list(db.execute(select(Report).order_by(Report.created_at.desc())).scalars().all())


def serialize_report(rep: Report) -> dict[str, Any]:
    return {
        "id": rep.id,
        "title": rep.title,
        "report_type": rep.report_type,
        "experiment_id": rep.experiment_id,
        "grid_id": rep.grid_id,
        "format": rep.format,
        "has_file": bool(rep.file_path and Path(rep.file_path).exists()),
        "summary_json": rep.summary_json,
        "created_at": rep.created_at.isoformat(),
    }


def download_report_response(db: Session, report_id: int) -> Response:
    rep = db.execute(select(Report).where(Report.id == report_id)).scalar_one_or_none()
    if not rep:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found.")
    if not rep.file_path or not Path(rep.file_path).exists():
        raise HTTPException(status_code=404, detail="Generated report artifact is missing.")
    media_type = "application/pdf" if rep.format == "pdf" else "text/csv; charset=utf-8"
    filename = f"wildfirex_report_{rep.id}.{rep.format}"
    return FileResponse(path=rep.file_path, media_type=media_type, filename=filename)


def delete_report(db: Session, report_id: int) -> dict:
    rep = db.execute(select(Report).where(Report.id == report_id)).scalar_one_or_none()
    if not rep:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found.")
    fp = rep.file_path
    db.delete(rep)
    db.commit()
    if fp:
        try:
            Path(fp).unlink(missing_ok=True)
        except Exception:
            pass
    return {"deleted": True, "id": report_id}
