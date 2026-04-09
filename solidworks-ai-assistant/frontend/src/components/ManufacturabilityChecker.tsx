import React, { useState } from "react";
import { api } from "@/services/api";
import type { ManufacturabilityCheck, ManufacturabilityResponse, MaterialType } from "@/types/industrial";
import { CheckCircle, AlertTriangle, XCircle, ShieldCheck } from "lucide-react";

const MATERIALS: MaterialType[] = ["S235", "S355", "INOX_304", "INOX_316L", "ALU_5754"];

export function ManufacturabilityChecker() {
  const [material, setMaterial] = useState<MaterialType>("S235");
  const [thickness, setThickness] = useState(2);
  const [bendRadius, setBendRadius] = useState(3);
  const [flangesText, setFlangesText] = useState("20\n30");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ManufacturabilityResponse | null>(null);

  const handleCheck = async () => {
    setLoading(true);
    try {
      const flanges = flangesText
        .split(/[\n,;\s]+/)
        .map((v) => parseFloat(v))
        .filter((v) => v > 0);
      const res = await api.checkManufacturability({
        material,
        thickness,
        bend_radius: bendRadius,
        flanges,
      });
      setResult(res);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 p-3">
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
          <span className="text-xs text-ctm-steel">Épaisseur T (mm)</span>
          <input type="number" step="0.5" value={thickness}
            onChange={(e) => setThickness(+e.target.value)}
            className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
        </label>

        <label>
          <span className="text-xs text-ctm-steel">Rayon R (mm)</span>
          <input type="number" step="0.5" value={bendRadius}
            onChange={(e) => setBendRadius(+e.target.value)}
            className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
        </label>

        <label className="col-span-2">
          <span className="text-xs text-ctm-steel">Longueurs brides (mm, 1 par ligne)</span>
          <textarea rows={3} value={flangesText}
            onChange={(e) => setFlangesText(e.target.value)}
            className="w-full mt-1 text-sm font-mono border border-gray-200 rounded-lg px-2 py-1.5" />
        </label>
      </div>

      <button
        onClick={handleCheck}
        disabled={loading}
        className="w-full py-2 bg-ctm-navy text-white text-sm rounded-xl
                   hover:bg-ctm-amber transition-colors disabled:opacity-60
                   flex items-center justify-center gap-2"
      >
        <ShieldCheck size={14} />
        {loading ? "Vérification..." : "Vérifier fabricabilité"}
      </button>

      {result && (
        <div className="space-y-2">
          {/* Global status */}
          <div className={`rounded-xl p-3 flex items-center gap-2 text-sm font-medium ${
            result.is_manufacturable
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}>
            {result.is_manufacturable
              ? <><CheckCircle size={16} /> Pièce fabricable</>
              : <><XCircle size={16} /> Non fabricable — corrections requises</>
            }
          </div>

          {/* Individual checks */}
          <div className="space-y-1.5">
            {result.checks.map((c, i) => (
              <CheckRow key={i} check={c} />
            ))}
          </div>

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700">Suggestions</p>
              {result.suggestions.map((s, i) => (
                <p key={i} className="text-xs text-amber-600">• {s}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: ManufacturabilityCheck }) {
  const icons = {
    ok: <CheckCircle size={14} className="text-green-500 flex-shrink-0" />,
    warning: <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />,
    error: <XCircle size={14} className="text-red-500 flex-shrink-0" />,
  };

  return (
    <div className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs ${
      check.severity === "ok"
        ? "bg-green-50"
        : check.severity === "warning"
        ? "bg-amber-50"
        : "bg-red-50"
    }`}>
      {icons[check.severity]}
      <span className={
        check.severity === "ok"
          ? "text-green-700"
          : check.severity === "warning"
          ? "text-amber-700"
          : "text-red-700"
      }>{check.message}</span>
    </div>
  );
}
