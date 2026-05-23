/**
 * sanctuaire_assistant.ino
 * Firmware Arduino pour ESP32 - Assistant Vocal Souverain
 * Sanctuaire de Souveraineté
 *
 * Matériel requis :
 *   - ESP32 DevKit (ou ESP32-WROOM-32)
 *   - Microphone I2S : INMP441 (broche SCK=26, WS=25, SD=34)
 *   - Amplificateur audio I2S : MAX98357A (BCLK=27, LRC=26, DIN=25)
 *     OU buzzer/haut-parleur sur pin PWM (GPIO 32)
 *   - LED de statut (GPIO 2 - LED intégrée sur la plupart des DevKit)
 *   - Bouton poussoir (GPIO 0 - bouton BOOT sur la plupart des DevKit)
 *
 * Fonctionnement :
 *   1. Appuie sur le bouton pour activer l'écoute
 *   2. Parle dans le microphone
 *   3. L'audio est envoyé au Raspberry Pi via HTTP POST
 *   4. Le Pi fait STT → Claude → TTS et retourne l'audio
 *   5. L'audio de réponse est lu via le DAC/amplificateur
 *
 * Configuration (modifier les constantes en haut du fichier) :
 *   - WIFI_SSID / WIFI_PASSWORD
 *   - SERVEUR_URL (adresse IP du Raspberry Pi)
 *
 * Flashage :
 *   Arduino IDE → Board: "ESP32 Dev Module" → Port: COMx → Upload
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <driver/i2s.h>
#include <ArduinoBase64.h>  // Pour décoder l'audio base64 reçu du serveur
#include <ArduinoJson.h>    // Pour parser le JSON de réponse

// ════════════════════════════════════════════════════════════════════════
// CONFIGURATION - À MODIFIER SELON VOTRE INSTALLATION
// ════════════════════════════════════════════════════════════════════════

// WiFi
const char* WIFI_SSID     = "VotreReseauWiFi";          // Nom du réseau WiFi
const char* WIFI_PASSWORD = "VotreMotDePasseWiFi";      // Mot de passe WiFi

// Serveur Raspberry Pi (remplacez par l'IP réelle de votre Pi)
const char* SERVEUR_URL   = "http://192.168.1.100:5000"; // URL du serveur Flask
const int   TIMEOUT_HTTP  = 30000;                       // Timeout HTTP en ms (30 sec)
const int   MAX_RETRIES   = 3;                           // Tentatives avant abandon

// ────────────────────────────────────────────────────────────────────────
// BROCHES MATÉRIEL
// ────────────────────────────────────────────────────────────────────────

// LED de statut
#define PIN_LED          2   // LED intégrée ESP32 (GPIO2)

// Bouton d'activation
#define PIN_BOUTON       0   // Bouton BOOT (GPIO0) - actif à l'état BAS

// Microphone I2S INMP441
#define I2S_MIC_SCK      26  // Horloge série (Serial Clock)
#define I2S_MIC_WS       25  // Sélection de mot (Word Select / LR Clock)
#define I2S_MIC_SD       34  // Données série (Serial Data) - entrée

// Ampli/DAC I2S MAX98357A (pour la sortie audio)
#define I2S_DAC_BCLK     27  // Horloge bit
#define I2S_DAC_LRC      26  // Left/Right clock (attention : même pin que MIC_WS si même bus)
#define I2S_DAC_DIN      25  // Données in (attention : même pin que MIC_WS si même bus)
// Note : Le micro et le DAC ne peuvent pas utiliser les mêmes broches simultanément.
//        Utilisez deux ports I2S différents : I2S_NUM_0 pour le micro, I2S_NUM_1 pour le DAC.

// ────────────────────────────────────────────────────────────────────────
// PARAMÈTRES AUDIO
// ────────────────────────────────────────────────────────────────────────

#define SAMPLE_RATE       16000  // Fréquence d'échantillonnage (Hz) - standard pour STT
#define BITS_PER_SAMPLE   16     // Bits par échantillon
#define CHANNELS          1      // Mono (INMP441 est mono)
#define BUFFER_COUNT      8      // Nombre de buffers DMA
#define BUFFER_SAMPLES    512    // Échantillons par buffer

// Durée d'enregistrement en secondes (max avant d'envoyer au serveur)
#define DUREE_MAX_ENREG   8      // secondes
#define TAILLE_BUFFER_AUDIO (SAMPLE_RATE * DUREE_MAX_ENREG * (BITS_PER_SAMPLE / 8))

// Seuil de détection de parole (0-32767 pour 16 bits)
// Augmenter si trop sensible aux bruits, diminuer si vous n'êtes pas détecté
#define SEUIL_PAROLE      1500

// Durée de silence avant d'arrêter l'enregistrement (ms)
#define SILENCE_DUREE_MS  1500

// ════════════════════════════════════════════════════════════════════════
// ÉTATS DE LA MACHINE À ÉTATS
// ════════════════════════════════════════════════════════════════════════

typedef enum {
  ETAT_ATTENTE,       // Attente de l'appui sur le bouton
  ETAT_ECOUTE,        // Enregistrement du microphone
  ETAT_TRAITEMENT,    // Envoi au serveur et attente de réponse
  ETAT_PARLE,         // Lecture de la réponse audio
  ETAT_ERREUR         // Erreur réseau ou autre
} EtatAssistant;

EtatAssistant etatCourant = ETAT_ATTENTE;

// ════════════════════════════════════════════════════════════════════════
// VARIABLES GLOBALES
// ════════════════════════════════════════════════════════════════════════

// Buffer audio d'enregistrement
int16_t*  bufferAudio     = nullptr;
size_t    tailleAudioEnr  = 0;      // Octets enregistrés

// Identifiant client pour le suivi de l'historique côté serveur
String clientId = "";

// Timing LED
unsigned long dernierClignot = 0;
bool ledEtat = false;

// Anti-rebond bouton
unsigned long dernierAppuiBouton = 0;
#define DEBOUNCE_MS 200

// ════════════════════════════════════════════════════════════════════════
// PROTOTYPES DES FONCTIONS
// ════════════════════════════════════════════════════════════════════════

void connecterWiFi();
void initI2SMicrophone();
void initI2SDAC();
bool enregistrerAudio();
bool envoyerAuServeur(uint8_t* audio, size_t taille, String& reponseTexte, uint8_t*& reponseAudio, size_t& tailleReponse);
void lireAudio(uint8_t* donnees, size_t taille);
void gererLED(EtatAssistant etat);
void afficherEtat(const char* msg);
bool boutonAppuye();
String construireEnTeteWAV(uint32_t tailleData);

// ════════════════════════════════════════════════════════════════════════
// SETUP
// ════════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("════════════════════════════════════════");
  Serial.println("  🏛️  Souverain - Assistant ESP32");
  Serial.println("  Sanctuaire de Souveraineté");
  Serial.println("════════════════════════════════════════");

  // Configuration des broches
  pinMode(PIN_LED,    OUTPUT);
  pinMode(PIN_BOUTON, INPUT_PULLUP);  // Bouton actif à l'état BAS
  digitalWrite(PIN_LED, LOW);

  // Génère un identifiant client basé sur l'adresse MAC
  clientId = "esp32-" + String((uint32_t)(ESP.getEfuseMac() & 0xFFFFFF), HEX);
  Serial.printf("[INFO] Client ID : %s\n", clientId.c_str());

  // Allocation du buffer audio
  bufferAudio = (int16_t*)malloc(TAILLE_BUFFER_AUDIO);
  if (!bufferAudio) {
    Serial.println("[ERREUR] Allocation mémoire buffer audio échouée !");
    // Réinitialisation dans 5 secondes
    delay(5000);
    ESP.restart();
  }
  Serial.printf("[INFO] Buffer audio alloué : %d octets\n", TAILLE_BUFFER_AUDIO);

  // Connexion WiFi
  connecterWiFi();

  // Initialisation du microphone I2S
  initI2SMicrophone();

  // Initialisation du DAC I2S (sortie audio)
  initI2SDAC();

  Serial.println("[INFO] Système prêt. Appuyez sur le bouton pour parler.");
  afficherEtat("PRÊT");

  // Clignotement LED pour signaler la disponibilité
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_LED, HIGH);
    delay(100);
    digitalWrite(PIN_LED, LOW);
    delay(100);
  }
}

// ════════════════════════════════════════════════════════════════════════
// BOUCLE PRINCIPALE
// ════════════════════════════════════════════════════════════════════════

void loop() {
  gererLED(etatCourant);

  switch (etatCourant) {

    // ── Attente ──────────────────────────────────────────────────────────
    case ETAT_ATTENTE:
      // Surveillance du bouton
      if (boutonAppuye()) {
        Serial.println("[BOUTON] Appui détecté → Démarrage écoute");
        afficherEtat("ÉCOUTE...");
        etatCourant = ETAT_ECOUTE;
        delay(100); // Debounce
      }
      break;

    // ── Écoute ───────────────────────────────────────────────────────────
    case ETAT_ECOUTE:
      Serial.println("[ÉCOUTE] Enregistrement en cours...");
      if (enregistrerAudio()) {
        Serial.printf("[ÉCOUTE] Enregistrement terminé : %d octets\n", tailleAudioEnr);
        etatCourant = ETAT_TRAITEMENT;
      } else {
        Serial.println("[ÉCOUTE] Enregistrement annulé (silence ou bouton)");
        etatCourant = ETAT_ATTENTE;
      }
      break;

    // ── Traitement ───────────────────────────────────────────────────────
    case ETAT_TRAITEMENT:
      afficherEtat("TRAITEMENT...");
      Serial.println("[HTTP] Envoi au serveur Raspberry Pi...");
      {
        String reponseTexte;
        uint8_t* reponseAudio = nullptr;
        size_t   tailleReponse = 0;

        bool succes = envoyerAuServeur(
          (uint8_t*)bufferAudio, tailleAudioEnr,
          reponseTexte, reponseAudio, tailleReponse
        );

        if (succes) {
          Serial.printf("[RÉPONSE] \"%s\"\n", reponseTexte.c_str());
          if (reponseAudio && tailleReponse > 0) {
            etatCourant = ETAT_PARLE;
            afficherEtat("LECTURE...");
            lireAudio(reponseAudio, tailleReponse);
            free(reponseAudio);
          }
          etatCourant = ETAT_ATTENTE;
        } else {
          Serial.println("[ERREUR] Échec communication serveur");
          etatCourant = ETAT_ERREUR;
        }
      }
      break;

    // ── Parole ───────────────────────────────────────────────────────────
    case ETAT_PARLE:
      // Traité dans ETAT_TRAITEMENT directement
      etatCourant = ETAT_ATTENTE;
      break;

    // ── Erreur ───────────────────────────────────────────────────────────
    case ETAT_ERREUR:
      afficherEtat("ERREUR - Attente...");
      // Clignotement rapide LED erreur
      for (int i = 0; i < 5; i++) {
        digitalWrite(PIN_LED, HIGH); delay(100);
        digitalWrite(PIN_LED, LOW);  delay(100);
      }
      // Vérifie si toujours connecté au WiFi
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WIFI] Connexion perdue. Reconnexion...");
        connecterWiFi();
      }
      etatCourant = ETAT_ATTENTE;
      break;
  }
}

// ════════════════════════════════════════════════════════════════════════
// FONCTIONS WiFi
// ════════════════════════════════════════════════════════════════════════

/**
 * Connexion WiFi avec retry automatique.
 */
void connecterWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[WIFI] Connexion à '%s'...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int tentatives = 0;
  while (WiFi.status() != WL_CONNECTED && tentatives < 30) {
    digitalWrite(PIN_LED, !digitalRead(PIN_LED)); // Clignotement
    delay(500);
    Serial.print(".");
    tentatives++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] Connecté ! IP : %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WIFI] Signal : %d dBm\n", WiFi.RSSI());
    digitalWrite(PIN_LED, HIGH);
    delay(200);
    digitalWrite(PIN_LED, LOW);
  } else {
    Serial.println("\n[WIFI] Échec de connexion !");
    Serial.println("[WIFI] Vérifiez WIFI_SSID et WIFI_PASSWORD dans le code.");
    // Attente avant réessai
    delay(5000);
    ESP.restart();
  }
}

// ════════════════════════════════════════════════════════════════════════
// FONCTIONS I2S - MICROPHONE
// ════════════════════════════════════════════════════════════════════════

/**
 * Initialise le port I2S 0 pour le microphone INMP441.
 */
void initI2SMicrophone() {
  i2s_config_t config_micro = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,  // INMP441 produit 32 bits (données sur 24 bits)
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,   // Mono gauche
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = BUFFER_COUNT,
    .dma_buf_len = BUFFER_SAMPLES,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pins_micro = {
    .bck_io_num   = I2S_MIC_SCK,
    .ws_io_num    = I2S_MIC_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,  // Pas de sortie pour le micro
    .data_in_num  = I2S_MIC_SD
  };

  esp_err_t err;
  err = i2s_driver_install(I2S_NUM_0, &config_micro, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("[ERREUR I2S] Micro driver install : %d\n", err);
    return;
  }
  err = i2s_set_pin(I2S_NUM_0, &pins_micro);
  if (err != ESP_OK) {
    Serial.printf("[ERREUR I2S] Micro set pin : %d\n", err);
    return;
  }
  i2s_zero_dma_buffer(I2S_NUM_0);
  Serial.println("[I2S] Microphone INMP441 initialisé (I2S_NUM_0)");
}

