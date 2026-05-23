#!/usr/bin/env python3
"""
assistant.py - Assistant vocal "Souverain" pour Raspberry Pi
Sanctuaire de Souveraineté

Ce script implémente un assistant vocal complet qui :
1. Écoute le microphone via SpeechRecognition
2. Envoie la question à Claude (Anthropic) en mode agent avec outils
3. Lit la réponse à voix haute via pyttsx3 ou espeak-ng
4. Maintient un historique de conversation

Utilisation :
    export ANTHROPIC_API_KEY="sk-ant-api03-..."
    python3 assistant.py

Dépendances :
    pip3 install anthropic SpeechRecognition pyttsx3 pyaudio
"""

import os
import json
import sys
import time
import signal
import subprocess
import threading
from pathlib import Path

# ─── Gestion des imports optionnels ───────────────────────────────────────────

try:
    import speech_recognition as sr
    SPEECH_RECOGNITION_DISPO = True
except ImportError:
    print("⚠️  SpeechRecognition non installé. Installe avec : pip3 install SpeechRecognition")
    SPEECH_RECOGNITION_DISPO = False

try:
    import anthropic
    ANTHROPIC_DISPO = True
except ImportError:
    print("⚠️  anthropic non installé. Installe avec : pip3 install anthropic")
    ANTHROPIC_DISPO = False

try:
    import pyttsx3
    PYTTSX3_DISPO = True
except ImportError:
    PYTTSX3_DISPO = False

# ─── Codes couleurs ANSI pour la console ──────────────────────────────────────

class Couleurs:
    ROUGE    = '\033[91m'
    VERT     = '\033[92m'
    JAUNE    = '\033[93m'
    BLEU     = '\033[94m'
    MAGENTA  = '\033[95m'
    CYAN     = '\033[96m'
    BLANC    = '\033[97m'
    GRAS     = '\033[1m'
    RESET    = '\033[0m'

def afficher(texte, couleur=Couleurs.BLANC, prefixe=''):
    """Affiche du texte coloré dans la console."""
    print(f"{couleur}{prefixe}{texte}{Couleurs.RESET}")

def info(msg):    afficher(msg, Couleurs.CYAN,    '[INFO]    ')
def succes(msg):  afficher(msg, Couleurs.VERT,    '[OK]      ')
def attention(msg): afficher(msg, Couleurs.JAUNE, '[ATTENTION]')
def erreur(msg):  afficher(msg, Couleurs.ROUGE,   '[ERREUR]  ')
def ecoute(msg):  afficher(msg, Couleurs.MAGENTA, '[ÉCOUTE]  ')
def reflexion(msg): afficher(msg, Couleurs.BLEU,  '[IA]      ')
def parole(msg):  afficher(msg, Couleurs.VERT,    '[SOUVERAIN]')


# ─── Classe principale de l'assistant ─────────────────────────────────────────

