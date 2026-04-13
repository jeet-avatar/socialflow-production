import os
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=True)

# ── API key presence check (startup only) ───────────────────────────────────
_startup_logger = logging.getLogger("startup")
for _key in ("ANTHROPIC_API_KEY", "GOOGLE_AI_API_KEY", "OPENAI_API_KEY", "FAL_API_KEY"):
    _val = os.getenv(_key, "")
    _startup_logger.info(f"[ENV] {_key}: {'SET (' + _val[:8] + '...)' if _val else 'NOT SET ⚠️'}")

# Import routes
from routes.auth_routes import router as auth_router
from routes.campaigns_routes import router as campaigns_router
from routes.leads_routes import router as leads_router, live_leads_router
from routes.integrations_routes import router as integrations_router
from routes.risk_analysis_routes import router as risk_analysis_router
from routes.company_routes import router as company_router
from routes.content_routes import router as content_router
from routes.videos_routes import router as videos_router
from routes.subscription_routes import router as subscription_router
from routes.user_routes import router as user_router
from routes.channel_routes import router as channels_router
from routes.model_config_routes import router as model_config_router
from routes.chat_routes import router as chat_router

# Import services for startup
from utils.db_init import init_collections
from utils.integrations_service import integrations_service
from utils.mongodb_service import mongodb_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="SocialFlow API",
    description="Social Media Management Platform API",
    version="1.0.0"
)

# Ensure static directory exists before mounting
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Path to frontend build directory
FRONTEND_BUILD_DIR = Path(__file__).parent.parent.parent / "frontend" / "dist"

# Configure CORS
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = ["*"] if allowed_origins_str == "*" else allowed_origins_str.split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all API routes
app.include_router(auth_router)
app.include_router(campaigns_router)
app.include_router(leads_router)
app.include_router(live_leads_router)  # Live leads at /api/live-leads
app.include_router(integrations_router)
app.include_router(risk_analysis_router)
app.include_router(company_router)
app.include_router(content_router)
app.include_router(videos_router)
app.include_router(subscription_router)
app.include_router(user_router)
app.include_router(channels_router)
app.include_router(model_config_router)
app.include_router(chat_router)

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    try:
        executor = ThreadPoolExecutor(max_workers=2)
        loop = asyncio.get_event_loop()

        try:
            # Initialize main MongoDB service first
            logger.info("🔌 Connecting to MongoDB...")
            await asyncio.wait_for(
                loop.run_in_executor(executor, mongodb_service.connect),
                timeout=10.0
            )
            logger.info("✅ MongoDB connected successfully")

            # Initialize new collections + indexes
            db = mongodb_service.get_database()
            init_collections(db)

            # Then initialize integrations service
            await asyncio.wait_for(
                loop.run_in_executor(executor, integrations_service._ensure_connection),
                timeout=10.0
            )
            logger.info("✅ Services initialized successfully")
        except asyncio.TimeoutError:
            logger.warning("⚠️  WARNING: MongoDB connection timeout - continuing without DB")
        except Exception as e:
            logger.warning(f"⚠️  WARNING: Service initialization warning: {e}")
    except Exception as e:
        logger.error(f"❌ ERROR: Error during startup: {e}")

# Health check endpoints
# Root: serve the frontend SPA
@app.get("/", include_in_schema=False)
async def serve_frontend_root():
    index_file = FRONTEND_BUILD_DIR / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)
    # Fallback if build is missing
    return {
        "message": "SocialFlow API is running, but frontend build not found.",
        "hint": "Run 'npm run build' in the frontend directory on the server."
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "message": "SocialFlow API is running!",
        "timestamp": datetime.now().isoformat()
    }

# Serve frontend static files (production build)
if FRONTEND_BUILD_DIR.exists():
    # Mount the frontend assets directory
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_BUILD_DIR / "assets")), name="frontend-assets")

    # Serve index.html for all other routes (SPA fallback)
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve the React frontend for all non-API routes"""
        # If the path exists as a file, serve it
        file_path = FRONTEND_BUILD_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        # Otherwise, serve index.html (for client-side routing)
        return FileResponse(FRONTEND_BUILD_DIR / "index.html")
else:
    logger.warning(f"⚠️  Frontend build directory not found at {FRONTEND_BUILD_DIR}")
    logger.warning("⚠️  Run 'npm run build' in the frontend directory to create the production build")

# Run the application
if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