/**
 * Initialise le port I2S 1 pour le DAC/ampli MAX98357A.
 */
void initI2SDAC() {
  i2s_config_t config_dac = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = BUFFER_COUNT,
    .dma_buf_len = BUFFER_SAMPLES,
    .use_apll = false,
    .tx_desc_auto_clear = true,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pins_dac = {
    .bck_io_num   = I2S_DAC_BCLK,
    .ws_io_num    = I2S_DAC_LRC,
    .data_out_num = I2S_DAC_DIN,
    .data_in_num  = I2S_PIN_NO_CHANGE
  };

  esp_err_t err;
  err = i2s_driver_install(I2S_NUM_1, &config_dac, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("[ERREUR I2S] DAC driver install : %d\n", err);
    return;
  }
  err = i2s_set_pin(I2S_NUM_1, &pins_dac);
  if (err != ESP_OK) {
    Serial.printf("[ERREUR I2S] DAC set pin : %d\n", err);
    return;
  }
  Serial.println("[I2S] DAC MAX98357A initialisé (I2S_NUM_1)");
}

// ════════════════════════════════════════════════════════════════════════
// ENREGISTREMENT AUDIO
// ════════════════════════════════════════════════════════════════════════

/**
 * Enregistre l'audio depuis le microphone.
 * S'arrête automatiquement après DUREE_MAX_ENREG secondes ou
 * après SILENCE_DUREE_MS ms de silence.
 *
 * @return true si de l'audio a été capturé, false sinon
 */
