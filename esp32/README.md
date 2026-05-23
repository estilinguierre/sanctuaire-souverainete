# Assistant Vocal ESP32 - Sanctuaire de Souveraineté

Ce module permet d'utiliser un ESP32 comme assistant vocal physique, communiquant avec le serveur Flask sur le Raspberry Pi.

## Matériel requis

| Composant | Référence | Rôle | Prix approximatif |
|-----------|-----------|------|-------------------|
| Microcontrôleur | ESP32 DevKit v1 (ESP32-WROOM-32) | Cerveau du système | ~8 € |
| Microphone | INMP441 (module breakout) | Capture vocale via I2S | ~4 € |
| Ampli audio | MAX98357A (module breakout) | Sortie audio I2S | ~4 € |
| Haut-parleur | 4Ω / 3W minimum | Diffusion de la réponse vocale | ~3 € |
| Bouton poussoir | Bouton momentané 6mm | Activation de l'écoute | ~0,50 € |
| LED | LED 5mm (rouge ou RGB) | Indicateur d'état | ~0,10 € |
| Résistance | 220Ω (1/4W) | Protection LED | ~0,05 € |
| Câblage | Câbles Dupont M-F et M-M | Connexions | ~2 € |
| Breadboard | Mini breadboard 400 points | Prototype | ~2 € |
| Alimentation | USB 5V / 1A minimum | Alimentation ESP32 | ~0 € (câble USB) |

**Coût total estimé : ~25 €**

---

## Schéma de câblage

### Microphone INMP441 → ESP32

| Broche INMP441 | Broche ESP32 | Description |
|----------------|--------------|-------------|
| VDD | 3.3V | Alimentation |
| GND | GND | Masse |
| SD | GPIO 34 | Données audio (entrée) |
| SCK | GPIO 26 | Horloge série |
| WS | GPIO 25 | Sélection mot (L/R) |
| L/R | GND | Sélection canal gauche (relier à GND) |

> **Note :** Le GPIO 34 est en entrée seule sur l'ESP32 (pas de résistance pull-up interne), ce qui en fait le choix idéal pour les données I2S en réception.

### Ampli MAX98357A → ESP32

| Broche MAX98357A | Broche ESP32 | Description |
|-----------------|--------------|-------------|
| VIN | 5V (via USB) ou 3.3V | Alimentation |
| GND | GND | Masse |
| DIN | GPIO 25 | Données audio (sortie) |
| BCLK | GPIO 27 | Horloge bit |
| LRC | GPIO 26 | Horloge L/R |
| GAIN | Non connecté | Gain par défaut (9 dB) |

> **Attention aux conflits de broches :** Dans cette configuration, le GPIO 25 et GPIO 26 sont partagés entre le microphone (réception) et le DAC (émission). Le firmware utilise deux ports I2S différents (I2S_NUM_0 et I2S_NUM_1) pour les gérer séparément. Une version alternative avec des broches totalement séparées est recommandée pour la production.

**Configuration alternative sans conflit de broches :**

| Composant | Broche SCK/BCLK | Broche WS/LRC | Broche Data |
|-----------|-----------------|---------------|-------------|
| INMP441 (micro) | GPIO 14 | GPIO 15 | GPIO 34 |
| MAX98357A (DAC) | GPIO 27 | GPIO 26 | GPIO 25 |

### LED de statut → ESP32

| Composant | Connexion |
|-----------|-----------|
| LED (anode +) | GPIO 2 (via résistance 220Ω) |
| LED (cathode -) | GND |

> La plupart des ESP32 DevKit ont déjà une LED intégrée sur GPIO 2.

### Bouton poussoir → ESP32

| Broche bouton | Connexion |
|---------------|-----------|
| Broche 1 | GPIO 0 |
| Broche 2 | GND |

> Le GPIO 0 est le bouton BOOT présent sur la plupart des ESP32 DevKit. En mode normal (après le démarrage), il fonctionne comme un bouton d'entrée standard avec pull-up interne activé dans le code.

### Haut-parleur → MAX98357A

| Broche haut-parleur | Connexion MAX98357A |
|---------------------|---------------------|
| + (rouge) | OUT+ |
| - (noir) | OUT- |

---

## Architecture WebSocket (v2.0)

### WebSocket vs HTTP : pourquoi WebSocket ?

Le firmware v2.0 utilise **WebSocket** (RFC 6455) au lieu de requêtes HTTP pour communiquer avec le Raspberry Pi. Cette décision technique apporte plusieurs avantages majeurs :

| Critère | HTTP (ancienne version) | WebSocket (v2.0) |
|---------|------------------------|------------------|
| Connexion | Nouvelle connexion par requête | Connexion persistante unique |
| Latence | 50-200ms (handshake TCP+HTTP) | < 5ms (canal ouvert en permanence) |
| Audio streaming | Impossible (tout envoyer en une fois) | Natif (chunks en temps réel) |
| Réponse serveur | Polling nécessaire | Push serveur immédiat |
| Overhead réseau | En-têtes HTTP répétés | Minimal (2-14 octets par trame) |
| Bidirectionnel | Non (requête-réponse) | Oui (full-duplex) |

