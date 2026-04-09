import React, { useState } from "react";
import { useIndustrialTools } from "@/hooks/useIndustrialTools";
import type { MaterialType } from "@/types/industrial";
import type { ProfileSegment } from "@/types/industrial";
import { Calculator, ChevronDown, Plus, Trash2 } from "lucide-react";

const MATERIALS: MaterialType[] = ["S235", "S355", "INOX_304", "INOX_316L", "ALU_5754"];
const COMMON_PROFILES = [
  "IPE80","IPE100","IPE120","IPE160","IPE200","IPE240",
  "HEA100","HEA200","HEA240",
  "RHS100x50x3","RHS100x100x4","SHS80x80x4",
  "UPN120","UPN160",
];

type Tab = "bend" | "mass" | "bars";

export function IndustrialCalculator() {
  const [tab, setTab] = useState<Tab>("bend");

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 text-xs font-medium">
        {(["bend", "mass", "bars"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 transition-colors ${
              tab === t
                ? "border-b-2 border-ctm-amber text-ctm-navy"
                : "text-ctm-steel hover:text-ctm-navy"
            }`}
          >
            {t === "bend" ? "Pliage" : t === "mass" ? "Masse soudure" : "Débit barre"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "bend" && <BendTab />}
        {tab === "mass" && <MassTab />}
        {tab === "bars" && <BarsTab />}
      </div>
    </div>
  );
}

// ---- Bend Allowance Tab ----
function BendTab() {
  const { calcBend, loading } = useIndustrialTools();
  const [material, setMaterial] = useState<MaterialType>("S235");
  const [angle, setAngle] = useState(90);
  const [radius, setRadius] = useState(3);
  const [thickness, setThickness] = useState(2);
  const [result, setResult] = useState<Awaited<ReturnType<typeof calcBend>>>(null);

  const handleCalc = async () => {
    const r = await calcBend({ angle, radius, thickness, material });
    setResult(r);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-ctm-steel font-mono">
        BA = (π/180) × α × (R + K × T)
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2">
          <span className="text-xs text-ctm-steel">Matériau</span>
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value as MaterialType)}
            className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-ctm-light"
          >
            {MATERIALS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>

        <label>
          <span className="text-xs text-ctm-steel">Angle α (°)</span>
          <input type="number" value={angle} onChange={(e) => setAngle(+e.target.value)}
            className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
        </label>

        <label>
          <span className="text-xs text-ctm-steel">Épaisseur T (mm)</span>
          <input type="number" step="0.5" value={thickness} onChange={(e) => setThickness(+e.target.value)}
            className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
        </label>

        <label>
          <span className="text-xs text-ctm-steel">Rayon R (mm)</span>
          <input type="number" step="0.5" value={radius} onChange={(e) => setRadius(+e.target.value)}
            className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
        </label>
      </div>

      <button
        onClick={handleCalc}
        disabled={loading}
        className="w-full py-2 bg-ctm-navy text-white text-sm rounded-xl
                   hover:bg-ctm-amber transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        <Calculator size={14} />
        {loading ? "Calcul..." : "Calculer BA"}
      </button>

      {result && (
        <div className={`rounded-xl p-3 text-xs space-y-1.5 ${result.min_radius_ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          <div className="font-mono text-ctm-steel text-[10px]">{result.formula}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
            <span className="text-ctm-steel">Bend Allowance</span>
            <span className="font-semibold text-ctm-navy">{result.bend_allowance} mm</span>
            <span className="text-ctm-steel">Bend Deduction</span>
            <span className="font-semibold text-ctm-navy">{result.bend_deduction} mm</span>
            <span className="text-ctm-steel">K-factor</span>
            <span className="font-semibold text-ctm-navy">{result.k_factor}</span>
            <span className="text-ctm-steel">Rayon neutre</span>
            <span className="font-semibold text-ctm-navy">{result.neutral_axis_radius} mm</span>
            <span className="text-ctm-steel">Rayon mini</span>
            <span className={`font-semibold ${result.min_radius_ok ? "text-green-600" : "text-red-600"}`}>
              {result.min_radius_required} mm {result.min_radius_ok ? "✓" : "✗"}
            </span>
          </div>
          {result.warnings.map((w, i) => (
            <p key={i} className="text-orange-600 text-[10px] mt-1">⚠ {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Weldment Mass Tab ----
function MassTab() {
  const { calcMass, loading } = useIndustrialTools();
  const [profiles, setProfiles] = useState<ProfileSegment[]>([
    { profile: "IPE100", length_mm: 3000, quantity: 4 },
  ]);
  const [result, setResult] = useState<Awaited<ReturnType<typeof calcMass>>>(null);

  const add = () => setProfiles((p) => [...p, { profile: "IPE100", length_mm: 1000, quantity: 1 }]);
  const remove = (i: number) => setProfiles((p) => p.filter((_, j) => j !== i));
  const update = (i: number, key: keyof ProfileSegment, val: string | number) =>
    setProfiles((p) => p.map((item, j) => (j === i ? { ...item, [key]: val } : item)));

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {profiles.map((seg, i) => (
          <div key={i} className="flex gap-1 items-center">
            <input
              list="profile-list"
              value={seg.profile}
              onChange={(e) => update(i, "profile", e.target.value)}
              placeholder="Profil"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5"
            />
            <input type="number" value={seg.length_mm}
              onChange={(e) => update(i, "length_mm", +e.target.value)}
              className="w-20 text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              placeholder="L (mm)"
            />
            <input type="number" value={seg.quantity} min={1}
              onChange={(e) => update(i, "quantity", +e.target.value)}
              className="w-12 text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              placeholder="Qté"
            />
            <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <datalist id="profile-list">
        {COMMON_PROFILES.map((p) => <option key={p} value={p} />)}
      </datalist>

      <button onClick={add} className="flex items-center gap-1 text-xs text-ctm-navy hover:text-ctm-amber">
        <Plus size={12} /> Ajouter profil
      </button>

      <button
        onClick={async () => setResult(await calcMass(profiles))}
        disabled={loading}
        className="w-full py-2 bg-ctm-navy text-white text-sm rounded-xl hover:bg-ctm-amber transition-colors disabled:opacity-60"
      >
        {loading ? "Calcul..." : "Calculer masse"}
      </button>

      {result && (
        <div className="bg-ctm-light rounded-xl p-3 text-xs space-y-1">
          <div className="text-lg font-bold text-ctm-navy">{result.total_mass_kg} kg</div>
          {result.details.map((d, i) => (
            <div key={i} className="flex justify-between text-ctm-steel">
              <span>{d.profile} × {d.quantity} × {d.length_mm}mm</span>
              <span className="font-medium">{d.mass_kg} kg</span>
            </div>
          ))}
          {result.unknown_profiles.length > 0 && (
            <p className="text-orange-500">Inconnus: {result.unknown_profiles.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Bar Cutting Tab ----
function BarsTab() {
  const { calcBarCuts, loading } = useIndustrialTools();
  const [barLength, setBarLength] = useState(6000);
  const [kerf, setKerf] = useState(3);
  const [lengthsText, setLengthsText] = useState("3500\n2000\n1500\n1500");
  const [result, setResult] = useState<Awaited<ReturnType<typeof calcBarCuts>>>(null);

  const handleCalc = async () => {
    const lengths = lengthsText
      .split(/[\n,;\s]+/)
      .map((l) => parseFloat(l))
      .filter((l) => l > 0);
    const r = await calcBarCuts({ required_lengths: lengths, bar_length: barLength, kerf });
    setResult(r);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="text-xs text-ctm-steel">Longueur barre (mm)</span>
          <input type="number" value={barLength} onChange={(e) => setBarLength(+e.target.value)}
            className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
        </label>
        <label>
          <span className="text-xs text-ctm-steel">Trait de scie (mm)</span>
          <input type="number" step="0.5" value={kerf} onChange={(e) => setKerf(+e.target.value)}
            className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
        </label>
      </div>

      <label>
        <span className="text-xs text-ctm-steel">Longueurs requises (mm, 1 par ligne)</span>
        <textarea rows={5} value={lengthsText} onChange={(e) => setLengthsText(e.target.value)}
          className="w-full mt-1 text-sm font-mono border border-gray-200 rounded-lg px-2 py-1.5" />
      </label>

      <button onClick={handleCalc} disabled={loading}
        className="w-full py-2 bg-ctm-navy text-white text-sm rounded-xl hover:bg-ctm-amber transition-colors disabled:opacity-60">
        {loading ? "Calcul..." : "Optimiser débit"}
      </button>

      {result && (
        <div className="bg-ctm-light rounded-xl p-3 text-xs space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xl font-bold text-ctm-navy">{result.bars_needed}</div>
              <div className="text-ctm-steel">barres</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-600">{result.efficiency_percent}%</div>
              <div className="text-ctm-steel">efficacité</div>
            </div>
            <div>
              <div className="text-xl font-bold text-orange-500">{result.waste_percent}%</div>
              <div className="text-ctm-steel">chutes</div>
            </div>
          </div>
          {result.cutting_plan.map((bar, i) => (
            <div key={i} className="text-ctm-steel">
              Barre {i + 1}: {bar.join(" + ")} mm
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
