"""
Generates expert-level industrial Markdown guides via GPT-4 Turbo.
Run once via scripts/generate_industrial_guides.py
"""
from __future__ import annotations

from pathlib import Path
from typing import List

from openai import AsyncOpenAI

from app.config import get_settings
from app.utils.logger import get_logger

logger = get_logger("ctm.content_generator")
settings = get_settings()

GUIDES_DIR = Path("data/industrial_guides")
GUIDES_DIR.mkdir(parents=True, exist_ok=True)

GUIDE_SYSTEM_PROMPT = """Tu es un formateur industriel senior et ingénieur expert en métallurgie, \
tôlerie industrielle, chaudronnerie et structures métalliques. \
Tu maîtrises SolidWorks 2025 au niveau expert.

Génère un guide technique complet en Markdown structuré, niveau ingénieur, avec :
- Titres hiérarchisés H1/H2/H3
- Tables Markdown pour données techniques
- Formules mathématiques (LaTeX inline)
- Schémas ASCII pour illustrations
- Diagrammes Mermaid pour workflows
- Exemples industriels réels CTM Industrie (Normandie)
- Erreurs fréquentes et solutions
- Astuces terrain identifiées avec 💡
- Références normatives (EN ISO)

Contenu adapté à Obsidian/Notion. Minimum 3000 mots. Pas de simplification excessive."""


