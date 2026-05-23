#!/usr/bin/env python3
"""
server.py - Serveur hybride Flask HTTP + WebSocket asyncio
Sanctuaire de Souveraineté

Architecture hybride :
  - Serveur WebSocket asyncio sur le port 8765 : communication temps réel avec l'ESP32
  - Serveur Flask HTTP sur le port 5000 : API REST pour l'interface web et tests

Protocole WebSocket ESP32 ↔ Raspberry Pi :
  ESP32 → "ping"            : keepalive, réponse "pong"
  ESP32 → "pause"           : début enregistrement, reset du buffer audio
  ESP32 → données binaires  : chunks audio PCM16 mono 16kHz
  ESP32 → "stop"            : fin enregistrement → pipeline STT → Claude → TTS → envoi audio

Endpoints Flask HTTP :
  GET  /health      : vérification que le serveur est en vie
  GET  /status      : statut détaillé des composants
  POST /transcribe  : audio WAV → texte (STT)
  POST /chat        : texte → réponse Claude (LLM)
  POST /tts         : texte → audio WAV (TTS)
  POST /assistant   : pipeline complet audio → audio
  POST /reset       : réinitialise l'historique d'un client

Utilisation :
    export ANTHROPIC_API_KEY="sk-ant-api03-..."
    python3 server.py

Variables d'environnement optionnelles :
    USE_LOCAL_STT=True   → utilise faster-whisper local (défaut: False = Google)
    USE_LOCAL_TTS=True   → utilise Piper TTS local (défaut: False = espeak-ng)
    FLASK_DEBUG=true     → active le mode debug Flask
"""

import os
import io
import json
import time
import wave
import struct
import asyncio
import logging
import tempfile
import threading
import subprocess
from pathlib import Path

# ── Configuration depuis les variables d'environnement ────────────────────────
# Mode STT : False = Google Speech Recognition, True = faster-whisper local
USE_LOCAL_STT = os.environ.get('USE_LOCAL_STT', 'False').lower() == 'true'

# Mode TTS : False = espeak-ng, True = Piper TTS local (si disponible)
USE_LOCAL_TTS = os.environ.get('USE_LOCAL_TTS', 'False').lower() == 'true'

# Langue pour STT et TTS
LANGUE_STT = os.environ.get('LANGUE_STT', 'fr-FR')
LANGUE_TTS = os.environ.get('LANGUE_TTS', 'fr')

# Ports des serveurs
FLASK_PORT  = int(os.environ.get('FLASK_PORT', '5000'))
WS_PORT     = int(os.environ.get('WS_PORT', '8765'))

# ── Configuration du journal (logging) ────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# ── Imports Flask ──────────────────────────────────────────────────────────────
try:
    from flask import Flask, request, jsonify, send_file
    FLASK_DISPO = True
except ImportError:
    logger.error("flask non installe. Lancez : pip3 install flask")
    FLASK_DISPO = False

# ── Imports WebSocket asyncio ──────────────────────────────────────────────────
try:
    import websockets
    WEBSOCKETS_DISPO = True
except ImportError:
    logger.error("websockets non installe. Lancez : pip3 install websockets")
    WEBSOCKETS_DISPO = False

# ── Imports Speech Recognition (Google) ───────────────────────────────────────
try:
    import speech_recognition as sr
    SR_DISPO = True
except ImportError:
    logger.warning("SpeechRecognition non installe (STT Google indisponible).")
    SR_DISPO = False

# ── Import faster-whisper (STT local) ─────────────────────────────────────────
try:
    from faster_whisper import WhisperModel
    WHISPER_DISPO = True
except ImportError:
    logger.warning("faster-whisper non installe (STT local indisponible).")
    WHISPER_DISPO = False

# ── Import numpy (pour la conversion audio PCM) ───────────────────────────────
try:
    import numpy as np
    NUMPY_DISPO = True
except ImportError:
    logger.warning("numpy non installe. Conversion audio limitee.")
    NUMPY_DISPO = False

# ── Imports Anthropic ──────────────────────────────────────────────────────────
try:
    import anthropic
    ANTHROPIC_DISPO = True
except ImportError:
    logger.warning("anthropic non installe. L'agent IA sera indisponible.")
    ANTHROPIC_DISPO = False

# ── Vérifications critiques ────────────────────────────────────────────────────
if not FLASK_DISPO or not WEBSOCKETS_DISPO:
    import sys
    logger.error("Dépendances critiques manquantes (flask, websockets). Arrêt.")
    sys.exit(1)

# ═══════════════════════════════════════════════════════════════════════════════
# INITIALISATION DES COMPOSANTS
# ═══════════════════════════════════════════════════════════════════════════════

# ── Application Flask ──────────────────────────────────────────────────────────
app = Flask(__name__)