bool enregistrerAudio() {
  tailleAudioEnr = 0;

  // Buffer temporaire pour les données 32 bits du INMP441
  int32_t bufTemp[BUFFER_SAMPLES];
  size_t bytesLus = 0;

  bool parolDetectee = false;
  unsigned long debutSilence = 0;
  unsigned long debutEnreg   = millis();

  Serial.println("[AUDIO] Début capture - Parlez maintenant !");

  while (true) {
    // Vérification timeout global
    if (millis() - debutEnreg > (uint32_t)(DUREE_MAX_ENREG * 1000)) {
      Serial.println("[AUDIO] Durée max atteinte.");
      break;
    }

    // Vérification appui bouton pour annuler
    if (boutonAppuye()) {
      Serial.println("[AUDIO] Annulation par bouton.");
      return false;
    }

    // Lecture I2S
    esp_err_t err = i2s_read(I2S_NUM_0, bufTemp, sizeof(bufTemp), &bytesLus, portMAX_DELAY);
    if (err != ESP_OK || bytesLus == 0) continue;

    // Conversion 32 bits → 16 bits (INMP441 donne données sur 24 bits dans 32 bits)
    size_t echantillons = bytesLus / sizeof(int32_t);
    int16_t* ptr_dest = bufferAudio + (tailleAudioEnr / sizeof(int16_t));

    int amplitude_max = 0;
    for (size_t i = 0; i < echantillons; i++) {
      int16_t val = (int16_t)(bufTemp[i] >> 16);  // Décalage pour récupérer les 16 bits utiles
      ptr_dest[i] = val;
      int amp = abs((int)val);
      if (amp > amplitude_max) amplitude_max = amp;
    }

    tailleAudioEnr += echantillons * sizeof(int16_t);

    // Détection de silence/parole
    if (amplitude_max > SEUIL_PAROLE) {
      parolDetectee = true;
      debutSilence  = 0; // Réinitialise le compteur de silence
    } else if (parolDetectee) {
      if (debutSilence == 0) debutSilence = millis();
      if (millis() - debutSilence > SILENCE_DUREE_MS) {
        Serial.println("[AUDIO] Silence détecté → Fin d'enregistrement.");
        break;
      }
    }

    // Vérification buffer plein
    if (tailleAudioEnr >= TAILLE_BUFFER_AUDIO - (BUFFER_SAMPLES * sizeof(int16_t))) {
      Serial.println("[AUDIO] Buffer plein.");
      break;
    }
  }

  Serial.printf("[AUDIO] Capturé : %d octets | Parole : %s\n",
                tailleAudioEnr, parolDetectee ? "OUI" : "NON");

  return (parolDetectee && tailleAudioEnr > 0);
}

