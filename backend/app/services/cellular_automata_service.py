import random
from typing import Any, Optional
from fastapi import HTTPException
from pyproj import Transformer
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.entities import GridCell, ProcessedGrid, SimulationRun, SimulationStep
from backend.app.schemas.cellular_automata import (
    CoordinateConvertRequest,
    CoordinateConvertResponse,
    GridNeighborhoodRequest,
    GridNeighborhoodResponse,
    SimulationCreateRequest,
)

# Abstract, bounded educational susceptibility weights by land-cover class.
# Explicitly NOT operationally calibrated fire-behavior fuel parameters.
ABSTRACT_SUSCEPTIBILITY: dict[str, float] = {
    "Tree cover": 0.90,
    "Shrubland": 0.78,
    "Grassland": 0.72,
    "Cropland": 0.45,
    "Herbaceous wetland": 0.25,
    "Mangroves": 0.20,
    "Moss and lichen": 0.30,
    "Built-up": 0.15,
    "Bare / sparse vegetation": 0.05,
    "Permanent water bodies": 0.0,
    "Snow and ice": 0.0,
    "NoData": 0.0,
}

NON_BURNABLE_CATEGORIES = {
    "Permanent water bodies",
    "Snow and ice",
    "NoData",
}

DIRECTION_VECTORS: dict[str, tuple[int, int]] = {
    "N": (-1, 0),
    "NE": (-1, 1),
    "E": (0, 1),
    "SE": (1, 1),
    "S": (1, 0),
    "SW": (1, -1),
    "W": (0, -1),
    "NW": (-1, -1),
}

NEIGHBOR_OFFSETS_4: list[tuple[str, int, int]] = [
    ("N", -1, 0),
    ("E", 0, 1),
    ("S", 1, 0),
    ("W", 0, -1),
]

NEIGHBOR_OFFSETS_8: list[tuple[str, int, int]] = [
    ("N", -1, 0),
    ("NE", -1, 1),
    ("E", 0, 1),
    ("SE", 1, 1),
    ("S", 1, 0),
    ("SW", 1, -1),
    ("W", 0, -1),
    ("NW", -1, -1),
]


def _get_grid_or_404(db: Session, grid_id: int) -> ProcessedGrid:
    grid = db.execute(select(ProcessedGrid).where(ProcessedGrid.id == grid_id)).scalar_one_or_none()
    if not grid:
        raise HTTPException(status_code=404, detail=f"Processed grid {grid_id} not found.")
    return grid


def _resolve_neighbor_coord(
    r: int,
    c: int,
    dr: int,
    dc: int,
    rows: int,
    cols: int,
    boundary_condition: str,
) -> Optional[tuple[int, int]]:
    nr, nc = r + dr, c + dc
    if 0 <= nr < rows and 0 <= nc < cols:
        return (nr, nc)
    if boundary_condition == "absorbing":
        return None
    if boundary_condition == "periodic":
        return (nr % rows, nc % cols)
    if boundary_condition == "reflective":
        rr = min(max(nr, 0), rows - 1)
        cc = min(max(nc, 0), cols - 1)
        if rr == r and cc == c:
            return None
        return (rr, cc)
    return None


