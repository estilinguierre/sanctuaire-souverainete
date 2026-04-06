from typing import List

from fastapi import APIRouter

from app.models import (
    BarCuttingRequest,
    BarCuttingResponse,
    BendAllowanceRequest,
    BendAllowanceResponse,
    ManufacturabilityRequest,
    ManufacturabilityResponse,
    MaterialEnum,
    WeldmentMassRequest,
    WeldmentMassResponse,
)
from app.services.industrial_calculations import (
    K_FACTOR_TABLE,
    MIN_BEND_RADIUS_FACTOR,
    PROFILE_DENSITY,
    calculate_bend_allowance,
    calculate_weldment_mass,
    check_manufacturability,
    get_min_bend_radius,
    optimize_bar_cutting,
)

router = APIRouter()


@router.post("/bend-allowance", response_model=BendAllowanceResponse)
async def bend_allowance(req: BendAllowanceRequest):
    """Calculate Bend Allowance (BA) and Bend Deduction (BD)."""
    return calculate_bend_allowance(req)


@router.post("/weldment-mass", response_model=WeldmentMassResponse)
async def weldment_mass(req: WeldmentMassRequest):
    """Calculate total mass of a weldment cut list."""
    return calculate_weldment_mass(req)


@router.post("/bar-optimization", response_model=BarCuttingResponse)
async def bar_optimization(req: BarCuttingRequest):
    """Optimise bar stock cutting (First-Fit Decreasing)."""
    return optimize_bar_cutting(
        required_lengths=req.required_lengths,
        bar_length=req.bar_length,
        kerf=req.kerf,
    )


@router.post("/manufacturability", response_model=ManufacturabilityResponse)
async def manufacturability(req: ManufacturabilityRequest):
    """Run fabricability checks for sheet metal parts."""
    return check_manufacturability(req)


@router.get("/materials")
async def get_materials():
    """List all supported materials with their properties."""
    result = []
    for mat in MaterialEnum:
        result.append({
            "code": mat.value,
            "k_factor_ranges": {
                f"{t_min}-{t_max}mm": k
                for (t_min, t_max), k in K_FACTOR_TABLE.get(mat, {}).items()
            },
            "min_bend_radius_factor": MIN_BEND_RADIUS_FACTOR.get(mat, 1.0),
        })
    return {"materials": result}


@router.get("/k-factors/{material}")
async def get_k_factors(material: str):
    """Get K-factor table for a specific material."""
    key = material.upper()
    table = K_FACTOR_TABLE.get(key)
    if not table:
        return {"error": f"Matériau '{material}' inconnu", "available": list(K_FACTOR_TABLE.keys())}
    return {
        "material": key,
        "k_factors": {f"{t_min}-{t_max}mm": k for (t_min, t_max), k in table.items()},
        "min_bend_radius_factor": MIN_BEND_RADIUS_FACTOR.get(key),
    }


@router.get("/profiles")
async def get_profiles():
    """List all known structural profiles with their linear density."""
    return {
        "profiles": [
            {"name": k, "density_kg_m": v}
            for k, v in sorted(PROFILE_DENSITY.items())
        ],
        "count": len(PROFILE_DENSITY),
    }
