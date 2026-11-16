from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.api.routes import (
    cellular_automata,
    combinatorics,
    dashboard,
    data_quality,
    datasets,
    experiments,
    generating_recurrence,
    geospatial,
    graph_theory,
    grids,
    health,
    logic,
    observations,
    reports,
    study_areas,
    syllabus,
    trees_algorithms,
)
from backend.app.core.config import settings
from backend.app.core.logging import configure_logging, get_logger
from backend.app.database.init_db import init_database

configure_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Starting WildfireX API (%s)...", settings.app_version)
    init_database()
    yield
    logger.info("Shutting down WildfireX API.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Geospatial research and mathematical simulation API for WildfireX, "
        "focused on Nagarhole National Park, Karnataka, India."
    ),
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        loc = ".".join(str(part) for part in err.get("loc", []) if part != "body")
        msg = err.get("msg", "Invalid input")
        messages.append(f"{loc}: {msg}" if loc else msg)
    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(messages) or "Invalid request parameters."},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception):
    logger.exception("Unhandled API error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal processing error occurred. Check server diagnostics for details."},
    )


app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(dashboard.router, prefix=settings.api_prefix)
app.include_router(datasets.router, prefix=settings.api_prefix)
app.include_router(study_areas.router, prefix=settings.api_prefix)
app.include_router(geospatial.router, prefix=settings.api_prefix)
app.include_router(grids.router, prefix=settings.api_prefix)
app.include_router(observations.router, prefix=settings.api_prefix)
app.include_router(data_quality.router, prefix=settings.api_prefix)
app.include_router(experiments.router, prefix=settings.api_prefix)
app.include_router(reports.router, prefix=settings.api_prefix)
app.include_router(syllabus.router, prefix=settings.api_prefix)
app.include_router(cellular_automata.router, prefix=settings.api_prefix)
app.include_router(graph_theory.router, prefix=settings.api_prefix)
app.include_router(combinatorics.router, prefix=settings.api_prefix)
app.include_router(logic.router, prefix=settings.api_prefix)
app.include_router(generating_recurrence.router, prefix=settings.api_prefix)
app.include_router(trees_algorithms.router, prefix=settings.api_prefix)