Grâce au WebSocket, l'ESP32 envoie l'audio en **streaming** pendant que l'utilisateur parle, ce qui réduit la latence totale de plusieurs secondes.

### Librairies Arduino nécessaires

Pour compiler ce firmware, vous avez besoin d'installer **une seule librairie tierce** :

| Librairie | Auteur | Installation |
|-----------|--------|--------------|
| **arduinoWebSockets** | Markus Sattler (Links2004) | Arduino Library Manager |

Les autres librairies utilisées (`WiFi.h`, `driver/i2s.h`, `driver/dac.h`) font partie du **SDK ESP32 Arduino** et sont disponibles automatiquement dès que vous installez le support ESP32 dans Arduino IDE.

#### Installation depuis Arduino Library Manager

1. Ouvrez Arduino IDE
2. Menu **Outils** → **Gérer les bibliothèques...**
3. Dans la barre de recherche, tapez : `WebSockets`
4. Recherchez la librairie **"WebSockets"** par **Markus Sattler**
5. Cliquez sur **Installer** (version 2.3.x ou supérieure recommandée)

> La librairie s'appelle "arduinoWebSockets" sur GitHub mais apparaît simplement comme "WebSockets" dans le Library Manager.

### Protocole WebSocket : diagramme de séquence

```
ESP32                                    Raspberry Pi (server.py)
  |                                              |
  |--- Connexion TCP + WebSocket handshake ----->|
  |<-- Connexion établie (WStype_CONNECTED) -----|
  |                                              |
  |--- "ping" (texte) ------------------------->|  Keepalive initial
  |<-- "pong" (texte) --------------------------|
  |                                              |
  |--- [Bouton GPIO26 pressé] ------------------|
  |--- "pause" (texte) ------------------------>|  Reset buffer audio
  |<-- "ready" (texte) --------------------------|
  |                                              |
  |--- [chunk 1] (binaire, PCM16, 2048 bytes) ->|  Streaming audio
  |--- [chunk 2] (binaire, PCM16, 2048 bytes) ->|  en temps réel
  |--- [chunk 3] (binaire, PCM16, 2048 bytes) ->|
  |    ...                                       |
  |--- [chunk N] (binaire, PCM16, 2048 bytes) ->|
  |                                              |
  |--- [Bouton GPIO26 relâché] -----------------|
  |--- "stop" (texte) ------------------------->|  Fin de l'audio
  |<-- "processing" (texte) --------------------|  Pipeline en cours
  |                                              |
  |         [STT : PCM16 → texte]               |
  |         [Claude : texte → réponse]           |
  |         [TTS : texte → WAV → PCM8]          |
  |                                              |
  |<-- [réponse audio] (binaire, PCM8) ---------|  Audio de réponse
  |                                              |
  |--- [Lecture DAC : GPIO25, 16kHz] -----------|
  |                                              |
  |--- "ping" (texte, toutes les 20s) -------->|  Keepalive continu
  |<-- "pong" (texte) --------------------------|
```

### Format des données audio

| Direction | Format | Fréquence | Résolution | Canaux |
|-----------|--------|-----------|------------|--------|
| ESP32 → Pi | PCM brut (sans en-tête) | 16 000 Hz | 16 bits signé | Mono |
| Pi → ESP32 | PCM brut (sans en-tête) | 16 000 Hz | 8 bits unsigned | Mono |

L'ESP32 lit le microphone INMP441 en 32 bits et convertit en 16 bits (`>>16`) avant l'envoi.
Le Raspberry Pi envoie du PCM 8 bits (0-255) directement lisible par le DAC interne de l'ESP32.

---

## Configuration du firmware

Ouvrez `sanctuaire_assistant.ino` et modifiez les constantes en début de fichier :

```cpp
// Réseau WiFi
const char* WIFI_SSID     = "VotreReseauWiFi";      // Remplacez par votre SSID
const char* WIFI_PASSWORD = "VotreMotDePasseWiFi";  // Remplacez par votre mot de passe

// URL du serveur Raspberry Pi
// Trouvez l'IP de votre Pi avec : hostname -I
const char* SERVEUR_URL   = "http://192.168.1.100:5000";

// Ajustement de la sensibilité du microphone
#define SEUIL_PAROLE  1500    // Augmenter si trop sensible, diminuer si pas assez
```

---

## Installation des bibliothèques Arduino

Dans Arduino IDE, allez dans **Outils → Gérer les bibliothèques** et installez :

