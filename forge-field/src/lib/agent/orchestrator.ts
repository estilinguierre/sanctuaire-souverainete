import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/db/supabaseClient";
import { buildSystemPrompt } from "./systemPrompt";
import { AGENT_TOOLS } from "./toolSchemas";
import {
  getSessionState,
  updateSessionState,
  getActiveChantiers,
} from "./sessionState";
import {
  searchCatalog,
  updateStock,
  createExpense,
  draftVoiceQuote,
  generateLocalSEOPost,
} from "./agentTools";
import type {
  AgentChatRequest,
  AgentChatResponse,
  ExecutedAction,
  UUID,
} from "@/types/agent";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const LLM_MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5-20251001";
const MAX_TOOL_ITERATIONS = 8; // Safety cap on the reasoning loop

// ─── Tool dispatch ─────────────────────────────────────────────────────────────

async function dispatchTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  tenantId: UUID,
  userId: UUID
): Promise<unknown> {
  switch (toolName) {
    case "searchCatalog":
      return searchCatalog(toolInput, tenantId);
    case "updateStock":
      return updateStock(toolInput, tenantId, userId);
    case "createExpense":
      return createExpense(toolInput, tenantId, userId);
    case "draftVoiceQuote":
      return draftVoiceQuote(toolInput, tenantId, userId);
    case "generateLocalSEOPost":
      return generateLocalSEOPost(toolInput, tenantId);
    default:
      return { success: false, error: `Outil inconnu : ${toolName}` };
  }
}

// ─── Main reasoning loop ──────────────────────────────────────────────────────

export async function runAgentLoop(
  req: AgentChatRequest
): Promise<AgentChatResponse> {
  const startTime = Date.now();
  const { user_message, session_key, tenant_id, user_id } = req;

  // 1. Load session + build context
  const [session, activeChantiers] = await Promise.all([
    getSessionState(session_key, tenant_id, user_id),
    getActiveChantiers(tenant_id),
  ]);

  const systemPrompt = buildSystemPrompt({
    session,
    activeChantiers,
    currentDate: new Date().toISOString().split("T")[0]!,
  });

  // 2. Initialize conversation history
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: user_message },
  ];

  const actionsExecuted: ExecutedAction[] = [];
  let finalResponse = "";
  let iterations = 0;

  // 3. Reasoning loop
  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model: LLM_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      // Allow the model to decide when to use tools vs. respond directly
      tool_choice: { type: "auto" },
      messages,
    });

    // 4a. Model finished — extract final text response
    if (response.stop_reason === "end_turn") {
      finalResponse = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }

    // 4b. Model wants to call tools
    if (response.stop_reason === "tool_use") {
      // Add assistant's response (including tool_use blocks) to history
      messages.push({ role: "assistant", content: response.content });

      const toolResultContents: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const toolStart = Date.now();

        const result = await dispatchTool(
          block.name,
          block.input as Record<string, unknown>,
          tenant_id,
          user_id
        );

        const duration_ms = Date.now() - toolStart;

        actionsExecuted.push({
          tool: block.name,
          input: block.input as Record<string, unknown>,
          result: result as ExecutedAction["result"],
          duration_ms,
        });

        // Update session context if we learned a chantier_id
        const input = block.input as Record<string, unknown>;
        if (input["chantier_id"] && typeof input["chantier_id"] === "string") {
          await updateSessionState(session_key, {
            last_chantier_id: input["chantier_id"],
          });
        }

        toolResultContents.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      // Re-inject tool results so the model can formulate final confirmation
      messages.push({ role: "user", content: toolResultContents });
      continue;
    }

    // Unexpected stop_reason — extract whatever text exists and exit
    finalResponse = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    break;
  }

  if (!finalResponse) {
    finalResponse = "Action exécutée.";
  }

  const totalMs = Date.now() - startTime;

  // 5. Persist action log
  await supabaseAdmin.from("agent_actions_log").insert({
    tenant_id,
    user_id,
    session_key,
    user_message,
    ai_response: finalResponse,
    tools_called: actionsExecuted.map((a) => a.tool),
    actions_executed: actionsExecuted,
    model_used: LLM_MODEL,
    duration_ms: totalMs,
  });

  return {
    success: true,
    ai_response: finalResponse,
    actions_executed: actionsExecuted,
    session_key,
  };
}
