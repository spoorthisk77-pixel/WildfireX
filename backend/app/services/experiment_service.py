import csv
import io
import json
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.core.constants import SCIENTIFIC_DISCLAIMER
from backend.app.models.entities import (
    Dataset,
    Experiment,
    ExperimentConfiguration,
    GridCell,
    ProcessedGrid,
    SimulationRun,
)
from backend.app.schemas.cellular_automata import SimulationCreateRequest
from backend.app.schemas.combinatorics import CombinatoricsRequest
from backend.app.schemas.experiment import ExperimentCreateRequest
from backend.app.schemas.generating_recurrence import OGFRequest, RecurrenceSolveRequest
from backend.app.schemas.graph_theory import GridGraphInspectRequest
from backend.app.schemas.logic import PropositionalEvalRequest
from backend.app.schemas.trees_algorithms import WeightedGraphAlgoRequest
from backend.app.services.cellular_automata_service import create_simulation, step_simulation
from backend.app.services.combinatorics_service import solve_combinatorics
from backend.app.services.generating_recurrence_service import analyze_ogf, solve_recurrence
from backend.app.services.grid_graph_service import inspect_grid_graph
from backend.app.services.logic_service import evaluate_propositional
from backend.app.services.trees_algorithms_service import run_weighted_graph_algorithm


def create_experiment(db: Session, payload: ExperimentCreateRequest) -> Experiment:
    dataset_hash = None
    dataset_id = payload.dataset_id
    if dataset_id is not None:
        ds = db.execute(select(Dataset).where(Dataset.id == dataset_id)).scalar_one_or_none()
        if not ds:
            raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} not found.")
        dataset_hash = ds.sha256_hash
    elif payload.grid_id is not None:
        grid = db.execute(select(ProcessedGrid).where(ProcessedGrid.id == payload.grid_id)).scalar_one_or_none()
        if grid:
            dataset_id = grid.source_dataset_id
            ds = db.execute(select(Dataset).where(Dataset.id == grid.source_dataset_id)).scalar_one_or_none()
            if ds:
                dataset_hash = ds.sha256_hash

    exp = Experiment(
        name=payload.name.strip(),
        module_type=payload.module_type,
        description=payload.description,
        grid_id=payload.grid_id,
        study_area_id=payload.study_area_id,
        dataset_id=dataset_id,
        dataset_version_hash=dataset_hash,
        status="configured",
    )
    db.add(exp)
    db.flush()

    cfg = ExperimentConfiguration(
        experiment_id=exp.id,
        parameters_json=payload.parameters,
        notes=payload.notes,
    )
    db.add(cfg)
    db.commit()
    return get_experiment(db, exp.id)