| Bibliothèque | Auteur | Version |
|-------------|--------|---------|
| ArduinoJson | Benoit Blanchon | >= 6.21.0 |
| ArduinoBase64 | Arturo Guadalupi | >= 1.0.0 |

> La bibliothèque `driver/i2s.h` est incluse dans le SDK ESP32 Arduino - pas d'installation supplémentaire.

---

## Instructions de compilation et flashage

### Via Arduino IDE

1. **Installez Arduino IDE** (version 2.x recommandée) : https://www.arduino.cc/en/software

2. **Ajoutez le support ESP32 :**
   - Fichier → Préférences → "URL de gestionnaire de cartes supplémentaires"
   - Ajoutez : `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Outils → Gestionnaire de cartes → Cherchez "esp32" → Installez "esp32 by Espressif Systems"

3. **Sélectionnez la carte :**
   - Outils → Type de carte → ESP32 Arduino → **"ESP32 Dev Module"**
   - Outils → Flash Size → **"4MB (32Mb)"**
   - Outils → Partition Scheme → **"Default 4MB with spiffs"**
   - Outils → CPU Frequency → **"240MHz (WiFi/BT)"**

4. **Sélectionnez le port :**
   - Branchez l'ESP32 via USB
   - Outils → Port → Sélectionnez le port COM (Windows) ou `/dev/ttyUSB0` (Linux/Mac)

5. **Téléversez :**
   - Cliquez sur → (Téléverser)
   - Si le téléversement échoue, maintenez le bouton BOOT pendant le démarrage du téléversement

### Via PlatformIO (alternative)

```ini
; platformio.ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
lib_deps =
    bblanchon/ArduinoJson@^6.21.0
    agdl/Base64@^1.0.0
monitor_speed = 115200
```

```bash
pio run --target upload
pio device monitor
```

---

## Utilisation

1. **Démarrez le serveur sur le Raspberry Pi :**
   ```bash
   export ANTHROPIC_API_KEY='sk-ant-api03-votre-cle'
   python3 /home/pi/sanctuaire-souverainete/raspberry-pi/server.py
   ```

2. **Alimentez l'ESP32** via USB ou batterie externe 5V.

3. **Attendez la connexion WiFi** (la LED clignote pendant la connexion).

4. **Appuyez sur le bouton** (GPIO 0 / bouton BOOT) pour activer l'écoute.

5. **Parlez** dans le microphone.

6. **Écoutez** la réponse de Souverain via le haut-parleur.

---

## Indicateurs LED

| Pattern LED | État | Signification |
|-------------|------|---------------|
| Éteinte | ATTENTE | Prêt, en attente d'appui bouton |
| Clignotement rapide (200ms) | ÉCOUTE | Enregistrement en cours |
| Clignotement lent (500ms) | TRAITEMENT | Envoi au Pi, attente réponse |
| Fixe allumée | PARLE | Lecture de la réponse audio |
| Clignotement très rapide (100ms) | ERREUR | Erreur réseau ou autre |
| 3 clignotements au démarrage | DÉMARRAGE | Système prêt |

---

## Dépannage

### L'ESP32 ne se connecte pas au WiFi
- Vérifiez `WIFI_SSID` et `WIFI_PASSWORD` dans le code
- L'ESP32 ne supporte que le WiFi 2.4 GHz (pas 5 GHz)
- Vérifiez la force du signal WiFi à l'emplacement de l'ESP32

### Aucun son capturé
- Vérifiez le câblage du INMP441, notamment la broche L/R reliée à GND
- Augmentez le timeout d'attente ou baissez `SEUIL_PAROLE`
- Ouvrez le moniteur série (115200 bauds) pour voir les logs

### Aucun son en sortie
- Vérifiez le câblage du MAX98357A et du haut-parleur
- Vérifiez que le haut-parleur est bien connecté à OUT+ et OUT- du MAX98357A

### Erreur HTTP / serveur non joignable
- Vérifiez que le serveur Flask tourne sur le Raspberry Pi
- Vérifiez l'adresse IP dans `SERVEUR_URL`
- Vérifiez que Pi et ESP32 sont sur le même réseau WiFi
- Testez avec : `curl http://192.168.1.100:5000/health` depuis un autre appareil

---

## Architecture du système complet

```
[UTILISATEUR]
      |
      | (parole)
      v
[ESP32 + INMP441]
      |
      | HTTP POST /assistant (audio WAV)
      v
[RASPBERRY PI - server.py]
      |
      |-- STT (Google Speech Recognition) --> Texte
      |
      |-- Claude API (Anthropic) --> Réponse texte
      |
      |-- TTS (espeak-ng) --> Audio WAV
      |
      | HTTP Response (JSON + audio base64)
      v
[ESP32 + MAX98357A + Haut-parleur]
      |
      | (parole)
      v
[UTILISATEUR]
```

---

*Sanctuaire de Souveraineté - "La technologie au service de l'autonomie personnelle"*
