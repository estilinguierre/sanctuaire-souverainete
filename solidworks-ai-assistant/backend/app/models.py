from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class MaterialEnum(str, Enum):
    S235 = "S235"
    S355 = "S355"
    INOX_304 = "INOX_304"
    INOX_316L = "INOX_316L"
    ALU_5754 = "ALU_5754"


class ChatRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class PartType(str, Enum):
    sheet_metal = "sheet_metal"
    weldment = "weldment"
    machined = "machined"


# ---------------------------------------------------------------------------
# Chat models
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: ChatRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)


class SourceChunk(BaseModel):
    title: str
    section: str = ""
    content_preview: str = ""
    score: float = 0.0
    source_url: str = ""


class MCPToolResult(BaseModel):
    tool_name: str
    success: bool
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1)
    session_id: str = Field(default="", description="UUID session, generated if empty")
    use_mcp: bool = Field(default=False, description="Allow calling SolidWorks via MCP")


class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceChunk] = []
    mcp_result: Optional[MCPToolResult] = None
    tokens_used: int = 0
    session_id: str = ""
    response_time: float = 0.0


# ---------------------------------------------------------------------------
# Voice models
# ---------------------------------------------------------------------------

class TranscriptionResponse(BaseModel):
    text: str
    language: str = "fr"
    confidence: float = 1.0


# ---------------------------------------------------------------------------
# Industrial calculation models
# ---------------------------------------------------------------------------

class BendAllowanceRequest(BaseModel):
    angle: float = Field(..., ge=0, le=180, description="Angle de pliage (degrés)")
    radius: float = Field(..., gt=0, description="Rayon intérieur (mm)")
    thickness: float = Field(..., gt=0, description="Épaisseur tôle (mm)")
    material: MaterialEnum = MaterialEnum.S235
    k_factor_override: Optional[float] = Field(
        None, ge=0.2, le=0.6, description="K-factor manuel (optionnel)"
    )


class BendAllowanceResponse(BaseModel):
    bend_allowance: float = Field(description="Allongement au pliage BA (mm)")
    bend_deduction: float = Field(description="Déduction de pliage BD (mm)")
    neutral_axis_radius: float = Field(description="Rayon axe neutre (mm)")
    k_factor: float
    material: str
    formula: str
    min_radius_ok: bool
    min_radius_required: float
    warnings: List[str] = []


class ProfileSegment(BaseModel):
    profile: str = Field(description="Ex: IPE100, HEA200, RHS100x50x3")
    length_mm: float = Field(..., gt=0)
    quantity: int = Field(default=1, ge=1)


class WeldmentMassRequest(BaseModel):
    profiles: List[ProfileSegment]


class WeldmentMassResponse(BaseModel):
    total_mass_kg: float
    details: List[Dict[str, Any]]
    unknown_profiles: List[str] = []


class BarCuttingRequest(BaseModel):
    required_lengths: List[float] = Field(description="Longueurs requises (mm)")
    bar_length: float = Field(default=6000.0, description="Longueur barre stock (mm)")
    kerf: float = Field(default=3.0, description="Trait de scie (mm)")


class BarCuttingResponse(BaseModel):
    bars_needed: int
    cutting_plan: List[List[float]]
    total_waste_mm: float
    waste_percent: float
    efficiency_percent: float


class ManufacturabilityRequest(BaseModel):
    material: MaterialEnum
    thickness: float = Field(..., gt=0)
    bend_radius: float = Field(..., gt=0)
    part_type: PartType = PartType.sheet_metal
    flanges: List[float] = Field(default=[], description="Longueurs brides (mm)")
    holes: List[Dict[str, float]] = Field(
        default=[], description="[{diameter, distance_to_bend}]"
    )


class ManufacturabilityCheck(BaseModel):
    check_name: str
    passed: bool
    value: float
    limit: float
    message: str
    severity: str = Field(description="ok | warning | error")


class ManufacturabilityResponse(BaseModel):
    is_manufacturable: bool
    checks: List[ManufacturabilityCheck]
    suggestions: List[str] = []


# ---------------------------------------------------------------------------
# Content / Guide models
# ---------------------------------------------------------------------------

class GuideInfo(BaseModel):
    slug: str
    title: str
    category: str
    file_path: str
    size_bytes: int = 0


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(..., min_length=3)
    n_results: int = Field(default=5, ge=1, le=20)
    filter_material: Optional[str] = None
    filter_operation: Optional[str] = None
