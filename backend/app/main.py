import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers.auth import router as auth_router
from app.routers.forgot_password import router as forgot_password_router
from app.routers.devices import router as devices_router
from app.routers.location import router as location_router
from app.routers.history import router as history_router
from app.routers.sync import router as sync_router
from app.services.auto_sync import start_auto_sync_tasks
from prometheus_fastapi_instrumentator import Instrumentator

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    app = FastAPI(title="CityTag Tracking Dashboard API")

    # ── Global exception handler: log traceback, return clean JSON ────────────
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"},
        )

    # ── Startup: test MongoDB connection so issues surface immediately ────────
    @app.on_event("startup")
    async def check_mongo_connection():
        from app.dependencies import get_settings
        from app.services.mongodb import MongoService
        settings = get_settings()
        uri = settings["mongo_uri"]
        masked = uri[:30] + "..." if len(uri) > 30 else uri
        logger.info("Testing MongoDB connection to: %s", masked)
        try:
            svc = MongoService(uri)
            await svc.client.admin.command("ping")
            logger.info("MongoDB connection OK")
        except Exception as exc:
            logger.error("MongoDB connection FAILED: %s: %s", type(exc).__name__, exc)

    # CORS for local development – adjust origins as needed
    app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(forgot_password_router)
    app.include_router(devices_router)
    # admin-specific endpoints
    from app.routers.admin_devices import router as admin_devices_router
    from app.routers.admin_users import router as admin_users_router
    app.include_router(admin_devices_router)
    app.include_router(admin_users_router)
    app.include_router(location_router)
    app.include_router(history_router)
    app.include_router(sync_router)
    Instrumentator().instrument(app).expose(app)

    from app.routers.field_staff import router as field_staff_router
    app.include_router(field_staff_router)

    from app.routers.geofence import router as geofence_router
    app.include_router(geofence_router)

    from app.routers.zones import router as zones_router
    app.include_router(zones_router)


    start_auto_sync_tasks(app)

    

    @app.get("/health")
    async def health_check():
        return {"status": "ok"}

    return app


app = create_app()