// ════════════════════════════════════════════════════════════════════════
// COMMUNICATION HTTP
// ════════════════════════════════════════════════════════════════════════

/**
 * Construit l'en-tête WAV standard pour les données PCM brutes.
 * Nécessaire car espeak-ng côté serveur attend des données WAV complètes.
 *
 * @param tailleData Taille des données PCM en octets
 * @return String contenant les 44 octets d'en-tête WAV
 */
String construireEnTeteWAV(uint32_t tailleData) {
  // Structure WAV : RIFF header + fmt chunk + data chunk
  uint8_t header[44];

  // RIFF chunk
  memcpy(header,      "RIFF", 4);
  uint32_t tailleRiff = tailleData + 36;
  memcpy(header + 4,  &tailleRiff, 4);
  memcpy(header + 8,  "WAVE", 4);

  // fmt chunk
  memcpy(header + 12, "fmt ", 4);
  uint32_t tailleChunk = 16;
  memcpy(header + 16, &tailleChunk, 4);
  uint16_t audioFormat = 1;   // PCM
  memcpy(header + 20, &audioFormat, 2);
  uint16_t numChannels = CHANNELS;
  memcpy(header + 22, &numChannels, 2);
  uint32_t sampleRate = SAMPLE_RATE;
  memcpy(header + 24, &sampleRate, 4);
  uint32_t byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  memcpy(header + 28, &byteRate, 4);
  uint16_t blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
  memcpy(header + 32, &blockAlign, 2);
  uint16_t bitsPerSample = BITS_PER_SAMPLE;
  memcpy(header + 34, &bitsPerSample, 2);

  // data chunk
  memcpy(header + 36, "data", 4);
  memcpy(header + 40, &tailleData, 4);

  // Convertit en String pour concaténation (non idéal mais fonctionnel)
  return String((char*)header, 44);
}

/**
 * Envoie l'audio au serveur Raspberry Pi et reçoit la réponse.
 * Utilise l'endpoint /assistant qui fait STT + Claude + TTS en un seul appel.
 *
 * @param audio         Pointeur vers les données PCM 16 bits
 * @param taille        Taille des données en octets
 * @param reponseTexte  [sortie] Texte de la réponse
 * @param reponseAudio  [sortie] Données WAV de la réponse (à libérer après usage)
 * @param tailleReponse [sortie] Taille des données audio de réponse
 * @return true si succès
 */