def convert_grid_coordinates(db: Session, payload: CoordinateConvertRequest) -> CoordinateConvertResponse:
    grid = _get_grid_or_404(db, payload.grid_id)
    bounds = grid.bounds_json or {}
    wgs_minx = float(bounds.get("minx", 0.0))
    wgs_miny = float(bounds.get("miny", 0.0))
    wgs_maxx = float(bounds.get("maxx", 1.0))
    wgs_maxy = float(bounds.get("maxy", 1.0))

    to_wgs84 = Transformer.from_crs(grid.crs, "EPSG:4326", always_xy=True)
    to_native = Transformer.from_crs("EPSG:4326", grid.crs, always_xy=True)
    minx, miny, maxx, maxy = to_native.transform_bounds(wgs_minx, wgs_miny, wgs_maxx, wgs_maxy)

    dx = (maxx - minx) / max(grid.cols, 1)
    dy = (maxy - miny) / max(grid.rows, 1)

    if payload.mode == "grid_to_geo":
        if payload.row_idx is None or payload.col_idx is None:
            raise HTTPException(status_code=400, detail="row_idx and col_idx are required for grid_to_geo mode.")
        r, c = payload.row_idx, payload.col_idx
        inside = 0 <= r < grid.rows and 0 <= c < grid.cols
        native_x = minx + (c + 0.5) * dx
        native_y = maxy - (r + 0.5) * dy
        lon, lat = to_wgs84.transform(native_x, native_y)
        cell = db.execute(
            select(GridCell).where(
                GridCell.grid_id == grid.id,
                GridCell.row_idx == r,
                GridCell.col_idx == c,
            )
        ).scalar_one_or_none()
        return CoordinateConvertResponse(
            grid_id=grid.id,
            mode=payload.mode,
            row_idx=r,
            col_idx=c,
            cell_uid=cell.cell_uid if cell else None,
            center_lon=round(float(lon), 6),
            center_lat=round(float(lat), 6),
            native_x=round(native_x, 2),
            native_y=round(native_y, 2),
            crs=grid.crs,
            inside_grid_bounds=inside,
            note="Converted using affine grid origin (minx, maxy) and PyProj transformer.",
        )

    if payload.longitude is None or payload.latitude is None:
        raise HTTPException(status_code=400, detail="longitude and latitude are required for geo_to_grid mode.")
    native_x, native_y = to_native.transform(payload.longitude, payload.latitude)
    c = int((native_x - minx) // dx)
    r = int((maxy - native_y) // dy)
    inside = 0 <= r < grid.rows and 0 <= c < grid.cols
    cell = None
    if inside:
        cell = db.execute(
            select(GridCell).where(
                GridCell.grid_id == grid.id,
                GridCell.row_idx == r,
                GridCell.col_idx == c,
            )
        ).scalar_one_or_none()

    return CoordinateConvertResponse(
        grid_id=grid.id,
        mode=payload.mode,
        row_idx=r,
        col_idx=c,
        cell_uid=cell.cell_uid if cell else None,
        center_lon=round(payload.longitude, 6),
        center_lat=round(payload.latitude, 6),
        native_x=round(float(native_x), 2),
        native_y=round(float(native_y), 2),
        crs=grid.crs,
        inside_grid_bounds=inside,
        note="Projected WGS84 coordinates into grid CRS and mapped to discrete lattice index (row, col).",
    )


def inspect_grid_neighborhood(db: Session, payload: GridNeighborhoodRequest) -> GridNeighborhoodResponse:
    grid = _get_grid_or_404(db, payload.grid_id)
    cells = list(db.execute(select(GridCell).where(GridCell.grid_id == grid.id)).scalars().all())
    by_coord = {(c.row_idx, c.col_idx): c for c in cells}
    by_uid = {c.cell_uid: c for c in cells}

    target = by_uid.get(payload.cell_uid)
    if not target:
        raise HTTPException(status_code=404, detail=f"Cell {payload.cell_uid} not found in grid {grid.id}.")

    offsets = NEIGHBOR_OFFSETS_8 if payload.neighborhood == "moore_8" else NEIGHBOR_OFFSETS_4
    neighbors: list[dict[str, Any]] = []
    clipped: list[str] = []
    seen_uids: set[str] = set()

    for direction, dr, dc in offsets:
        resolved = _resolve_neighbor_coord(
            target.row_idx,
            target.col_idx,
            dr,
            dc,
            grid.rows,
            grid.cols,
            payload.boundary_condition,
        )
        if resolved is None:
            clipped.append(direction)
            continue
        nb = by_coord.get(resolved)
        if nb is None or nb.cell_uid in seen_uids:
            continue
        seen_uids.add(nb.cell_uid)
        neighbors.append(
            {
                "direction": direction,
                "cell_uid": nb.cell_uid,
                "graph_vertex_id": nb.graph_vertex_id,
                "row_idx": nb.row_idx,
                "col_idx": nb.col_idx,
                "landcover_category": nb.landcover_category,
                "quality_status": nb.quality_status,
                "wrapped_or_reflected": (target.row_idx + dr, target.col_idx + dc) != resolved,
            }
        )

    return GridNeighborhoodResponse(
        grid_id=grid.id,
        cell_uid=target.cell_uid,
        row_idx=target.row_idx,
        col_idx=target.col_idx,
        neighborhood=payload.neighborhood,
        boundary_condition=payload.boundary_condition,
        neighbor_details=neighbors,
        degree=len(neighbors),
        boundary_clipped_directions=clipped,
    )


def _compute_state_counts(states: dict[str, str]) -> dict[str, int]:
    counts = {
        "non_burnable": 0,
        "unburned": 0,
        "ignited": 0,
        "burning": 0,
        "extinguished": 0,
    }
    for st in states.values():
        counts[st] = counts.get(st, 0) + 1
    return counts


def create_simulation(db: Session, payload: SimulationCreateRequest) -> SimulationDetailOutPlaceholder if False else dict:
    grid = _get_grid_or_404(db, payload.grid_id)
    cells = list(
        db.execute(select(GridCell).where(GridCell.grid_id == grid.id).order_by(GridCell.row_idx, GridCell.col_idx))
        .scalars()
        .all()
    )
    if not cells:
        raise HTTPException(status_code=400, detail="Selected grid contains no cells.")

    by_uid = {c.cell_uid: c for c in cells}
    barrier_set = set(payload.barrier_cell_uids)
    seed_set = set(payload.seed_cell_uids)

    missing_seeds = [u for u in seed_set if u not in by_uid]
    if missing_seeds:
        raise HTTPException(status_code=400, detail=f"Seed cell(s) not found in grid: {', '.join(missing_seeds[:5])}")

    initial_states: dict[str, str] = {}
    valid_seed_count = 0
    for c in cells:
        if c.quality_status != "valid" or c.landcover_category in NON_BURNABLE_CATEGORIES or c.cell_uid in barrier_set:
            initial_states[c.cell_uid] = "non_burnable"
        elif c.cell_uid in seed_set:
            initial_states[c.cell_uid] = "ignited"
            valid_seed_count += 1
        else:
            initial_states[c.cell_uid] = "unburned"

    if valid_seed_count == 0:
        raise HTTPException(
            status_code=400,
            detail="None of the selected seed cells are burnable (they may be water, NoData, or barriers).",
        )

    counts = _compute_state_counts(initial_states)
    affected = counts["ignited"] + counts["burning"] + counts["extinguished"]

    params = payload.model_dump()
    sim = SimulationRun(
        name=payload.name.strip(),
        grid_id=grid.id,
        data_classification="hypothetical_simulation",
        neighborhood=payload.neighborhood,
        boundary_condition=payload.boundary_condition,
        status="initialized",
        current_generation=0,
        max_generations=payload.max_generations,
        parameters_json=params,
        seed_cells_json=sorted(seed_set),
        initial_summary_json={
            "grid_name": grid.name,
            "rows": grid.rows,
            "cols": grid.cols,
            "total_cells": len(cells),
            "burnable_cells": counts["unburned"] + counts["ignited"],
            "non_burnable_cells": counts["non_burnable"],
        },
    )
    db.add(sim)
    db.flush()

    step0 = SimulationStep(
        simulation_id=sim.id,
        generation=0,
        state_counts_json=counts,
        affected_cell_count=affected,
        newly_ignited_count=counts["ignited"],
        cell_states_json=initial_states,
        metrics_json={"burn_timers": {u: 0 for u, s in initial_states.items() if s == "ignited"}},
    )
    db.add(step0)
    db.commit()
    db.refresh(sim)
    return get_simulation_detail(db, sim.id)


def _get_simulation_or_404(db: Session, simulation_id: int) -> SimulationRun:
    sim = db.execute(select(SimulationRun).where(SimulationRun.id == simulation_id)).scalar_one_or_none()
    if not sim:
        raise HTTPException(status_code=404, detail=f"Simulation run {simulation_id} not found.")
    return sim


def list_simulations(db: Session, grid_id: Optional[int] = None) -> list[SimulationRun]:
    stmt = select(SimulationRun).order_by(SimulationRun.created_at.desc())
    if grid_id is not None:
        stmt = stmt.where(SimulationRun.grid_id == grid_id)
    return list(db.execute(stmt).scalars().all())


def get_simulation_detail(db: Session, simulation_id: int) -> dict:
    sim = _get_simulation_or_404(db, simulation_id)
    steps = list(
        db.execute(
            select(SimulationStep)
            .where(SimulationStep.simulation_id == sim.id)
            .order_by(SimulationStep.generation)
        )
        .scalars()
        .all()
    )
    return {"simulation": sim, "steps": steps}


def step_simulation(db: Session, simulation_id: int, steps_to_advance: int = 1) -> dict:
    sim = _get_simulation_or_404(db, simulation_id)
    if sim.status == "completed":
        return get_simulation_detail(db, sim.id)

    grid = _get_grid_or_404(db, sim.grid_id)
    cells = list(db.execute(select(GridCell).where(GridCell.grid_id == grid.id)).scalars().all())
    by_coord = {(c.row_idx, c.col_idx): c for c in cells}

    latest_step = (
        db.execute(
            select(SimulationStep)
            .where(SimulationStep.simulation_id == sim.id)
            .order_by(SimulationStep.generation.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if not latest_step:
        raise HTTPException(status_code=400, detail="Simulation has no initial generation 0 state.")

    params = sim.parameters_json or {}
    base_factor = float(params.get("base_transition_factor", 0.45))
    moisture_damping = float(params.get("moisture_damping", 0.25))
    wind_dir = str(params.get("wind_direction", "none"))
    wind_bias = float(params.get("wind_bias", 0.15))
    burn_duration = int(params.get("burn_duration_steps", 2))
    deterministic_mode = bool(params.get("deterministic_mode", True))
    random_seed = int(params.get("random_seed", 42))

    offsets = NEIGHBOR_OFFSETS_8 if sim.neighborhood == "moore_8" else NEIGHBOR_OFFSETS_4
    wind_vec = DIRECTION_VECTORS.get(wind_dir)

    curr_states = dict(latest_step.cell_states_json)
    burn_timers: dict[str, int] = dict((latest_step.metrics_json or {}).get("burn_timers", {}))
    curr_gen = sim.current_generation

    for _ in range(steps_to_advance):
        if curr_gen >= sim.max_generations:
            sim.status = "completed"
            break

        active_sources = [u for u, s in curr_states.items() if s in ("ignited", "burning")]
        if not active_sources:
            sim.status = "completed"
            break

        next_states = dict(curr_states)
        next_timers: dict[str, int] = {}
        newly_ignited = 0
        rng = random.Random(random_seed + (curr_gen + 1) * 1009)

        for cell in cells:
            uid = cell.cell_uid
            st = curr_states.get(uid, "non_burnable")
            if st == "non_burnable" or st == "extinguished":
                continue

            if st == "ignited":
                next_states[uid] = "burning"
                next_timers[uid] = 1
                continue

            if st == "burning":
                t = burn_timers.get(uid, 1) + 1
                if t >= burn_duration:
                    next_states[uid] = "extinguished"
                else:
                    next_states[uid] = "burning"
                    next_timers[uid] = t
                continue

            # Unburned cell: check active neighbors under boundary condition
            suscept = ABSTRACT_SUSCEPTIBILITY.get(cell.landcover_category, 0.35)
            if suscept <= 0.0:
                continue

            non_ignition_prob = 1.0
            has_active_neighbor = False
            for _direction, dr, dc in offsets:
                resolved = _resolve_neighbor_coord(
                    cell.row_idx,
                    cell.col_idx,
                    dr,
                    dc,
                    grid.rows,
                    grid.cols,
                    sim.boundary_condition,
                )
                if resolved is None:
                    continue
                nb = by_coord.get(resolved)
                if nb is None:
                    continue
                nb_state = curr_states.get(nb.cell_uid)
                if nb_state not in ("ignited", "burning"):
                    continue
                has_active_neighbor = True

                # Vector from neighbor -> current cell is (-dr, -dc)
                p = base_factor * suscept * (1.0 - moisture_damping)
                if wind_vec is not None:
                    # Dot product between wind direction and spread vector (-dr, -dc)
                    dot = wind_vec[0] * (-dr) + wind_vec[1] * (-dc)
                    if dot > 0:
                        p += wind_bias
                    elif dot < 0:
                        p -= wind_bias * 0.5
                p = max(0.02, min(0.95, p))
                non_ignition_prob *= (1.0 - p)

            if has_active_neighbor:
                p_ignite = 1.0 - non_ignition_prob
                ignite = (p_ignite >= 0.42) if deterministic_mode else (rng.random() < p_ignite)
                if ignite:
                    next_states[uid] = "ignited"
                    next_timers[uid] = 0
                    newly_ignited += 1

        curr_gen += 1
        counts = _compute_state_counts(next_states)
        affected = counts["ignited"] + counts["burning"] + counts["extinguished"]
        active_remaining = counts["ignited"] + counts["burning"]

        step_row = SimulationStep(
            simulation_id=sim.id,
            generation=curr_gen,
            state_counts_json=counts,
            affected_cell_count=affected,
            newly_ignited_count=newly_ignited,
            cell_states_json=next_states,
            metrics_json={
                "burn_timers": next_timers,
                "active_front_cells": active_remaining,
                "affected_ratio": round(affected / max(1, counts["unburned"] + affected), 4),
            },
        )
        db.add(step_row)
        curr_states = next_states
        burn_timers = next_timers

        sim.current_generation = curr_gen
        if active_remaining == 0 or curr_gen >= sim.max_generations:
            sim.status = "completed"
        else:
            sim.status = "running"

    db.commit()
    return get_simulation_detail(db, sim.id)


def update_simulation_status(db: Session, simulation_id: int, status: str) -> SimulationRun:
    sim = _get_simulation_or_404(db, simulation_id)
    sim.status = status
    db.commit()
    db.refresh(sim)
    return sim


def reset_simulation(db: Session, simulation_id: int) -> dict:
    sim = _get_simulation_or_404(db, simulation_id)
    steps = list(
        db.execute(
            select(SimulationStep)
            .where(SimulationStep.simulation_id == sim.id, SimulationStep.generation > 0)
        )
        .scalars()
        .all()
    )
    for st in steps:
        db.delete(st)
    sim.current_generation = 0
    sim.status = "initialized"
    db.commit()
    return get_simulation_detail(db, sim.id)


def delete_simulation(db: Session, simulation_id: int) -> dict:
    sim = _get_simulation_or_404(db, simulation_id)
    name = sim.name
    db.delete(sim)
    db.commit()
    return {"deleted": True, "id": simulation_id, "name": name}