class RaspberryPiAssistant:
    """
    Assistant vocal complet pour Raspberry Pi.
    Intègre STT, LLM (Claude avec outils), et TTS.
    """

    def __init__(self):
        # Configuration
        self.modele_ia      = 'claude-sonnet-4-6'
        self.max_messages   = 20      # messages max dans l'historique
        self.langue_stt     = 'fr-FR' # langue de reconnaissance vocale
        self.timeout_ecoute = 10      # secondes d'attente max pour la parole
        self.duree_phrase   = 15      # secondes max par phrase

        # État
        self.en_cours       = True    # False = arrêt propre demandé
        self.historique     = []      # [{role, content}]
        self.knowledge_base = None

        # Chargement de la base de connaissances
        self._charger_knowledge_base()

        # Initialisation des composants
        self.client_anthropic = self._init_anthropic()
        self.recognizer       = self._init_speech_recognition()
        self.microphone       = self._init_microphone()
        self.moteur_tts       = self._init_tts()

        # Gestion du signal CTRL+C pour quitter proprement
        signal.signal(signal.SIGINT, self._signal_arret)
        signal.signal(signal.SIGTERM, self._signal_arret)

    # ── Initialisation des composants ──────────────────────────────────────

    def _charger_knowledge_base(self):
        """Charge le fichier knowledge-base.json depuis ../data/"""
        # Chemin relatif au script : ../data/knowledge-base.json
        chemin = Path(__file__).parent.parent / 'data' / 'knowledge-base.json'
        try:
            with open(chemin, 'r', encoding='utf-8') as f:
                self.knowledge_base = json.load(f)
            succes(f"Base de connaissances chargée depuis : {chemin}")
        except FileNotFoundError:
            attention(f"knowledge-base.json introuvable : {chemin}")
            self.knowledge_base = None
        except json.JSONDecodeError as e:
            erreur(f"Erreur lecture knowledge-base.json : {e}")
            self.knowledge_base = None

    def _init_anthropic(self):
        """Initialise le client Anthropic SDK."""
        if not ANTHROPIC_DISPO:
            erreur("SDK Anthropic non disponible. Installe : pip3 install anthropic")
            return None

        cle_api = os.environ.get('ANTHROPIC_API_KEY', '')
        if not cle_api:
            erreur("Variable d'environnement ANTHROPIC_API_KEY non définie !")
            erreur("Commande : export ANTHROPIC_API_KEY='sk-ant-api03-...'")
            sys.exit(1)

        client = anthropic.Anthropic(api_key=cle_api)
        succes("Client Anthropic initialisé.")
        return client

    def _init_speech_recognition(self):
        """Initialise le recognizer SpeechRecognition."""
        if not SPEECH_RECOGNITION_DISPO:
            return None
        recognizer = sr.Recognizer()
        # Calibration du bruit ambiant (plus sensible = valeur faible)
        recognizer.energy_threshold = 300
        recognizer.dynamic_energy_threshold = True
        recognizer.pause_threshold = 1.0   # secondes de silence pour considérer une phrase finie
        succes("Recognizer vocal initialisé.")
        return recognizer

    def _init_microphone(self):
        """Initialise le microphone par défaut."""
        if not SPEECH_RECOGNITION_DISPO:
            return None
        try:
            micro = sr.Microphone()
            # Calibration du bruit ambiant au démarrage
            info("Calibration du microphone (2 secondes)...")
            with micro as source:
                self.recognizer.adjust_for_ambient_noise(source, duration=2)
            succes(f"Microphone initialisé. Seuil d'énergie : {self.recognizer.energy_threshold:.0f}")
            return micro
        except Exception as e:
            erreur(f"Impossible d'accéder au microphone : {e}")
            attention("Vérifiez que le microphone est connecté et que PyAudio est installé.")
            return None

    def _init_tts(self):
        """Initialise le moteur Text-to-Speech (pyttsx3 ou espeak-ng via subprocess)."""
        if PYTTSX3_DISPO:
            try:
                moteur = pyttsx3.init()
                # Configuration de la voix française si disponible
                voix_disponibles = moteur.getProperty('voices')
                voix_fr = next(
                    (v for v in voix_disponibles if 'fr' in v.id.lower() or 'french' in v.name.lower()),
                    None
                )
                if voix_fr:
                    moteur.setProperty('voice', voix_fr.id)
                    succes(f"Voix TTS sélectionnée : {voix_fr.name}")
                else:
                    attention("Aucune voix française trouvée pour pyttsx3. Voix par défaut utilisée.")

                moteur.setProperty('rate', 160)    # vitesse de parole (mots/min)
                moteur.setProperty('volume', 0.9)  # volume (0.0 à 1.0)
                succes("Moteur TTS pyttsx3 initialisé.")
                return {'type': 'pyttsx3', 'moteur': moteur}
            except Exception as e:
                attention(f"pyttsx3 a échoué ({e}), passage à espeak-ng...")

        # Fallback : espeak-ng via subprocess
        try:
            subprocess.run(['espeak-ng', '--version'],
                         capture_output=True, check=True)
            succes("Moteur TTS espeak-ng disponible.")
            return {'type': 'espeak-ng'}
        except (subprocess.CalledProcessError, FileNotFoundError):
            attention("espeak-ng non trouvé. Installe : sudo apt-get install espeak-ng")
            return None

    # ── Outils pour l'agent IA ────────────────────────────────────────────

    def _definir_outils(self):
        """Définit les outils disponibles pour Claude."""
        return [
            {
                'name': 'search_knowledge',
                'description': 'Recherche dans toute la base de connaissances du Sanctuaire de Souveraineté.',
                'input_schema': {
                    'type': 'object',
                    'properties': {
                        'query': {
                            'type': 'string',
                            'description': 'Mot-clé ou phrase de recherche en français'
                        }
                    },
                    'required': ['query']
                }
            },
            {
                'name': 'get_principle',
                'description': 'Récupère les détails d\'un principe de souveraineté.',
                'input_schema': {
                    'type': 'object',
                    'properties': {
                        'id': {
                            'type': 'string',
                            'description': ('Identifiant du principe : souverainete-personnelle, '
                                          'liberte-individuelle, responsabilite, autonomie, '
                                          'autodidaxie, technologie-service-humain, communaute, '
                                          'souverainete-numerique, souverainete-financiere, '
                                          'souverainete-intellectuelle')
                        }
                    },
                    'required': ['id']
                }
            },
            {
                'name': 'list_resources',
                'description': 'Liste les ressources recommandées (livres, pratiques, concepts).',
                'input_schema': {
                    'type': 'object',
                    'properties': {
                        'categorie': {
                            'type': 'string',
                            'description': 'livres, pratiques, concepts, ou tout'
                        }
                    },
                    'required': ['categorie']
                }
            },
            {
                'name': 'get_faq',
                'description': 'Récupère les questions-réponses fréquentes.',
                'input_schema': {
                    'type': 'object',
                    'properties': {
                        'question_id': {
                            'type': 'integer',
                            'description': 'Numéro de question 1-12, ou 0 pour la liste'
                        }
                    },
                    'required': ['question_id']
                }
            }
        ]

    def _executer_outil(self, nom_outil, parametres):
        """Exécute un outil et retourne le résultat en JSON."""
        kb = self.knowledge_base
        if not kb:
            return json.dumps({'erreur': 'Base de connaissances non disponible.'})

        reflexion(f"Outil : {nom_outil} | Paramètres : {parametres}")

        try:
            if nom_outil == 'search_knowledge':
                query = parametres.get('query', '').lower()
                resultats = []

                # Recherche dans les principes
                for p in kb.get('principes', []):
                    texte = f"{p.get('titre','')} {p.get('description','')} {' '.join(p.get('tags',[]))}".lower()
                    if query in texte:
                        resultats.append({
                            'type': 'principe',
                            'id': p['id'],
                            'titre': p['titre'],
                            'extrait': p['description'][:200]
                        })

                # Recherche dans la FAQ
                for f_item in kb.get('faq', []):
                    texte = f"{f_item.get('question','')} {f_item.get('reponse','')}".lower()
                    if query in texte:
                        resultats.append({
                            'type': 'faq',
                            'id': f_item['id'],
                            'question': f_item['question'],
                            'extrait': f_item['reponse'][:200]
                        })

                # Recherche dans le glossaire
                for terme, definition in kb.get('glossaire', {}).items():
                    if query in terme or query in definition.lower():
                        resultats.append({
                            'type': 'glossaire',
                            'terme': terme,
                            'definition': definition[:200]
                        })

                if not resultats:
                    return json.dumps({'message': f'Aucun résultat pour "{parametres.get("query")}".'})
                return json.dumps({'resultats': resultats[:8]})

            elif nom_outil == 'get_principle':
                id_principe = parametres.get('id', '')
                principe = next((p for p in kb.get('principes', []) if p['id'] == id_principe), None)
                if not principe:
                    return json.dumps({'erreur': f'Principe "{id_principe}" introuvable.'})
                return json.dumps(principe)

            elif nom_outil == 'list_resources':
                cat = parametres.get('categorie', 'tout').lower()
                if cat == 'tout':
                    return json.dumps(kb.get('ressources', []))
                section = next(
                    (r for r in kb.get('ressources', [])
                     if cat in r.get('id', '').lower() or cat in r.get('categorie', '').lower()),
                    None
                )
                if not section:
                    return json.dumps({
                        'disponible': [r['id'] for r in kb.get('ressources', [])],
                        'message': f'Catégorie "{cat}" non trouvée.'
                    })
                return json.dumps(section)

            elif nom_outil == 'get_faq':
                id_q = int(parametres.get('question_id', 0))
                if id_q == 0:
                    return json.dumps({
                        'faq': [{'id': f['id'], 'question': f['question']}
                                for f in kb.get('faq', [])]
                    })
                faq_item = next((f for f in kb.get('faq', []) if f['id'] == id_q), None)
                if not faq_item:
                    return json.dumps({'erreur': f'Question {id_q} introuvable.'})
                return json.dumps(faq_item)

            else:
                return json.dumps({'erreur': f'Outil inconnu : {nom_outil}'})

        except Exception as e:
            return json.dumps({'erreur': str(e)})

    # ── System prompt ──────────────────────────────────────────────────────

    def _construire_system_prompt(self):
        """Construit le system prompt complet."""
        kb = self.knowledge_base
        contexte_kb = ''

        if kb:
            principes_titres = '\n'.join(
                f"- {p['titre']} ({p['id']})" for p in kb.get('principes', [])
            )
            contexte_kb = f"""
## Contexte du Sanctuaire de Souveraineté

**Projet :** {kb.get('projet', {}).get('nom', 'Sanctuaire de Souveraineté')}
**Mission :** {kb.get('projet', {}).get('mission', '')}
**Créateur :** {kb.get('projet', {}).get('createur', {}).get('description', '')}

**Principes du projet :**
{principes_titres}

**Philosophie :** {kb.get('philosophie', {}).get('fondement', '')}

Tu as accès à des outils pour consulter la base de connaissances complète.
"""
        else:
            contexte_kb = "Tu es l'assistant du Sanctuaire de Souveraineté, dédié à la souveraineté personnelle et la liberté individuelle."

        return f"""Tu es Souverain, l'assistant vocal du Sanctuaire de Souveraineté.

{contexte_kb}

## Ton rôle
Tu es un guide éclairé sur la souveraineté personnelle, la liberté individuelle, l'autonomie, et tous les thèmes du projet. Tu parles de manière claire, accessible et pratique. Le créateur du projet est un soudeur autodidacte - tu adaptes ton langage à tous les niveaux.

## Instructions importantes
- Réponds de manière CONCISE car tes réponses seront lues à voix haute
- Maximum 3-4 phrases sauf si on te demande plus de détails
- Utilise les outils disponibles pour les questions sur le projet
- Réponds toujours en français sauf si l'utilisateur parle une autre langue
- Sois pratique et inspirant

Ce projet tourne sur un Raspberry Pi - tu es l'assistant local et souverain de l'utilisateur."""

    # ── Boucle agent ──────────────────────────────────────────────────────

    def _appel_claude_agent(self, question):
        """
        Envoie la question à Claude et gère la boucle agent avec outils.
        Retourne la réponse textuelle finale.
        """
        if not self.client_anthropic:
            return "Le client Anthropic n'est pas initialisé. Vérifiez la clé API."

        # Ajoute la question à l'historique
        self.historique.append({'role': 'user', 'content': question})

        # Tronque si trop long
        if len(self.historique) > self.max_messages:
            self.historique = self.historique[-self.max_messages:]

        # Copie des messages pour l'API
        messages_api = [{'role': m['role'], 'content': m['content']}
                        for m in self.historique]

        outils = self._definir_outils()
        system_prompt = self._construire_system_prompt()

        iteration = 0
        max_iterations = 5

        while iteration < max_iterations:
            iteration += 1
            reflexion(f"Appel Claude (itération {iteration})...")

            try:
                reponse = self.client_anthropic.messages.create(
                    model=self.modele_ia,
                    max_tokens=1024,
                    system=system_prompt,
                    messages=messages_api,
                    tools=outils,
                    tool_choice={'type': 'auto'}
                )
            except anthropic.AuthenticationError:
                erreur("Clé API invalide ou expirée.")
                return "Erreur d'authentification. Vérifiez votre clé API Anthropic."
            except anthropic.RateLimitError:
                erreur("Limite de taux dépassée.")
                return "Trop de requêtes. Attendez quelques secondes et réessayez."
            except anthropic.APIError as e:
                erreur(f"Erreur API Anthropic : {e}")
                return f"Erreur de communication avec Claude : {str(e)}"

            stop_reason = reponse.stop_reason
            contenu = reponse.content

            # Réponse textuelle finale
            if stop_reason in ('end_turn', 'max_tokens'):
                texte = ' '.join(
                    bloc.text for bloc in contenu if hasattr(bloc, 'text')
                ).strip()
                if texte:
                    self.historique.append({'role': 'assistant', 'content': texte})
                return texte or "Je n'ai pas pu générer de réponse."

            # Utilisation d'outils
            if stop_reason == 'tool_use':
                # Ajoute la réponse assistant (avec appels d'outils) aux messages API
                messages_api.append({
                    'role': 'assistant',
                    'content': [
                        {
                            'type': bloc.type,
                            **({'text': bloc.text} if hasattr(bloc, 'text') else {}),
                            **({'id': bloc.id, 'name': bloc.name, 'input': bloc.input}
                               if hasattr(bloc, 'name') else {})
                        }
                        for bloc in contenu
                    ]
                })

                # Exécute les outils et ajoute les résultats
                resultats_outils = []
                for bloc in contenu:
                    if bloc.type == 'tool_use':
                        resultat = self._executer_outil(bloc.name, bloc.input)
                        resultats_outils.append({
                            'type': 'tool_result',
                            'tool_use_id': bloc.id,
                            'content': resultat
                        })

                messages_api.append({'role': 'user', 'content': resultats_outils})
                continue

            # Stop reason inattendu
            attention(f"stop_reason inattendu : {stop_reason}")
            break

        return "J'ai rencontré une difficulté. Pouvez-vous reformuler votre question ?"

    # ── Reconnaissance vocale ──────────────────────────────────────────────

    def _ecouter(self):
        """
        Écoute le microphone et retourne le texte transcrit.
        Retourne None en cas d'échec ou de silence.
        """
        if not self.recognizer or not self.microphone:
            erreur("Microphone ou recognizer non disponible.")
            return None

        ecoute("Écoute en cours... Parlez !")

        try:
            with self.microphone as source:
                # Écoute avec timeout
                audio = self.recognizer.listen(
                    source,
                    timeout=self.timeout_ecoute,
                    phrase_time_limit=self.duree_phrase
                )

            info("Transcription en cours...")

            # Essaie Google STT en français
            texte = self.recognizer.recognize_google(audio, language=self.langue_stt)
            succes(f"Transcrit : \"{texte}\"")
            return texte

        except sr.WaitTimeoutError:
            attention("Aucune parole détectée (timeout).")
            return None
        except sr.UnknownValueError:
            attention("Parole non reconnue. Réessayez en parlant plus distinctement.")
            return None
        except sr.RequestError as e:
            erreur(f"Erreur service STT : {e}")
            erreur("Vérifiez votre connexion internet (Google STT requis).")
            return None

    # ── Synthèse vocale ────────────────────────────────────────────────────

    def _parler(self, texte):
        """Synthétise le texte en parole."""
        if not texte:
            return

        parole(f"Réponse : {texte[:100]}{'...' if len(texte) > 100 else ''}")

        if not self.moteur_tts:
            attention("Aucun moteur TTS disponible. Réponse en console uniquement.")
            return

        moteur_type = self.moteur_tts['type']

        if moteur_type == 'pyttsx3':
            try:
                moteur = self.moteur_tts['moteur']
                moteur.say(texte)
                moteur.runAndWait()
            except Exception as e:
                erreur(f"Erreur pyttsx3 : {e}")
                # Fallback espeak-ng
                self._parler_espeak(texte)

        elif moteur_type == 'espeak-ng':
            self._parler_espeak(texte)

    def _parler_espeak(self, texte):
        """Utilise espeak-ng via subprocess comme TTS."""
        try:
            subprocess.run(
                ['espeak-ng', '-v', 'fr', '-s', '150', '-a', '200', texte],
                check=True,
                capture_output=True
            )
        except subprocess.CalledProcessError as e:
            erreur(f"Erreur espeak-ng : {e}")
        except FileNotFoundError:
            erreur("espeak-ng non trouvé. Installe : sudo apt-get install espeak-ng")

    # ── Boucle principale ──────────────────────────────────────────────────

    def demarrer(self):
        """Lance la boucle principale de l'assistant."""
        self._afficher_banniere()

        if not self.client_anthropic:
            erreur("Impossible de démarrer : client Anthropic manquant.")
            return

        # Message d'accueil prononcé
        message_accueil = ("Bonjour, je suis Souverain, votre assistant du Sanctuaire de Souveraineté. "
                          "Je suis prêt à répondre à vos questions sur la liberté et l'autonomie.")
        self._parler(message_accueil)

        info("Assistant démarré. Appuyez sur CTRL+C pour quitter.")
        print()

        while self.en_cours:
            try:
                # Écoute la question
                texte_utilisateur = self._ecouter()

                if not texte_utilisateur:
                    # Silence ou erreur STT - on réessaie
                    time.sleep(0.5)
                    continue

                # Commandes spéciales
                if texte_utilisateur.lower() in ['arrêt', 'stop', 'quitter', 'sortir', 'exit', 'quit']:
                    info("Commande d'arrêt reçue.")
                    self._parler("Au revoir ! Restez souverain.")
                    self.en_cours = False
                    break

                if texte_utilisateur.lower() in ['effacer', 'réinitialiser', 'recommencer']:
                    self.historique.clear()
                    self._parler("Conversation effacée. Je suis prêt pour une nouvelle discussion.")
                    continue

                # Appel à Claude en mode agent
                print()
                reponse = self._appel_claude_agent(texte_utilisateur)
                print()

                if reponse:
                    self._parler(reponse)
                    print()

            except KeyboardInterrupt:
                # Géré par le signal_arret
                break
            except Exception as e:
                erreur(f"Erreur inattendue dans la boucle principale : {e}")
                time.sleep(1)

        info("Assistant arrêté.")

    def _signal_arret(self, signum, frame):
        """Gestionnaire de signal pour arrêt propre."""
        print()
        info("Signal d'arrêt reçu. Fermeture propre...")
        self.en_cours = False
        # Libère les ressources TTS si pyttsx3
        if self.moteur_tts and self.moteur_tts['type'] == 'pyttsx3':
            try:
                self.moteur_tts['moteur'].stop()
            except Exception:
                pass
        sys.exit(0)

    def _afficher_banniere(self):
        """Affiche la bannière de démarrage."""
        print()
        print(f"{Couleurs.MAGENTA}{Couleurs.GRAS}{'═' * 60}")
        print(f"  🏛️  SOUVERAIN - Assistant Vocal du Sanctuaire")
        print(f"{'═' * 60}{Couleurs.RESET}")
        print(f"{Couleurs.CYAN}  Modèle IA  : {self.modele_ia}")
        print(f"  Langue STT : {self.langue_stt}")
        print(f"  Microphone : {'Prêt' if self.microphone else '⚠️ Non disponible'}")
        print(f"  TTS        : {self.moteur_tts['type'] if self.moteur_tts else '⚠️ Non disponible'}")
        kb_status = '✓ Chargée' if self.knowledge_base else '⚠️ Non disponible'
        print(f"  Base de connaissances : {kb_status}{Couleurs.RESET}")
        print(f"{Couleurs.MAGENTA}{'═' * 60}{Couleurs.RESET}")
        print()
        print(f"{Couleurs.JAUNE}  Commandes vocales spéciales :")
        print(f"  - 'Effacer' ou 'Réinitialiser' → Efface l'historique")
        print(f"  - 'Arrêt', 'Stop', 'Quitter' → Ferme l'assistant")
        print(f"  CTRL+C → Arrêt forcé{Couleurs.RESET}")
        print()


# ─── Point d'entrée ───────────────────────────────────────────────────────────

if __name__ == '__main__':
    # Vérification des dépendances critiques
    if not ANTHROPIC_DISPO:
        print("ERREUR CRITIQUE : Le SDK Anthropic est requis.")
        print("Installe avec : pip3 install anthropic")
        sys.exit(1)

    if not SPEECH_RECOGNITION_DISPO:
        print("ERREUR CRITIQUE : SpeechRecognition est requis.")
        print("Installe avec : pip3 install SpeechRecognition pyaudio")
        sys.exit(1)

    # Vérification de la clé API
    if not os.environ.get('ANTHROPIC_API_KEY'):
        print()
        print("⚠️  CONFIGURATION REQUISE :")
        print("   Définissez votre clé API Anthropic :")
        print("   export ANTHROPIC_API_KEY='sk-ant-api03-votre-cle'")
        print()
        sys.exit(1)

    # Démarrage de l'assistant
    assistant = RaspberryPiAssistant()
    assistant.demarrer()
