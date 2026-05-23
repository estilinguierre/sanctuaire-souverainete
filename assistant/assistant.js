/**
 * assistant.js - Assistant vocal "Souverain" du Sanctuaire de Souveraineté
 *
 * Architecture :
 *  - Chargement de la base de connaissances (knowledge-base.json)
 *  - Reconnaissance vocale via Web Speech API (SpeechRecognition)
 *  - Synthèse vocale via Web Speech API (SpeechSynthesis)
 *  - Appel à l'API Anthropic Claude avec boucle agent et outils
 *  - Gestion de l'historique de conversation (max 20 messages)
 *  - Interface utilisateur réactive avec animations d'état
 */

'use strict';

class SanctuaireAssistant {
  constructor() {
    // ── Configuration ──────────────────────────────────────────────────
    this.modeleIA = 'claude-sonnet-4-6';
    this.apiUrl   = 'https://api.anthropic.com/v1/messages';
    this.maxMessages = 20; // messages max dans l'historique
    this.langueParDefaut = 'fr-FR';

    // ── État interne ────────────────────────────────────────────────────
    this.apiKey       = '';
    this.knowledgeBase = null;
    this.historique   = [];           // [{role, content}]
    this.enEcoute     = false;
    this.enTraitement = false;
    this.enSynthese   = false;
    this.langue       = this.langueParDefaut;
    this.recognition  = null;
    this.synthesis    = window.speechSynthesis;
    this.voixSelectionnee = null;

    // ── Référence aux éléments du DOM ───────────────────────────────────
    this.el = {
      conteneurMicro    : document.getElementById('conteneur-micro'),
      boutonMicro       : document.getElementById('bouton-micro'),
      microIcone        : document.getElementById('micro-icone'),
      microLabel        : document.getElementById('micro-label'),
      indicateurStatut  : document.getElementById('indicateur-statut'),
      statutIcone       : document.getElementById('statut-icone'),
      statutTexte       : document.getElementById('statut-texte'),
      visualiseurSon    : document.getElementById('visualiseur-son'),
      messagesList      : document.getElementById('messages-liste'),
      messageVide       : document.getElementById('message-vide'),
      compteurMessages  : document.getElementById('compteur-messages'),
      zoneTranscription : document.getElementById('zone-transcription'),
      texteTranscrit    : document.getElementById('texte-transcrit'),
      inputApiKey       : document.getElementById('input-api-key'),
      sectionApi        : document.getElementById('section-api'),
      pointApi          : document.getElementById('point-api'),
      apiMessage        : document.getElementById('api-message'),
      selecteurLangue   : document.getElementById('selecteur-langue'),
    };

    // ── Initialisation ──────────────────────────────────────────────────
    this._chargerApiKey();
    this._chargerKnowledgeBase();
    this._initReconnaissanceVocale();
    this._chargerVoix();
  }

  // ════════════════════════════════════════════════════════════════════════
  // GESTION CLÉ API
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Charge la clé API depuis localStorage au démarrage.
   */
  _chargerApiKey() {
    const cle = localStorage.getItem('sanctuaire_api_key');
    if (cle) {
      this.apiKey = cle;
      this.el.inputApiKey.value = cle;
      this._afficherStatutApi(true, 'Clé API chargée depuis la mémoire du navigateur.');
    }
  }

  /**
   * Sauvegarde la clé API saisie dans localStorage.
   */
  sauvegarderApiKey() {
    const cle = this.el.inputApiKey.value.trim();
    if (!cle) {
      this._afficherStatutApi(false, 'Veuillez entrer une clé API valide.');
      return;
    }
    if (!cle.startsWith('sk-ant-')) {
      this._afficherStatutApi(false, 'Format invalide. La clé doit commencer par sk-ant-');
      return;
    }
    this.apiKey = cle;
    localStorage.setItem('sanctuaire_api_key', cle);
    this._afficherStatutApi(true, 'Clé API enregistrée avec succès !');
    this._afficherToast('Clé API sauvegardée.', 'succes');
  }

  /**
   * Affiche le statut de la clé API dans l'interface.
   */
  _afficherStatutApi(ok, message) {
    const point = this.el.pointApi;
    const msg   = this.el.apiMessage;
    const section = this.el.sectionApi;

    if (ok) {
      point.className = 'statut-point actif';
      section.classList.remove('api-erreur');
      section.classList.add('api-configuree');
      msg.className = 'api-message succes';
    } else {
      point.className = 'statut-point erreur';
      section.classList.remove('api-configuree');
      section.classList.add('api-erreur');
      msg.className = 'api-message erreur';
    }
    msg.textContent = message;
  }