def list_experiments(db: Session) -> list[Experiment]:
    stmt = (
        select(Experiment)
        .options(selectinload(Experiment.configurations))
        .order_by(Experiment.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_experiment(db: Session, experiment_id: int) -> Experiment:
    stmt = (
        select(Experiment)
        .options(selectinload(Experiment.configurations))
        .where(Experiment.id == experiment_id)
    )
    exp = db.execute(stmt).scalar_one_or_none()
    if not exp:
        raise HTTPException(status_code=404, detail=f"Experiment {experiment_id} not found.")
    return exp


def execute_experiment(db: Session, experiment_id: int) -> Experiment:
    exp = get_experiment(db, experiment_id)
    params = dict(exp.configurations[-1].parameters_json) if exp.configurations else {}
    t0 = time.perf_counter()

    results: dict[str, Any] = {
        "module_type": exp.module_type,
        "dataset_id": exp.dataset_id,
        "dataset_version_hash": exp.dataset_version_hash,
    }

    try:
        if exp.module_type == "cellular_automata":
            if not exp.grid_id:
                raise HTTPException(
                    status_code=400,
                    detail="Cellular Automata experiment execution requires a linked processed grid_id.",
                )
            seed_uids = params.get("seed_cell_uids")
            if not seed_uids:
                burnable = db.execute(
                    select(GridCell)
                    .where(
                        GridCell.grid_id == exp.grid_id,
                        GridCell.quality_status == "valid",
                        GridCell.landcover_category != "Permanent water bodies",
                    )
                    .limit(1)
                ).scalars().first()
                if not burnable:
                    raise HTTPException(status_code=400, detail="No valid burnable cells available on linked grid.")
                seed_uids = [burnable.cell_uid]

            steps_to_run = min(int(params.get("steps", 5)), 30)
            sim_req = SimulationCreateRequest(
                name=f"{exp.name} (Exp #{exp.id})",
                grid_id=exp.grid_id,
                experiment_id=exp.id,
                neighborhood=str(params.get("neighborhood", "moore_8")),
                boundary_condition=str(params.get("boundary_condition", "absorbing")),
                seed_cell_uids=list(seed_uids),
                barrier_cell_uids=list(params.get("barrier_cell_uids", [])),
                base_transition_factor=float(params.get("base_transition_factor", 0.6)),
                moisture_damping=float(params.get("moisture_damping", 0.2)),
                wind_direction=str(params.get("wind_direction", "E")),
                wind_bias=float(params.get("wind_bias", 0.15)),
                burn_duration_steps=int(params.get("burn_duration_steps", 2)),
                max_generations=int(params.get("max_generations", 30)),
                deterministic_mode=bool(params.get("deterministic_mode", True)),
            )
            created = create_simulation(db, sim_req)
            sim_id = created["simulation"].id
            final_detail = step_simulation(db, sim_id, steps_to_advance=steps_to_run)
            final_step = final_detail["steps"][-1]
            results.update({
                "data_classification": "hypothetical_simulation",
                "simulation_id": sim_id,
                "generations_executed": final_detail["simulation"].current_generation,
                "final_state_counts": final_step.state_counts_json,
                "affected_cell_count": final_step.affected_cell_count,
                "disclaimer": SCIENTIFIC_DISCLAIMER,
            })

        elif exp.module_type == "graph_theory":
            if not exp.grid_id:
                raise HTTPException(status_code=400, detail="Graph theory grid inspection requires a linked grid_id.")
            graph_out = inspect_grid_graph(
                db,
                GridGraphInspectRequest(
                    grid_id=exp.grid_id,
                    neighborhood=str(params.get("neighborhood", "von_neumann_4")),
                    boundary_condition=str(params.get("boundary_condition", "absorbing")),
                    patch_rows=int(params.get("patch_rows", 6)),
                    patch_cols=int(params.get("patch_cols", 6)),
                ),
            )
            results.update({
                "data_classification": "mathematical_model",
                "summary": graph_out["result"],
                "verification": graph_out["verification"],
            })

        elif exp.module_type == "combinatorics":
            comb_req = CombinatoricsRequest(
                topic=params.get("topic", "combinations"),
                n=int(params.get("n", 8)),
                r=int(params.get("r", 3)),
                group_sizes=params.get("group_sizes") or params.get("groups"),
                board_matrix=params.get("board_matrix"),
            )
            comb_out = solve_combinatorics(comb_req)
            results.update({"data_classification": "mathematical_model", "summary": comb_out["result"]})

        elif exp.module_type == "logic":
            expr = str(params.get("expression", "P -> Q"))
            logic_out = evaluate_propositional(PropositionalEvalRequest(expression=expr))
            results.update({"data_classification": "mathematical_model", "summary": logic_out["result"]})

        elif exp.module_type in {"generating_functions", "recurrence"}:
            if exp.module_type == "generating_functions":
                gf_out = analyze_ogf(
                    OGFRequest(
                        expression=str(params.get("expression", "1 / (1 - x)")),
                        order=int(params.get("order", 8)),
                        extract_index=int(params.get("extract_index", 5)),
                    )
                )
                results.update({"data_classification": "mathematical_model", "summary": gf_out["result"]})
            else:
                rec_out = solve_recurrence(
                    RecurrenceSolveRequest(
                        order=int(params.get("order", 2)),
                        c1=float(params.get("c1", 1.0)),
                        c2=float(params.get("c2", 1.0)),
                        initial_a0=float(params.get("initial_a0", 0.0)),
                        initial_a1=float(params.get("initial_a1", 1.0)),
                        non_homogeneous_type=str(params.get("non_homogeneous_type", "none")),
                        terms_count=int(params.get("terms_count", 10)),
                    )
                )
                results.update({"data_classification": "mathematical_model", "summary": rec_out["result"]})

        elif exp.module_type in {"trees", "trees_algorithms"}:
            algo_out = run_weighted_graph_algorithm(
                db,
                WeightedGraphAlgoRequest(
                    algorithm=params.get("algorithm", "kruskal"),
                    grid_id=exp.grid_id if not params.get("vertices") else None,
                    vertices=params.get("vertices") or ["A", "B", "C", "D"],
                    edges=params.get("edges") or [
                        {"u": "A", "v": "B", "weight": 1},
                        {"u": "B", "v": "C", "weight": 2},
                        {"u": "C", "v": "D", "weight": 3},
                    ],
                    source_vertex=params.get("source_vertex") or params.get("source"),
                ),
            )
            results.update({"data_classification": "mathematical_model", "summary": algo_out["result"]})
        else:
            results.update({"data_classification": "configured_record", "parameters_recorded": params})

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        results["duration_ms"] = elapsed_ms

        exp.results_json = results
        exp.status = "completed"
        exp.executed_at = datetime.now(timezone.utc)
        db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        exp.status = "error"
        exp.results_json = {"error": str(exc)}
        db.commit()
        raise HTTPException(status_code=400, detail=f"Experiment execution failed: {exc}") from exc

    return get_experiment(db, exp.id)


def export_experiment_response(db: Session, experiment_id: int, export_format: str = "json") -> Response:
    exp = get_experiment(db, experiment_id)
    payload = {
        "id": exp.id,
        "name": exp.name,
        "module_type": exp.module_type,
        "description": exp.description,
        "grid_id": exp.grid_id,
        "study_area_id": exp.study_area_id,
        "dataset_id": exp.dataset_id,
        "dataset_version_hash": exp.dataset_version_hash,
        "status": exp.status,
        "executed_at": exp.executed_at.isoformat() if exp.executed_at else None,
        "created_at": exp.created_at.isoformat(),
        "configurations": [
            {
                "id": c.id,
                "parameters": c.parameters_json,
                "notes": c.notes,
                "created_at": c.created_at.isoformat(),
            }
            for c in exp.configurations
        ],
        "results": exp.results_json,
        "disclaimer": SCIENTIFIC_DISCLAIMER,
    }
    if export_format.lower() == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["field", "value"])
        for k, v in payload.items():
            writer.writerow([k, json.dumps(v) if isinstance(v, (dict, list)) else (v if v is not None else "")])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="wildfirex_experiment_{exp.id}.csv"'},
        )

    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="wildfirex_experiment_{exp.id}.json"'},
    )