bool envoyerAuServeur(uint8_t* audio, size_t taille,
                       String& reponseTexte,
                       uint8_t*& reponseAudio, size_t& tailleReponse) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Non connecté au WiFi !");
    connecterWiFi();
    return false;
  }

  String url = String(SERVEUR_URL) + "/assistant";
  HTTPClient http;

  for (int tentative = 1; tentative <= MAX_RETRIES; tentative++) {
    Serial.printf("[HTTP] Tentative %d/%d → %s\n", tentative, MAX_RETRIES, url.c_str());

    http.begin(url);
    http.setTimeout(TIMEOUT_HTTP);

    // En-têtes HTTP
    http.addHeader("Content-Type", "audio/wav");
    http.addHeader("X-Language",   "fr-FR");
    http.addHeader("X-Client-ID",  clientId);

    // Construction du corps WAV = en-tête WAV + données PCM
    // On crée un buffer complet WAV
    size_t tailleWAV = 44 + taille;
    uint8_t* wavBuffer = (uint8_t*)malloc(tailleWAV);
    if (!wavBuffer) {
      Serial.println("[HTTP] Allocation buffer WAV échouée !");
      http.end();
      return false;
    }

    // En-tête WAV (44 octets)
    // RIFF
    memcpy(wavBuffer, "RIFF", 4);
    uint32_t riffSize = (uint32_t)(taille + 36);
    memcpy(wavBuffer + 4, &riffSize, 4);
    memcpy(wavBuffer + 8, "WAVE", 4);
    // fmt
    memcpy(wavBuffer + 12, "fmt ", 4);
    uint32_t fmtSize = 16;
    memcpy(wavBuffer + 16, &fmtSize, 4);
    uint16_t audioFmt = 1;
    memcpy(wavBuffer + 20, &audioFmt, 2);
    uint16_t ch = CHANNELS;
    memcpy(wavBuffer + 22, &ch, 2);
    uint32_t sr = SAMPLE_RATE;
    memcpy(wavBuffer + 24, &sr, 4);
    uint32_t br = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
    memcpy(wavBuffer + 28, &br, 4);
    uint16_t ba = CHANNELS * (BITS_PER_SAMPLE / 8);
    memcpy(wavBuffer + 32, &ba, 2);
    uint16_t bps = BITS_PER_SAMPLE;
    memcpy(wavBuffer + 34, &bps, 2);
    // data
    memcpy(wavBuffer + 36, "data", 4);
    uint32_t dataSize = (uint32_t)taille;
    memcpy(wavBuffer + 40, &dataSize, 4);
    // Données audio
    memcpy(wavBuffer + 44, audio, taille);

    // Envoi POST
    int codeReponse = http.POST(wavBuffer, (int)tailleWAV);
    free(wavBuffer);

    if (codeReponse == 200) {
      // Parse la réponse JSON
      String corpReponse = http.getString();
      http.end();

      StaticJsonDocument<4096> doc;
      DeserializationError erreur = deserializeJson(doc, corpReponse);

      if (erreur) {
        Serial.printf("[JSON] Erreur parsing : %s\n", erreur.c_str());
        return false;
      }

      bool succes = doc["succes"] | false;
      if (!succes) {
        const char* err = doc["erreur"] | "Erreur inconnue";
        Serial.printf("[SERVEUR] Erreur : %s\n", err);
        reponseTexte = String(err);
        return false;
      }

      reponseTexte = doc["reponse_texte"] | "";

      // Décodage de l'audio base64
      const char* audioB64 = doc["audio_base64"] | "";
      if (strlen(audioB64) > 0) {
        // Décode le base64
        size_t tailleDecodee = base64_dec_len((char*)audioB64, strlen(audioB64));
        reponseAudio = (uint8_t*)malloc(tailleDecodee);
        if (reponseAudio) {
          tailleReponse = base64_decode((char*)reponseAudio, (char*)audioB64, strlen(audioB64));
          Serial.printf("[AUDIO] Réponse audio : %d octets décodés\n", tailleReponse);
        } else {
          Serial.println("[ERREUR] Allocation réponse audio échouée !");
          tailleReponse = 0;
        }
      } else {
        reponseAudio  = nullptr;
        tailleReponse = 0;
        Serial.println("[INFO] Pas d'audio dans la réponse (texte seulement).");
      }

      return true;

    } else {
      Serial.printf("[HTTP] Code erreur : %d\n", codeReponse);
      if (codeReponse > 0) {
        Serial.printf("[HTTP] Réponse : %s\n", http.getString().c_str());
      }
      http.end();

      if (tentative < MAX_RETRIES) {
        Serial.printf("[HTTP] Retry dans 2 secondes...\n");
        delay(2000);
      }
    }
  }

  return false;
}

