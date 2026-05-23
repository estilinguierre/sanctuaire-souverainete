/**
 * sanctuaire_assistant.ino
 * Firmware Arduino pour ESP32 - Assistant Vocal Souverain (WebSocket)
 * Sanctuaire de Souveraineté
 *
 * Architecture : WebSocket bidirectionnel vers Raspberry Pi
 * Protocole :
 *   ESP32 → "ping"            : au moment de la connexion (keepalive)
 *   ESP32 → "pause"           : début d'enregistrement (bouton pressé)
 *   ESP32 → binaire PCM16     : chunks audio 1024 samples pendant l'enreg.
 *   ESP32 → "stop"            : fin d'enregistrement (bouton relâché)
 *   Pi    → "pong"            : réponse au ping (keepalive)
 *   Pi    → binaire PCM8      : audio de réponse à jouer (8-bit unsigned, 16kHz)
 *
 * Matériel :
 *   - ESP32 DevKit (WROOM-32)
 *   - Microphone I2S INMP441  : SCK=14, WS=15, SD=32 (I2S_NUM_0)
 *   - DAC interne GPIO25       (DAC_CHANNEL_1)
 *   - Bouton sur GPIO26        (PULLDOWN - actif à l'état HAUT)
 *   - LED de statut GPIO2      (LED intégrée)
 *
 * Librairies requises (Arduino Library Manager) :
 *   - "arduinoWebSockets" par Markus Sattler (chercher "WebSockets" → WebSocketsClient)
 *
 * Flashage :
 *   Arduino IDE → Board: "ESP32 Dev Module" → Port: COMx ou /dev/ttyUSBx → Upload
 *
 * Basé sur le pattern de arpy8/ESP32_Voice_Assistant (MIT license)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <driver/i2s.h>
#include <driver/dac.h>
#include <WebSocketsClient.h>

// ════════════════════════════════════════════════════════════════════════
// CONFIGURATION - À MODIFIER SELON VOTRE INSTALLATION
// ════════════════════════════════════════════════════════════════════════

// Réseau WiFi
const char* WIFI_SSID     = "VotreReseauWiFi";       // Nom du réseau WiFi 2.4 GHz
const char* WIFI_PASSWORD = "VotreMotDePasseWiFi";   // Mot de passe WiFi

// Serveur WebSocket (adresse IP du Raspberry Pi)
// Trouvez l'IP du Pi avec : hostname -I  ou  ip addr
const char* WS_HOST = "192.168.1.100";   // IP du Raspberry Pi sur le réseau local
const int   WS_PORT = 8765;              // Port WebSocket du serveur Python
const char* WS_PATH = "/";              // Chemin WebSocket (racine)

// ────────────────────────────────────────────────────────────────────────
// BROCHES MATÉRIEL
// ────────────────────────────────────────────────────────────────────────

// LED de statut (LED intégrée sur la plupart des ESP32 DevKit)
#define PIN_LED         2

// Bouton d'activation (actif à l'état HAUT avec résistance PULLDOWN)
// Branchez : bouton entre GPIO26 et 3.3V
#define PIN_BOUTON      26

// Microphone I2S INMP441 (I2S_NUM_0)
// INMP441 : VDD=3.3V, GND=GND, L/R=GND (canal droit)
#define I2S_MIC_SCK     14   // Serial Clock (BCLK)
#define I2S_MIC_WS      15   // Word Select (LRCK)
#define I2S_MIC_SD      32   // Serial Data (DOUT du micro = entrée ESP32)

// DAC sortie audio sur GPIO25 (DAC_CHANNEL_1 interne à l'ESP32)
// Branchez directement un petit haut-parleur ou un ampli audio sur GPIO25
// Pas besoin de librairie I2S pour la lecture (DAC direct)

// ────────────────────────────────────────────────────────────────────────
// PARAMÈTRES AUDIO
// ────────────────────────────────────────────────────────────────────────

#define SAMPLE_RATE         16000    // Hz - standard pour STT/TTS (compatible Whisper)
#define DMA_BUF_COUNT       8        // Nombre de buffers DMA I2S
#define DMA_BUF_LEN         512      // Taille de chaque buffer DMA en samples
#define CHUNK_SAMPLES       1024     // Samples lus par chunk avant envoi WebSocket

// Délai entre samples pour la lecture DAC en mode direct (µs)
// 1 / 16000 Hz = 62.5 µs par sample
#define DAC_DELAY_US        62

// ════════════════════════════════════════════════════════════════════════
// MACHINE À ÉTATS
// ════════════════════════════════════════════════════════════════════════

typedef enum {
    ETAT_ATTENTE,        // En attente de l'appui bouton, WebSocket prêt
    ETAT_ENREGISTREMENT, // Bouton pressé, enregistrement et envoi de chunks audio
    ETAT_TRAITEMENT,     // "stop" envoyé, attente de la réponse audio du serveur
    ETAT_LECTURE         // Réception et lecture audio de la réponse via DAC
} EtatAssistant;

// État courant de l'assistant
EtatAssistant etatCourant = ETAT_ATTENTE;

// ════════════════════════════════════════════════════════════════════════
// VARIABLES GLOBALES
// ════════════════════════════════════════════════════════════════════════

// Client WebSocket (librairie arduinoWebSockets de Markus Sattler)
WebSocketsClient webSocket;

// Indicateur de connexion WebSocket active
bool wsConnecte       = false;

// Gestion du bouton avec anti-rebond logiciel
bool boutonPrecedent  = false;  // Dernier état lu du bouton
bool enregistrement   = false;  // Enregistrement actif (bouton pressé)
unsigned long dernierAppui = 0; // Timestamp dernier appui pour anti-rebond
#define DEBOUNCE_MS  50          // Durée anti-rebond en millisecondes

// Animation LED
unsigned long dernierClignot = 0;
bool ledEtat = false;

// Intervalles de reconnexion et keepalive
#define RECONNECT_INTERVALLE_MS  5000   // 5 secondes entre tentatives de reconnexion
#define PING_INTERVALLE_MS       20000  // Ping keepalive toutes les 20 secondes

// Timestamp du dernier ping envoyé
unsigned long dernierPing = 0;

// ════════════════════════════════════════════════════════════════════════
// PROTOTYPES DE FONCTIONS
// ════════════════════════════════════════════════════════════════════════

void setupWifi();
void setupI2SMicrophone();
void setupDACOutput();
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length);
void send_audio_chunk();
void playStartupTone();
void animerLED(EtatAssistant etat);
void afficherEtat(const char* msg);

// ════════════════════════════════════════════════════════════════════════
// SETUP - INITIALISATION DU SYSTÈME
// ════════════════════════════════════════════════════════════════════════

void setup() {
    // Initialisation du port série pour le débogage (115200 bauds)
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println("================================================");
    Serial.println("  Souverain - Firmware WebSocket ESP32 v2.0");
    Serial.println("  Sanctuaire de Souverainete");
    Serial.println("================================================");
    Serial.printf("  WiFi cible   : %s\n", WIFI_SSID);
    Serial.printf("  WebSocket    : ws://%s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
    Serial.println("================================================");

    // Configuration des broches matériel
    pinMode(PIN_LED,    OUTPUT);
    pinMode(PIN_BOUTON, INPUT_PULLDOWN); // Bouton actif HAUT, résistance vers GND intégrée
    digitalWrite(PIN_LED, LOW);          // LED éteinte par défaut

    // Étape 1 : Connexion WiFi (bloquante jusqu'à connexion ou redémarrage)
    setupWifi();

    // Étape 2 : Initialisation du microphone I2S (INMP441)
    setupI2SMicrophone();

    // Étape 3 : Initialisation du DAC audio (GPIO25)
    setupDACOutput();

    // Étape 4 : Ton de confirmation démarrage (prouve que le DAC fonctionne)
    playStartupTone();

    // Étape 5 : Configuration et démarrage du client WebSocket
    // La librairie arduinoWebSockets gère la reconnexion automatique
    webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(RECONNECT_INTERVALLE_MS);
    // Heartbeat WebSocket natif (niveau protocole) : ping toutes les 15s, timeout 3s, 2 essais
    webSocket.enableHeartbeat(15000, 3000, 2);

    Serial.println("[INFO] Initialisation complete. Appuyez sur le bouton (GPIO26) pour parler.");
    afficherEtat("ATTENTE");
}

// ════════════════════════════════════════════════════════════════════════
// LOOP - BOUCLE PRINCIPALE NON BLOQUANTE
// ════════════════════════════════════════════════════════════════════════

void loop() {
    // Traitement non bloquant des événements WebSocket
    // Cette fonction doit être appelée le plus souvent possible
    webSocket.loop();

    // Animation LED selon l'état courant de l'assistant
    animerLED(etatCourant);

    // ── Lecture et gestion du bouton avec anti-rebond ─────────────────────
    unsigned long maintenant = millis();
    bool boutonLu = (digitalRead(PIN_BOUTON) == HIGH);

    // Anti-rebond : on ne prend en compte un changement d'état que si
    // DEBOUNCE_MS millisecondes se sont écoulées depuis le dernier changement
    if (boutonLu != boutonPrecedent && (maintenant - dernierAppui) > DEBOUNCE_MS) {
        dernierAppui = maintenant;

        if (boutonLu) {
            // ── Front montant : bouton pressé ─────────────────────────────
            if (wsConnecte && etatCourant == ETAT_ATTENTE) {
                Serial.println("[BOUTON] Presse - Debut enregistrement");
                enregistrement = true;
                etatCourant    = ETAT_ENREGISTREMENT;
                afficherEtat("ENREGISTREMENT");

                // Signale au serveur le début d'un enregistrement
                // Le serveur va réinitialiser son buffer audio à la réception de "pause"
                webSocket.sendTXT("pause");
            } else if (!wsConnecte) {
                Serial.println("[BOUTON] Presse mais WebSocket non connecte - attente reconnexion");
            }
        } else {
            // ── Front descendant : bouton relâché ─────────────────────────
            if (enregistrement) {
                Serial.println("[BOUTON] Relache - Fin enregistrement");
                enregistrement = false;
                etatCourant    = ETAT_TRAITEMENT;
                afficherEtat("TRAITEMENT - Attente reponse serveur");

                // Signale au serveur la fin de l'audio
                // Le serveur va lancer le pipeline : STT → Claude → TTS → envoi audio
                webSocket.sendTXT("stop");
            }
        }
        boutonPrecedent = boutonLu;
    }

    // ── Envoi de chunks audio pendant l'enregistrement ───────────────────
    // Appelé en continu tant que le bouton est pressé et WS connecté
    if (enregistrement && wsConnecte) {
        send_audio_chunk();
    }

    // ── Keepalive manuel applicatif (complément au heartbeat WS) ─────────
    // Envoie "ping" au niveau applicatif pour maintenir la session côté serveur
    if (wsConnecte && !enregistrement) {
        if (maintenant - dernierPing > PING_INTERVALLE_MS) {
            dernierPing = maintenant;
            webSocket.sendTXT("ping");
            Serial.println("[WS] Keepalive ping envoye");
        }
    }
}

// ════════════════════════════════════════════════════════════════════════
// CONNEXION WIFI
// ════════════════════════════════════════════════════════════════════════

/**
 * Connexion WiFi avec retry automatique et clignotement LED.
 * Si la connexion échoue après 30 tentatives (~15 secondes),
 * l'ESP32 redémarre automatiquement pour relancer la procédure.
 *
 * Note : l'ESP32 ne supporte que le WiFi 2.4 GHz (pas 5 GHz).
 */
