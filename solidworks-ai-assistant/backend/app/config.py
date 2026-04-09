from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    # Application
    app_name: str = "Assistant SolidWorks IA Industriel CTM"
    app_version: str = "1.0.0"
    debug: bool = False
    log_level: str = "INFO"

    # API Keys
    openai_api_key: str = ""

    # Server
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # CORS
    allowed_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:80",
    ]

    # ChromaDB
    chroma_persist_dir: str = "./data/embeddings"
    chroma_collection_name: str = "solidworks_knowledge"

    # OpenAI Models
    llm_model: str = "gpt-4-turbo-preview"
    whisper_model: str = "whisper-1"
    embedding_model: str = "text-embedding-3-large"
    llm_temperature: float = 0.3
    llm_max_tokens: int = 1500

    # Knowledge Base
    max_context_chunks: int = 8
    kb_chunk_size: int = 800
    kb_chunk_overlap: int = 100

    # MCP Server (bare-metal Node.js on Windows host)
    mcp_server_url: str = "http://localhost:3001"
    mcp_timeout: float = 30.0

    # CTM Industrie — machine parc
    ctm_machine_plieuse: str = "AMADA HFE 100-30"
    ctm_machine_laser: str = "TRUMPF TruLaser 3030"
    ctm_machine_soudage: str = "KUKA KR16 R2010"

    # Default industrial params
    default_material: str = "S235"
    default_thickness: float = 3.0


@lru_cache()
def get_settings() -> Settings:
    return Settings()
