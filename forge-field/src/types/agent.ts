// ─── Core domain types ────────────────────────────────────────────────────────

export type UUID = string;

export type StockAction = "IN" | "OUT";

export type ExpenseCategory =
  | "carburant"
  | "materiau"
  | "repas"
  | "peage"
  | "autre";

export type ChantierStatus = "actif" | "en_pause" | "cloture" | "archive";

export type QuoteStatus =
  | "brouillon"
  | "envoye"
  | "accepte"
  | "refuse"
  | "commande"
  | "archive";

// ─── Tool result wrapper ──────────────────────────────────────────────────────

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Tool parameter types ─────────────────────────────────────────────────────

export interface StockItem {
  material_id: UUID;
  qty: number;
}

export interface UpdateStockParams {
  action: StockAction;
  items: StockItem[];
  chantier_id: UUID;
  notes?: string;
}

export interface CreateExpenseParams {
  amount: number;
  category: ExpenseCategory;
  chantier_id: UUID;
  supplier: string;
  date?: string; // ISO date string, defaults to today
  notes?: string;
}

export interface DraftVoiceQuoteParams {
  raw_transcription: string;
  chantier_context?: string;
  client_nom?: string;
  taux_marge?: number;
}

export interface GenerateLocalSEOPostParams {
  chantier_id: UUID;
}

export interface SearchCatalogParams {
  query: string;
  tenant_id: UUID;
  limit?: number;
}

// ─── Tool result data types ───────────────────────────────────────────────────

export interface UpdateStockResult {
  movements_created: number;
  updated_items: Array<{
    material_id: UUID;
    nom: string;
    action: StockAction;
    qty: number;
    stock_apres: number;
    alerte_stock?: boolean;
  }>;
}

export interface CreateExpenseResult {
  expense_id: UUID;
  montant_ttc: number;
  category: ExpenseCategory;
  chantier_nom: string;
  statut: string;
}

export interface DraftVoiceQuoteResult {
  quote_id: UUID;
  html_preview: string;
  total_ht: number;
  total_ttc: number;
  lines_count: number;
}

export interface GenerateSEOPostResult {
  post_id: UUID;
  markdown_content: string;
  titre: string;
  mots_cles: string[];
}

export interface CatalogItem {
  id: UUID;
  code_interne: string | null;
  nom: string;
  unite: string;
  quantite_depot: number;
  famille: string | null;
  prix_achat_ht: number | null;
}

// ─── Agent session state ──────────────────────────────────────────────────────

export interface SessionState {
  session_key: string;
  tenant_id: UUID;
  user_id: UUID;
  last_chantier_id: UUID | null;
  context: SessionContext;
}

export interface SessionContext {
  pendingDisambiguation?: DisambiguationRequest;
  recentEntities?: {
    chantier_id?: UUID;
    chantier_nom?: string;
  };
}

export interface DisambiguationRequest {
  type: "chantier" | "material";
  options: Array<{ id: UUID; label: string }>;
  original_intent: string;
}

// ─── Agent chat API ───────────────────────────────────────────────────────────

export interface AgentChatRequest {
  user_message: string;
  session_key: string;
  tenant_id: UUID;
  user_id: UUID;
  audio_file?: Buffer; // base64 decoded audio for Whisper
}

export interface ExecutedAction {
  tool: string;
  input: Record<string, unknown>;
  result: ToolResult;
  duration_ms: number;
}

export interface AgentChatResponse {
  success: boolean;
  ai_response: string;
  actions_executed: ExecutedAction[];
  session_key: string;
}

// ─── Database row shapes (subset of full schema) ─────────────────────────────

export interface ChantierRow {
  id: UUID;
  tenant_id: UUID;
  nom: string;
  status: ChantierStatus;
  client_nom: string | null;
  localisation: string | null;
}

export interface CatalogRow {
  id: UUID;
  tenant_id: UUID;
  code_interne: string | null;
  nom: string;
  nom_aliases: string[] | null;
  unite: string;
  quantite_depot: number;
  seuil_alerte: number;
  prix_achat_ht: number | null;
  prix_vente_ht: number | null;
  famille: string | null;
}
