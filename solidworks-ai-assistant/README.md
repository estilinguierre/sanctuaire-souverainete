# Assistant SolidWorks IA — CTM Industrie

Assistant IA vocal pour SolidWorks, spécialisé en tôlerie industrielle, chaudronnerie et structures métalliques.  
CTM Industrie · Dives-sur-Mer, Normandie.

---

## Architecture

```
Browser (React/Vite :5173)
       ↓ REST + SSE + Web Speech API (fr-FR)
FastAPI Backend (:8000)
  ├── ChromaDB (base vectorielle locale)
  ├── OpenAI GPT-4 Turbo + Whisper
  └── httpx → MCP Server (:3001)
              ↓ winax COM (Windows uniquement)
         SolidWorks Desktop
```

**Note importante** : Le MCP server doit tourner en bare-metal sur la machine Windows où SolidWorks est installé. `winax` (COM automation) ne fonctionne pas dans Docker Linux.

---

## Démarrage rapide

### Prérequis
- Python 3.11+
- Node.js 18+
- Docker + Docker Compose (optionnel)
- Clé API OpenAI

### 1. Backend

```bash
cd backend
cp .env.example .env        # remplir OPENAI_API_KEY
pip install -r requirements.txt
uvicorn app.main:app --reload
# → http://localhost:8000/api/v1/health
```

### 2. MCP Server (Windows + SolidWorks)

```bash
cd mcp-server
cp .env.example .env
npm install
# Mode mock (Linux/test) :
MOCK_MODE=true npm run dev
# Mode live (Windows + SolidWorks) :
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### 4. Docker (backend + frontend)

```bash
cp .env.example .env        # remplir OPENAI_API_KEY
docker compose up --build
```

---

## Génération de la base de connaissances

```bash
cd backend

# 1. Générer les guides industriels (GPT-4)
python scripts/generate_industrial_guides.py

# 2. (Optionnel) Scraper la doc SolidWorks officielle
python scripts/scrape_docs.py

# 3. Indexer dans ChromaDB
python scripts/create_embeddings.py
```

---

## Tests

```bash
# Backend (unit tests — aucune clé API requise)
cd backend
pip install pytest
pytest tests/test_industrial_calculations.py -v

# MCP (integration tests — MOCK_MODE)
MOCK_MODE=true node mcp-server/dist/index.js &
python backend/scripts/test_mcp_integration.py
```

---

## Fonctionnalités

| Fonctionnalité | Statut | Notes |
|----------------|--------|-------|
| Chat vocal (Web Speech API fr-FR) | ✅ | Navigateur Chromium requis |
| Chat texte + streaming SSE | ✅ | |
| Transcription Whisper | ✅ | Nécessite OPENAI_API_KEY |
| Calcul Bend Allowance | ✅ | 5 matériaux, formule BA |
| Calcul masse weldment | ✅ | 60+ profils normalisés |
| Optimisation débit barre | ✅ | Algorithme FFD |
| Vérification fabricabilité | ✅ | Rayon, bride, trou-pli |
| RAG sur guides métier | ✅ | Après generate + embeddings |
| 90+ outils SolidWorks MCP | ✅ (mock) | Live sur Windows |
| Export DXF auto | ✅ (mock) | |

---

## Structure du projet

```
solidworks-ai-assistant/
├── backend/              Python FastAPI + ChromaDB + OpenAI
├── mcp-server/           Node.js TypeScript + 90 outils SolidWorks
├── frontend/             React 18 + Vite + Tailwind CSS
├── obsidian_export/      Guides Markdown (Obsidian / Notion)
└── docker-compose.yml
```

---

## Machines CTM Industrie

| Machine | Modèle | Capacité |
|---------|--------|----------|
| Presse-plieuse | AMADA HFE 100-30 | 100T, 3050 mm |
| Découpe laser | TRUMPF TruLaser 3030 | CO2 4kW, 3000×1500 mm |
| Soudage robot | KUKA KR16 R2010 | MIG/MAG, portée 2010 mm |

---

*CTM Industrie — Dives-sur-Mer, Normandie*  
*Assistant développé sur branche `claude/solidworks-ai-assistant-ctm-wyseR`*
