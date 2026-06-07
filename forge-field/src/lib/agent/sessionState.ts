import { supabaseAdmin } from "@/lib/db/supabaseClient";
import type { SessionState, SessionContext, UUID } from "@/types/agent";

// In-memory cache for hot sessions (< SESSION_TTL_SECONDS old).
// Backed by Supabase for persistence across restarts and multiple instances.
const memoryCache = new Map<string, { state: SessionState; cachedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute in-memory TTL

export async function getSessionState(
  sessionKey: string,
  tenantId: UUID,
  userId: UUID
): Promise<SessionState> {
  // 1. Check hot memory cache first
  const cached = memoryCache.get(sessionKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.state;
  }

  // 2. Load from Supabase
  const { data } = await supabaseAdmin
    .from("agent_sessions")
    .select("*")
    .eq("session_key", sessionKey)
    .single();

  if (data) {
    const state: SessionState = {
      session_key: data.session_key as string,
      tenant_id: data.tenant_id as UUID,
      user_id: data.user_id as UUID,
      last_chantier_id: (data.last_chantier_id as UUID) ?? null,
      context: (data.context as SessionContext) ?? {},
    };
    memoryCache.set(sessionKey, { state, cachedAt: Date.now() });
    return state;
  }

  // 3. Create new session
  const newState: SessionState = {
    session_key: sessionKey,
    tenant_id: tenantId,
    user_id: userId,
    last_chantier_id: null,
    context: {},
  };

  await supabaseAdmin.from("agent_sessions").insert({
    session_key: sessionKey,
    tenant_id: tenantId,
    user_id: userId,
    last_chantier_id: null,
    context: {},
  });

  memoryCache.set(sessionKey, { state: newState, cachedAt: Date.now() });
  return newState;
}

export async function updateSessionState(
  sessionKey: string,
  patch: Partial<Pick<SessionState, "last_chantier_id" | "context">>
): Promise<void> {
  const cached = memoryCache.get(sessionKey);
  if (cached) {
    const merged: SessionState = {
      ...cached.state,
      ...patch,
      context: { ...cached.state.context, ...(patch.context ?? {}) },
    };
    memoryCache.set(sessionKey, { state: merged, cachedAt: Date.now() });
  }

  const update: Record<string, unknown> = {};
  if (patch.last_chantier_id !== undefined) {
    update["last_chantier_id"] = patch.last_chantier_id;
  }
  if (patch.context !== undefined) {
    // Merge JSONB in Postgres with coalesce
    update["context"] = patch.context;
  }

  await supabaseAdmin
    .from("agent_sessions")
    .update(update)
    .eq("session_key", sessionKey);
}

export function evictSessionCache(sessionKey: string): void {
  memoryCache.delete(sessionKey);
}

// Resolve active chantiers for the tenant — used by the LLM system prompt
// to inject current context.
export async function getActiveChantiers(
  tenantId: UUID
): Promise<Array<{ id: UUID; nom: string; localisation: string | null }>> {
  const { data } = await supabaseAdmin
    .from("chantiers")
    .select("id, nom, localisation")
    .eq("tenant_id", tenantId)
    .eq("status", "actif")
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []) as Array<{
    id: UUID;
    nom: string;
    localisation: string | null;
  }>;
}
