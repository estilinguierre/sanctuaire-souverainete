import axios from "axios";
import type {
  ChatRequest,
  ChatResponse,
  GuideInfo,
  HealthStatus,
  SourceChunk,
} from "@/types";
import type {
  BarCuttingRequest,
  BarCuttingResponse,
  BendAllowanceRequest,
  BendAllowanceResponse,
  ManufacturabilityResponse,
  ProfileSegment,
  WeldmentMassResponse,
} from "@/types/industrial";

const BASE = "/api/v1";

const http = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 60000,
});

class ApiClient {
  // Health
  async getHealth(): Promise<HealthStatus> {
    const { data } = await http.get<HealthStatus>("/health");
    return data;
  }

  // Chat (non-streaming)
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const { data } = await http.post<ChatResponse>("/chat", req);
    return data;
  }

  // Voice transcription
  async transcribeAudio(audioBlob: Blob, filename = "audio.webm"): Promise<string> {
    const form = new FormData();
    form.append("file", audioBlob, filename);
    const { data } = await http.post<{ text: string }>("/voice/transcribe", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.text;
  }

  // Industrial calculations
  async calcBendAllowance(req: BendAllowanceRequest): Promise<BendAllowanceResponse> {
    const { data } = await http.post<BendAllowanceResponse>("/industrial/bend-allowance", req);
    return data;
  }

  async calcWeldmentMass(profiles: ProfileSegment[]): Promise<WeldmentMassResponse> {
    const { data } = await http.post<WeldmentMassResponse>("/industrial/weldment-mass", { profiles });
    return data;
  }

  async calcBarOptimization(req: BarCuttingRequest): Promise<BarCuttingResponse> {
    const { data } = await http.post<BarCuttingResponse>("/industrial/bar-optimization", req);
    return data;
  }

  async checkManufacturability(params: {
    material: string;
    thickness: number;
    bend_radius: number;
    flanges?: number[];
    holes?: Array<{ diameter: number; distance_to_bend: number }>;
  }): Promise<ManufacturabilityResponse> {
    const { data } = await http.post<ManufacturabilityResponse>(
      "/industrial/manufacturability",
      { ...params, part_type: "sheet_metal" }
    );
    return data;
  }

  // Content
  async getGuides(): Promise<GuideInfo[]> {
    const { data } = await http.get<GuideInfo[]>("/content/guides");
    return data;
  }

  async getGuide(slug: string): Promise<{ slug: string; content: string }> {
    const { data } = await http.get(`/content/guides/${encodeURIComponent(slug)}`);
    return data;
  }

  async searchKnowledge(query: string, n = 5): Promise<SourceChunk[]> {
    const { data } = await http.post<SourceChunk[]>("/content/search", { query, n_results: n });
    return data;
  }
}

export const api = new ApiClient();