// ════════════════════════════════════════════════════════════════════════
// LECTURE AUDIO (DAC I2S)
// ════════════════════════════════════════════════════════════════════════

/**
 * Lit le fichier WAV sur le DAC I2S (MAX98357A ou équivalent).
 * Ignore les 44 premiers octets (en-tête WAV).
 *
 * @param donnees Données WAV complètes (avec en-tête)
 * @param taille  Taille totale en octets
 */
void lireAudio(uint8_t* donnees, size_t taille) {
  if (!donnees || taille < 44) {
    Serial.println("[AUDIO] Données audio invalides.");
    return;
  }

  // Saut de l'en-tête WAV (44 octets standard)
  uint8_t* ptrData  = donnees + 44;
  size_t   tailleData = taille - 44;

  Serial.printf("[AUDIO] Lecture : %d octets de données PCM\n", tailleData);

  size_t octetsEcrits = 0;
  size_t offset = 0;

  while (offset < tailleData) {
    size_t aEcrire = min((size_t)BUFFER_SAMPLES * sizeof(int16_t), tailleData - offset);
    esp_err_t err = i2s_write(I2S_NUM_1, ptrData + offset, aEcrire, &octetsEcrits, portMAX_DELAY);
    if (err != ESP_OK) {
      Serial.printf("[AUDIO] Erreur I2S write : %d\n", err);
      break;
    }
    offset += octetsEcrits;
    gererLED(ETAT_PARLE);
  }

  // Flush du buffer
  i2s_zero_dma_buffer(I2S_NUM_1);
  Serial.println("[AUDIO] Lecture terminée.");
}

// ════════════════════════════════════════════════════════════════════════
// GESTION LED
// ════════════════════════════════════════════════════════════════════════

/**
 * Gère l'animation LED selon l'état de l'assistant.
 * - ATTENTE     : Éteinte
 * - ÉCOUTE      : Clignotement rapide (rouge symbolique)
 * - TRAITEMENT  : Clignotement lent
 * - PARLE       : Allumée fixe (vert symbolique)
 * - ERREUR      : Clignotement très rapide
 */
void gererLED(EtatAssistant etat) {
  unsigned long maintenant = millis();

  switch (etat) {
    case ETAT_ATTENTE:
      digitalWrite(PIN_LED, LOW);
      break;

    case ETAT_ECOUTE:
      // Clignotement rapide : 200ms
      if (maintenant - dernierClignot > 200) {
        ledEtat = !ledEtat;
        digitalWrite(PIN_LED, ledEtat ? HIGH : LOW);
        dernierClignot = maintenant;
      }
      break;

    case ETAT_TRAITEMENT:
      // Clignotement lent : 500ms
      if (maintenant - dernierClignot > 500) {
        ledEtat = !ledEtat;
        digitalWrite(PIN_LED, ledEtat ? HIGH : LOW);
        dernierClignot = maintenant;
      }
      break;

    case ETAT_PARLE:
      // LED fixe allumée
      digitalWrite(PIN_LED, HIGH);
      break;

    case ETAT_ERREUR:
      // Clignotement très rapide : 100ms
      if (maintenant - dernierClignot > 100) {
        ledEtat = !ledEtat;
        digitalWrite(PIN_LED, ledEtat ? HIGH : LOW);
        dernierClignot = maintenant;
      }
      break;
  }
}

// ════════════════════════════════════════════════════════════════════════
// UTILITAIRES
// ════════════════════════════════════════════════════════════════════════

/**
 * Affiche un message d'état sur la console série.
 */
void afficherEtat(const char* msg) {
  Serial.printf("[ÉTAT] ══════ %s ══════\n", msg);
}

/**
 * Vérifie si le bouton est appuyé avec anti-rebond.
 * Le bouton GPIO0 est actif à l'état BAS (INPUT_PULLUP).
 */
bool boutonAppuye() {
  if (digitalRead(PIN_BOUTON) == LOW) {
    unsigned long maintenant = millis();
    if (maintenant - dernierAppuiBouton > DEBOUNCE_MS) {
      dernierAppuiBouton = maintenant;
      return true;
    }
  }
  return false;
}
