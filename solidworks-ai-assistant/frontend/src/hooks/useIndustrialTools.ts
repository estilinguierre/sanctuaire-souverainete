import { useCallback, useState } from "react";
import { api } from "@/services/api";
import type {
  BarCuttingRequest,
  BarCuttingResponse,
  BendAllowanceRequest,
  BendAllowanceResponse,
  ProfileSegment,
  WeldmentMassResponse,
} from "@/types/industrial";

export function useIndustrialTools() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withLoading = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur calcul");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const calcBend = useCallback(
    (req: BendAllowanceRequest): Promise<BendAllowanceResponse | null> =>
      withLoading(() => api.calcBendAllowance(req)),
    []
  );

  const calcMass = useCallback(
    (profiles: ProfileSegment[]): Promise<WeldmentMassResponse | null> =>
      withLoading(() => api.calcWeldmentMass(profiles)),
    []
  );

  const calcBarCuts = useCallback(
    (req: BarCuttingRequest): Promise<BarCuttingResponse | null> =>
      withLoading(() => api.calcBarOptimization(req)),
    []
  );

  return { loading, error, calcBend, calcMass, calcBarCuts };
}