def build_scenario_comparison(db: Session) -> dict[str, Any]:
    datasets = {d.id: d for d in db.execute(select(Dataset)).scalars().all()}
    grids = {g.id: g for g in db.execute(select(ProcessedGrid).order_by(ProcessedGrid.created_at.desc())).scalars().all()}
    sims = list(
        db.execute(
            select(SimulationRun)
            .options(selectinload(SimulationRun.steps))
            .order_by(SimulationRun.created_at.desc())
        )
        .scalars()
        .all()
    )
    experiments = list_experiments(db)

    simulation_scenarios = []
    for sim in sims:
        g = grids.get(sim.grid_id)
        ds = datasets.get(g.source_dataset_id) if g else None
        steps = sorted(sim.steps, key=lambda s: s.generation)
        final_step = steps[-1] if steps else None

        processing_ms = None
        if len(steps) >= 2 and steps[0].created_at and steps[-1].created_at:
            processing_ms = round((steps[-1].created_at - steps[0].created_at).total_seconds() * 1000.0, 1)

        valid_pct = round((g.valid_cell_count / g.cell_count) * 100.0, 2) if (g and g.cell_count) else None
        trajectory = [
            {
                "generation": s.generation,
                "unburned": s.state_counts_json.get("unburned", 0),
                "ignited": s.state_counts_json.get("ignited", 0),
                "burning": s.state_counts_json.get("burning", 0),
                "extinguished": s.state_counts_json.get("extinguished", 0),
                "non_burnable": s.state_counts_json.get("non_burnable", 0),
                "affected_cell_count": s.affected_cell_count,
            }
            for s in steps
        ]

        simulation_scenarios.append({
            "simulation_id": sim.id,
            "name": sim.name,
            "data_classification": sim.data_classification,
            "status": sim.status,
            "grid_id": sim.grid_id,
            "grid_name": g.name if g else f"Grid #{sim.grid_id}",
            "dataset_id": ds.id if ds else None,
            "dataset_name": ds.name if ds else None,
            "dataset_hash": ds.sha256_hash[:12] if ds else None,
            "grid_configuration": {
                "rows": g.rows if g else None,
                "cols": g.cols if g else None,
                "resolution_meters": g.resolution_meters if g else None,
                "crs": g.crs if g else None,
                "clipped_to_boundary": g.clipped_to_boundary if g else None,
            },
            "mathematical_assumptions": {
                "neighborhood": sim.neighborhood,
                "boundary_condition": sim.boundary_condition,
                "parameters": sim.parameters_json,
            },
            "initial_conditions": {
                "seed_cells": sim.seed_cells_json,
                "seed_count": len(sim.seed_cells_json),
                "initial_summary": sim.initial_summary_json,
            },
            "generation_count": sim.current_generation,
            "max_generations": sim.max_generations,
            "final_state_counts": final_step.state_counts_json if final_step else {},
            "affected_cell_count": final_step.affected_cell_count if final_step else 0,
            "graph_metrics": {
                "vertices": (g.metadata_json or {}).get("graph_nodes", g.valid_cell_count) if g else None,
                "edges": (g.metadata_json or {}).get("graph_edges") if g else None,
                "connected_components": (g.metadata_json or {}).get("connected_components") if g else None,
            },
            "data_quality": {
                "valid_cell_pct": valid_pct,
                "nodata_cell_count": g.nodata_cell_count if g else None,
            },
            "processing_duration_ms": processing_ms,
            "trajectory": trajectory,
            "created_at": sim.created_at.isoformat(),
        })

    experiment_summaries = []
    for exp in experiments:
        ds = datasets.get(exp.dataset_id) if exp.dataset_id else None
        g = grids.get(exp.grid_id) if exp.grid_id else None
        experiment_summaries.append({
            "id": exp.id,
            "name": exp.name,
            "module_type": exp.module_type,
            "description": exp.description,
            "status": exp.status,
            "grid_id": exp.grid_id,
            "grid_name": g.name if g else None,
            "dataset_id": exp.dataset_id,
            "dataset_name": ds.name if ds else None,
            "dataset_version_hash": exp.dataset_version_hash,
            "parameters": exp.configurations[-1].parameters_json if exp.configurations else {},
            "results_json": exp.results_json,
            "executed_at": exp.executed_at.isoformat() if exp.executed_at else None,
            "created_at": exp.created_at.isoformat(),
        })

    return {
        "simulation_scenarios": simulation_scenarios,
        "experiments": experiment_summaries,
        "disclaimer": SCIENTIFIC_DISCLAIMER,
        "scenario_notice": (
            "Scenario comparisons evaluate bounded, hypothetical cellular automaton and mathematical configurations "
            "side-by-side for educational sensitivity analysis. They are NOT operational wildfire forecasts."
        ),
    }


def delete_experiment(db: Session, experiment_id: int) -> dict:
    exp = get_experiment(db, experiment_id)
    db.delete(exp)
    db.commit()
    return {"deleted": True, "id": experiment_id}
