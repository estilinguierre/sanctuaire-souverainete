/**
 * sanctuaire_assistant.ino
 * Firmware Arduino pour ESP32 - Assistant Vocal Souverain (WebSocket)
 * Sanctuaire de Souveraineté
 *
 * Architecture : WebSocket bidirectionnel vers Raspberry Pi
 * Protocole :
 *   ESP32 → "ping"            : au moment de la connexion
 *   ESP32 → "pause"           : début d'enregistrement (bouton pressé)
 *   ESP32 → binaire PCM16     : chunks audio 1024 samples pendant l'enreg.
 *   ESP32 → "stop"            : fin d'enregistrement (bouton relâché)
 *   Pi    → "pong"            : réponse au ping (keepalive)
 *   Pi    → binaire PCM8      : audio de réponse à jouer (8-bit, 16kHz)
 *
 * Matériel :
 *   - ESP32 DevKit (WROOM-32)
 *   - Microphone I2S INMP441  : SCK=14, WS=15, SD=32 (I2S_NUM_0)
 *   - DAC interne GPIO25       (DAC_CHANNEL_1)
 *   - Bouton sur GPIO26        (PULLDOWN - actif à l'état HAUT)
 *   - LED de statut GPIO2      (LED intégrée)
 *
 * Librairies requises (Arduino Library Manager) :
 *   - "arduinoWebSockets" par Markus Sattler (WebSocketsClient)
 *
 * Flashage :
 *   Arduino IDE → Board: "ESP32 Dev Module" → Port: COMx → Upload
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
const char* WIFI_SSID     = "VotreReseauWiFi";       // Nom du réseau WiFi
const char* WIFI_PASSWORD = "VotreMotDePasseWiFi";   // Mot de passe WiFi

// Serveur WebSocket (adresse IP du Raspberry Pi)
const char* WS_HOST = "192.168.1.100";   // IP du Raspberry Pi
const int   WS_PORT = 8765;              // Port WebSocket du serveur
const char* WS_PATH = "/";              // Chemin WebSocket

// ────────────────────────────────────────────────────────────────────────
// BROCHES MATÉRIEL
// ────────────────────────────────────────────────────────────────────────

// LED de statut (LED intégrée sur la plupart des ESP32 DevKit)
#define PIN_LED         2

// Bouton d'activation (actif à l'état HAUT avec PULLDOWN)
#define PIN_BOUTON      26

// Microphone I2S INMP441 (I2S_NUM_0)
#define I2S_MIC_SCK     14   // Serial Clock
#define I2S_MIC_WS      15   // Word Select (LRCK)
#define I2S_MIC_SD      32   // Serial Data (entrée)

// DAC sortie audio sur GPIO25 (DAC_CHANNEL_1 interne à l'ESP32)
// Pas besoin d'ampli externe : le DAC interne pilote directement un petit HP

// ────────────────────────────────────────────────────────────────────────
// PARAMÈTRES AUDIO
// ────────────────────────────────────────────────────────────────────────

#define SAMPLE_RATE         16000    // Hz - standard pour STT/TTS
#define DMA_BUF_COUNT       8        // Nombre de buffers DMA
#define DMA_BUF_LEN         512      // Échantillons par buffer DMA
#define CHUNK_SAMPLES       1024     // Samples lus par chunk avant envoi WS

// Délai entre samples pour le DAC en lecture (62.5 µs ≈ 16kHz)
#define DAC_DELAY_US        62

// ════════════════════════════════════════════════════════════════════════
// MACHINE À ÉTATS
// ════════════════════════════════════════════════════════════════════════

typedef enum {
    ETAT_ATTENTE,        // En attente de l'appui bouton
    ETAT_ENREGISTREMENT, // Enregistrement et envoi de chunks audio
    ETAT_TRAITEMENT,     // Attente de la réponse du serveur
    ETAT_LECTURE         // Lecture audio de la réponse via DAC
} EtatAssistant;

EtatAssistant etatCourant = ETAT_ATTENTE;

// ════════════════════════════════════════════════════════════════════════
// VARIABLES GLOBALES
// ════════════════════════════════════════════════════════════════════════

// Client WebSocket
WebSocketsClient webSocket;
bool wsConnecte       = false;  // État connexion WebSocket

// État du bouton
bool boutonPrecedent  = false;  // Dernier état lu du bouton
bool enregistrement   = false;  // Enregistrement en cours

// LED animation
unsigned long dernierClignot = 0;
bool ledEtat = false;

// Timer pour reconnexion WebSocket
unsigned long dernierReconnect  = 0;
#define RECONNECT_INTERVALLE_MS  5000  // 5 secondes entre tentatives

// Timer keepalive ping
unsigned long dernierPing = 0;
#define PING_INTERVALLE_MS       20000 // Ping toutes les 20 secondes

// ════════════════════════════════════════════════════════════════════════
// PROTOTYPES
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
// SETUP
// ════════════════════════════════════════════════════════════════════════

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println("================================================");
    Serial.println("  Souverain - Firmware WebSocket ESP32");
    Serial.println("  Sanctuaire de Souverainete");
    Serial.println("================================================");

    // Configuration des broches
    pinMode(PIN_LED,    OUTPUT);
    pinMode(PIN_BOUTON, INPUT_PULLDOWN); // Bouton actif à l'état HAUT
    digitalWrite(PIN_LED, LOW);

    // Connexion WiFi
    setupWifi();

    // Initialisation du microphone I2S
    setupI2SMicrophone();

    // Initialisation du DAC audio
    setupDACOutput();

    // Ton de confirmation au démarrage
    playStartupTone();

    // Configuration du client WebSocket
    // Reconnexion automatique toutes les 5 secondes si déconnecté
    webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(RECONNECT_INTERVALLE_MS);
    webSocket.enableHeartbeat(15000, 3000, 2); // ping WS natif optionnel

    Serial.println("[INFO] Systeme pret. Appuyez sur le bouton pour parler.");
    afficherEtat("ATTENTE");
}

// ════════════════════════════════════════════════════════════════════════
// BOUCLE PRINCIPALE
// ════════════════════════════════════════════════════════════════════════

void loop() {
    // Traitement des événements WebSocket (non bloquant)
    webSocket.loop();

    // Animation LED selon l'état courant
    animerLED(etatCourant);

    // ── Gestion du bouton (actif HAUT avec PULLDOWN) ──────────────────────
    bool boutonActuel = (digitalRead(PIN_BOUTON) == HIGH);

    if (boutonActuel && !boutonPrecedent) {
        // Front montant : bouton vient d'être pressé
        if (wsConnecte && etatCourant == ETAT_ATTENTE) {
            Serial.println("[BOUTON] Presse - Debut enregistrement");
            enregistrement = true;
            etatCourant    = ETAT_ENREGISTREMENT;
            afficherEtat("ENREGISTREMENT");
            // Signal au serveur : début d'enregistrement
            webSocket.sendTXT("pause");
        }
    } else if (!boutonActuel && boutonPrecedent) {
        // Front descendant : bouton vient d'être relâché
        if (enregistrement) {
            Serial.println("[BOUTON] Relache - Fin enregistrement");
            enregistrement = false;
            etatCourant    = ETAT_TRAITEMENT;
            afficherEtat("TRAITEMENT - Attente reponse");
            // Signal au serveur : fin d'enregistrement, lancer le pipeline
            webSocket.sendTXT("stop");
        }
    }
    boutonPrecedent = boutonActuel;

    // ── Envoi de chunks audio pendant l'enregistrement ────────────────────
    if (enregistrement && wsConnecte) {
        send_audio_chunk();
    }

    // ── Keepalive manuel si le heartbeat intégré n'est pas suffisant ─────
    if (wsConnecte) {
        unsigned long maintenant = millis();
        if (maintenant - dernierPing > PING_INTERVALLE_MS) {
            dernierPing = maintenant;
            webSocket.sendTXT("ping");
        }
    }
}

// ════════════════════════════════════════════════════════════════════════
// CONNEXION WIFI
// ════════════════════════════════════════════════════════════════════════

/**
 * Connexion WiFi avec retry automatique.
 * Redémarre l'ESP32 si la connexion échoue après 30 tentatives.
 */
