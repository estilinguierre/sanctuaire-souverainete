#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# setup.sh - Installation de l'assistant vocal Souverain sur Raspberry Pi
# Sanctuaire de Souveraineté
#
# Utilisation :
#   chmod +x setup.sh
#   ./setup.sh
# ═══════════════════════════════════════════════════════════════════════

set -e  # Arrête le script si une commande échoue

# Couleurs pour l'affichage
ROUGE='\033[91m'
VERT='\033[92m'
JAUNE='\033[93m'
CYAN='\033[96m'
GRAS='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]    $1${RESET}"; }
succes()  { echo -e "${VERT}[OK]      $1${RESET}"; }
attention(){ echo -e "${JAUNE}[ATTENTION] $1${RESET}"; }
erreur()  { echo -e "${ROUGE}[ERREUR]  $1${RESET}"; }

# ─── Bannière ─────────────────────────────────────────────────────────────────
echo -e "${CYAN}${GRAS}"
echo "═══════════════════════════════════════════════════════"
echo "  🏛️  Installation - Assistant Souverain"
echo "  Sanctuaire de Souveraineté | Raspberry Pi Setup"
echo "═══════════════════════════════════════════════════════"
echo -e "${RESET}"

# ─── Vérification de l'environnement ─────────────────────────────────────────
info "Vérification de l'environnement..."

# Vérification que nous sommes sur un système Debian/Raspberry Pi
if ! command -v apt-get &> /dev/null; then
    attention "apt-get non trouvé. Ce script est conçu pour Raspberry Pi OS (Debian)."
    attention "Adaptez les commandes apt-get pour votre système."
fi

# Vérification Python 3
if ! command -v python3 &> /dev/null; then
    erreur "Python 3 n'est pas installé !"
    exit 1
fi
PYTHON_VERSION=$(python3 --version)
succes "Python trouvé : $PYTHON_VERSION"

# ─── Mise à jour du système ───────────────────────────────────────────────────
info "Mise à jour des paquets système..."
sudo apt-get update -qq
succes "Liste des paquets mise à jour."

# ─── Installation des dépendances système ────────────────────────────────────
info "Installation des dépendances système..."
sudo apt-get install -y \
    python3-pip \
    python3-venv \
    portaudio19-dev \
    python3-pyaudio \
    espeak-ng \
    flac \
    libespeak-ng1 \
    alsa-utils \
    pulseaudio \
    libportaudio2 \
    libasound2-dev \
    git \
    curl

succes "Dépendances système installées."

# ─── Test du microphone ───────────────────────────────────────────────────────
info "Test de la configuration audio..."
if arecord -l &> /dev/null; then
    succes "Périphériques d'enregistrement audio détectés."
else
    attention "Aucun périphérique d'enregistrement détecté."
    attention "Branchez un microphone USB et relancez le script."
fi

# Test des haut-parleurs
if aplay -l &> /dev/null; then
    succes "Périphériques de lecture audio détectés."
else
    attention "Aucun périphérique de lecture détecté."
fi

# Test espeak-ng
if espeak-ng --version &> /dev/null; then
    succes "espeak-ng est fonctionnel."
    # Test rapide de la synthèse vocale
    echo "Test vocal" | espeak-ng -v fr -s 150 2>/dev/null || true
else
    attention "espeak-ng ne répond pas correctement."
fi

# ─── Installation des dépendances Python ─────────────────────────────────────
info "Installation des dépendances Python..."

# Mise à jour de pip
python3 -m pip install --upgrade pip

# Installation des paquets depuis requirements.txt
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/requirements.txt" ]; then
    python3 -m pip install -r "$SCRIPT_DIR/requirements.txt"
    succes "Paquets Python installés depuis requirements.txt."
else
    attention "requirements.txt non trouvé, installation des paquets un par un..."
    python3 -m pip install \
        "anthropic>=0.40.0" \
        "SpeechRecognition>=3.10.0" \
        "pyttsx3>=2.90" \
        "pyaudio>=0.2.14" \
        "requests>=2.31.0" \
        "flask>=3.0.0"
    succes "Paquets Python installés."
fi

# ─── Vérification des imports Python ─────────────────────────────────────────
info "Vérification des imports Python..."

python3 -c "import anthropic; print('  ✓ anthropic')" || erreur "Import anthropic échoué"
python3 -c "import speech_recognition; print('  ✓ speech_recognition')" || erreur "Import speech_recognition échoué"
python3 -c "import pyttsx3; print('  ✓ pyttsx3')" || attention "Import pyttsx3 échoué (fallback espeak-ng disponible)"
python3 -c "import flask; print('  ✓ flask')" || erreur "Import flask échoué"

# ─── Configuration du service systemd (optionnel) ─────────────────────────────
info "Création d'un service systemd (optionnel)..."

# Nom de l'utilisateur courant
USER_COURANT="$(whoami)"
PYTHON_PATH="$(which python3)"

# Crée le fichier de service systemd
cat > /tmp/souverain-assistant.service << EOF
[Unit]
Description=Souverain - Assistant Vocal du Sanctuaire de Souveraineté
After=network.target sound.target pulseaudio.service

[Service]
Type=simple
User=${USER_COURANT}
WorkingDirectory=${SCRIPT_DIR}
Environment="ANTHROPIC_API_KEY="
ExecStart=${PYTHON_PATH} ${SCRIPT_DIR}/assistant.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

attention "Service systemd créé dans /tmp/souverain-assistant.service"
attention "Pour l'activer :"
echo "  1. Éditez /tmp/souverain-assistant.service et ajoutez votre clé API"
echo "  2. sudo cp /tmp/souverain-assistant.service /etc/systemd/system/"
echo "  3. sudo systemctl enable souverain-assistant"
echo "  4. sudo systemctl start souverain-assistant"

# ─── Configuration de la clé API ─────────────────────────────────────────────
echo
echo -e "${GRAS}═══════════════════════════════════════════════════════${RESET}"
echo -e "${VERT}${GRAS}  ✓ Installation terminée !${RESET}"
echo -e "${GRAS}═══════════════════════════════════════════════════════${RESET}"
echo
echo -e "${JAUNE}📋 ÉTAPES SUIVANTES :${RESET}"
echo
echo "  1. CONFIGUREZ VOTRE CLÉ API ANTHROPIC :"
echo "     export ANTHROPIC_API_KEY='sk-ant-api03-votre-cle-ici'"
echo "     (Obtenez votre clé sur : https://console.anthropic.com)"
echo
echo "  2. POUR RENDRE LA CLÉ PERMANENTE :"
echo "     echo \"export ANTHROPIC_API_KEY='votre-cle'\" >> ~/.bashrc"
echo "     source ~/.bashrc"
echo
echo "  3. DÉMARREZ L'ASSISTANT :"
echo "     cd ${SCRIPT_DIR}"
echo "     python3 assistant.py"
echo
echo "  4. OPTIONNEL - SERVEUR FLASK POUR ESP32 :"
echo "     python3 server.py"
echo
echo -e "${CYAN}  📖 Documentation complète dans le README du projet${RESET}"
echo

# ─── Test final ───────────────────────────────────────────────────────────────
info "Test de démarrage rapide..."
python3 -c "
import sys
try:
    import anthropic, speech_recognition, flask
    print('  ✓ Toutes les dépendances critiques sont disponibles.')
except ImportError as e:
    print(f'  ⚠️  Dépendance manquante : {e}')
    sys.exit(1)
" || true

echo
succes "Script d'installation terminé avec succès."
