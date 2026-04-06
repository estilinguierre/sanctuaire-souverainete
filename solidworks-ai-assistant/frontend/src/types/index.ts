export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  timestamp?: string;
}

export interface SourceChunk {
  title: string;
  section: string;
  content_preview: string;
  score: number;
  source_url: string;
}

export interface MCPToolResult {
  tool_name: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

export interface ChatResponse {
  answer: string;
  sources: SourceChunk[];
  mcp_result?: MCPToolResult;
  tokens_used: number;
  session_id: string;
  response_time: number;
}

export interface ChatRequest {
  messages: ChatMessage[];
  session_id: string;
  use_mcp: boolean;
}

export interface HealthStatus {
  status: "ok" | "degraded";
  version: string;
  chroma_docs: number;
  mcp_connected: boolean;
  llm_model: string;
  ctm_machines: {
    plieuse: string;
    laser: string;
    soudage: string;
  };
}

export interface GuideInfo {
  slug: string;
  title: string;
  category: string;
  file_path: string;
  size_bytes: number;
}
