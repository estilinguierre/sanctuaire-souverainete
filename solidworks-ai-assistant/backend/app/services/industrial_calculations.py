"""
Industrial metalwork calculations — pure functions, no external deps.

All formulas follow EN/ISO standards used in French industrial practice.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

from app.models import (
    BarCuttingResponse,
    BendAllowanceRequest,
    BendAllowanceResponse,
    ManufacturabilityCheck,
    ManufacturabilityRequest,
    ManufacturabilityResponse,
    MaterialEnum,
    ProfileSegment,
    WeldmentMassRequest,
    WeldmentMassResponse,
)

# ---------------------------------------------------------------------------
# K-factor tables
# Material → tuple(t_min, t_max) → k_factor
# Source: SolidWorks Sheet Metal + EN 10130 / retours terrain CTM
# ---------------------------------------------------------------------------

K_FACTOR_TABLE: Dict[str, Dict[Tuple[float, float], float]] = {
    MaterialEnum.S235: {
        (0.5, 1.5): 0.38,
        (1.5, 3.0): 0.40,
        (3.0, 6.0): 0.42,
        (6.0, 12.0): 0.44,
    },
    MaterialEnum.S355: {
        (0.5, 1.5): 0.40,
        (1.5, 3.0): 0.42,
        (3.0, 6.0): 0.44,
        (6.0, 12.0): 0.46,
    },
    MaterialEnum.INOX_304: {
        (0.5, 1.5): 0.35,
        (1.5, 3.0): 0.37,
        (3.0, 6.0): 0.40,
        (6.0, 12.0): 0.42,
    },
    MaterialEnum.INOX_316L: {
        (0.5, 1.5): 0.35,
        (1.5, 3.0): 0.37,
        (3.0, 6.0): 0.40,
        (6.0, 12.0): 0.42,
    },
    MaterialEnum.ALU_5754: {
        (0.5, 1.5): 0.41,
        (1.5, 3.0): 0.43,
        (3.0, 6.0): 0.45,
        (6.0, 12.0): 0.47,
    },
}

# Minimum bend radius = factor × thickness
MIN_BEND_RADIUS_FACTOR: Dict[str, float] = {
    MaterialEnum.S235: 0.8,
    MaterialEnum.S355: 1.0,
    MaterialEnum.INOX_304: 1.2,
    MaterialEnum.INOX_316L: 1.2,
    MaterialEnum.ALU_5754: 1.5,
}

# Profile linear density (kg/m) — EN 10034 / EN 10219
PROFILE_DENSITY: Dict[str, float] = {
    # IPE series
    "IPE80": 6.0, "IPE100": 8.1, "IPE120": 10.4, "IPE140": 12.9,
    "IPE160": 15.8, "IPE180": 18.8, "IPE200": 22.4, "IPE220": 26.2,
    "IPE240": 30.7, "IPE270": 36.1, "IPE300": 42.2, "IPE330": 49.1,
    "IPE360": 57.1, "IPE400": 66.3, "IPE450": 77.6, "IPE500": 90.7,
    # HEA series
    "HEA100": 16.7, "HEA120": 19.9, "HEA140": 24.7, "HEA160": 30.4,
    "HEA180": 35.5, "HEA200": 42.3, "HEA220": 50.5, "HEA240": 60.3,
    "HEA260": 68.2, "HEA280": 76.4, "HEA300": 88.3,
    # HEB series
    "HEB100": 20.4, "HEB120": 26.7, "HEB140": 33.7, "HEB160": 42.6,
    "HEB180": 51.2, "HEB200": 61.3, "HEB220": 71.5, "HEB240": 83.2,
    "HEB260": 93.0, "HEB280": 103.0, "HEB300": 117.0,
    # UPN channels
    "UPN80": 8.64, "UPN100": 11.0, "UPN120": 13.4, "UPN140": 16.0,
    "UPN160": 18.8, "UPN180": 22.0, "UPN200": 25.3, "UPN220": 29.4,
    # RHS (rectangular hollow section) — common sizes
    "RHS60x40x3": 4.35, "RHS80x40x3": 5.17, "RHS80x60x3": 5.99,
    "RHS100x50x3": 6.71, "RHS100x60x4": 9.22, "RHS100x100x4": 12.0,
    "RHS120x60x4": 10.1, "RHS120x80x4": 11.3, "RHS140x80x5": 14.7,
    "RHS150x100x5": 18.0, "RHS160x80x5": 16.1, "RHS200x100x5": 22.0,
    # SHS (square hollow section)
    "SHS40x40x3": 3.45, "SHS50x50x3": 4.35, "SHS60x60x4": 6.85,
    "SHS80x80x4": 9.35, "SHS100x100x4": 12.0, "SHS120x120x5": 17.8,
    # Flat bar (platine)
    "FLAT50x5": 1.96, "FLAT60x6": 2.83, "FLAT80x8": 5.02, "FLAT100x10": 7.85,
    # Angle
    "L50x50x5": 3.77, "L60x60x6": 5.42, "L80x80x8": 9.63,
    "L100x100x10": 15.1,
}


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

def get_k_factor(material: str, thickness: float) -> float:
    """Look up K-factor from table; interpolates between thickness ranges."""
    table = K_FACTOR_TABLE.get(material)
    if not table:
        return 0.42  # safe default

    for (t_min, t_max), k in table.items():
        if t_min <= thickness <= t_max:
            return k

    # Out of range: clamp
    if thickness < min(r[0] for r in table):
        return next(iter(table.values()))
    return list(table.values())[-1]


def get_min_bend_radius(material: str, thickness: float) -> float:
    """Return minimum inside bend radius for material+thickness (mm)."""
    factor = MIN_BEND_RADIUS_FACTOR.get(material, 1.0)
    return round(factor * thickness, 2)


def calculate_bend_allowance(req: BendAllowanceRequest) -> BendAllowanceResponse:
    """
    Bend Allowance (BA) — ISO 2768 / SolidWorks Sheet Metal

    Formula:  BA = (π / 180) × angle × (R + K × T)
    Where:
      R = inside bend radius (mm)
      T = material thickness (mm)
      K = K-factor (neutral axis position ratio)

    Bend Deduction: BD = 2 × OSSB − BA
      OSSB (Outside Setback) = tan(angle/2) × (R + T)
    """
    k = req.k_factor_override or get_k_factor(req.material, req.thickness)
    r = req.radius
    t = req.thickness
    angle_rad = math.radians(req.angle)

    ba = (math.pi / 180) * req.angle * (r + k * t)
    ossb = math.tan(angle_rad / 2) * (r + t)
    bd = 2 * ossb - ba
    neutral_radius = r + k * t

    r_min = get_min_bend_radius(req.material, t)
    min_ok = r >= r_min

    warnings = []
    if not min_ok:
        warnings.append(
            f"Rayon {r}mm < rayon minimum {r_min}mm pour {req.material} "
            f"ép.{t}mm — risque de fissure."
        )
    if req.angle > 170:
        warnings.append("Angle > 170° : vérifier accessibilité outil presse-plieuse.")

    formula = (
        f"BA = (π/180) × {req.angle}° × ({r} + {k} × {t}) = {round(ba, 3)} mm"
    )

    return BendAllowanceResponse(
        bend_allowance=round(ba, 3),
        bend_deduction=round(bd, 3),
        neutral_axis_radius=round(neutral_radius, 3),
        k_factor=k,
        material=req.material,
        formula=formula,
        min_radius_ok=min_ok,
        min_radius_required=r_min,
        warnings=warnings,
    )


def calculate_weldment_mass(req: WeldmentMassRequest) -> WeldmentMassResponse:
    """Compute total mass of a weldment cut list (kg)."""
    total = 0.0
    details = []
    unknown = []

    for seg in req.profiles:
        key = seg.profile.upper()
        density = PROFILE_DENSITY.get(key)
        if density is None:
            unknown.append(seg.profile)
            continue
        length_m = seg.length_mm / 1000
        mass = density * length_m * seg.quantity
        total += mass
        details.append(
            {
                "profile": seg.profile,
                "length_mm": seg.length_mm,
                "quantity": seg.quantity,
                "density_kg_m": density,
                "mass_kg": round(mass, 3),
            }
        )

    return WeldmentMassResponse(
        total_mass_kg=round(total, 3),
        details=details,
        unknown_profiles=unknown,
    )


def optimize_bar_cutting(
    required_lengths: List[float],
    bar_length: float = 6000.0,
    kerf: float = 3.0,
) -> BarCuttingResponse:
    """
    First-Fit Decreasing bin-packing for bar stock optimisation.
    Accounts for saw kerf.
    """
    # Sort descending
    pieces = sorted(required_lengths, reverse=True)
    bars: List[List[float]] = []
    bar_remaining: List[float] = []

    for piece in pieces:
        placed = False
        for i, rem in enumerate(bar_remaining):
            # kerf is added for every cut except the last piece on a bar
            needed = piece + kerf
            if rem >= needed:
                bars[i].append(piece)
                bar_remaining[i] -= needed
                placed = True
                break
        if not placed:
            bars.append([piece])
            bar_remaining.append(bar_length - piece)

    total_used = sum(required_lengths)
    total_stock = len(bars) * bar_length
    waste = total_stock - total_used
    waste_pct = (waste / total_stock * 100) if total_stock > 0 else 0

    return BarCuttingResponse(
        bars_needed=len(bars),
        cutting_plan=bars,
        total_waste_mm=round(waste, 1),
        waste_percent=round(waste_pct, 1),
        efficiency_percent=round(100 - waste_pct, 1),
    )


def check_manufacturability(req: ManufacturabilityRequest) -> ManufacturabilityResponse:
    """Run standard fabricability checks for sheet metal parts."""
    checks: List[ManufacturabilityCheck] = []
    suggestions: List[str] = []

    r_min = get_min_bend_radius(req.material, req.thickness)

    # 1. Minimum bend radius
    passed = req.bend_radius >= r_min
    checks.append(ManufacturabilityCheck(
        check_name="Rayon de pliage minimum",
        passed=passed,
        value=req.bend_radius,
        limit=r_min,
        message=(
            f"Rayon {req.bend_radius}mm {'≥' if passed else '<'} min {r_min}mm"
        ),
        severity="ok" if passed else "error",
    ))
    if not passed:
        suggestions.append(
            f"Augmenter le rayon à au moins {r_min}mm ou utiliser un matériau plus ductile."
        )

    # 2. Flange length minimum (2× thickness)
    flange_min = 2 * req.thickness
    for fl in req.flanges:
        ok = fl >= flange_min
        checks.append(ManufacturabilityCheck(
            check_name=f"Longueur bride ({fl}mm)",
            passed=ok,
            value=fl,
            limit=flange_min,
            message=f"Bride {fl}mm {'≥' if ok else '<'} min {flange_min}mm",
            severity="ok" if ok else "warning",
        ))
        if not ok:
            suggestions.append(
                f"Bride {fl}mm trop courte — minimum recommandé: {flange_min}mm (2×ép.)."
            )

    # 3. Hole-to-bend distance (min 2× thickness + radius)
    hole_dist_min = 2 * req.thickness + req.bend_radius
    for hole in req.holes:
        d = hole.get("distance_to_bend", 0)
        ok = d >= hole_dist_min
        checks.append(ManufacturabilityCheck(
            check_name=f"Distance trou-pli (∅{hole.get('diameter', '?')}mm)",
            passed=ok,
            value=d,
            limit=hole_dist_min,
            message=f"Distance {d}mm {'≥' if ok else '<'} min {round(hole_dist_min, 1)}mm",
            severity="ok" if ok else "warning",
        ))
        if not ok:
            suggestions.append(
                f"Déplacer le trou à {round(hole_dist_min + 1, 1)}mm minimum du pli."
            )

    is_manufacturable = all(c.severity != "error" for c in checks)
    return ManufacturabilityResponse(
        is_manufacturable=is_manufacturable,
        checks=checks,
        suggestions=suggestions,
    )
