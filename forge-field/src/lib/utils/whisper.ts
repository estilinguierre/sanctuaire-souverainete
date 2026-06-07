// Audio transcription via Whisper.
// Default: OpenAI hosted API.
// Alternative: replace baseURL with a self-hosted faster-whisper endpoint
// (https://github.com/fedirz/faster-whisper-server) for full sovereignty.

import OpenAI from "openai";
import { Readable } from "stream";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.WHISPER_BASE_URL ?? undefined, // override for self-hosted
});

export async function transcribeAudioWithWhisper(
  audioBuffer: Buffer,
  mimeType: string = "audio/webm"
): Promise<string> {
  // OpenAI SDK requires a File-like object with a name property
  const file = new File([audioBuffer], "audio.webm", { type: mimeType });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "fr",
    prompt:
      "Transcription de terrain pour un artisan BTP. " +
      "Termes techniques : IPN, HEA, DN50, boulon de 12, plein de gasoil, vanne, tuyauterie.",
  });

  return transcription.text.trim();
}

// Parse multipart form-data audio from a Next.js request
export async function extractAudioFromRequest(
  request: Request
): Promise<{ audioBuffer: Buffer; mimeType: string } | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) return null;

  const formData = await request.formData();
  const audioFile = formData.get("audio_file");

  if (!audioFile || !(audioFile instanceof File)) return null;

  const arrayBuffer = await audioFile.arrayBuffer();
  return {
    audioBuffer: Buffer.from(arrayBuffer),
    mimeType: audioFile.type || "audio/webm",
  };
}