  // ════════════════════════════════════════════════════════════════════════
  // CHARGEMENT BASE DE CONNAISSANCES
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Charge knowledge-base.json via fetch.
   * Le fichier est situé dans ../data/ par rapport à l'assistant.
   */
  async _chargerKnowledgeBase() {
    try {
      const reponse = await fetch('../data/knowledge-base.json');
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      this.knowledgeBase = await reponse.json();
      console.log('[Souverain] Base de connaissances chargée :', Object.keys(this.knowledgeBase));
    } catch (erreur) {
      console.error('[Souverain] Erreur chargement knowledge-base.json :', erreur);
      // On continue sans knowledge base, l'IA répondra de manière générale
      this.knowledgeBase = null;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // RECONNAISSANCE VOCALE (STT)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Initialise l'objet SpeechRecognition avec les bons paramètres.
   */
  _initReconnaissanceVocale() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[Souverain] Web Speech API non supportée dans ce navigateur.');
      this._afficherMessageSysteme('⚠️ La reconnaissance vocale n\'est pas supportée par votre navigateur. Chromium/Chrome recommandé.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous   = false;  // s'arrête après un silence
    this.recognition.interimResults = true;  // résultats intermédiaires en temps réel
    this.recognition.lang          = this.langue;
    this.recognition.maxAlternatives = 1;

    // Résultats de transcription
    this.recognition.onresult = (event) => {
      let transcritIntermediaire = '';
      let transcritFinal = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const resultat = event.results[i];
        if (resultat.isFinal) {
          transcritFinal += resultat[0].transcript;
        } else {
          transcritIntermediaire += resultat[0].transcript;
        }
      }

      // Affichage temps réel dans la zone de transcription
      const texteActuel = transcritFinal || transcritIntermediaire;
      this.el.texteTranscrit.textContent = texteActuel || '🎤 Écoute en cours...';

      // Si on a un résultat final, on le traite
      if (transcritFinal.trim()) {
        this._traiterTexteUtilisateur(transcritFinal.trim());
      }
    };

    // Fin de reconnaissance
    this.recognition.onend = () => {
      if (this.enEcoute && !this.enTraitement) {
        // Redémarrage si l'utilisateur a arrêté de parler mais qu'on est encore en mode écoute
        // (normalement on ne redémarre pas automatiquement pour économiser les crédits)
        this._desactiverEcoute();
      }
    };

    // Erreurs de reconnaissance
    this.recognition.onerror = (event) => {
      console.warn('[Souverain] Erreur reconnaissance vocale :', event.error);
      this._desactiverEcoute();

      const messagesErreur = {
        'not-allowed'     : 'Accès au microphone refusé. Veuillez autoriser l\'accès dans les paramètres du navigateur.',
        'no-speech'       : 'Aucune parole détectée. Réessayez.',
        'audio-capture'   : 'Impossible d\'accéder au microphone. Vérifiez qu\'il est bien connecté.',
        'network'         : 'Erreur réseau lors de la reconnaissance vocale.',
        'service-not-allowed' : 'Service de reconnaissance vocale non autorisé.',
        'aborted'         : 'Reconnaissance vocale interrompue.',
      };

      const msg = messagesErreur[event.error] || `Erreur : ${event.error}`;
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        this._afficherErreur(msg);
      }
    };

    // Début de reconnaissance
    this.recognition.onstart = () => {
      this.el.texteTranscrit.textContent = '🎤 Écoute en cours... Parlez maintenant.';
      this.el.zoneTranscription.classList.add('active');
    };
  }

  /**
   * Bascule l'état du microphone (actif/inactif).
   */
  basculerEcoute() {
    if (this.enTraitement) return; // Ignore si on traite déjà une réponse
    if (this.enSynthese) {
      // Arrête la synthèse vocale et reprend l'écoute
      this.synthesis.cancel();
      this.enSynthese = false;
    }

    if (this.enEcoute) {
      this._desactiverEcoute();
    } else {
      this._activerEcoute();
    }
  }