GUIDE_TOPICS = [
    {
        "slug": "tolerie/01_Bases_Tolerie_SolidWorks",
        "title": "Bases de la Tôlerie Industrielle dans SolidWorks",
        "prompt": (
            "Génère un guide complet sur la tôlerie industrielle dans SolidWorks.\n"
            "Couvre : Feature Sheet Metal (Base-Flange, Edge Flange, Miter Flange, Hem, Jog), "
            "paramétrage matière et K-factor, table de pliage AMADA, dépliés (Flat Pattern), "
            "export DXF pour laser TRUMPF TruLaser 3030, nomenclature tôle.\n"
            "Inclure table K-factor S235/S355/Inox304/316L/Alu5754 par épaisseur, "
            "table rayons minimum, workflow complet Sketch→Tôle→Déplié→DXF."
        ),
        "operation_type": "tolerie",
    },
    {
        "slug": "tolerie/02_Pliage_Presse_Plieuse",
        "title": "Calcul de Pliage — Presse-Plieuse AMADA",
        "prompt": (
            "Génère un guide sur le calcul de pliage pour presse-plieuse industrielle.\n"
            "Couvre : formule Bend Allowance (BA = π/180 × α × (R+K×T)), "
            "Bend Deduction (BD = 2×OSSB−BA), OSSB = tan(α/2)×(R+T), "
            "développé total multi-plis, tables V-opening AMADA, "
            "séquence de pliage optimale, collisions outil/pièce, "
            "spécifications presse AMADA HFE 100-30 (100T, 3050mm), "
            "jeu de poinçon/matrice standard 60°/88°/90°. "
            "Exemples CTM : cornière, capot, platine."
        ),
        "operation_type": "tolerie",
    },
    {
        "slug": "tolerie/03_Decoupe_Laser_Plasma",
        "title": "Découpe Laser et Plasma — Tôlerie CTM",
        "prompt": (
            "Guide sur la découpe laser CO2 et plasma pour tôlerie industrielle.\n"
            "Couvre : spécifications TRUMPF TruLaser 3030 (CO2 4kW, format 3000×1500mm), "
            "DXF propre pour découpe (couches, entités, textes), "
            "puissance/vitesse selon matériau/épaisseur (S235, Inox, Alu), "
            "zones de zone thermique affectée (ZTA), "
            "imbrication pièces (nesting) pour optimisation matière, "
            "brides et micro-joints, finitions bords."
        ),
        "operation_type": "tolerie",
    },
    {
        "slug": "chaudronnerie/01_Chaudronnerie_SolidWorks",
        "title": "Chaudronnerie Industrielle dans SolidWorks",
        "prompt": (
            "Guide expert sur la chaudronnerie dans SolidWorks.\n"
            "Couvre : pièces de forte épaisseur (6-30mm), viroles (cylindres), "
            "cônes, fonds bombés (torosphériques, elliptiques, hémisphériques), "
            "transition rectangulaire→rond, segmentation surfaces non développables, "
            "méthode Loft Surface pour transitions complexes, "
            "conversion Surface→Tôle, dépliage manuel, "
            "traçage tôlier sur plat, gabarits soudure. "
            "Norme PED (Directive Équipements sous Pression), EN 13445."
        ),
        "operation_type": "chaudronnerie",
    },
    {
        "slug": "chaudronnerie/02_Soudage_MIG_TIG_MAG",
        "title": "Procédés de Soudage — MIG/TIG/MAG Industriel",
        "prompt": (
            "Guide technique sur les procédés de soudage pour chaudronnerie.\n"
            "Couvre : MIG (135), MAG (136), TIG (141), soudage orbital, "
            "préparations de joints selon NF EN ISO 9692 (en V, en K, en U, angles bords), "
            "matériaux d'apport (ER70S-6, ER308L, ER5356), "
            "paramètres soudage (intensité, vitesse, énergie kJ/mm), "
            "préchauffage EN ISO 13916, contrôle qualité (VT, PT, UT, RT), "
            "soudage robot KUKA KR16 chez CTM, qualification WPQR/WPS."
        ),
        "operation_type": "chaudronnerie",
    },
    {
        "slug": "structures/01_Weldments_SolidWorks",
        "title": "Structures Soudées (Weldments) dans SolidWorks",
        "prompt": (
            "Guide complet Weldments SolidWorks pour structures métalliques.\n"
            "Couvre : activation module Weldments, 3D Sketch (lignes, plans), "
            "Structural Member (bibliothèque profils ISO), Trim/Extend auto, "
            "End Cap, Gusset (gousset), Weld Bead (cordon), "
            "Cut List (liste de coupe) et propriétés custom, "
            "BOM soudure, création bibliothèque profils CTM personnalisée, "
            "mise en plan avec nomenclature, export DXF profilés."
        ),
        "operation_type": "structures",
    },
    {
        "slug": "structures/02_Charpente_Acier",
        "title": "Charpente Métallique — Calcul et Optimisation",
        "prompt": (
            "Guide sur la charpente métallique et l'optimisation matière.\n"
            "Couvre : profils normalisés EN 10025 (IPE, HEA, HEB, UPN, RHS, SHS), "
            "masses linéiques (kg/m) et sélection selon charges, "
            "optimisation débit barre (First-Fit Decreasing bin packing), "
            "longueurs barres standard 6m/12m, "
            "calcul masse totale, coût matière, "
            "assemblage boulonné (EN 1090), "
            "assemblage soudé (EN 1011), "
            "règles accessibilité soudure (angle 45° minimum, dégagement torche), "
            "portique levage CTM — cas concret."
        ),
        "operation_type": "structures",
    },
    {
        "slug": "configuration_sw/01_Parametrage_CTM",
        "title": "Configuration SolidWorks CTM Industrie",
        "prompt": (
            "Guide de configuration SolidWorks pour CTM Industrie.\n"
            "Couvre : templates pièce/assemblage/mise en plan (unités mm, matière, propriétés), "
            "cartouche CTM (référence, matière, masse, révision, approbation), "
            "styles de cotation ISO, vues standard (3 vues + isométrique), "
            "table de pliage AMADA (fichier .btl), "
            "bibliothèque matériaux CTM (S235/S355/Inox/Alu avec densité), "
            "macros VBA utiles (export DXF auto, PDF plan, BOM Excel), "
            "bonnes pratiques sketch (degrés liberté, relations, symétries), "
            "gestion configurations multi-épaisseurs."
        ),
        "operation_type": "configuration",
    },
]


async def generate_guide(topic: dict) -> Path:
    """Generate a single guide and save to disk."""
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    out_path = GUIDES_DIR / f"{topic['slug']}.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if out_path.exists():
        logger.info(f"Guide already exists: {out_path}")
        return out_path

    logger.info(f"Generating guide: {topic['title']}")

    response = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": GUIDE_SYSTEM_PROMPT},
            {"role": "user", "content": topic["prompt"]},
        ],
        temperature=0.4,
        max_tokens=4000,
    )

    content = response.choices[0].message.content or ""
    out_path.write_text(content, encoding="utf-8")
    logger.info(f"Saved: {out_path} ({len(content)} chars)")
    return out_path


async def generate_all_guides() -> List[Path]:
    """Generate all industrial guides."""
    paths = []
    for topic in GUIDE_TOPICS:
        path = await generate_guide(topic)
        paths.append(path)
    return paths
