import io

from fastapi import APIRouter, File, HTTPException, UploadFile
from openai import AsyncOpenAI

from app.config import get_settings
from app.models import TranscriptionResponse

router = APIRouter()
settings = get_settings()


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Transcribe audio using OpenAI Whisper.
    Accepts: webm, mp4, wav, ogg, flac (max 25MB).
    Language hint: French by default for technical vocabulary.
    """
    if not file.content_type or not any(
        t in file.content_type for t in ["audio", "video", "webm", "octet"]
    ):
        raise HTTPException(
            status_code=415, detail="Format audio non supporté."
        )

    audio_bytes = await file.read()
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Fichier trop grand (max 25MB).")

    client = AsyncOpenAI(api_key=settings.openai_api_key)

    # Whisper accepts file-like objects
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = file.filename or "audio.webm"

    transcription = await client.audio.transcriptions.create(
        model=settings.whisper_model,
        file=audio_file,
        language="fr",
        prompt=(
            "Vocabulaire SolidWorks, tôlerie, chaudronnerie, soudure, "
            "K-factor, Bend Allowance, Weldments, DXF, presse-plieuse."
        ),
    )

    return TranscriptionResponse(
        text=transcription.text,
        language="fr",
        confidence=1.0,
    )
