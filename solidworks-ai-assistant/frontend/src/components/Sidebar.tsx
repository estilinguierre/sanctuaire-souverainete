import React, { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { GuideInfo, HealthStatus } from "@/types";
import { IndustrialCalculator } from "./IndustrialCalculator";
import { ManufacturabilityChecker } from "./ManufacturabilityChecker";
import { BookOpen, Calculator, Cpu, Wifi, WifiOff } from "lucide-react";

type SidebarTab = "guides" | "calc" | "status";

interface Props {
  onGuideInsert?: (content: string) => void;
}

export function Sidebar({ onGuideInsert }: Props) {
  const [tab, setTab] = useState<SidebarTab>("calc");
  const [guides, setGuides] = useState<GuideInfo[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loadingGuides, setLoadingGuides] = useState(false);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => null);
    const iv = setInterval(
      () => api.getHealth().then(setHealth).catch(() => null),
      30_000
    );
    return () => clearInterval(iv);
  }, []);

  const loadGuides = async () => {
    setLoadingGuides(true);
    try {
      const g = await api.getGuides();
      setGuides(g);
    } finally {
      setLoadingGuides(false);
    }
  };

  useEffect(() => {
    if (tab === "guides" && guides.length === 0) loadGuides();
  }, [tab]);

  const categories = [...new Set(guides.map((g) => g.category))];

  return (
    <div className="w-72 flex flex-col border-r border-gray-200 bg-ctm-light h-full">
      {/* Header */}
      <div className="px-4 py-3 bg-ctm-navy">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-ctm-amber flex items-center justify-center font-bold text-ctm-dark text-sm">
            CTM
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">Assistant SolidWorks</p>
            <p className="text-ctm-steel text-xs">CTM Industrie · Normandie</p>
          </div>
        </div>

        {/* Mini status */}
        <div className="flex items-center gap-1.5 mt-2 text-xs">
          {health?.mcp_connected
            ? <Wifi size={10} className="text-green-400" />
            : <WifiOff size={10} className="text-ctm-steel" />
          }
          <span className="text-ctm-steel">
            {health?.mcp_connected ? "SolidWorks connecté" : "Mode chat seul"}
          </span>
          {health && (
            <span className="ml-auto text-ctm-steel">{health.chroma_docs} docs</span>
          )}
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-gray-200 bg-white text-xs">
        <TabBtn active={tab === "calc"} onClick={() => setTab("calc")} icon={<Calculator size={12} />} label="Calculs" />
        <TabBtn active={tab === "guides"} onClick={() => setTab("guides")} icon={<BookOpen size={12} />} label="Guides" />
        <TabBtn active={tab === "status"} onClick={() => setTab("status")} icon={<Cpu size={12} />} label="Statut" />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === "calc" && <IndustrialCalculator />}

        {tab === "guides" && (
          <div className="h-full overflow-y-auto p-2 space-y-3">
            {loadingGuides && <p className="text-xs text-ctm-steel p-2">Chargement...</p>}
            {guides.length === 0 && !loadingGuides && (
              <p className="text-xs text-ctm-steel p-2 text-center">
                Aucun guide — lancez<br />
                <code className="text-ctm-navy">generate_industrial_guides.py</code>
              </p>
            )}
            {categories.map((cat) => (
              <div key={cat}>
                <p className="text-[10px] uppercase font-semibold text-ctm-steel px-1 mb-1 tracking-wide">{cat}</p>
                {guides.filter((g) => g.category === cat).map((g) => (
                  <button
                    key={g.slug}
                    onClick={async () => {
                      if (onGuideInsert) {
                        const { content } = await api.getGuide(g.slug);
                        onGuideInsert(content);
                      }
                    }}
                    className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-white hover:shadow-sm text-ctm-navy transition-all"
                  >
                    {g.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === "status" && health && <StatusPanel health={health} />}
        {tab === "status" && !health && (
          <p className="p-3 text-xs text-ctm-steel text-center">Backend non accessible</p>
        )}
      </div>

      {/* Manufacturability at bottom */}
      <div className="border-t border-gray-200">
        <details>
          <summary className="px-3 py-2 text-xs font-medium text-ctm-navy cursor-pointer hover:bg-white select-none">
            Vérification fabricabilité
          </summary>
          <ManufacturabilityChecker />
        </details>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 py-2.5 transition-colors ${
        active ? "border-b-2 border-ctm-amber text-ctm-navy font-semibold" : "text-ctm-steel hover:text-ctm-navy"
      }`}
    >
      {icon}{label}
    </button>
  );
}

function StatusPanel({ health }: { health: HealthStatus }) {
  const rows = [
    ["Version", health.version],
    ["LLM", health.llm_model],
    ["Documents KB", String(health.chroma_docs)],
    ["SolidWorks", health.mcp_connected ? "✓ Connecté" : "✗ Non connecté"],
    ["Plieuse", health.ctm_machines.plieuse],
    ["Laser", health.ctm_machines.laser],
    ["Soudage", health.ctm_machines.soudage],
  ];

  return (
    <div className="p-3 space-y-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between text-xs">
          <span className="text-ctm-steel">{label}</span>
          <span className={`font-medium ${value.startsWith("✓") ? "text-green-600" : value.startsWith("✗") ? "text-red-500" : "text-ctm-navy"}`}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}