void setupWifi() {
    if (WiFi.status() == WL_CONNECTED) return;

    Serial.printf("[WIFI] Connexion a '%s'...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int tentatives = 0;
    while (WiFi.status() != WL_CONNECTED && tentatives < 30) {
        // Clignotement LED pendant la connexion
        digitalWrite(PIN_LED, !digitalRead(PIN_LED));
        delay(500);
        Serial.print(".");
        tentatives++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WIFI] Connecte ! IP : %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("[WIFI] Signal RSSI : %d dBm\n", WiFi.RSSI());
        // Clignotement confirmation
        for (int i = 0; i < 3; i++) {
            digitalWrite(PIN_LED, HIGH); delay(100);
            digitalWrite(PIN_LED, LOW);  delay(100);
        }
    } else {
        Serial.println("\n[WIFI] Echec connexion ! Verifiez WIFI_SSID et WIFI_PASSWORD.");
        delay(3000);
        ESP.restart();
    }
}

// ════════════════════════════════════════════════════════════════════════
// I2S MICROPHONE
// ════════════════════════════════════════════════════════════════════════

/**
 * Initialise le port I2S 0 pour le microphone INMP441.
 * Configuration 32 bits (données utiles sur 24 bits) → shift >>16 pour 16 bits.
 * Canal droit uniquement (INMP441 avec pin L/R à GND).
 */
