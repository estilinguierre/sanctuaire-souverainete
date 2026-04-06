from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import chat, content, health, industrial, voice
from app.services import knowledge_base, mcp_bridge
from app.utils.logger import app_logger, setup_logging

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    app_logger.info(f"Starting {settings.app_name} v{settings.app_version}")

    # Pre-warm ChromaDB (creates collection if needed)
    stats = knowledge_base.get_stats()
    app_logger.info(
        f"ChromaDB ready: {stats.get('document_count', 0)} documents "
        f"in collection '{settings.chroma_collection_name}'"
    )

    # Check MCP server
    sw_ok = await mcp_bridge.mcp_bridge.health_check()
    if sw_ok:
        app_logger.info("MCP server connected — SolidWorks disponible")
    else:
        app_logger.warning(
            "MCP server non connecté — mode dégradé (chat sans SolidWorks)"
        )

    yield

    # Cleanup
    await mcp_bridge.mcp_bridge.close()
    app_logger.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Assistant IA vocal pour SolidWorks — spécialisation tôlerie, "
        "chaudronnerie et structures métalliques. CTM Industrie, Normandie."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
PREFIX = "/api/v1"
app.include_router(health.router, prefix=PREFIX, tags=["Health"])
app.include_router(chat.router, prefix=f"{PREFIX}/chat", tags=["Chat"])
app.include_router(voice.router, prefix=f"{PREFIX}/voice", tags=["Voice"])
app.include_router(industrial.router, prefix=f"{PREFIX}/industrial", tags=["Industrial"])
app.include_router(content.router, prefix=f"{PREFIX}/content", tags=["Content"])
