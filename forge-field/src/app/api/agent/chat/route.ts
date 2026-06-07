import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { runAgentLoop } from "@/lib/agent/orchestrator";
import { transcribeAudioWithWhisper } from "@/lib/utils/whisper";
import type { AgentChatResponse } from "@/types/agent";

// ─── Request schema ───────────────────────────────────────────────────────────

const ChatRequestSchema = z.object({
  user_message: z
    .string()
    .min(1, "Le message ne peut pas être vide")
    .max(5_000)
    .optional(),
  session_key: z.string().min(1).max(128).optional(),
  tenant_id: z.string().uuid("tenant_id invalide"),
  user_id: z.string().uuid("user_id invalide"),
});

// ─── POST /api/agent/chat ─────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let rawBody: Record<string, unknown>;
    let audioBuffer: Buffer | undefined;
    let audioMimeType: string | undefined;

    // ── Parse body: JSON or multipart (with audio) ──────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const audioFile = formData.get("audio_file");

      if (audioFile instanceof File) {
        audioBuffer = Buffer.from(await audioFile.arrayBuffer());
        audioMimeType = audioFile.type || "audio/webm";
      }

      rawBody = {
        user_message: formData.get("user_message") as string | undefined,
        session_key: formData.get("session_key") as string | undefined,
        tenant_id: formData.get("tenant_id"),
        user_id: formData.get("user_id"),
      };
    } else {
      rawBody = (await req.json()) as Record<string, unknown>;
    }

    // ── Validate ──────────────────────────────────────────────────────────────
    const parsed = ChatRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Requête invalide",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { tenant_id, user_id } = parsed.data;
    let { user_message, session_key } = parsed.data;

    // Auto-generate session_key if not provided
    session_key = session_key ?? uuidv4();

    // ── Transcribe audio if present ───────────────────────────────────────────
    if (audioBuffer) {
      try {
        const transcribed = await transcribeAudioWithWhisper(
          audioBuffer,
          audioMimeType ?? "audio/webm"
        );
        // Audio transcription overrides or supplements text message
        user_message = transcribed;
      } catch (whisperErr) {
        return NextResponse.json(
          {
            success: false,
            error: "Erreur de transcription audio. Réessaie ou tape ton message.",
            whisper_error:
              whisperErr instanceof Error ? whisperErr.message : "Unknown",
          },
          { status: 422 }
        );
      }
    }

    if (!user_message || user_message.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Message vide — parle ou écris quelque chose." },
        { status: 400 }
      );
    }

    // ── Run agent ──────────────────────────────────────────────────────────────
    const result: AgentChatResponse = await runAgentLoop({
      user_message: user_message.trim(),
      session_key,
      tenant_id,
      user_id,
    });

    return NextResponse.json(
      {
        ...result,
        meta: {
          duration_ms: Date.now() - startTime,
          tools_invoked: result.actions_executed.length,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[/api/agent/chat] Unhandled error:", err);

    return NextResponse.json(
      {
        success: false,
        error: "Erreur interne. Reparle dans un instant.",
        debug:
          process.env.NODE_ENV === "development" && err instanceof Error
            ? err.message
            : undefined,
      },
      { status: 500 }
    );
  }
}

// Health check
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok", agent: "JARVIS — Forge Field" });
}