void setupI2SMicrophone() {
    i2s_config_t config_micro = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = SAMPLE_RATE,
        .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT, // INMP441 envoie 32 bits
        .channel_format       = I2S_CHANNEL_FMT_ONLY_RIGHT, // Mono droit
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count        = DMA_BUF_COUNT,
        .dma_buf_len          = DMA_BUF_LEN,
        .use_apll             = false,
        .tx_desc_auto_clear   = false,
        .fixed_mclk           = 0
    };

    i2s_pin_config_t pins_micro = {
        .bck_io_num   = I2S_MIC_SCK,
        .ws_io_num    = I2S_MIC_WS,
        .data_out_num = I2S_PIN_NO_CHANGE, // Pas de sortie sur ce bus
        .data_in_num  = I2S_MIC_SD
    };

    esp_err_t err = i2s_driver_install(I2S_NUM_0, &config_micro, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("[ERREUR I2S] driver_install micro : %d\n", err);
        return;
    }
    err = i2s_set_pin(I2S_NUM_0, &pins_micro);
    if (err != ESP_OK) {
        Serial.printf("[ERREUR I2S] set_pin micro : %d\n", err);
        return;
    }
    i2s_zero_dma_buffer(I2S_NUM_0);
    Serial.printf("[I2S] Microphone INMP441 pret (SCK=%d, WS=%d, SD=%d)\n",
                  I2S_MIC_SCK, I2S_MIC_WS, I2S_MIC_SD);
}

// ════════════════════════════════════════════════════════════════════════
// DAC SORTIE AUDIO
// ════════════════════════════════════════════════════════════════════════

/**
 * Active le DAC interne sur GPIO25 (DAC_CHANNEL_1).
 * Le DAC interne de l'ESP32 produit une sortie analogique 8 bits (0-255).
 * Couplé à un filtre passe-bas et un petit amplificateur audio, il produit
 * une sortie audio acceptable pour les applications vocales.
 */
void setupDACOutput() {
    // Active le canal DAC 1 (GPIO25)
    dac_output_enable(DAC_CHANNEL_1);
    // Valeur neutre (silence à 128 = milieu de la plage 0-255)
    dac_output_voltage(DAC_CHANNEL_1, 128);
    Serial.println("[DAC] Sortie audio GPIO25 (DAC_CHANNEL_1) activee");
}

// ════════════════════════════════════════════════════════════════════════
// ENVOI CHUNK AUDIO
// ════════════════════════════════════════════════════════════════════════

/**
 * Lit 1024 samples 32 bits depuis le microphone I2S,
 * les convertit en 16 bits (>>16) et les envoie via WebSocket en binaire.
 *
 * Cette fonction est appelée en boucle pendant l'enregistrement.
 * Chaque appel envoie ~64ms d'audio (1024 samples / 16000 Hz).
 */
