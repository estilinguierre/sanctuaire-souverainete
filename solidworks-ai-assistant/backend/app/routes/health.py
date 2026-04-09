from fastapi import APIRouter
from app.services import knowledge_base, mcp_bridge
from app.config import get_settings

router = APIRouter()
settings = get_settings()


@router.get("/health")
async def health():
    kb_stats = knowledge_base.get_stats()
    sw_connected = await mcp_bridge.mcp_bridge.health_check()

    return {
        "status": "ok",
        "version": settings.app_version,
        "app": settings.app_name,
        "chroma_docs": kb_stats.get("document_count", 0),
        "mcp_connected": sw_connected,
        "llm_model": settings.llm_model,
        "ctm_machines": {
            "plieuse": settings.ctm_machine_plieuse,
            "laser": settings.ctm_machine_laser,
            "soudage": settings.ctm_machine_soudage,
        },
    }
