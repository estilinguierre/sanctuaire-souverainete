#!/usr/bin/env python3
"""
server.py - Serveur Flask pour Raspberry Pi
Sanctuaire de Souveraineté

Ce serveur Flask expose des endpoints HTTP pour permettre à un ESP32
(ou n'importe quel client HTTP) d'utiliser l'assistant Souverain :

  POST /transcribe  - Audio WAV → texte (STT)
  POST /chat        - Texte → réponse Claude (LLM)
  POST /tts         - Texte → audio WAV (TTS)
  POST /assistant   - Pipeline complet : audio → Claude → audio
  GET  /health      - Vérification que le serveur est en vie
  GET  /status      - Statut détaillé du serveur

Utilisation :
    export ANTHROPIC_API_KEY="sk-ant-api03-..."
    python3 server.py

L'ESP32 doit pointer vers http://<IP_DU_PI>:5000
"""

import os
import io
import json
import time
import wave
import struct
import tempfile
import subprocess
from pathlib import Path

# ── Imports Flask ──────────────────────────────────────────────────────────────
try:
    from flask import Flask, request, jsonify, send_file, abort
    FLASK_DISPO = True
except ImportError:
    print("ERREUR : flask non installé. Installe avec : pip3 install flask")
    FLASK_DISPO = False

# ── Imports Speech Recognition ─────────────────────────────────────────────────
try:
    import speech_recognition as sr
    SR_DISPO = True
except ImportError:
    print("ATTENTION : SpeechRecognition non installé.")
    SR_DISPO = False

# ── Imports Anthropic ──────────────────────────────────────────────────────────
try:
    import anthropic
    ANTHROPIC_DISPO = True
except ImportError:
    print("ATTENTION : anthropic non installé.")
    ANTHROPIC_DISPO = False

# ── Vérification critique ──────────────────────────────────────────────────────
if not FLASK_DISPO:
    import sys
    sys.exit(1)

# ═══════════════════════════════════════════════════════════════════════════════
# Application Flask
# ═══════════════════════════════════════════════════════════════════════════════

app = Flask(__name__)