# ── Chargement de la knowledge base ───────────────────────────────────────────
def charger_knowledge_base():
    """Charge knowledge-base.json depuis le répertoire ../data/ du projet."""
    chemin = Path(__file__).parent.parent / 'data' / 'knowledge-base.json'
    try:
        with open(chemin, 'r', encoding='utf-8') as f:
            kb = json.load(f)
        logger.info(f"Knowledge base chargee depuis {chemin}")
        return kb
    except FileNotFoundError:
        logger.warning(f"knowledge-base.json non trouvee : {chemin}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"Erreur JSON dans knowledge-base.json : {e}")
        return None

KNOWLEDGE_BASE = charger_knowledge_base()

# ── Client Anthropic ───────────────────────────────────────────────────────────
def creer_client_anthropic():
    """Crée le client Anthropic si la clé API est disponible dans l'environnement."""
    cle = os.environ.get('ANTHROPIC_API_KEY', '')
    if not cle:
        logger.warning("ANTHROPIC_API_KEY non definie. L'agent IA sera indisponible.")
        return None
    if not ANTHROPIC_DISPO:
        return None
    return anthropic.Anthropic(api_key=cle)

CLIENT_ANTHROPIC = creer_client_anthropic()

# ── Recognizer STT Google ──────────────────────────────────────────────────────
RECOGNIZER = None
if SR_DISPO and not USE_LOCAL_STT:
    RECOGNIZER = sr.Recognizer()
    RECOGNIZER.energy_threshold = 300
    RECOGNIZER.dynamic_energy_threshold = True
    logger.info("Recognizer Google Speech initialisé")

# ── Modèle faster-whisper (chargement différé) ────────────────────────────────
_whisper_model = None

def obtenir_modele_whisper():
    """Charge le modèle faster-whisper 'small' en mémoire (chargement unique)."""
    global _whisper_model
    if _whisper_model is None and WHISPER_DISPO and USE_LOCAL_STT:
        logger.info("Chargement du modele faster-whisper 'small' (premier usage)...")
        try:
            _whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
            logger.info("Modele faster-whisper charge avec succes")
        except Exception as e:
            logger.error(f"Erreur chargement faster-whisper : {e}")
    return _whisper_model

# ── Historiques de conversation par client ────────────────────────────────────
# Clé : identifiant client (adresse IP ou ID personnalisé)
# Valeur : liste de messages [{role, content}]
historiques = {}
MAX_MESSAGES = 20  # Nombre maximum de messages conservés par client

def obtenir_historique(client_id: str) -> list:
    """Retourne (ou crée) l'historique de conversation pour un client."""
    if client_id not in historiques:
        historiques[client_id] = []
    return historiques[client_id]

# ── Chemin Piper TTS ──────────────────────────────────────────────────────────
SCRIPT_DIR      = Path(__file__).parent
PIPER_BINAIRE   = SCRIPT_DIR / 'bin' / 'piper' / 'piper'
PIPER_VOIX_FR   = SCRIPT_DIR / 'voices' / 'fr_FR-siwis-low.onnx'

# ═══════════════════════════════════════════════════════════════════════════════
# FONCTIONS STT (SPEECH TO TEXT)
# ═══════════════════════════════════════════════════════════════════════════════

def transcire_audio_google(donnees_wav: bytes, langue: str = 'fr-FR') -> str | None:
    """
    Transcrit un buffer audio WAV via Google Speech Recognition.

    Nécessite une connexion internet et la bibliothèque SpeechRecognition.
    Gratuit pour usage modéré (limite Google non documentée).

    Args:
        donnees_wav : données brutes d'un fichier WAV
        langue      : code BCP-47 de la langue (ex: 'fr-FR', 'en-US')

    Returns:
        texte transcrit ou None si échec
    """
    if not SR_DISPO or not RECOGNIZER:
        return None

    try:
        # Sauvegarde temporaire pour SpeechRecognition (nécessite un fichier)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            f.write(donnees_wav)
            chemin_temp = f.name

        try:
            with sr.AudioFile(chemin_temp) as source:
                audio = RECOGNIZER.record(source)
            texte = RECOGNIZER.recognize_google(audio, language=langue)
            logger.info(f"[STT-Google] Transcription : '{texte}'")
            return texte
        finally:
            os.unlink(chemin_temp)

    except sr.UnknownValueError:
        logger.warning("[STT-Google] Parole non reconnue dans l'audio")
        return None
    except sr.RequestError as e:
        logger.error(f"[STT-Google] Erreur requête Google : {e}")
        return None
    except Exception as e:
        logger.error(f"[STT-Google] Erreur inattendue : {e}")
        return None


def transcire_audio_whisper(donnees_wav: bytes, langue: str = 'fr') -> str | None:
    """
    Transcrit un buffer audio WAV via faster-whisper (modèle local).

    Avantages : fonctionne hors ligne, bon support du français, RGPD compliant.
    Inconvénients : ~200-400ms de latence, utilise le CPU du Raspberry Pi.

    Pattern faster-whisper (documentation officielle) :
        model = WhisperModel("small", device="cpu", compute_type="int8")
        segments, info = model.transcribe(audio_file, language="fr")
        text = " ".join([seg.text for seg in segments])

    Args:
        donnees_wav : données brutes d'un fichier WAV
        langue      : code langue ISO (ex: 'fr', 'en')

    Returns:
        texte transcrit ou None si échec
    """
    modele = obtenir_modele_whisper()
    if modele is None:
        logger.error("[STT-Whisper] Modele non disponible")
        return None

    try:
        # Sauvegarde temporaire pour faster-whisper
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            f.write(donnees_wav)
            chemin_temp = f.name

        try:
            # Transcription avec faster-whisper
            # language="fr" évite la détection automatique (plus rapide)
            segments, info = modele.transcribe(chemin_temp, language=langue.split('-')[0])
            texte = " ".join([seg.text for seg in segments]).strip()
            logger.info(f"[STT-Whisper] Transcription : '{texte}' "
                        f"(langue détectée: {info.language}, "
                        f"probabilité: {info.language_probability:.2f})")
            return texte if texte else None
        finally:
            os.unlink(chemin_temp)

    except Exception as e:
        logger.error(f"[STT-Whisper] Erreur transcription : {e}")
        return None


def transcire_audio(donnees_wav: bytes, langue: str = 'fr-FR') -> str | None:
    """
    Point d'entrée unifié pour la transcription audio.
    Choisit automatiquement le moteur selon USE_LOCAL_STT.

    Args:
        donnees_wav : données brutes d'un fichier WAV
        langue      : code langue BCP-47 (ex: 'fr-FR')

    Returns:
        texte transcrit ou None si échec
    """
    if USE_LOCAL_STT:
        return transcire_audio_whisper(donnees_wav, langue)
    else:
        return transcire_audio_google(donnees_wav, langue)


def pcm16_vers_wav(donnees_pcm: bytes,
                   sample_rate: int = 16000,
                   nb_canaux: int = 1,
                   bits: int = 16) -> bytes:
    """
    Encapsule des données PCM brutes dans un en-tête WAV RIFF standard.

    L'ESP32 envoie du PCM16 brut sans en-tête WAV. Cette fonction ajoute
    l'en-tête RIFF/WAV nécessaire pour que SpeechRecognition et Whisper
    puissent lire les données audio.

    Args:
        donnees_pcm : bytes PCM bruts (int16_t little-endian)
        sample_rate : fréquence d'échantillonnage (Hz)
        nb_canaux   : nombre de canaux (1 = mono)
        bits        : résolution en bits (16)

    Returns:
        bytes : fichier WAV complet avec en-tête RIFF
    """
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as fichier_wav:
        fichier_wav.setnchannels(nb_canaux)
        fichier_wav.setsampwidth(bits // 8)  # 2 octets pour 16 bits
        fichier_wav.setframerate(sample_rate)
        fichier_wav.writeframes(donnees_pcm)
    return buffer.getvalue()


# ═══════════════════════════════════════════════════════════════════════════════
# FONCTIONS TTS (TEXT TO SPEECH)
# ═══════════════════════════════════════════════════════════════════════════════

def generer_audio_espeak(texte: str, langue: str = 'fr', vitesse: int = 150) -> bytes | None:
    """
    Génère un fichier WAV via espeak-ng (TTS open-source léger).

    espeak-ng est disponible sur Raspberry Pi OS via :
        sudo apt-get install espeak-ng

    La qualité vocale est basique mais la latence est très faible (~50ms).

    Args:
        texte   : texte à synthétiser
        langue  : code langue espeak (ex: 'fr', 'en', 'de')
        vitesse : vitesse en mots par minute (100-200)

    Returns:
        bytes WAV ou None si erreur
    """
    if not texte:
        return None

    try:
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            chemin_out = f.name

        subprocess.run(
            ['espeak-ng', '-v', langue, '-s', str(vitesse), '-w', chemin_out, texte],
            check=True,
            capture_output=True,
            timeout=30
        )

        with open(chemin_out, 'rb') as f:
            donnees = f.read()

        os.unlink(chemin_out)
        logger.debug(f"[TTS-espeak] Généré {len(donnees)} octets pour '{texte[:50]}...'")
        return donnees

    except subprocess.TimeoutExpired:
        logger.error("[TTS-espeak] Timeout (30s)")
        return None
    except subprocess.CalledProcessError as e:
        logger.error(f"[TTS-espeak] Erreur espeak-ng : {e.stderr.decode()[:200]}")
        return None
    except FileNotFoundError:
        logger.error("[TTS-espeak] espeak-ng non trouvé. Installe : sudo apt-get install espeak-ng")
        return None
    except Exception as e:
        logger.error(f"[TTS-espeak] Erreur inattendue : {e}")
        return None


def generer_audio_piper(texte: str,
                        modele: str | None = None,
                        langue: str = 'fr') -> bytes | None:
    """
    Génère un fichier WAV via Piper TTS (voix neurale haute qualité).

    Piper est un moteur TTS open-source de qualité supérieure à espeak-ng,
    développé par Rhasspy. Il fonctionne entièrement en local.

    Installation : voir setup.sh pour le téléchargement automatique.
    Modèles : https://huggingface.co/rhasspy/piper-voices

    Pattern Piper TTS :
        subprocess.run(
            ['./bin/piper/piper', '--model', 'voices/fr_FR-siwis-low.onnx', '--output_file', out],
            input=text.encode()
        )

    Fallback : si Piper n'est pas disponible, utilise espeak-ng automatiquement.

    Args:
        texte  : texte à synthétiser
        modele : chemin vers le fichier .onnx (défaut: fr_FR-siwis-low.onnx)
        langue : code langue (pour le fallback espeak-ng)

    Returns:
        bytes WAV ou None si erreur
    """
    if not texte:
        return None

    # Sélection du modèle de voix
    chemin_modele = Path(modele) if modele else PIPER_VOIX_FR

    # Vérification de la disponibilité de Piper
    if not PIPER_BINAIRE.exists():
        logger.warning(f"[TTS-Piper] Binaire Piper non trouvé : {PIPER_BINAIRE}")
        logger.warning("[TTS-Piper] Fallback sur espeak-ng")
        return generer_audio_espeak(texte, langue)

    if not chemin_modele.exists():
        logger.warning(f"[TTS-Piper] Modèle de voix non trouvé : {chemin_modele}")
        logger.warning("[TTS-Piper] Fallback sur espeak-ng")
        return generer_audio_espeak(texte, langue)

    try:
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            chemin_out = f.name

        # Piper lit le texte sur stdin et écrit le WAV dans le fichier de sortie
        resultat = subprocess.run(
            [str(PIPER_BINAIRE), '--model', str(chemin_modele), '--output_file', chemin_out],
            input=texte.encode('utf-8'),
            capture_output=True,
            timeout=60
        )

        if resultat.returncode != 0:
            logger.error(f"[TTS-Piper] Erreur Piper : {resultat.stderr.decode()[:200]}")
            logger.warning("[TTS-Piper] Fallback sur espeak-ng")
            return generer_audio_espeak(texte, langue)

        if not Path(chemin_out).exists() or Path(chemin_out).stat().st_size == 0:
            logger.error("[TTS-Piper] Fichier de sortie vide ou inexistant")
            return generer_audio_espeak(texte, langue)

        with open(chemin_out, 'rb') as f:
            donnees = f.read()

        os.unlink(chemin_out)
        logger.debug(f"[TTS-Piper] Généré {len(donnees)} octets pour '{texte[:50]}...'")
        return donnees

    except subprocess.TimeoutExpired:
        logger.error("[TTS-Piper] Timeout (60s)")
        return generer_audio_espeak(texte, langue)
    except FileNotFoundError:
        logger.error(f"[TTS-Piper] Binaire non exécutable : {PIPER_BINAIRE}")
        return generer_audio_espeak(texte, langue)
    except Exception as e:
        logger.error(f"[TTS-Piper] Erreur inattendue : {e}")
        return generer_audio_espeak(texte, langue)


def generer_audio(texte: str, langue: str = 'fr') -> bytes | None:
    """
    Point d'entrée unifié pour la génération audio TTS.
    Choisit automatiquement le moteur selon USE_LOCAL_TTS.

    Args:
        texte  : texte à synthétiser
        langue : code langue (ex: 'fr', 'en')

    Returns:
        bytes WAV ou None si erreur
    """
    if USE_LOCAL_TTS:
        return generer_audio_piper(texte, langue=langue)
    else:
        return generer_audio_espeak(texte, langue)


def wav_vers_pcm8(donnees_wav: bytes) -> bytes | None:
    """
    Convertit un fichier WAV en PCM 8 bits unsigned pour l'ESP32.

    L'ESP32 attend du PCM 8 bits unsigned (0-255) à 16kHz pour le DAC interne.
    Cette fonction lit le WAV, rééchantillonne si nécessaire, et convertit.

    Conversion int16 (-32768 à +32767) → uint8 (0-255) :
        uint8 = (int16 / 256) + 128

    Args:
        donnees_wav : données brutes d'un fichier WAV

    Returns:
        bytes PCM8 unsigned ou None si erreur
    """
    if not donnees_wav:
        return None

    try:
        buffer = io.BytesIO(donnees_wav)
        with wave.open(buffer, 'rb') as w:
            n_canaux    = w.getnchannels()
            largeur     = w.getsampwidth()   # octets par sample (2 pour 16 bits)
            rate        = w.getframerate()
            n_frames    = w.getnframes()
            raw_data    = w.readframes(n_frames)

        # Conversion selon la profondeur de bits
        if largeur == 2:
            # 16 bits signé little-endian → int16
            n_samples = len(raw_data) // 2
            samples = struct.unpack(f'<{n_samples}h', raw_data)
        elif largeur == 1:
            # 8 bits unsigned → décalage vers int16
            samples = [b - 128 for b in raw_data]
            samples = [s * 256 for s in samples]
        else:
            logger.error(f"[CONV] Largeur {largeur} octets non supportée")
            return None

        # Conversion stéréo → mono si nécessaire (moyenne des canaux)
        if n_canaux == 2:
            samples_mono = []
            for i in range(0, len(samples), 2):
                if i + 1 < len(samples):
                    samples_mono.append((samples[i] + samples[i+1]) // 2)
            samples = samples_mono

        # Conversion int16 → uint8 pour le DAC ESP32
        # (x / 256) + 128 : divise par 256 pour réduire la plage, puis décale
        pcm8 = bytes([
            max(0, min(255, int(s / 256) + 128))
            for s in samples
        ])

        logger.debug(f"[CONV] WAV {len(donnees_wav)} octets → PCM8 {len(pcm8)} octets "
                     f"({n_canaux}ch, {rate}Hz, {largeur*8}bits)")
        return pcm8

    except Exception as e:
        logger.error(f"[CONV] Erreur conversion WAV→PCM8 : {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# AGENT CLAUDE
# ═══════════════════════════════════════════════════════════════════════════════

def construire_system_prompt() -> str:
    """
    Construit le system prompt pour Claude en intégrant la knowledge base.

    Le prompt inclut le contexte du Sanctuaire de Souveraineté et les
    instructions pour répondre de manière concise (optimisé pour la synthèse vocale).

    Returns:
        str : system prompt complet
    """
    kb = KNOWLEDGE_BASE

    if kb:
        # Extraction des principes pour le contexte
        principes = '\n'.join(
            f"- {p.get('titre', '')} ({p.get('id', '')}): {p.get('description', '')[:100]}"
            for p in kb.get('principes', [])
        )

        # Extraction des FAQ si disponibles
        faqs = kb.get('faq', [])
        faq_exemples = '\n'.join(
            f"Q: {f.get('question', '')} → A: {f.get('reponse', '')[:80]}"
            for f in faqs[:3]  # 3 exemples max
        )

        contexte = f"""Tu es Souverain, l'assistant vocal du Sanctuaire de Souveraineté.

Projet : {kb.get('projet', {}).get('nom', 'Sanctuaire de Souveraineté')}
Mission : {kb.get('projet', {}).get('mission', '')}
Fondement philosophique : {kb.get('philosophie', {}).get('fondement', '')}

Principes fondamentaux du projet :
{principes}

Exemples de questions-réponses typiques :
{faq_exemples}
"""
    else:
        contexte = (
            "Tu es Souverain, l'assistant vocal du Sanctuaire de Souveraineté, "
            "dédié à la liberté individuelle, l'autonomie et la technologie souveraine."
        )

    return f"""{contexte}

INSTRUCTIONS DE RÉPONSE :
- Réponds de manière très concise (2-4 phrases maximum)
- Tes réponses seront lues à voix haute sur un ESP32 via un petit haut-parleur
- Évite les listes à puces, le markdown, les symboles non verbaux
- Sois pratique, inspirant et accessible
- Parle en français par défaut, en tutoiement chaleureux
- Pour les questions techniques, donne des instructions courtes et actionnables"""


def executer_outil(nom_outil: str, entrees: dict) -> str:
    """
    Exécute un outil de l'agent Claude et retourne le résultat en JSON.

    Outils disponibles :
      - search_knowledge   : recherche dans les principes et ressources
      - get_principle      : récupère un principe par son identifiant
      - list_resources     : liste les ressources disponibles
      - get_faq            : recherche dans les questions fréquentes

    Args:
        nom_outil : nom de l'outil à exécuter
        entrees   : dictionnaire des paramètres d'entrée

    Returns:
        str : résultat JSON sérialisé
    """
    if not KNOWLEDGE_BASE:
        return json.dumps({'erreur': 'Knowledge base non disponible'})

    if nom_outil == 'search_knowledge':
        query = entrees.get('query', '').lower()
        resultats = []

        # Recherche dans les principes
        for p in KNOWLEDGE_BASE.get('principes', []):
            titre = p.get('titre', '').lower()
            description = p.get('description', '').lower()
            if query in titre or query in description:
                resultats.append({
                    'type'    : 'principe',
                    'id'      : p.get('id', ''),
                    'titre'   : p.get('titre', ''),
                    'extrait' : p.get('description', '')[:200]
                })

        # Recherche dans les ressources
        for r in KNOWLEDGE_BASE.get('ressources', []):
            if query in r.get('nom', '').lower() or query in r.get('description', '').lower():
                resultats.append({
                    'type'    : 'ressource',
                    'nom'     : r.get('nom', ''),
                    'extrait' : r.get('description', '')[:150]
                })

        return json.dumps({'resultats': resultats[:5]}, ensure_ascii=False)

    elif nom_outil == 'get_principle':
        principe_id = entrees.get('id', '')
        for p in KNOWLEDGE_BASE.get('principes', []):
            if p.get('id', '') == principe_id:
                return json.dumps({'principe': p}, ensure_ascii=False)
        return json.dumps({'erreur': f"Principe '{principe_id}' non trouvé"})

    elif nom_outil == 'list_resources':
        ressources = [
            {'nom': r.get('nom', ''), 'type': r.get('type', ''), 'description': r.get('description', '')[:100]}
            for r in KNOWLEDGE_BASE.get('ressources', [])
        ]
        return json.dumps({'ressources': ressources}, ensure_ascii=False)

    elif nom_outil == 'get_faq':
        question = entrees.get('question', '').lower()
        for f in KNOWLEDGE_BASE.get('faq', []):
            if question in f.get('question', '').lower():
                return json.dumps({'faq': f}, ensure_ascii=False)
        # Recherche approximative
        resultats_faq = [
            f for f in KNOWLEDGE_BASE.get('faq', [])
            if any(mot in f.get('question', '').lower() for mot in question.split())
        ]
        return json.dumps({'resultats': resultats_faq[:3]}, ensure_ascii=False)

    else:
        return json.dumps({'erreur': f"Outil '{nom_outil}' non reconnu"})


def appeler_claude(messages: list, client_id: str = 'default') -> str:
    """
    Appelle l'API Claude avec une boucle agent (tool use).

    La boucle agent permet à Claude d'utiliser des outils pour enrichir
    ses réponses avec le contenu de la knowledge base du Sanctuaire.

    Outils disponibles pour Claude :
      - search_knowledge : recherche libre dans la base de connaissances
      - get_principle    : récupère un principe spécifique par ID
      - list_resources   : liste toutes les ressources disponibles
      - get_faq          : recherche dans les questions fréquentes

    Args:
        messages  : liste de messages [{role: str, content: str}]
        client_id : identifiant du client (pour les logs)

    Returns:
        str : réponse textuelle de Claude
    """
    if not CLIENT_ANTHROPIC:
        return "Service IA non disponible. Vérifiez la clé API ANTHROPIC_API_KEY."

    # Définition des outils disponibles pour Claude
    outils = [
        {
            'name': 'search_knowledge',
            'description': 'Recherche dans la base de connaissances du Sanctuaire de Souveraineté. '
                           'Utile pour répondre aux questions sur les principes, valeurs, et ressources.',
            'input_schema': {
                'type': 'object',
                'properties': {
                    'query': {
                        'type': 'string',
                        'description': 'Terme(s) de recherche en français'
                    }
                },
                'required': ['query']
            }
        },
        {
            'name': 'get_principle',
            'description': 'Récupère un principe spécifique du Sanctuaire par son identifiant.',
            'input_schema': {
                'type': 'object',
                'properties': {
                    'id': {
                        'type': 'string',
                        'description': "Identifiant du principe (ex: 'P001', 'autonomie')"
                    }
                },
                'required': ['id']
            }
        },
        {
            'name': 'list_resources',
            'description': 'Liste toutes les ressources disponibles dans le Sanctuaire.',
            'input_schema': {
                'type': 'object',
                'properties': {},
                'required': []
            }
        },
        {
            'name': 'get_faq',
            'description': 'Recherche dans les questions fréquemment posées (FAQ).',
            'input_schema': {
                'type': 'object',
                'properties': {
                    'question': {
                        'type': 'string',
                        'description': 'Question à rechercher dans la FAQ'
                    }
                },
                'required': ['question']
            }
        }
    ]

    # Formatage des messages pour l'API Anthropic
    messages_api = [{'role': m['role'], 'content': m['content']} for m in messages]
    system_prompt = construire_system_prompt()

    # Boucle agent (maximum 4 itérations pour éviter les boucles infinies)
    for iteration in range(4):
        try:
            reponse = CLIENT_ANTHROPIC.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=512,       # Limité pour des réponses concises (TTS)
                system=system_prompt,
                messages=messages_api,
                tools=outils,
                tool_choice={'type': 'auto'}
            )
        except anthropic.AuthenticationError:
            logger.error("[Claude] Clé API invalide")
            return "Erreur d'authentification API. Vérifiez votre clé Anthropic."
        except anthropic.RateLimitError:
            logger.error("[Claude] Limite de débit atteinte")
            return "Service temporairement surchargé. Veuillez réessayer dans quelques secondes."
        except Exception as e:
            logger.error(f"[Claude] Erreur API (iter {iteration}) : {e}")
            return f"Erreur de communication avec l'IA : {str(e)[:100]}"

        stop_reason = reponse.stop_reason
        contenu     = reponse.content

        logger.debug(f"[Claude] Itération {iteration}, stop_reason={stop_reason}")

        # Réponse finale : Claude a terminé de générer
        if stop_reason in ('end_turn', 'max_tokens'):
            texte = ' '.join(
                b.text for b in contenu if hasattr(b, 'text')
            ).strip()
            return texte or "Je n'ai pas de réponse à formuler."

        # Claude veut utiliser des outils
        if stop_reason == 'tool_use':
            # Ajout de la réponse assistant avec les appels d'outils dans l'historique
            messages_api.append({
                'role'   : 'assistant',
                'content': [
                    {
                        'type': b.type,
                        **({'text': b.text} if hasattr(b, 'text') else {}),
                        **({'id': b.id, 'name': b.name, 'input': b.input}
                           if hasattr(b, 'name') else {})
                    }
                    for b in contenu
                ]
            })

            # Exécution de chaque outil demandé et ajout des résultats
            resultats_outils = []
            for b in contenu:
                if b.type == 'tool_use':
                    logger.info(f"[Claude] Outil utilisé : {b.name}({b.input})")
                    resultat = executer_outil(b.name, b.input)
                    resultats_outils.append({
                        'type'       : 'tool_result',
                        'tool_use_id': b.id,
                        'content'    : resultat
                    })

            messages_api.append({'role': 'user', 'content': resultats_outils})
            continue  # Prochain appel Claude avec les résultats des outils

        # Raison d'arrêt inattendue
        logger.warning(f"[Claude] Raison d'arrêt inattendue : {stop_reason}")
        break

    return "Je n'ai pas pu traiter cette demande. Veuillez reformuler."


# ═══════════════════════════════════════════════════════════════════════════════
# PIPELINE COMPLET AUDIO → AUDIO
# ═══════════════════════════════════════════════════════════════════════════════

def pipeline_complet(donnees_pcm: bytes, client_id: str = 'ws-client') -> bytes | None:
    """
    Pipeline complet de traitement audio pour l'ESP32 :
      1. PCM16 brut → WAV (ajout en-tête RIFF)
      2. WAV → texte (STT : Google ou Whisper)
      3. Texte → réponse Claude (agent avec outils)
      4. Réponse → audio WAV (TTS : espeak-ng ou Piper)
      5. WAV → PCM8 unsigned pour le DAC ESP32

    Args:
        donnees_pcm : bytes PCM16 mono 16kHz reçus de l'ESP32
        client_id   : identifiant du client WebSocket (pour l'historique)

    Returns:
        bytes PCM8 unsigned prêts à envoyer à l'ESP32, ou None si erreur
    """
    debut = time.time()
    moteur_stt = "Whisper" if USE_LOCAL_STT else "Google"
    moteur_tts = "Piper" if USE_LOCAL_TTS else "espeak-ng"

    logger.info(f"[PIPELINE] Démarrage pour client '{client_id}' "
                f"(STT={moteur_stt}, TTS={moteur_tts})")
    logger.info(f"[PIPELINE] Audio reçu : {len(donnees_pcm)} octets PCM16 "
                f"({len(donnees_pcm)/2/16000:.1f}s)")

    # Étape 1 : Conversion PCM16 → WAV
    donnees_wav = pcm16_vers_wav(donnees_pcm)
    if not donnees_wav:
        logger.error("[PIPELINE] Échec conversion PCM16 → WAV")
        return None

    # Étape 2 : STT (Speech to Text)
    logger.info(f"[PIPELINE] STT en cours ({moteur_stt})...")
    t_stt = time.time()
    texte_utilisateur = transcire_audio(donnees_wav, LANGUE_STT)
    logger.info(f"[PIPELINE] STT terminé en {time.time()-t_stt:.2f}s : "
                f"'{texte_utilisateur}'")

    if not texte_utilisateur:
        logger.warning("[PIPELINE] Transcription vide ou échouée")
        # Message de fallback en cas d'échec STT
        texte_utilisateur = "Je n'ai pas compris. Pouvez-vous répéter ?"
        # Dans ce cas, on envoie juste une réponse d'erreur TTS sans Claude
        donnees_tts = generer_audio(texte_utilisateur, LANGUE_TTS)
        if donnees_tts:
            return wav_vers_pcm8(donnees_tts)
        return None

    # Étape 3 : Claude LLM (avec gestion de l'historique)
    logger.info("[PIPELINE] Appel Claude en cours...")
    t_llm = time.time()

    hist = obtenir_historique(client_id)
    hist.append({'role': 'user', 'content': texte_utilisateur})

    # Tronque l'historique pour ne pas dépasser la limite
    if len(hist) > MAX_MESSAGES:
        historiques[client_id] = hist[-MAX_MESSAGES:]
        hist = historiques[client_id]

    reponse_texte = appeler_claude(list(hist), client_id)
    hist.append({'role': 'assistant', 'content': reponse_texte})

    logger.info(f"[PIPELINE] Claude terminé en {time.time()-t_llm:.2f}s : "
                f"'{reponse_texte[:80]}...'")

    # Étape 4 : TTS (Text to Speech)
    logger.info(f"[PIPELINE] TTS en cours ({moteur_tts})...")
    t_tts = time.time()
    code_langue_tts = LANGUE_TTS.split('-')[0] if '-' in LANGUE_TTS else LANGUE_TTS
    donnees_tts = generer_audio(reponse_texte, code_langue_tts)
    logger.info(f"[PIPELINE] TTS terminé en {time.time()-t_tts:.2f}s "
                f"({len(donnees_tts) if donnees_tts else 0} octets WAV)")

    if not donnees_tts:
        logger.error("[PIPELINE] Échec TTS")
        return None

    # Étape 5 : Conversion WAV → PCM8 pour le DAC ESP32
    pcm8 = wav_vers_pcm8(donnees_tts)

    duree_totale = time.time() - debut
    logger.info(f"[PIPELINE] Terminé en {duree_totale:.2f}s - "
                f"PCM8 : {len(pcm8) if pcm8 else 0} octets "
                f"({len(pcm8)/16000:.1f}s audio)" if pcm8 else
                f"[PIPELINE] Terminé en {duree_totale:.2f}s - Échec conversion finale")

    return pcm8


# ═══════════════════════════════════════════════════════════════════════════════
# SERVEUR WEBSOCKET ASYNCIO (PORT 8765)
# ═══════════════════════════════════════════════════════════════════════════════

# Dictionnaire des clients WebSocket connectés
# Clé : objet websocket, Valeur : dict {buffer_audio, client_id, en_enregistrement}
clients_ws: dict = {}


async def gestionnaire_websocket(websocket):
    """
    Gestionnaire principal pour chaque connexion WebSocket entrante.

    Gère le cycle de vie complet d'une connexion ESP32 :
    1. Connexion → initialisation du buffer audio
    2. Réception "pause" → reset du buffer
    3. Réception data binaire → accumulation dans le buffer
    4. Réception "stop" → lancement du pipeline dans un executor (non bloquant)
    5. Déconnexion → nettoyage

    Le pipeline (STT + Claude + TTS) est exécuté dans un ThreadPoolExecutor
    pour ne pas bloquer la boucle asyncio pendant les opérations CPU-intensives.

    Args:
        websocket : objet websocket de la connexion cliente
    """
    # Identification du client
    adresse = websocket.remote_address
    client_id = f"ws-{adresse[0]}:{adresse[1]}" if adresse else "ws-inconnu"

    logger.info(f"[WS] Nouvelle connexion : {client_id}")

    # Initialisation de l'état du client
    clients_ws[websocket] = {
        'client_id'        : client_id,
        'buffer_audio'     : bytearray(),  # Accumulation des chunks PCM16
        'en_enregistrement': False,
        'connecte_at'      : time.time()
    }

    try:
        async for message in websocket:
            etat = clients_ws.get(websocket)
            if etat is None:
                break

            # ── Message texte ──────────────────────────────────────────────
            if isinstance(message, str):
                logger.info(f"[WS] {client_id} → texte : '{message}'")

                if message == 'ping':
                    # Keepalive applicatif → réponse pong
                    await websocket.send('pong')
                    logger.debug(f"[WS] {client_id} ← pong")

                elif message == 'pause':
                    # Début d'enregistrement → reset du buffer audio
                    etat['buffer_audio']      = bytearray()
                    etat['en_enregistrement'] = True
                    logger.info(f"[WS] {client_id} : début enregistrement, buffer réinitialisé")
                    # Confirmation au client (optionnel)
                    await websocket.send('ready')

                elif message == 'stop':
                    # Fin d'enregistrement → lancement du pipeline
                    etat['en_enregistrement'] = False
                    donnees_pcm = bytes(etat['buffer_audio'])
                    taille = len(donnees_pcm)

                    logger.info(f"[WS] {client_id} : fin enregistrement, "
                                f"{taille} octets PCM16 ({taille/2/16000:.1f}s)")

                    if taille < 3200:
                        # Minimum 0.1 secondes d'audio (3200 octets = 1600 samples 16bit)
                        logger.warning(f"[WS] {client_id} : audio trop court ({taille} octets)")
                        await websocket.send('error:audio trop court, parlez plus longtemps')
                        continue

                    # Signal au client que le traitement est en cours
                    await websocket.send('processing')

                    # Exécution du pipeline dans un thread séparé pour ne pas
                    # bloquer la boucle asyncio pendant STT + Claude + TTS
                    loop = asyncio.get_event_loop()
                    try:
                        pcm8 = await loop.run_in_executor(
                            None,  # Utilise le ThreadPoolExecutor par défaut
                            pipeline_complet,
                            donnees_pcm,
                            etat['client_id']
                        )

                        if pcm8:
                            # Envoi de l'audio de réponse en binaire
                            await websocket.send(bytes(pcm8))
                            logger.info(f"[WS] {client_id} ← audio {len(pcm8)} octets PCM8 envoyé")
                        else:
                            await websocket.send('error:pipeline echoue, verifiez les logs')

                    except Exception as e:
                        logger.error(f"[WS] {client_id} : erreur pipeline : {e}")
                        await websocket.send(f'error:{str(e)[:100]}')

                    finally:
                        # Nettoyage du buffer après traitement
                        etat['buffer_audio'] = bytearray()

                else:
                    # Message texte non reconnu
                    logger.warning(f"[WS] {client_id} : message inconnu '{message}'")

            # ── Message binaire = chunk audio PCM16 ───────────────────────
            elif isinstance(message, bytes):
                if etat.get('en_enregistrement', False):
                    # Accumulation du chunk dans le buffer
                    etat['buffer_audio'].extend(message)
                    taille_totale = len(etat['buffer_audio'])
                    # Log uniquement à intervalles réguliers pour éviter le spam
                    if taille_totale % 20480 < len(message):
                        logger.debug(f"[WS] {client_id} : buffer {taille_totale} octets "
                                     f"({taille_totale/2/16000:.1f}s audio)")
                else:
                    logger.warning(f"[WS] {client_id} : données binaires reçues hors enregistrement")

    except websockets.exceptions.ConnectionClosedOK:
        logger.info(f"[WS] {client_id} : déconnexion propre")
    except websockets.exceptions.ConnectionClosedError as e:
        logger.warning(f"[WS] {client_id} : déconnexion anormale : {e}")
    except Exception as e:
        logger.error(f"[WS] {client_id} : erreur inattendue : {e}")
    finally:
        # Nettoyage lors de la déconnexion
        if websocket in clients_ws:
            del clients_ws[websocket]
        logger.info(f"[WS] {client_id} : client supprimé ({len(clients_ws)} restant(s))")


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS FLASK HTTP (PORT 5000)
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/health', methods=['GET'])
def health():
    """
    Vérification rapide que le serveur Flask est en vie.

    Réponse : {"status": "ok", "message": "...", "timestamp": ...}
    """
    return jsonify({
        'status'   : 'ok',
        'message'  : 'Souverain Server opérationnel',
        'timestamp': time.time(),
        'ws_port'  : WS_PORT,
        'clients_ws_connectes': len(clients_ws)
    })


@app.route('/status', methods=['GET'])
def status():
    """
    Statut détaillé du serveur et de tous ses composants.

    Utile pour diagnostiquer les problèmes de configuration.
    """
    return jsonify({
        'status': 'ok',
        'composants': {
            'flask'              : FLASK_DISPO,
            'websockets_asyncio' : WEBSOCKETS_DISPO,
            'speech_recognition' : SR_DISPO,
            'faster_whisper'     : WHISPER_DISPO,
            'anthropic'          : ANTHROPIC_DISPO,
            'api_key_configuree' : bool(os.environ.get('ANTHROPIC_API_KEY')),
            'client_anthropic'   : CLIENT_ANTHROPIC is not None,
            'knowledge_base'     : KNOWLEDGE_BASE is not None,
            'piper_disponible'   : PIPER_BINAIRE.exists(),
            'voix_fr_disponible' : PIPER_VOIX_FR.exists(),
            'numpy'              : NUMPY_DISPO
        },
        'configuration': {
            'stt_local'    : USE_LOCAL_STT,
            'tts_local'    : USE_LOCAL_TTS,
            'moteur_stt'   : 'faster-whisper' if USE_LOCAL_STT else 'Google Speech',
            'moteur_tts'   : 'Piper TTS' if USE_LOCAL_TTS else 'espeak-ng',
            'langue_stt'   : LANGUE_STT,
            'langue_tts'   : LANGUE_TTS,
            'modele_ia'    : 'claude-sonnet-4-6',
            'flask_port'   : FLASK_PORT,
            'ws_port'      : WS_PORT
        },
        'stats': {
            'clients_ws_actifs'   : len(clients_ws),
            'clients_historique'  : len(historiques),
            'version'             : '2.0.0'
        }
    })


@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Endpoint STT : reçoit un fichier audio WAV, retourne le texte transcrit.

    Requête :
        Content-Type: audio/wav (données WAV brutes dans le body)
        ou multipart/form-data avec champ 'audio'
        Header optionnel : X-Language: fr-FR

    Réponse JSON :
        {"succes": true, "texte": "...", "langue": "fr-FR", "moteur": "Google"}
    """
    langue = request.headers.get('X-Language', LANGUE_STT)

    # Récupération des données audio (body brut ou multipart)
    if request.content_type and 'multipart' in request.content_type:
        if 'audio' not in request.files:
            return jsonify({'succes': False, 'erreur': 'Champ audio manquant'}), 400
        donnees_audio = request.files['audio'].read()
    else:
        donnees_audio = request.get_data()

    if not donnees_audio:
        return jsonify({'succes': False, 'erreur': 'Données audio vides'}), 400

    texte = transcire_audio(donnees_audio, langue)

    if texte is None:
        return jsonify({
            'succes': False,
            'erreur': 'Transcription échouée - audio non reconnu ou service indisponible',
            'texte' : None
        })

    return jsonify({
        'succes': True,
        'texte' : texte,
        'langue': langue,
        'moteur': 'faster-whisper' if USE_LOCAL_STT else 'Google Speech Recognition'
    })


@app.route('/chat', methods=['POST'])
def chat():
    """
    Endpoint LLM : reçoit du texte, retourne la réponse de l'agent Claude.

    Requête JSON :
        {
            "texte"     : "Ma question pour Souverain",
            "client_id" : "esp32-001",     // optionnel, pour suivi historique
            "historique": [...]            // optionnel, messages précédents
        }

    Réponse JSON :
        {"succes": true, "reponse": "...", "client_id": "...", "tokens_utilises": ...}
    """
    if not request.is_json:
        return jsonify({'succes': False, 'erreur': 'Content-Type doit être application/json'}), 400

    data      = request.get_json()
    texte     = data.get('texte', '').strip()
    client_id = data.get('client_id', request.remote_addr)
    historique_envoye = data.get('historique', None)

    if not texte:
        return jsonify({'succes': False, 'erreur': 'Champ texte vide'}), 400

    # Construction des messages à envoyer à Claude
    if historique_envoye is not None:
        # Le client gère son propre historique
        messages = historique_envoye + [{'role': 'user', 'content': texte}]
    else:
        # Historique géré côté serveur
        hist = obtenir_historique(client_id)
        hist.append({'role': 'user', 'content': texte})
        messages = list(hist)

    # Tronque si nécessaire
    if len(messages) > MAX_MESSAGES:
        messages = messages[-MAX_MESSAGES:]

    reponse = appeler_claude(messages, client_id)

    # Mise à jour de l'historique serveur si on le gère
    if historique_envoye is None:
        hist = obtenir_historique(client_id)
        hist.append({'role': 'assistant', 'content': reponse})
        if len(hist) > MAX_MESSAGES:
            historiques[client_id] = hist[-MAX_MESSAGES:]

    return jsonify({
        'succes'   : True,
        'reponse'  : reponse,
        'client_id': client_id
    })


@app.route('/tts', methods=['POST'])
def tts():
    """
    Endpoint TTS : reçoit du texte, retourne un fichier audio WAV.

    Requête JSON :
        {
            "texte"  : "Texte à synthétiser",
            "langue" : "fr",    // optionnel (défaut: fr)
            "vitesse": 150      // optionnel, mots par minute (espeak-ng seulement)
        }

    Réponse : fichier WAV binaire (Content-Type: audio/wav)
    """
    if not request.is_json:
        return jsonify({'succes': False, 'erreur': 'JSON requis'}), 400

    data    = request.get_json()
    texte   = data.get('texte', '').strip()
    langue  = data.get('langue', LANGUE_TTS)
    vitesse = int(data.get('vitesse', 150))

    if not texte:
        return jsonify({'succes': False, 'erreur': 'Texte vide'}), 400

    # Génération audio avec le moteur configuré
    if USE_LOCAL_TTS:
        donnees_wav = generer_audio_piper(texte, langue=langue)
    else:
        donnees_wav = generer_audio_espeak(texte, langue, vitesse)

    if not donnees_wav:
        return jsonify({'succes': False, 'erreur': 'Génération audio échouée'}), 500

    return send_file(
        io.BytesIO(donnees_wav),
        mimetype='audio/wav',
        as_attachment=False,
        download_name='reponse.wav'
    )


@app.route('/assistant', methods=['POST'])
def assistant_pipeline_http():
    """
    Pipeline complet HTTP : Audio WAV → STT → Claude → TTS → Audio WAV

    Requête :
        Content-Type: audio/wav (données WAV brutes dans le body)
        ou multipart/form-data avec champ 'audio'
        Header optionnel : X-Language: fr-FR
        Header optionnel : X-Client-ID: esp32-001

    Réponse JSON :
        {
            "succes"           : true,
            "texte_utilisateur": "Question posée...",
            "reponse_texte"    : "Réponse de Souverain...",
            "audio_base64"     : "...",  // WAV encodé base64
            "moteur_stt"       : "...",
            "moteur_tts"       : "..."
        }
    """
    import base64

    langue_stt = request.headers.get('X-Language', LANGUE_STT)
    client_id  = request.headers.get('X-Client-ID', request.remote_addr)

    # Récupération de l'audio
    if request.content_type and 'multipart' in request.content_type:
        if 'audio' not in request.files:
            return jsonify({'succes': False, 'erreur': 'Champ audio manquant'}), 400
        donnees_audio = request.files['audio'].read()
    else:
        donnees_audio = request.get_data()

    if not donnees_audio:
        return jsonify({'succes': False, 'erreur': 'Données audio vides'}), 400

    # STT
    texte_utilisateur = transcire_audio(donnees_audio, langue_stt)
    if not texte_utilisateur:
        return jsonify({
            'succes': False,
            'erreur': 'Transcription échouée. Parlez plus distinctement ou vérifiez le microphone.'
        })

    logger.info(f"[HTTP PIPELINE] STT : '{texte_utilisateur}'")

    # Claude LLM
    hist = obtenir_historique(client_id)
    hist.append({'role': 'user', 'content': texte_utilisateur})
    if len(hist) > MAX_MESSAGES:
        historiques[client_id] = hist[-MAX_MESSAGES:]

    reponse_texte = appeler_claude(list(hist), client_id)
    hist.append({'role': 'assistant', 'content': reponse_texte})

    logger.info(f"[HTTP PIPELINE] Claude : '{reponse_texte[:80]}...'")

    # TTS
    code_langue_tts = langue_stt.split('-')[0]
    donnees_wav = generer_audio(reponse_texte, code_langue_tts)

    if not donnees_wav:
        return jsonify({
            'succes'            : True,
            'texte_utilisateur' : texte_utilisateur,
            'reponse_texte'     : reponse_texte,
            'audio_base64'      : None,
            'attention'         : 'TTS non disponible, réponse texte seulement',
            'moteur_stt'        : 'faster-whisper' if USE_LOCAL_STT else 'Google',
            'moteur_tts'        : None
        })

    audio_b64 = base64.b64encode(donnees_wav).decode('utf-8')

    return jsonify({
        'succes'            : True,
        'texte_utilisateur' : texte_utilisateur,
        'reponse_texte'     : reponse_texte,
        'audio_base64'      : audio_b64,
        'audio_taille_octets': len(donnees_wav),
        'moteur_stt'        : 'faster-whisper' if USE_LOCAL_STT else 'Google Speech',
        'moteur_tts'        : 'Piper TTS' if USE_LOCAL_TTS else 'espeak-ng'
    })


@app.route('/reset', methods=['POST'])
def reset_historique():
    """
    Réinitialise l'historique de conversation d'un client.

    Requête JSON : {"client_id": "esp32-001"}
    Réponse JSON : {"succes": true, "message": "..."}
    """
    data      = request.get_json() or {}
    client_id = data.get('client_id', request.remote_addr)

    if client_id in historiques:
        del historiques[client_id]
        logger.info(f"[Flask] Historique effacé pour {client_id}")

    return jsonify({
        'succes' : True,
        'message': f'Historique effacé pour {client_id}'
    })


# ── Gestion des erreurs Flask ──────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'erreur': 'Endpoint introuvable',
        'endpoints_disponibles': [
            'GET  /health',
            'GET  /status',
            'POST /transcribe  (audio WAV → texte)',
            'POST /chat        (texte → réponse Claude)',
            'POST /tts         (texte → audio WAV)',
            'POST /assistant   (audio WAV → audio WAV, pipeline complet)',
            'POST /reset       (réinitialise historique conversation)'
        ]
    }), 404


@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Erreur interne Flask : {e}")
    return jsonify({'erreur': 'Erreur interne du serveur', 'detail': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════════════
# DÉMARRAGE DU SERVEUR HYBRIDE
# ═══════════════════════════════════════════════════════════════════════════════

def demarrer_flask():
    """
    Lance le serveur Flask HTTP dans un thread daemon séparé.
    Le thread daemon s'arrête automatiquement quand le processus principal se termine.
    """
    mode_debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    logger.info(f"[Flask] Démarrage sur http://0.0.0.0:{FLASK_PORT} (debug={mode_debug})")

    # use_reloader=False est obligatoire quand Flask tourne dans un thread
    # threaded=True permet plusieurs requêtes simultanées
    app.run(
        host='0.0.0.0',
        port=FLASK_PORT,
        debug=mode_debug,
        use_reloader=False,
        threaded=True
    )


async def demarrer_websocket_server():
    """
    Lance le serveur WebSocket asyncio et le maintient indéfiniment.

    Le serveur gère plusieurs connexions simultanées grâce à asyncio.
    Chaque connexion est gérée par une coroutine gestionnaire_websocket indépendante.
    """
    logger.info(f"[WS] Démarrage du serveur WebSocket sur ws://0.0.0.0:{WS_PORT}")

    # Configuration du serveur WebSocket :
    # - ping_interval=20s : keepalive WebSocket niveau protocole
    # - ping_timeout=10s  : timeout si pas de pong
    # - max_size=10MB     : taille max des messages (10 secondes audio ~160KB max)
    async with websockets.serve(
        gestionnaire_websocket,
        '0.0.0.0',
        WS_PORT,
        ping_interval=20,
        ping_timeout=10,
        max_size=10 * 1024 * 1024  # 10 MB max par message
    ):
        logger.info(f"[WS] Serveur WebSocket en écoute sur ws://0.0.0.0:{WS_PORT}")
        # Maintient le serveur actif indéfiniment
        await asyncio.Future()  # Bloque jusqu'à annulation


if __name__ == '__main__':
    # ── Bannière de démarrage ──────────────────────────────────────────────────
    print()
    print("=" * 62)
    print("  Souverain Server v2.0 - Hybride Flask + WebSocket")
    print("  Sanctuaire de Souverainete - Raspberry Pi Backend")
    print("=" * 62)
    print(f"  Flask HTTP    : http://0.0.0.0:{FLASK_PORT}")
    print(f"  WebSocket     : ws://0.0.0.0:{WS_PORT}")
    print("=" * 62)
    print(f"  Flask         : {'OK' if FLASK_DISPO else 'MANQUANT'}")
    print(f"  WebSockets    : {'OK' if WEBSOCKETS_DISPO else 'MANQUANT'}")
    print(f"  SpeechRecog   : {'OK' if SR_DISPO else 'non installe'}")
    print(f"  faster-whisper: {'OK' if WHISPER_DISPO else 'non installe'}")
    print(f"  Anthropic SDK : {'OK' if ANTHROPIC_DISPO else 'non installe'}")
    print(f"  Cle API       : {'OK' if os.environ.get('ANTHROPIC_API_KEY') else 'MANQUANTE'}")
    print(f"  Knowledge Base: {'OK' if KNOWLEDGE_BASE else 'non disponible'}")
    print(f"  Piper TTS     : {'OK' if PIPER_BINAIRE.exists() else 'non installe'}")
    print("=" * 62)
    print(f"  Moteur STT    : {'faster-whisper (local)' if USE_LOCAL_STT else 'Google Speech (cloud)'}")
    print(f"  Moteur TTS    : {'Piper TTS (local)' if USE_LOCAL_TTS else 'espeak-ng (local)'}")
    print("=" * 62)
    print()

    if not os.environ.get('ANTHROPIC_API_KEY'):
        print("  AVERTISSEMENT : ANTHROPIC_API_KEY non definie.")
        print("  Les endpoints /chat, /assistant et WebSocket stop ne fonctionneront pas.")
        print("  Configurez : export ANTHROPIC_API_KEY='sk-ant-api03-...'")
        print()

    print("  Variables d'environnement disponibles :")
    print("    USE_LOCAL_STT=True   → utiliser faster-whisper")
    print("    USE_LOCAL_TTS=True   → utiliser Piper TTS")
    print("    FLASK_DEBUG=true     → mode debug Flask")
    print("    WS_PORT=8765         → port WebSocket")
    print("    FLASK_PORT=5000      → port Flask HTTP")
    print()

    # ── Lancement du serveur Flask dans un thread daemon ──────────────────────
    thread_flask = threading.Thread(target=demarrer_flask, name='FlaskThread')
    thread_flask.daemon = True  # Se termine avec le processus principal
    thread_flask.start()
    logger.info("[Main] Thread Flask démarré")

    # ── Lancement du serveur WebSocket asyncio dans le thread principal ───────
    # Le serveur WebSocket prend le contrôle de la boucle asyncio principale
    # et s'exécute indéfiniment jusqu'à interruption (Ctrl+C)
    try:
        asyncio.run(demarrer_websocket_server())
    except KeyboardInterrupt:
        logger.info("[Main] Arrêt demandé (Ctrl+C)")
        print()
        print("  Serveur arrêté proprement.")
        print()