void setupWifi() {
    if (WiFi.status() == WL_CONNECTED) return;

    Serial.printf("[WIFI] Connexion au reseau '%s'...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int tentatives = 0;
    while (WiFi.status() != WL_CONNECTED && tentatives < 30) {
        // Clignotement LED pendant la tentative de connexion
        digitalWrite(PIN_LED, !digitalRead(PIN_LED));
        delay(500);
        Serial.print(".");
        tentatives++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("[WIFI] Connecte ! Adresse IP : %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("[WIFI] Intensite signal RSSI : %d dBm\n", WiFi.RSSI());
        Serial.printf("[WIFI] Canal : %d\n", WiFi.channel());

        // 3 clignotements rapides pour confirmer la connexion WiFi
        digitalWrite(PIN_LED, LOW);
        for (int i = 0; i < 3; i++) {
            digitalWrite(PIN_LED, HIGH); delay(100);
            digitalWrite(PIN_LED, LOW);  delay(100);
        }
    } else {
        Serial.println("[WIFI] Echec de connexion apres 30 tentatives !");
        Serial.println("[WIFI] Verifiez WIFI_SSID et WIFI_PASSWORD dans le code.");
        Serial.println("[WIFI] Redemarrage dans 3 secondes...");
        // Clignotement d'erreur rapide
        for (int i = 0; i < 6; i++) {
            digitalWrite(PIN_LED, HIGH); delay(100);
            digitalWrite(PIN_LED, LOW);  delay(100);
        }
        delay(3000);
        ESP.restart();
    }
}

// ════════════════════════════════════════════════════════════════════════
// I2S MICROPHONE INMP441
// ════════════════════════════════════════════════════════════════════════

/**
 * Initialise le port I2S 0 pour le microphone numérique INMP441.
 *
 * Configuration spécifique INMP441 :
 *  - Le micro envoie 32 bits par sample (format standard I2S 32 bits)
 *  - Les données utiles sont dans les bits 31 à 8 (MSB justifié)
 *  - On décale de >>16 pour obtenir un int16_t utilisable
 *  - Canal DROIT uniquement (broche L/R du micro reliée à GND → canal droit)
 *
 * Cette configuration est celle du projet arpy8/ESP32_Voice_Assistant.
 */
void setupI2SMicrophone() {
    // Configuration du pilote I2S pour la réception (microphone)
    i2s_config_t config_micro = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = SAMPLE_RATE,                    // 16000 Hz
        .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT,     // INMP441 : 32 bits
        .channel_format       = I2S_CHANNEL_FMT_ONLY_RIGHT,    // Mono canal droit
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,     // Format I2S standard
        .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,           // Niveau priorité interruption
        .dma_buf_count        = DMA_BUF_COUNT,                  // 8 buffers DMA
        .dma_buf_len          = DMA_BUF_LEN,                    // 512 samples par buffer
        .use_apll             = false,                          // Pas de PLL audio
        .tx_desc_auto_clear   = false,
        .fixed_mclk           = 0
    };

    // Configuration des broches I2S pour le microphone
    i2s_pin_config_t pins_micro = {
        .bck_io_num   = I2S_MIC_SCK,        // Broche horloge série (GPIO14)
        .ws_io_num    = I2S_MIC_WS,         // Broche sélection canal (GPIO15)
        .data_out_num = I2S_PIN_NO_CHANGE,   // Pas de sortie sur ce bus
        .data_in_num  = I2S_MIC_SD          // Entrée données micro (GPIO32)
    };

    // Installation du pilote I2S
    esp_err_t err = i2s_driver_install(I2S_NUM_0, &config_micro, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("[ERREUR I2S] Installation pilote microphone : code %d\n", err);
        Serial.println("[ERREUR I2S] Verifiez le cablage INMP441 (SCK=14, WS=15, SD=32)");
        return;
    }

    // Application de la configuration des broches
    err = i2s_set_pin(I2S_NUM_0, &pins_micro);
    if (err != ESP_OK) {
        Serial.printf("[ERREUR I2S] Configuration des broches : code %d\n", err);
        return;
    }

    // Efface les buffers DMA pour éviter le bruit initial
    i2s_zero_dma_buffer(I2S_NUM_0);

    Serial.printf("[I2S] Microphone INMP441 initialise (SCK=GPIO%d, WS=GPIO%d, SD=GPIO%d)\n",
                  I2S_MIC_SCK, I2S_MIC_WS, I2S_MIC_SD);
    Serial.printf("[I2S] Taux : %d Hz, Bits : 32 (→ 16 apres shift), Buffers : %d x %d\n",
                  SAMPLE_RATE, DMA_BUF_COUNT, DMA_BUF_LEN);
}

// ════════════════════════════════════════════════════════════════════════
// DAC SORTIE AUDIO
// ════════════════════════════════════════════════════════════════════════

/**
 * Active le DAC interne sur GPIO25 (DAC_CHANNEL_1).
 *
 * Le DAC interne de l'ESP32 est un convertisseur 8 bits (256 niveaux, 0 à 255).
 * Résolution : 3.3V / 256 ≈ 13 mV par pas.
 * Valeur de silence : 128 (point médian, 1.65V).
 *
 * Pour un rendu audio correct, il est recommandé de connecter :
 *   GPIO25 → condensateur 10µF → haut-parleur → GND
 * Le condensateur coupe la composante DC (1.65V) pour n'avoir que le son.
 *
 * Fréquence d'échantillonnage en lecture : 16kHz simulée par delayMicroseconds(62).
 */
void setupDACOutput() {
    // Active le canal DAC 1 (GPIO25)
    dac_output_enable(DAC_CHANNEL_1);

    // Valeur initiale : silence (point médian de la plage 0-255)
    dac_output_voltage(DAC_CHANNEL_1, 128);

    Serial.println("[DAC] Sortie audio GPIO25 (DAC_CHANNEL_1) activee");
    Serial.println("[DAC] Conseil : branchez GPIO25 via condensateur 10uF au haut-parleur");
}

// ════════════════════════════════════════════════════════════════════════
// ENVOI CHUNK AUDIO VIA WEBSOCKET
// ════════════════════════════════════════════════════════════════════════

/**
 * Lit 1024 samples 32 bits depuis le microphone I2S INMP441,
 * les convertit en 16 bits (décalage >>16), puis les envoie
 * en binaire via WebSocket.
 *
 * Format envoyé : PCM16 mono little-endian, 16kHz
 * Taille d'un chunk : 1024 × 2 octets = 2048 octets
 * Durée d'un chunk  : 1024 / 16000 = 64 ms d'audio
 *
 * Cette fonction doit être appelée en boucle pendant l'enregistrement.
 * Elle est non bloquante : timeout court de 10ms sur la lecture I2S.
 */
void send_audio_chunk() {
    // Buffer 32 bits pour lecture I2S brute (INMP441 produit 32 bits)
    int32_t samplesIn[CHUNK_SAMPLES];
    size_t  bytesLus = 0;

    // Lecture depuis I2S avec timeout court (non bloquant à 10ms max)
    esp_err_t err = i2s_read(I2S_NUM_0,
                              samplesIn,
                              sizeof(samplesIn),
                              &bytesLus,
                              pdMS_TO_TICKS(10));

    if (err != ESP_OK || bytesLus == 0) {
        // Pas de données disponibles dans le timeout, on passe
        return;
    }

    // Nombre de samples effectivement lus
    size_t nbSamples = bytesLus / sizeof(int32_t);

    // Conversion 32 bits → 16 bits
    // L'INMP441 place les données utiles dans les bits 31-8 (MSB justifié)
    // Le décalage de 16 bits vers la droite (>>16) extrait les 16 bits utiles
    // Exemple : 0x0A280000 >> 16 = 0x0A28 (valeur positive)
    int16_t samplesOut[CHUNK_SAMPLES];
    for (size_t i = 0; i < nbSamples; i++) {
        samplesOut[i] = (int16_t)(samplesIn[i] >> 16);
    }

    // Envoi binaire via WebSocket
    // Le serveur Python recevra ces données comme bytes bruts PCM16
    webSocket.sendBIN((uint8_t*)samplesOut, nbSamples * sizeof(int16_t));
}

// ════════════════════════════════════════════════════════════════════════
// GESTIONNAIRE D'ÉVÉNEMENTS WEBSOCKET
// ════════════════════════════════════════════════════════════════════════

/**
 * Callback WebSocket appelé automatiquement par la librairie arduinoWebSockets
 * pour chaque événement réseau.
 *
 * Événements gérés :
 *   WStype_CONNECTED    : Connexion établie → envoi "ping" pour signaler présence
 *   WStype_DISCONNECTED : Déconnexion → remise à zéro état, reconnexion auto
 *   WStype_BIN          : Audio reçu (PCM8 unsigned) → lecture via DAC interne
 *   WStype_TEXT         : Messages texte → gestion pong, statuts serveur, erreurs
 *   WStype_PING         : Ping niveau protocole WS reçu (log)
 *   WStype_PONG         : Pong niveau protocole WS reçu (log)
 *   WStype_ERROR        : Erreur réseau (log)
 */
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {

        // ── Connexion WebSocket établie ───────────────────────────────────
        case WStype_CONNECTED:
            wsConnecte = true;
            Serial.printf("[WS] Connecte a ws://%s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
            afficherEtat("WEBSOCKET CONNECTE");

            // Envoi du ping applicatif initial pour signaler notre présence
            // Le serveur Python répond par "pong" pour confirmer la session
            webSocket.sendTXT("ping");

            // Remise à zéro de l'état de l'assistant
            etatCourant    = ETAT_ATTENTE;
            enregistrement = false;

            // Reset du timer keepalive
            dernierPing = millis();
            break;

        // ── Déconnexion WebSocket ─────────────────────────────────────────
        case WStype_DISCONNECTED:
            wsConnecte = false;
            Serial.println("[WS] Deconnecte du serveur.");
            Serial.printf("[WS] Reconnexion automatique dans %d secondes...\n",
                          RECONNECT_INTERVALLE_MS / 1000);
            afficherEtat("DECONNECTE - Reconnexion auto");

            // Remise à zéro de l'état en cas de déconnexion pendant l'enregistrement
            etatCourant    = ETAT_ATTENTE;
            enregistrement = false;
            break;

        // ── Réception données binaires = audio de réponse du serveur ─────
        case WStype_BIN: {
            Serial.printf("[WS] Audio recu : %zu octets (PCM8 unsigned, 16kHz)\n", length);

            // Changement d'état vers la lecture audio
            etatCourant = ETAT_LECTURE;
            afficherEtat("LECTURE AUDIO REPONSE");

            // Lecture du flux audio via le DAC interne
            // Le serveur Python envoie du PCM 8 bits unsigned (0-255) à 16kHz
            // Chaque octet est directement une valeur DAC
            for (size_t i = 0; i < length; i++) {
                // payload[i] est un uint8_t entre 0 et 255
                // 128 = silence, 0 = minimum, 255 = maximum
                dac_output_voltage(DAC_CHANNEL_1, payload[i]);

                // Délai pour maintenir la fréquence d'échantillonnage à ~16kHz
                // 1/16000 = 62.5 µs entre chaque sample
                delayMicroseconds(DAC_DELAY_US);
            }

            // Remise au silence après lecture terminée
            dac_output_voltage(DAC_CHANNEL_1, 128);

            Serial.printf("[WS] Lecture audio terminee (%zu echantillons, %.1f secondes)\n",
                          length, (float)length / SAMPLE_RATE);

            // Retour à l'état d'attente pour une nouvelle interaction
            etatCourant = ETAT_ATTENTE;
            afficherEtat("ATTENTE");
            break;
        }

        // ── Réception message texte du serveur ────────────────────────────
        case WStype_TEXT: {
            // Conversion du payload en String pour faciliter la comparaison
            String msg = String((char*)payload);
            Serial.printf("[WS] Message texte recu : '%s'\n", msg.c_str());

            if (msg == "pong") {
                // Réponse au ping keepalive applicatif - connexion vivante
                Serial.println("[WS] Keepalive pong recu - connexion active");

            } else if (msg == "ready") {
                // Le serveur indique qu'il est prêt à recevoir de l'audio
                Serial.println("[WS] Serveur pret - en attente d'enregistrement");
                etatCourant = ETAT_ATTENTE;

            } else if (msg.startsWith("processing")) {
                // Le serveur traite le pipeline STT/LLM/TTS
                Serial.println("[WS] Serveur en cours de traitement...");
                etatCourant = ETAT_TRAITEMENT;
                afficherEtat("TRAITEMENT EN COURS");

            } else if (msg.startsWith("transcribed:")) {
                // Le serveur a transcrit l'audio et envoie le texte (informatif)
                Serial.printf("[WS] Transcription : %s\n", msg.c_str() + 12);

            } else if (msg.startsWith("error:")) {
                // Erreur côté serveur (STT ou LLM échoué)
                Serial.printf("[WS] ERREUR SERVEUR : %s\n", msg.c_str() + 6);
                etatCourant = ETAT_ATTENTE;
                afficherEtat("ATTENTE (apres erreur)");

            } else {
                // Message informatif générique non reconnu
                Serial.printf("[WS] Message serveur : %s\n", msg.c_str());
            }
            break;
        }

        // ── Erreur WebSocket ──────────────────────────────────────────────
        case WStype_ERROR:
            Serial.printf("[WS] Erreur WebSocket (length=%zu)\n", length);
            break;

        // ── Ping/Pong au niveau protocole WebSocket (RFC 6455) ────────────
        case WStype_PING:
            // La librairie répond automatiquement au ping avec un pong
            Serial.println("[WS] Ping protocole recu (reponse auto)");
            break;

        case WStype_PONG:
            Serial.println("[WS] Pong protocole recu");
            break;

        default:
            // Type d'événement inconnu, ignoré
            break;
    }
}

// ════════════════════════════════════════════════════════════════════════
// TON DE DÉMARRAGE
// ════════════════════════════════════════════════════════════════════════

/**
 * Joue un ton de confirmation au démarrage via le DAC interne.
 *
 * Génère deux tonalités successives :
 *   - 440 Hz (La) pendant 150ms : signal de démarrage
 *   - 880 Hz (La octave supérieure) pendant 100ms : confirmation prêt
 *
 * Ce son confirme que le DAC est fonctionnel et que le firmware
 * a correctement initialisé tous les composants.
 *
 * Durée totale : environ 300ms (bloquant, acceptable au démarrage).
 */
void playStartupTone() {
    Serial.println("[DAC] Lecture du ton de demarrage...");

    // Première tonalité : 440 Hz (La standard)
    const float freq1     = 440.0f;
    const int   duree1Ms  = 150;
    const int   nb1       = (SAMPLE_RATE * duree1Ms) / 1000;  // 2400 samples

    for (int i = 0; i < nb1; i++) {
        float phase    = 2.0f * PI * freq1 * i / (float)SAMPLE_RATE;
        uint8_t sample = (uint8_t)(128 + 40 * sinf(phase));  // Amplitude 40/128
        dac_output_voltage(DAC_CHANNEL_1, sample);
        delayMicroseconds(DAC_DELAY_US);
    }

    // Pause brève entre les deux tonalités
    dac_output_voltage(DAC_CHANNEL_1, 128);
    delay(30);

    // Deuxième tonalité : 880 Hz (La une octave au-dessus)
    const float freq2     = 880.0f;
    const int   duree2Ms  = 100;
    const int   nb2       = (SAMPLE_RATE * duree2Ms) / 1000;  // 1600 samples

    for (int i = 0; i < nb2; i++) {
        float phase    = 2.0f * PI * freq2 * i / (float)SAMPLE_RATE;
        uint8_t sample = (uint8_t)(128 + 40 * sinf(phase));
        dac_output_voltage(DAC_CHANNEL_1, sample);
        delayMicroseconds(DAC_DELAY_US);
    }

    // Remise au silence après les tonalités
    dac_output_voltage(DAC_CHANNEL_1, 128);
    Serial.println("[DAC] Ton de demarrage termine");
}

// ════════════════════════════════════════════════════════════════════════
// ANIMATION LED SELON L'ÉTAT
// ════════════════════════════════════════════════════════════════════════

/**
 * Anime la LED GPIO2 de manière non bloquante selon l'état courant.
 *
 * Pattern visuels :
 *   ETAT_ATTENTE        → Éteinte      (aucune activité)
 *   ETAT_ENREGISTREMENT → Clignotement rapide 200ms  (microphone actif)
 *   ETAT_TRAITEMENT     → Clignotement lent  500ms   (calcul en cours)
 *   ETAT_LECTURE        → Fixe allumée               (lecture audio)
 *
 * Cette fonction utilise millis() pour les délais afin de ne pas bloquer
 * la boucle principale et permettre au WebSocket de continuer à fonctionner.
 */
void animerLED(EtatAssistant etat) {
    unsigned long maintenant = millis();

    switch (etat) {
        case ETAT_ATTENTE:
            // Éteinte en attente d'interaction
            digitalWrite(PIN_LED, LOW);
            ledEtat = false;
            break;

        case ETAT_ENREGISTREMENT:
            // Clignotement rapide : période 200ms (ON 100ms / OFF 100ms)
            // Signale visuellement que le microphone est actif
            if (maintenant - dernierClignot >= 200) {
                ledEtat = !ledEtat;
                digitalWrite(PIN_LED, ledEtat ? HIGH : LOW);
                dernierClignot = maintenant;
            }
            break;

        case ETAT_TRAITEMENT:
            // Clignotement lent : période 500ms (ON 250ms / OFF 250ms)
            // Signale que le traitement est en cours sur le serveur
            if (maintenant - dernierClignot >= 500) {
                ledEtat = !ledEtat;
                digitalWrite(PIN_LED, ledEtat ? HIGH : LOW);
                dernierClignot = maintenant;
            }
            break;

        case ETAT_LECTURE:
            // Allumée fixe pendant la lecture de la réponse audio
            digitalWrite(PIN_LED, HIGH);
            ledEtat = true;
            break;
    }
}

// ════════════════════════════════════════════════════════════════════════
// UTILITAIRE - AFFICHAGE ÉTAT DANS LA CONSOLE SÉRIE
// ════════════════════════════════════════════════════════════════════════

/**
 * Affiche un message d'état bien formaté dans la console série.
 * Utile pour le débogage via le moniteur série Arduino (115200 bauds).
 *
 * @param msg  Message à afficher entre les séparateurs
 */
void afficherEtat(const char* msg) {
    Serial.printf("[ETAT] ======== %s ========\n", msg);
}