# ── Chargement de la knowledge base ───────────────────────────────────────────
def charger_knowledge_base():
    """Charge knowledge-base.json depuis ../data/"""
    chemin = Path(__file__).parent.parent / 'data' / 'knowledge-base.json'
    try:
        with open(chemin, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[WARN] knowledge-base.json non chargée : {e}")
        return None

KNOWLEDGE_BASE = charger_knowledge_base()

# ── Client Anthropic ───────────────────────────────────────────────────────────
def creer_client_anthropic():
    """Crée le client Anthropic si la clé API est disponible."""
    cle = os.environ.get('ANTHROPIC_API_KEY', '')
    if not cle:
        print("[WARN] ANTHROPIC_API_KEY non définie.")
        return None
    if not ANTHROPIC_DISPO:
        return None
    return anthropic.Anthropic(api_key=cle)

CLIENT_ANTHROPIC = creer_client_anthropic()

# ── Recognizer STT ────────────────────────────────────────────────────────────
RECOGNIZER = sr.Recognizer() if SR_DISPO else None
if RECOGNIZER:
    RECOGNIZER.energy_threshold = 300
    RECOGNIZER.dynamic_energy_threshold = True

# ── Historiques de conversation par client ─────────────────────────────────────
# Clé : identifiant client (IP ou ID fourni), valeur : liste de messages
historiques = {}
MAX_MESSAGES = 20

def obtenir_historique(client_id):
    """Retourne l'historique de conversation pour un client donné."""
    if client_id not in historiques:
        historiques[client_id] = []
    return historiques[client_id]

# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS INTERNES
# ═══════════════════════════════════════════════════════════════════════════════

def transcire_audio(donnees_wav, langue='fr-FR'):
    """
    Transcrit un buffer audio WAV en texte.

    Args:
        donnees_wav: bytes du fichier WAV
        langue: code langue pour STT (ex: 'fr-FR')

    Returns:
        str: texte transcrit ou None en cas d'échec
    """
    if not SR_DISPO or not RECOGNIZER:
        return None

    try:
        # Sauvegarde temporaire du WAV
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            f.write(donnees_wav)
            chemin_temp = f.name

        try:
            with sr.AudioFile(chemin_temp) as source:
                audio = RECOGNIZER.record(source)
            texte = RECOGNIZER.recognize_google(audio, language=langue)
            return texte
        finally:
            os.unlink(chemin_temp)

    except sr.UnknownValueError:
        return None
    except sr.RequestError as e:
        print(f"[ERREUR STT] {e}")
        return None
    except Exception as e:
        print(f"[ERREUR transcription] {e}")
        return None


def generer_audio_espeak(texte, langue='fr', vitesse=150):
    """
    Génère un fichier WAV via espeak-ng.

    Args:
        texte: texte à prononcer
        langue: code langue espeak (ex: 'fr', 'en')
        vitesse: mots par minute

    Returns:
        bytes: données WAV ou None en cas d'erreur
    """
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
        return donnees

    except subprocess.TimeoutExpired:
        print("[ERREUR TTS] espeak-ng timeout")
        return None
    except subprocess.CalledProcessError as e:
        print(f"[ERREUR TTS] espeak-ng : {e}")
        return None
    except FileNotFoundError:
        print("[ERREUR TTS] espeak-ng non trouvé. Installe : sudo apt-get install espeak-ng")
        return None


def construire_system_prompt():
    """Construit le system prompt pour Claude."""
    kb = KNOWLEDGE_BASE
    if kb:
        principes = '\n'.join(
            f"- {p['titre']} ({p['id']})" for p in kb.get('principes', [])
        )
        contexte = f"""
Tu es Souverain, l'assistant vocal du Sanctuaire de Souveraineté.

Projet : {kb.get('projet', {}).get('nom', '')}
Mission : {kb.get('projet', {}).get('mission', '')}

Principes du projet :
{principes}

Philosophie : {kb.get('philosophie', {}).get('fondement', '')}
"""
    else:
        contexte = "Tu es Souverain, l'assistant du Sanctuaire de Souveraineté, dédié à la liberté individuelle et l'autonomie."

    return f"""{contexte}

Instructions : Réponds de manière concise (2-4 phrases max) car tes réponses seront lues à voix haute sur un ESP32.
Sois pratique, inspirant et accessible. Langue : français par défaut."""


def appeler_claude(messages, client_id):
    """
    Appelle Claude API en mode agent et retourne la réponse textuelle.

    Args:
        messages: liste [{role, content}]
        client_id: identifiant du client pour l'historique

    Returns:
        str: réponse textuelle de Claude
    """
    if not CLIENT_ANTHROPIC:
        return "Service IA non disponible. Vérifiez la clé API."

    # Outils disponibles (version simplifiée pour l'ESP32)
    outils = [
        {
            'name': 'search_knowledge',
            'description': 'Recherche dans la base de connaissances du Sanctuaire.',
            'input_schema': {
                'type': 'object',
                'properties': {
                    'query': {'type': 'string', 'description': 'Terme de recherche'}
                },
                'required': ['query']
            }
        }
    ]

    messages_api = [{'role': m['role'], 'content': m['content']} for m in messages]
    system_prompt = construire_system_prompt()

    iteration = 0
    while iteration < 4:
        iteration += 1
        try:
            reponse = CLIENT_ANTHROPIC.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=512,  # Limité pour réponses concises ESP32
                system=system_prompt,
                messages=messages_api,
                tools=outils,
                tool_choice={'type': 'auto'}
            )
        except Exception as e:
            print(f"[ERREUR Claude] {e}")
            return f"Erreur de communication avec l'IA : {str(e)[:100]}"

        stop_reason = reponse.stop_reason
        contenu = reponse.content

        if stop_reason in ('end_turn', 'max_tokens'):
            texte = ' '.join(
                b.text for b in contenu if hasattr(b, 'text')
            ).strip()
            return texte or "Pas de réponse générée."

        if stop_reason == 'tool_use':
            messages_api.append({
                'role': 'assistant',
                'content': [
                    {'type': b.type,
                     **({'text': b.text} if hasattr(b, 'text') else {}),
                     **({'id': b.id, 'name': b.name, 'input': b.input} if hasattr(b, 'name') else {})}
                    for b in contenu
                ]
            })

            resultats = []
            for b in contenu:
                if b.type == 'tool_use':
                    # Recherche simple dans la knowledge base
                    if b.name == 'search_knowledge' and KNOWLEDGE_BASE:
                        query = b.input.get('query', '').lower()
                        res = []
                        for p in KNOWLEDGE_BASE.get('principes', []):
                            if query in p.get('titre', '').lower() or query in p.get('description', '').lower():
                                res.append({'titre': p['titre'], 'extrait': p['description'][:200]})
                        resultat_str = json.dumps({'resultats': res[:3]})
                    else:
                        resultat_str = json.dumps({'message': 'Outil non disponible.'})

                    resultats.append({
                        'type': 'tool_result',
                        'tool_use_id': b.id,
                        'content': resultat_str
                    })

            messages_api.append({'role': 'user', 'content': resultats})
            continue

        break

    return "Je n'ai pas pu traiter cette demande."


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS API
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/health', methods=['GET'])
def health():
    """Vérification simple que le serveur est en vie."""
    return jsonify({
        'status': 'ok',
        'message': 'Souverain Server opérationnel',
        'timestamp': time.time()
    })