  /**
   * Active l'écoute microphone.
   */
  _activerEcoute() {
    if (!this.recognition) {
      this._afficherErreur('Reconnaissance vocale non disponible. Utilisez Chrome ou Edge.');
      return;
    }
    if (!this.apiKey) {
      this._afficherErreur('Veuillez d\'abord entrer votre clé API Anthropic.');
      this.el.inputApiKey.focus();
      return;
    }

    try {
      this.recognition.lang = this.langue;
      this.recognition.start();
      this.enEcoute = true;
      this._mettreAJourEtatUI('ecoute');
    } catch (e) {
      console.error('[Souverain] Erreur démarrage micro :', e);
      this._afficherErreur('Impossible de démarrer le microphone. Réessayez.');
    }
  }

  /**
   * Désactive l'écoute microphone.
   */
  _desactiverEcoute() {
    this.enEcoute = false;
    if (this.recognition) {
      try { this.recognition.abort(); } catch (e) {}
    }
    this.el.zoneTranscription.classList.remove('active');
    if (!this.enTraitement && !this.enSynthese) {
      this._mettreAJourEtatUI('attente');
      this.el.texteTranscrit.textContent = 'Appuyez sur le microphone pour commencer...';
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // SYNTHÈSE VOCALE (TTS)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Charge les voix disponibles dans le navigateur.
   */
  _chargerVoix() {
    const charger = () => {
      const voix = this.synthesis.getVoices();
      // Cherche une voix française en priorité
      this.voixSelectionnee = voix.find(v => v.lang.startsWith('fr') && v.localService)
        || voix.find(v => v.lang.startsWith('fr'))
        || voix[0];
      if (this.voixSelectionnee) {
        console.log('[Souverain] Voix sélectionnée :', this.voixSelectionnee.name, this.voixSelectionnee.lang);
      }
    };

    charger();
    if (this.synthesis.onvoiceschanged !== undefined) {
      this.synthesis.onvoiceschanged = charger;
    }
  }

  /**
   * Prononce un texte via la synthèse vocale.
   * @param {string} texte - Texte à prononcer
   * @returns {Promise} - Résolu quand la synthèse est terminée
   */
  _prononcer(texte) {
    return new Promise((resolve) => {
      if (!texte || !this.synthesis) {
        resolve();
        return;
      }

      // Nettoyage du texte (enlève les emojis pour la synthèse)
      const texteNettoye = texte
        .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
        .replace(/[🏛️🎤💬]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!texteNettoye) { resolve(); return; }

      this.synthesis.cancel(); // Arrête toute synthèse en cours

      const utterance = new SpeechSynthesisUtterance(texteNettoye);

      // Sélection de la voix selon la langue choisie
      const voixPourLangue = this.synthesis.getVoices().find(v =>
        v.lang.startsWith(this.langue.split('-')[0])
      );
      if (voixPourLangue) {
        utterance.voice = voixPourLangue;
      } else if (this.voixSelectionnee) {
        utterance.voice = this.voixSelectionnee;
      }

      utterance.lang  = this.langue;
      utterance.rate  = 0.95;  // légèrement plus lent pour la clarté
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      this.enSynthese = true;
      this._mettreAJourEtatUI('parle');

      utterance.onend = () => {
        this.enSynthese = false;
        this._mettreAJourEtatUI('attente');
        resolve();
      };

      utterance.onerror = (e) => {
        console.warn('[Souverain] Erreur synthèse vocale :', e);
        this.enSynthese = false;
        this._mettreAJourEtatUI('attente');
        resolve();
      };

      this.synthesis.speak(utterance);
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // OUTILS (TOOLS) POUR L'AGENT IA
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Définition des outils disponibles pour Claude.
   * Ces outils permettent à l'IA de chercher dans la knowledge base.
   */
  _definirOutils() {
    return [
      {
        name: 'search_knowledge',
        description: 'Recherche dans toute la base de connaissances du Sanctuaire de Souveraineté. Utiliser pour trouver des informations sur n\'importe quel sujet lié au projet.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Mot-clé ou phrase de recherche en français'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_principle',
        description: 'Récupère les détails complets d\'un principe spécifique de souveraineté.',
        input_schema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Identifiant du principe. Valeurs possibles : souverainete-personnelle, liberte-individuelle, responsabilite, autonomie, autodidaxie, technologie-service-humain, communaute, souverainete-numerique, souverainete-financiere, souverainete-intellectuelle'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'list_resources',
        description: 'Liste les ressources recommandées du projet (livres, pratiques concrètes, concepts).',
        input_schema: {
          type: 'object',
          properties: {
            categorie: {
              type: 'string',
              description: 'Catégorie de ressources. Valeurs : livres, pratiques, concepts, ou "tout" pour tout lister'
            }
          },
          required: ['categorie']
        }
      },
      {
        name: 'get_faq',
        description: 'Récupère les questions fréquemment posées sur la souveraineté et le projet.',
        input_schema: {
          type: 'object',
          properties: {
            question_id: {
              type: 'number',
              description: 'Numéro de la question (1 à 12), ou 0 pour toutes les questions'
            }
          },
          required: ['question_id']
        }
      }
    ];
  }

  /**
   * Exécute un outil demandé par Claude et retourne le résultat.
   * @param {string} nomOutil - Nom de l'outil
   * @param {Object} parametres - Paramètres de l'outil
   * @returns {string} - Résultat de l'outil en JSON
   */
  _executerOutil(nomOutil, parametres) {
    const kb = this.knowledgeBase;
    if (!kb) return JSON.stringify({ erreur: 'Base de connaissances non disponible.' });

    try {
      switch (nomOutil) {
        case 'search_knowledge': {
          const query = (parametres.query || '').toLowerCase();
          const resultats = [];

          // Recherche dans les principes
          (kb.principes || []).forEach(p => {
            const texte = `${p.titre} ${p.description} ${p.tags?.join(' ')}`.toLowerCase();
            if (texte.includes(query)) {
              resultats.push({
                type: 'principe',
                id: p.id,
                titre: p.titre,
                extrait: p.description.substring(0, 200) + '...'
              });
            }
          });

          // Recherche dans la FAQ
          (kb.faq || []).forEach(f => {
            const texte = `${f.question} ${f.reponse}`.toLowerCase();
            if (texte.includes(query)) {
              resultats.push({
                type: 'faq',
                id: f.id,
                question: f.question,
                extrait: f.reponse.substring(0, 200) + '...'
              });
            }
          });

          // Recherche dans le glossaire
          Object.entries(kb.glossaire || {}).forEach(([terme, definition]) => {
            if (terme.includes(query) || definition.toLowerCase().includes(query)) {
              resultats.push({
                type: 'glossaire',
                terme,
                definition: definition.substring(0, 200)
              });
            }
          });

          // Recherche dans les ressources
          (kb.ressources || []).forEach(section => {
            (section.items || []).forEach(item => {
              const texteItem = typeof item === 'string'
                ? item
                : `${item.titre || item.nom || ''} ${item.description || ''} ${item.themes?.join(' ') || ''}`;
              if (texteItem.toLowerCase().includes(query)) {
                resultats.push({
                  type: 'ressource',
                  categorie: section.categorie,
                  item: typeof item === 'string' ? item : (item.titre || item.nom)
                });
              }
            });
          });

          if (resultats.length === 0) {
            return JSON.stringify({ message: `Aucun résultat trouvé pour "${parametres.query}".` });
          }
          return JSON.stringify({ query: parametres.query, resultats: resultats.slice(0, 8) });
        }

        case 'get_principle': {
          const principe = (kb.principes || []).find(p => p.id === parametres.id);
          if (!principe) {
            return JSON.stringify({ erreur: `Principe "${parametres.id}" introuvable.` });
          }
          return JSON.stringify(principe);
        }

        case 'list_resources': {
          const cat = (parametres.categorie || 'tout').toLowerCase();
          if (cat === 'tout') {
            return JSON.stringify(kb.ressources);
          }
          const section = (kb.ressources || []).find(r =>
            r.id.toLowerCase() === cat || r.categorie.toLowerCase().includes(cat)
          );
          if (!section) {
            return JSON.stringify({
              disponible: (kb.ressources || []).map(r => r.id),
              message: `Catégorie "${cat}" non trouvée.`
            });
          }
          return JSON.stringify(section);
        }

        case 'get_faq': {
          const id = parseInt(parametres.question_id, 10);
          if (id === 0) {
            // Retourner toutes les questions (sans les réponses complètes pour économiser des tokens)
            return JSON.stringify({
              faq: (kb.faq || []).map(f => ({ id: f.id, question: f.question }))
            });
          }
          const faq = (kb.faq || []).find(f => f.id === id);
          if (!faq) {
            return JSON.stringify({ erreur: `Question ${id} introuvable. Il y a ${kb.faq?.length || 0} questions.` });
          }
          return JSON.stringify(faq);
        }

        default:
          return JSON.stringify({ erreur: `Outil inconnu : ${nomOutil}` });
      }
    } catch (e) {
      return JSON.stringify({ erreur: `Erreur exécution outil : ${e.message}` });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // SYSTEM PROMPT
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Construit le system prompt complet en incluant un résumé de la knowledge base.
   */
  _construireSystemPrompt() {
    const kb = this.knowledgeBase;
    let contexteKB = '';

    if (kb) {
      const principesTitres = (kb.principes || []).map(p => `- ${p.titre} (${p.id})`).join('\n');
      const outilsTitres    = (kb.outils || []).map(o => `- ${o.nom} : ${o.description?.substring(0, 80)}`).join('\n');

      contexteKB = `
## Contexte du Sanctuaire de Souveraineté

**Projet :** ${kb.projet?.nom}
**Mission :** ${kb.projet?.mission}
**Créateur :** ${kb.projet?.createur?.description}
**URL :** ${kb.projet?.url}

**Principes explorés dans ce projet :**
${principesTitres}

**Outils utilisés dans le projet :**
${outilsTitres}

**Philosophie :** ${kb.philosophie?.fondement}

Tu as accès à des outils pour rechercher des informations précises dans la base de connaissances complète du projet. Utilise-les pour répondre avec exactitude aux questions sur les principes, ressources, FAQ et définitions.
`;
    } else {
      contexteKB = `
## Contexte
Tu es l'assistant du Sanctuaire de Souveraineté, un projet dédié à la souveraineté personnelle, la liberté individuelle, l'autonomie et la responsabilité. Réponds en t'appuyant sur ces thèmes.
`;
    }

    return `Tu es **Souverain**, l'assistant vocal intelligent du Sanctuaire de Souveraineté.

${contexteKB}

## Ton rôle et ta personnalité

Tu es un guide éclairé, bienveillant et direct. Tu crois profondément en la capacité de chaque individu à prendre sa vie en main. Tu es :
- **Knowledgeable** : Tu maîtrises les thèmes de la souveraineté personnelle, liberté individuelle, autonomie, autodidaxie, souveraineté numérique, financière et intellectuelle
- **Accessible** : Tu parles de manière claire, sans jargon inutile. Le créateur du projet est un soudeur autodidacte - tu adaptes ton langage à tous
- **Pratique** : Tu donnes des conseils concrets et actionnables, pas seulement de la théorie
- **Honnête** : Tu ne prétends pas avoir des réponses que tu n'as pas
- **Inspirant** : Tu rappelles que la souveraineté est accessible à tous, quelle que soit la situation de départ

## Directives de réponse

1. **Pour les questions sur le projet :** Utilise les outils disponibles pour récupérer les informations exactes de la base de connaissances
2. **Pour les questions générales sur la souveraineté :** Réponds en t'appuyant sur les principes du projet
3. **Longueur des réponses :** Adapte-toi au contexte vocal - préfère des réponses concises (2-4 phrases) que l'utilisateur peut réécouter, sauf si une explication détaillée est clairement demandée
4. **Langue :** Réponds toujours dans la même langue que l'utilisateur
5. **Ton :** Chaleureux mais direct. Pas de formules vides. Chaque réponse apporte de la valeur
6. **Incitation à l'action :** Quand c'est pertinent, propose une action concrète que l'utilisateur peut faire maintenant

## Ce que tu n'es pas
- Tu n'es pas un conseiller financier, médical ou juridique au sens légal
- Tu n'es pas un promoteur de théories complotistes
- Tu n'es pas un outil politique partisan

Commence chaque conversation avec enthousiasme et rappelle que tu peux répondre à des questions vocales ou textuelles sur la souveraineté.`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // BOUCLE AGENT - APPEL À L'API CLAUDE
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Traite le texte de l'utilisateur : l'ajoute à l'historique,
   * appelle l'API Claude en boucle agent (gestion des tool_use),
   * et prononce la réponse finale.
   * @param {string} texteUtilisateur - Texte transcrit de l'utilisateur
   */
  async _traiterTexteUtilisateur(texteUtilisateur) {
    if (!texteUtilisateur.trim()) return;
    if (this.enTraitement) return;

    // Désactive l'écoute pendant le traitement
    this._desactiverEcoute();
    this.enTraitement = true;

    // Affiche le message utilisateur dans l'interface
    this._ajouterMessageUI('utilisateur', texteUtilisateur);

    // Ajoute à l'historique
    this.historique.push({ role: 'user', content: texteUtilisateur });

    // Tronque l'historique si trop long (max 20 messages)
    if (this.historique.length > this.maxMessages) {
      // Garde les 2 premiers (contexte) et les derniers
      this.historique = this.historique.slice(this.historique.length - this.maxMessages);
    }

    // Affiche l'indicateur "réflexion"
    this._mettreAJourEtatUI('reflexion');
    const idFrappe = this._afficherMessageFrappe();

    try {
      const reponseFinale = await this._bouclAgent();

      // Supprime l'indicateur de frappe
      this._supprimerMessageFrappe(idFrappe);

      // Affiche et prononce la réponse
      this._ajouterMessageUI('assistant', reponseFinale);
      this.historique.push({ role: 'assistant', content: reponseFinale });

      await this._prononcer(reponseFinale);

    } catch (erreur) {
      this._supprimerMessageFrappe(idFrappe);
      const msgErreur = this._gererErreurAPI(erreur);
      this._afficherErreur(msgErreur);
      this._mettreAJourEtatUI('attente');
    } finally {
      this.enTraitement = false;
    }
  }

  /**
   * Boucle agent principale : appelle Claude, gère les tool_use,
   * retourne le texte final de la réponse.
   * @returns {Promise<string>} - Réponse textuelle finale
   */
  async _bouclAgent() {
    // Préparation des messages pour l'API (format Anthropic)
    let messagesAPI = this._construireMessagesAPI();
    const systemPrompt = this._construireSystemPrompt();
    const outils = this._definirOutils();

    let iteration = 0;
    const maxIterations = 5; // Sécurité anti-boucle infinie

    while (iteration < maxIterations) {
      iteration++;

      // Appel à l'API Anthropic
      const reponseAPI = await this._appelAPI({
        model: this.modeleIA,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messagesAPI,
        tools: outils,
        tool_choice: { type: 'auto' }
      });

      const stopReason = reponseAPI.stop_reason;
      const contenuReponse = reponseAPI.content || [];

      // Si l'IA a terminé ou donne une réponse texte finale
      if (stopReason === 'end_turn' || stopReason === 'max_tokens') {
        // Extrait le texte de la réponse
        const texte = contenuReponse
          .filter(bloc => bloc.type === 'text')
          .map(bloc => bloc.text)
          .join(' ')
          .trim();
        return texte || "Je n'ai pas pu générer de réponse. Veuillez réessayer.";
      }

      // Si l'IA veut utiliser un outil (tool_use)
      if (stopReason === 'tool_use') {
        // Ajoute la réponse de l'assistant (avec les appels d'outils) à l'historique API
        messagesAPI.push({ role: 'assistant', content: contenuReponse });

        // Exécute tous les outils demandés et prépare les résultats
        const resultatsOutils = contenuReponse
          .filter(bloc => bloc.type === 'tool_use')
          .map(appelOutil => {
            console.log('[Souverain] Outil appelé :', appelOutil.name, appelOutil.input);
            const resultat = this._executerOutil(appelOutil.name, appelOutil.input);
            console.log('[Souverain] Résultat outil :', resultat.substring(0, 200));
            return {
              type: 'tool_result',
              tool_use_id: appelOutil.id,
              content: resultat
            };
          });

        // Ajoute les résultats des outils au fil de messages
        messagesAPI.push({ role: 'user', content: resultatsOutils });

        // Continue la boucle pour que Claude utilise les résultats
        continue;
      }

      // Cas inattendu : on sort de la boucle
      console.warn('[Souverain] stop_reason inattendu :', stopReason);
      break;
    }

    // Si on sort de la boucle sans réponse finale
    return "J'ai rencontré une difficulté à traiter votre demande. Veuillez reformuler votre question.";
  }

  /**
   * Construit le tableau de messages au format Anthropic API
   * à partir de l'historique interne.
   */
  _construireMessagesAPI() {
    // L'historique interne est [{role:'user'|'assistant', content:'...'}, ...]
    // On le retourne tel quel (l'API Anthropic accepte ce format simple)
    return this.historique.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * Effectue l'appel HTTP à l'API Anthropic.
   * @param {Object} corps - Corps de la requête
   * @returns {Promise<Object>} - Réponse JSON de l'API
   */
  async _appelAPI(corps) {
    if (!this.apiKey) {
      throw new Error('CLÉ_API_MANQUANTE');
    }

    const reponse = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'x-api-key'                            : this.apiKey,
        'anthropic-version'                    : '2023-06-01',
        'content-type'                         : 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(corps)
    });

    if (!reponse.ok) {
      const texteErreur = await reponse.text();
      let messageErreur;
      try {
        const jsonErreur = JSON.parse(texteErreur);
        messageErreur = jsonErreur.error?.message || texteErreur;
      } catch {
        messageErreur = texteErreur;
      }
      const erreur = new Error(messageErreur);
      erreur.status = reponse.status;
      throw erreur;
    }

    return reponse.json();
  }

  /**
   * Gère les erreurs de l'API et retourne un message lisible.
   */
  _gererErreurAPI(erreur) {
    console.error('[Souverain] Erreur API :', erreur);

    if (erreur.message === 'CLÉ_API_MANQUANTE') {
      return 'Veuillez d\'abord entrer votre clé API Anthropic en haut de la page.';
    }
    if (erreur.status === 401) {
      this._afficherStatutApi(false, 'Clé API invalide ou expirée.');
      return 'Clé API invalide. Vérifiez votre clé dans les paramètres.';
    }
    if (erreur.status === 429) {
      return 'Trop de requêtes. Attendez quelques secondes avant de réessayer.';
    }
    if (erreur.status === 500) {
      return 'Erreur serveur Anthropic. Réessayez dans un instant.';
    }
    if (!navigator.onLine) {
      return 'Pas de connexion internet. Vérifiez votre réseau.';
    }
    return `Erreur : ${erreur.message || 'Une erreur inattendue s\'est produite.'}`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // GESTION DE L'INTERFACE UTILISATEUR
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Met à jour tous les éléments visuels selon l'état courant.
   * @param {'attente'|'ecoute'|'reflexion'|'parle'} etat
   */
  _mettreAJourEtatUI(etat) {
    const conteneur    = this.el.conteneurMicro;
    const bouton       = this.el.boutonMicro;
    const icone        = this.el.microIcone;
    const label        = this.el.microLabel;
    const indicateur   = this.el.indicateurStatut;
    const statutIcone  = this.el.statutIcone;
    const statutTexte  = this.el.statutTexte;

    // Réinitialise les classes d'état
    conteneur.className   = 'bouton-micro-conteneur';
    indicateur.className  = 'indicateur-statut';

    switch (etat) {
      case 'ecoute':
        conteneur.classList.add('micro-actif');
        indicateur.classList.add('ecoute');
        icone.textContent  = '🔴';
        label.textContent  = 'Écoute...';
        statutIcone.textContent = '🎤';
        statutTexte.textContent = 'Écoute en cours...';
        bouton.setAttribute('aria-label', 'Arrêter l\'écoute');
        break;

      case 'reflexion':
        conteneur.classList.add('micro-reflexion');
        indicateur.classList.add('reflexion');
        icone.textContent  = '🤔';
        label.textContent  = 'Réflexion';
        statutIcone.textContent = '⚙️';
        statutTexte.textContent = 'Souverain réfléchit...';
        bouton.setAttribute('aria-label', 'Traitement en cours');
        this.el.texteTranscrit.textContent = 'Traitement de votre question...';
        break;

      case 'parle':
        conteneur.classList.add('micro-parle');
        indicateur.classList.add('parle');
        icone.textContent  = '🔊';
        label.textContent  = 'Parle';
        statutIcone.textContent = '🔊';
        statutTexte.textContent = 'Souverain répond...';
        bouton.setAttribute('aria-label', 'Interrompre la réponse vocale');
        this.el.zoneTranscription.classList.remove('active');
        this.el.texteTranscrit.textContent = 'Synthèse vocale en cours...';
        break;

      case 'attente':
      default:
        icone.textContent  = '🎤';
        label.textContent  = 'Parler';
        statutIcone.textContent = '💤';
        statutTexte.textContent = 'En attente';
        bouton.setAttribute('aria-label', 'Activer le microphone');
        this.el.zoneTranscription.classList.remove('active');
        this.el.texteTranscrit.textContent = 'Appuyez sur le microphone pour commencer...';
        break;
    }
  }

  /**
   * Ajoute une bulle de message dans la conversation.
   * @param {'utilisateur'|'assistant'} role
   * @param {string} texte
   */
  _ajouterMessageUI(role, texte) {
    // Supprime le message vide d'accueil
    if (this.el.messageVide) {
      this.el.messageVide.remove();
      this.el.messageVide = null;
    }

    const maintenant = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const avatar = role === 'utilisateur' ? '👤' : '🏛️';

    const divMessage = document.createElement('div');
    divMessage.className = `message ${role}`;
    divMessage.setAttribute('data-role', role);
    divMessage.innerHTML = `
      <div class="message-avatar" aria-hidden="true">${avatar}</div>
      <div class="message-corps">
        <div class="message-bulle">${this._echapperHTML(texte)}</div>
        <span class="message-heure" aria-label="Heure: ${maintenant}">${maintenant}</span>
      </div>
    `;

    this.el.messagesList.appendChild(divMessage);
    this._faireDefileVersLeBas();
    this._mettreAJourCompteur();
  }

  /**
   * Affiche un indicateur "en train d'écrire...".
   * @returns {string} - ID unique de l'élément
   */
  _afficherMessageFrappe() {
    const id = 'frappe-' + Date.now();
    const divFrappe = document.createElement('div');
    divFrappe.className = 'message assistant message-frappe';
    divFrappe.id = id;
    divFrappe.innerHTML = `
      <div class="message-avatar" aria-hidden="true">🏛️</div>
      <div class="message-corps">
        <div class="message-bulle">
          <div class="points-frappe" aria-label="Souverain est en train d'écrire">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    `;
    this.el.messagesList.appendChild(divFrappe);
    this._faireDefileVersLeBas();
    return id;
  }

  /**
   * Supprime l'indicateur de frappe.
   * @param {string} id
   */
  _supprimerMessageFrappe(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  /**
   * Affiche un message d'erreur dans la conversation.
   * @param {string} texte
   */
  _afficherErreur(texte) {
    const div = document.createElement('div');
    div.className = 'message-erreur';
    div.setAttribute('role', 'alert');
    div.innerHTML = `<span>⚠️</span><span>${this._echapperHTML(texte)}</span>`;
    this.el.messagesList.appendChild(div);
    this._faireDefileVersLeBas();
    this._mettreAJourEtatUI('attente');
  }

  /**
   * Affiche un message système (informationnel, centré).
   * @param {string} texte
   */
  _afficherMessageSysteme(texte) {
    const div = document.createElement('div');
    div.className = 'message-systeme';
    div.textContent = texte;
    this.el.messagesList.appendChild(div);
    this._faireDefileVersLeBas();
  }

  /**
   * Affiche une notification toast.
   * @param {string} texte
   * @param {'succes'|'erreur'|'info'} type
   */
  _afficherToast(texte, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = texte;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.5s';
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  /**
   * Fait défiler la liste de messages vers le bas.
   */
  _faireDefileVersLeBas() {
    requestAnimationFrame(() => {
      this.el.messagesList.scrollTop = this.el.messagesList.scrollHeight;
    });
  }

  /**
   * Met à jour le compteur de messages.
   */
  _mettreAJourCompteur() {
    const nb = this.el.messagesList.querySelectorAll('.message').length;
    this.el.compteurMessages.textContent = `${nb} message${nb > 1 ? 's' : ''}`;
  }

  /**
   * Échappe les caractères HTML dangereux.
   * @param {string} texte
   * @returns {string}
   */
  _echapperHTML(texte) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(texte));
    return div.innerHTML;
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACTIONS UTILISATEUR
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Change la langue de reconnaissance et synthèse vocale.
   * @param {string} codeLangue - Ex: 'fr-FR', 'en-US'
   */
  changerLangue(codeLangue) {
    this.langue = codeLangue;
    if (this.recognition) {
      this.recognition.lang = codeLangue;
    }
    // Recharge les voix pour la nouvelle langue
    this._chargerVoix();
    console.log('[Souverain] Langue changée :', codeLangue);
    this._afficherToast(`Langue changée : ${codeLangue}`, 'info');
  }

  /**
   * Efface toute la conversation et remet l'interface à zéro.
   */
  effacerConversation() {
    if (this.enTraitement || this.enSynthese) {
      this.synthesis.cancel();
      this.enSynthese = false;
      this.enTraitement = false;
    }
    this._desactiverEcoute();

    // Vide l'historique
    this.historique = [];

    // Remet le DOM de la conversation à zéro
    this.el.messagesList.innerHTML = `
      <div class="message-vide" id="message-vide">
        <span class="vide-icone">🏛️</span>
        <p>Conversation effacée. Je suis <strong>Souverain</strong>, prêt pour une nouvelle discussion.</p>
        <p style="margin-top:8px;font-size:0.8rem;">Appuyez sur le microphone pour commencer.</p>
      </div>
    `;
    this.el.messageVide = document.getElementById('message-vide');
    this.el.compteurMessages.textContent = '0 message';

    this._mettreAJourEtatUI('attente');
    this._afficherToast('Conversation effacée.', 'info');
  }
}
