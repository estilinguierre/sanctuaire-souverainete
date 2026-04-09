export type MaterialType = "S235" | "S355" | "INOX_304" | "INOX_316L" | "ALU_5754";

export interface BendAllowanceRequest {
  angle: number;
  radius: number;
  thickness: number;
  material: MaterialType;
  k_factor_override?: number;
}

export interface BendAllowanceResponse {
  bend_allowance: number;
  bend_deduction: number;
  neutral_axis_radius: number;
  k_factor: number;
  material: string;
  formula: string;
  min_radius_ok: boolean;
  min_radius_required: number;
  warnings: string[];
}

export interface ProfileSegment {
  profile: string;
  length_mm: number;
  quantity: number;
}

export interface WeldmentMassResponse {
  total_mass_kg: number;
  details: Array<{
    profile: string;
    length_mm: number;
    quantity: number;
    density_kg_m: number;
    mass_kg: number;
  }>;
  unknown_profiles: string[];
}

export interface BarCuttingRequest {
  required_lengths: number[];
  bar_length: number;
  kerf: number;
}

export interface BarCuttingResponse {
  bars_needed: number;
  cutting_plan: number[][];
  total_waste_mm: number;
  waste_percent: number;
  efficiency_percent: number;
}

export interface ManufacturabilityCheck {
  check_name: string;
  passed: boolean;
  value: number;
  limit: number;
  message: string;
  severity: "ok" | "warning" | "error";
}

export interface ManufacturabilityResponse {
  is_manufacturable: boolean;
  checks: ManufacturabilityCheck[];
  suggestions: string[];
}