@app.route('/status', methods=['GET'])
def status():
    """Statut détaillé du serveur et de ses composants."""
    return jsonify({
        'status': 'ok',
        'composants': {
            'flask'              : FLASK_DISPO,
            'speech_recognition' : SR_DISPO,
            'anthropic'          : ANTHROPIC_DISPO,
            'api_key_configuree' : bool(os.environ.get('ANTHROPIC_API_KEY')),
            'client_anthropic'   : CLIENT_ANTHROPIC is not None,
            'knowledge_base'     : KNOWLEDGE_BASE is not None,
        },
        'modele_ia': 'claude-sonnet-4-6',
        'version': '1.0.0'
    })


@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Endpoint STT : reçoit un fichier audio WAV, retourne le texte transcrit.

    Requête :
        Content-Type: audio/wav (ou multipart/form-data avec champ 'audio')
        Header optionnel : X-Language: fr-FR

    Réponse :
        {"succes": true, "texte": "...", "langue": "fr-FR"}
    """
    if not SR_DISPO:
        return jsonify({'succes': False, 'erreur': 'SpeechRecognition non disponible'}), 503

    langue = request.headers.get('X-Language', 'fr-FR')

    # Récupération des données audio
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
        return jsonify({'succes': False, 'erreur': 'Transcription échouée', 'texte': None})

    return jsonify({'succes': True, 'texte': texte, 'langue': langue})


@app.route('/chat', methods=['POST'])
def chat():
    """
    Endpoint LLM : reçoit texte + historique optionnel, retourne réponse Claude.

    Requête JSON :
        {
            "texte": "Ma question",
            "client_id": "esp32-001",  // optionnel, pour suivi historique
            "historique": [...]        // optionnel, messages précédents
        }

    Réponse :
        {"succes": true, "reponse": "...", "client_id": "..."}
    """
    if not request.is_json:
        return jsonify({'succes': False, 'erreur': 'Content-Type doit être application/json'}), 400

    data = request.get_json()
    texte = data.get('texte', '').strip()
    client_id = data.get('client_id', request.remote_addr)
    historique_envoye = data.get('historique', None)

    if not texte:
        return jsonify({'succes': False, 'erreur': 'Champ texte vide'}), 400

    # Utilise l'historique envoyé par le client ou celui côté serveur
    if historique_envoye is not None:
        messages = historique_envoye + [{'role': 'user', 'content': texte}]
    else:
        hist = obtenir_historique(client_id)
        hist.append({'role': 'user', 'content': texte})
        messages = hist

    # Tronque si nécessaire
    if len(messages) > MAX_MESSAGES:
        messages = messages[-MAX_MESSAGES:]

    reponse = appeler_claude(messages, client_id)

    # Mise à jour de l'historique côté serveur
    if historique_envoye is None:
        hist = obtenir_historique(client_id)
        hist.append({'role': 'assistant', 'content': reponse})
        if len(hist) > MAX_MESSAGES:
            historiques[client_id] = hist[-MAX_MESSAGES:]

    return jsonify({
        'succes': True,
        'reponse': reponse,
        'client_id': client_id
    })


@app.route('/tts', methods=['POST'])
def tts():
    """
    Endpoint TTS : reçoit du texte, retourne un fichier audio WAV.

    Requête JSON :
        {
            "texte": "Texte à prononcer",
            "langue": "fr",   // optionnel (défaut: fr)
            "vitesse": 150    // optionnel, mots par minute
        }

    Réponse :
        Fichier WAV binaire (Content-Type: audio/wav)
    """
    if not request.is_json:
        return jsonify({'succes': False, 'erreur': 'JSON requis'}), 400

    data = request.get_json()
    texte  = data.get('texte', '').strip()
    langue = data.get('langue', 'fr')
    vitesse = int(data.get('vitesse', 150))

    if not texte:
        return jsonify({'succes': False, 'erreur': 'Texte vide'}), 400

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
def assistant_pipeline():
    """
    Pipeline complet : Audio WAV → STT → Claude → TTS → Audio WAV

    Requête :
        Content-Type: audio/wav (données WAV brutes)
        ou multipart/form-data avec champ 'audio'
        Header optionnel : X-Language: fr-FR
        Header optionnel : X-Client-ID: esp32-001

    Réponse :
        {
            "succes": true,
            "texte_utilisateur": "...",
            "reponse_texte": "...",
            "audio_base64": "..." // audio WAV encodé en base64
        }
    """
    import base64

    langue_stt = request.headers.get('X-Language', 'fr-FR')
    client_id  = request.headers.get('X-Client-ID', request.remote_addr)

    # ── Étape 1 : Récupération de l'audio ──────────────────────────────────
    if request.content_type and 'multipart' in request.content_type:
        if 'audio' not in request.files:
            return jsonify({'succes': False, 'erreur': 'Champ audio manquant'}), 400
        donnees_audio = request.files['audio'].read()
    else:
        donnees_audio = request.get_data()

    if not donnees_audio:
        return jsonify({'succes': False, 'erreur': 'Données audio vides'}), 400

    # ── Étape 2 : STT ────────────────────────────────────────────────────────
    texte_utilisateur = transcire_audio(donnees_audio, langue_stt)
    if not texte_utilisateur:
        return jsonify({
            'succes': False,
            'erreur': 'Transcription échouée. Parlez plus distinctement.'
        })

    print(f"[PIPELINE] STT → \"{texte_utilisateur}\"")

    # ── Étape 3 : Claude LLM ─────────────────────────────────────────────────
    hist = obtenir_historique(client_id)
    hist.append({'role': 'user', 'content': texte_utilisateur})
    if len(hist) > MAX_MESSAGES:
        historiques[client_id] = hist[-MAX_MESSAGES:]

    reponse_texte = appeler_claude(list(hist), client_id)

    hist.append({'role': 'assistant', 'content': reponse_texte})
    print(f"[PIPELINE] Claude → \"{reponse_texte[:100]}...\"")

    # ── Étape 4 : TTS ────────────────────────────────────────────────────────
    code_langue_tts = langue_stt.split('-')[0]  # 'fr-FR' → 'fr'
    donnees_wav = generer_audio_espeak(reponse_texte, code_langue_tts)

    if not donnees_wav:
        # Retourne quand même la réponse texte même si le TTS a échoué
        return jsonify({
            'succes': True,
            'texte_utilisateur': texte_utilisateur,
            'reponse_texte': reponse_texte,
            'audio_base64': None,
            'attention': 'TTS non disponible, réponse texte seulement'
        })

    # Encode le WAV en base64 pour l'envoi JSON
    audio_b64 = base64.b64encode(donnees_wav).decode('utf-8')

    return jsonify({
        'succes': True,
        'texte_utilisateur': texte_utilisateur,
        'reponse_texte': reponse_texte,
        'audio_base64': audio_b64,
        'audio_taille_octets': len(donnees_wav)
    })


@app.route('/reset', methods=['POST'])
def reset_historique():
    """
    Réinitialise l'historique de conversation pour un client.

    Requête JSON : {"client_id": "esp32-001"}
    """
    data = request.get_json() or {}
    client_id = data.get('client_id', request.remote_addr)

    if client_id in historiques:
        del historiques[client_id]

    return jsonify({
        'succes': True,
        'message': f'Historique effacé pour {client_id}'
    })


# ── Gestion des erreurs ────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'erreur': 'Endpoint introuvable',
        'endpoints_disponibles': [
            'GET  /health',
            'GET  /status',
            'POST /transcribe',
            'POST /chat',
            'POST /tts',
            'POST /assistant',
            'POST /reset'
        ]
    }), 404


@app.errorhandler(500)
def internal_error(e):
    return jsonify({'erreur': 'Erreur interne du serveur', 'detail': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════════════
# Démarrage du serveur
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print()
    print("═" * 60)
    print("  🏛️  Souverain Server - Raspberry Pi Backend")
    print("  Sanctuaire de Souveraineté")
    print("═" * 60)
    print(f"  Flask           : {'✓' if FLASK_DISPO else '✗'}")
    print(f"  SpeechRecognition: {'✓' if SR_DISPO else '✗'}")
    print(f"  Anthropic SDK   : {'✓' if ANTHROPIC_DISPO else '✗'}")
    print(f"  Clé API         : {'✓ Configurée' if os.environ.get('ANTHROPIC_API_KEY') else '✗ MANQUANTE'}")
    print(f"  Knowledge Base  : {'✓ Chargée' if KNOWLEDGE_BASE else '✗ Non disponible'}")
    print("═" * 60)
    print()
    print("  Endpoints disponibles :")
    print("    GET  http://0.0.0.0:5000/health")
    print("    GET  http://0.0.0.0:5000/status")
    print("    POST http://0.0.0.0:5000/transcribe  (audio → texte)")
    print("    POST http://0.0.0.0:5000/chat        (texte → réponse)")
    print("    POST http://0.0.0.0:5000/tts         (texte → audio)")
    print("    POST http://0.0.0.0:5000/assistant   (audio → audio)")
    print()

    if not os.environ.get('ANTHROPIC_API_KEY'):
        print("  ⚠️  AVERTISSEMENT : ANTHROPIC_API_KEY non définie.")
        print("  Le module /chat et /assistant ne fonctionneront pas.")
        print("  Commande : export ANTHROPIC_API_KEY='sk-ant-api03-...'")
        print()

    # Démarre Flask sur toutes les interfaces réseau, port 5000
    # debug=False pour la production
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true',
        threaded=True
    )
