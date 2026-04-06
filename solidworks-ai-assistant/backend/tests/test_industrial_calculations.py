"""Unit tests for industrial calculations — pure functions, no external deps."""
import math
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models import (
    BarCuttingRequest,
    BendAllowanceRequest,
    ManufacturabilityRequest,
    MaterialEnum,
    PartType,
    ProfileSegment,
    WeldmentMassRequest,
)
from app.services.industrial_calculations import (
    calculate_bend_allowance,
    calculate_weldment_mass,
    check_manufacturability,
    get_k_factor,
    get_min_bend_radius,
    optimize_bar_cutting,
)


# ---------------------------------------------------------------------------
# K-factor lookup
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("material,thickness,expected", [
    (MaterialEnum.S235, 1.0, 0.38),
    (MaterialEnum.S235, 2.0, 0.40),
    (MaterialEnum.S235, 4.0, 0.42),
    (MaterialEnum.S235, 8.0, 0.44),
    (MaterialEnum.S355, 3.0, 0.44),
    (MaterialEnum.INOX_304, 2.0, 0.37),
    (MaterialEnum.ALU_5754, 3.0, 0.45),
])
def test_get_k_factor(material, thickness, expected):
    assert get_k_factor(material, thickness) == expected


# ---------------------------------------------------------------------------
# Bend allowance formula: BA = (π/180) × α × (R + K × T)
# ---------------------------------------------------------------------------

def test_bend_allowance_90deg_s235():
    req = BendAllowanceRequest(
        angle=90,
        radius=3.0,
        thickness=2.0,
        material=MaterialEnum.S235,
    )
    result = calculate_bend_allowance(req)

    k = get_k_factor(MaterialEnum.S235, 2.0)  # 0.40
    expected_ba = (math.pi / 180) * 90 * (3.0 + k * 2.0)

    assert abs(result.bend_allowance - round(expected_ba, 3)) < 0.001
    assert result.k_factor == k
    assert result.min_radius_ok  # 3mm >= 0.8×2=1.6mm


def test_bend_allowance_radius_too_small():
    req = BendAllowanceRequest(
        angle=90,
        radius=0.5,
        thickness=3.0,
        material=MaterialEnum.S235,
    )
    result = calculate_bend_allowance(req)
    assert not result.min_radius_ok
    assert len(result.warnings) > 0
    assert "fissure" in result.warnings[0].lower()


def test_bend_allowance_k_override():
    req = BendAllowanceRequest(
        angle=90,
        radius=4.0,
        thickness=3.0,
        material=MaterialEnum.S355,
        k_factor_override=0.50,
    )
    result = calculate_bend_allowance(req)
    assert result.k_factor == 0.50


def test_bend_allowance_inox_316l():
    req = BendAllowanceRequest(
        angle=45,
        radius=5.0,
        thickness=2.0,
        material=MaterialEnum.INOX_316L,
    )
    result = calculate_bend_allowance(req)
    assert result.bend_allowance > 0
    assert result.material == MaterialEnum.INOX_316L


# ---------------------------------------------------------------------------
# Weldment mass
# ---------------------------------------------------------------------------

def test_weldment_mass_ipe100():
    req = WeldmentMassRequest(
        profiles=[ProfileSegment(profile="IPE100", length_mm=6000, quantity=4)]
    )
    result = calculate_weldment_mass(req)
    # 8.1 kg/m × 6.0m × 4 = 194.4 kg
    assert abs(result.total_mass_kg - 194.4) < 0.01


def test_weldment_mass_unknown_profile():
    req = WeldmentMassRequest(
        profiles=[ProfileSegment(profile="XYZSPECIAL100", length_mm=3000, quantity=1)]
    )
    result = calculate_weldment_mass(req)
    assert result.total_mass_kg == 0.0
    assert "XYZSPECIAL100" in result.unknown_profiles


def test_weldment_mass_mixed():
    req = WeldmentMassRequest(
        profiles=[
            ProfileSegment(profile="HEA200", length_mm=5000, quantity=2),
            ProfileSegment(profile="IPE160", length_mm=3000, quantity=6),
        ]
    )
    result = calculate_weldment_mass(req)
    # HEA200: 42.3 × 5 × 2 = 423 kg
    # IPE160: 15.8 × 3 × 6 = 284.4 kg
    assert abs(result.total_mass_kg - (423.0 + 284.4)) < 0.1


# ---------------------------------------------------------------------------
# Bar optimisation
# ---------------------------------------------------------------------------

def test_bar_cutting_simple():
    result = optimize_bar_cutting(
        required_lengths=[2000, 2000, 2000],
        bar_length=6000,
        kerf=3.0,
    )
    assert result.bars_needed == 1
    assert len(result.cutting_plan[0]) == 3


def test_bar_cutting_two_bars():
    result = optimize_bar_cutting(
        required_lengths=[3500, 3500, 3500],
        bar_length=6000,
        kerf=3.0,
    )
    assert result.bars_needed == 2


def test_bar_cutting_efficiency():
    result = optimize_bar_cutting(
        required_lengths=[1000] * 5,
        bar_length=6000,
        kerf=0.0,
    )
    assert result.efficiency_percent > 80


# ---------------------------------------------------------------------------
# Manufacturability checks
# ---------------------------------------------------------------------------

def test_manufacturability_ok():
    req = ManufacturabilityRequest(
        material=MaterialEnum.S235,
        thickness=2.0,
        bend_radius=3.0,
        flanges=[20.0, 30.0],
        holes=[{"diameter": 5, "distance_to_bend": 15}],
    )
    result = check_manufacturability(req)
    # R_min = 0.8×2 = 1.6mm; 3mm >= 1.6mm ✓
    assert result.is_manufacturable


def test_manufacturability_radius_too_small():
    req = ManufacturabilityRequest(
        material=MaterialEnum.INOX_316L,
        thickness=4.0,
        bend_radius=2.0,  # < 1.2×4 = 4.8mm
        flanges=[],
    )
    result = check_manufacturability(req)
    assert not result.is_manufacturable
    errors = [c for c in result.checks if c.severity == "error"]
    assert len(errors) > 0