void send_audio_chunk() {
    // Buffer 32 bits pour la lecture I2S (INMP441 produit 32 bits)
    int32_t samplesIn[CHUNK_SAMPLES];
    size_t  bytesLus = 0;

    // Lecture depuis I2S avec timeout court (non bloquant)
    esp_err_t err = i2s_read(I2S_NUM_0, samplesIn, sizeof(samplesIn),
                             &bytesLus, pdMS_TO_TICKS(10));
    if (err != ESP_OK || bytesLus == 0) return;

    size_t nbSamples = bytesLus / sizeof(int32_t);

    // Conversion 32 bits → 16 bits
    // L'INMP441 place les données utiles dans les bits 31-8 (format MSB)
    // Le décalage >>16 extrait les 16 bits les plus significatifs
    int16_t samplesOut[CHUNK_SAMPLES];
    for (size_t i = 0; i < nbSamples; i++) {
        samplesOut[i] = (int16_t)(samplesIn[i] >> 16);
    }

    // Envoi binaire via WebSocket (PCM16 mono 16kHz)
    webSocket.sendBIN((uint8_t*)samplesOut, nbSamples * sizeof(int16_t));
}

// ════════════════════════════════════════════════════════════════════════
// GESTIONNAIRE ÉVÉNEMENTS WEBSOCKET
// ════════════════════════════════════════════════════════════════════════

/**
 * Callback WebSocket appelé pour chaque événement réseau.
 *
 * Événements gérés :
 *   WStype_CONNECTED    : Envoi du ping initial pour établir la session
 *   WStype_DISCONNECTED : Mise à jour de l'état, reconnexion automatique
 *   WStype_BIN          : Réception audio (PCM8) → lecture via DAC
 *   WStype_TEXT         : Réception messages texte (pong, statuts)
 *   WStype_ERROR        : Log d'erreur
 */
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {

        // ── Connexion établie ─────────────────────────────────────────────
        case WStype_CONNECTED:
            wsConnecte = true;
            Serial.printf("[WS] Connecte a ws://%s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
            afficherEtat("WEBSOCKET CONNECTE");
            // Envoi du ping initial pour signaler notre présence
            webSocket.sendTXT("ping");
            // Retour à l'état d'attente propre
            etatCourant    = ETAT_ATTENTE;
            enregistrement = false;
            break;

        // ── Déconnexion ───────────────────────────────────────────────────
        case WStype_DISCONNECTED:
            wsConnecte = false;
            Serial.println("[WS] Deconnecte du serveur. Reconnexion automatique...");
            afficherEtat("DECONNECTE");
            etatCourant    = ETAT_ATTENTE;
            enregistrement = false;
            break;

        // ── Réception données binaires = audio de réponse ─────────────────
        case WStype_BIN: {
            Serial.printf("[WS] Audio recu : %d octets (PCM8 16kHz)\n", length);
            etatCourant = ETAT_LECTURE;
            afficherEtat("LECTURE AUDIO");

            // Lecture du flux audio via DAC interne
            // Le serveur envoie du PCM 8 bits unsigned (0-255) à 16kHz
            for (size_t i = 0; i < length; i++) {
                // Envoi direct au DAC : payload[i] est déjà un uint8 0-255
                dac_output_voltage(DAC_CHANNEL_1, payload[i]);
                // Délai pour maintenir la fréquence d'échantillonnage à 16kHz
                // 1/16000 = 62.5 µs entre chaque sample
                delayMicroseconds(DAC_DELAY_US);
            }

            // Remise au silence après lecture (valeur neutre 128)
            dac_output_voltage(DAC_CHANNEL_1, 128);
            Serial.println("[WS] Lecture audio terminee");
            etatCourant = ETAT_ATTENTE;
            afficherEtat("ATTENTE");
            break;
        }

        // ── Réception message texte ───────────────────────────────────────
        case WStype_TEXT: {
            String msg = String((char*)payload);
            Serial.printf("[WS] Message texte recu : '%s'\n", msg.c_str());

            if (msg == "pong") {
                // Réponse au ping keepalive - connexion active
                Serial.println("[WS] Keepalive pong recu");
            } else if (msg.startsWith("ready")) {
                // Serveur signale qu'il est prêt
                Serial.println("[WS] Serveur pret");
            } else if (msg.startsWith("processing")) {
                // Serveur traite l'audio
                etatCourant = ETAT_TRAITEMENT;
                afficherEtat("TRAITEMENT EN COURS");
            } else if (msg.startsWith("error:")) {
                // Erreur côté serveur
                Serial.printf("[WS] Erreur serveur : %s\n", msg.c_str() + 6);
                etatCourant = ETAT_ATTENTE;
            } else {
                // Message informationnel général
                Serial.printf("[WS] Info serveur : %s\n", msg.c_str());
            }
            break;
        }

        // ── Erreur WebSocket ──────────────────────────────────────────────
        case WStype_ERROR:
            Serial.printf("[WS] Erreur WebSocket (length=%d)\n", length);
            break;

        // ── Ping/Pong natif WebSocket (niveau protocole) ──────────────────
        case WStype_PING:
            Serial.println("[WS] Ping protocole recu");
            break;
        case WStype_PONG:
            Serial.println("[WS] Pong protocole recu");
            break;

        default:
            break;
    }
}

// ════════════════════════════════════════════════════════════════════════
// TON DE DÉMARRAGE
// ════════════════════════════════════════════════════════════════════════

/**
 * Joue un ton de confirmation au démarrage via le DAC.
 * Génère une sinusoïde simple à 440 Hz (La) pour confirmer que le DAC fonctionne.
 * Durée : environ 200ms.
 */
void playStartupTone() {
    Serial.println("[DAC] Ton de demarrage...");

    // Synthèse sinusoïdale simple à 440 Hz
    const float frequence  = 440.0f;   // Hz
    const int   dureeMs    = 200;      // millisecondes
    const int   nbSamples  = (SAMPLE_RATE * dureeMs) / 1000; // 3200 samples

    for (int i = 0; i < nbSamples; i++) {
        // Calcul du sample sinus : amplitude 50 (sur 128 max) autour de 128
        float phase    = 2.0f * PI * frequence * i / (float)SAMPLE_RATE;
        uint8_t sample = (uint8_t)(128 + 50 * sinf(phase));
        dac_output_voltage(DAC_CHANNEL_1, sample);
        delayMicroseconds(DAC_DELAY_US);
    }

    // Remise au silence
    dac_output_voltage(DAC_CHANNEL_1, 128);
    Serial.println("[DAC] Ton de demarrage termine");
}

// ════════════════════════════════════════════════════════════════════════
// ANIMATION LED
// ════════════════════════════════════════════════════════════════════════

/**
 * Anime la LED selon l'état courant de l'assistant :
 *
 *   ATTENTE        : Éteinte (pas d'activité)
 *   ENREGISTREMENT : Clignotement rapide 200ms (rouge symbolique = écoute active)
 *   TRAITEMENT     : Clignotement lent 500ms  (jaune symbolique = réflexion)
 *   LECTURE        : Allumée fixe              (vert symbolique = parole)
 */
void animerLED(EtatAssistant etat) {
    unsigned long maintenant = millis();

    switch (etat) {
        case ETAT_ATTENTE:
            // Éteinte en attente
            digitalWrite(PIN_LED, LOW);
            break;

        case ETAT_ENREGISTREMENT:
            // Clignotement rapide : 200ms période
            if (maintenant - dernierClignot > 200) {
                ledEtat = !ledEtat;
                digitalWrite(PIN_LED, ledEtat ? HIGH : LOW);
                dernierClignot = maintenant;
            }
            break;

        case ETAT_TRAITEMENT:
            // Clignotement lent : 500ms période
            if (maintenant - dernierClignot > 500) {
                ledEtat = !ledEtat;
                digitalWrite(PIN_LED, ledEtat ? HIGH : LOW);
                dernierClignot = maintenant;
            }
            break;

        case ETAT_LECTURE:
            // Allumée fixe pendant la lecture audio
            digitalWrite(PIN_LED, HIGH);
            break;
    }
}

// ════════════════════════════════════════════════════════════════════════
// UTILITAIRE - AFFICHAGE ÉTAT
// ════════════════════════════════════════════════════════════════════════

/**
 * Affiche un message d'état bien formaté dans la console série.
 */
void afficherEtat(const char* msg) {
    Serial.printf("[ETAT] ====== %s ======\n", msg);
}
