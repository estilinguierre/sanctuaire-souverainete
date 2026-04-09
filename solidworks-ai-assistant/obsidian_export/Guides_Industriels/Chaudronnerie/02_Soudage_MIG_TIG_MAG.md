# Procédés de Soudage — MIG/TIG/MAG Industriel

> **Niveau** : Ingénieur · **Domaine** : Soudage · **CTM Industrie — KUKA KR16**

---

## 1. Procédés Utilisés chez CTM

| Procédé | Code ISO | Application CTM | Matériaux |
|---------|----------|-----------------|-----------|
| MIG | 131 | Structures légères, tôlerie | S235, Alu 5754 |
| MAG | 136 | Charpente, chaudronnerie | S235, S355 |
| TIG | 141 | Inox, qualité cosmétique | Inox 304/316L, Alu |
| Soudage robot | 135/136 | Séries, structures répétitives | S235, S355 (KUKA KR16) |

---

## 2. Préparations de Joints — NF EN ISO 9692

### Types de joints selon épaisseur

| Épaisseur T | Préparation | Angle | Jeu | Talon |
|-------------|-------------|-------|-----|-------|
| ≤ 3 mm | Bord vif | — | 0–1 mm | — |
| 3–6 mm | En I (bord vif) | — | 1–2 mm | — |
| 6–12 mm | En V | 60° total | 2 mm | 1–2 mm |
| 12–20 mm | En K ou X | 60° | 2 mm | 2 mm |
| > 20 mm | En U | R5 | 3 mm | 2 mm |

```
Préparation en V (6–12 mm) :
        ╲         ╱
         ╲  60°  ╱
          ╲     ╱
    ───────╲   ╱───────
            ╲ ╱
      talon─►◄ jeu
```

### Symboles AWS/EN ISO

| Symbole | Type joint | Utilisation |
|---------|------------|-------------|
| ▽ | Angle (fillet) | Assemblages en T, cornières |
| ⊓ | Bout à bout V | Panneaux, viroles |
| ○ | Bouchon | Renforts locaux |
| Z | Doublement | Recouvrements |

---

## 3. Matériaux d'Apport

### Aciers doux S235/S355
| Fil | Norme | Composition | Usage |
|-----|-------|-------------|-------|
| ER70S-6 | AWS A5.18 | C-Mn-Si | MAG universel CTM |
| E7018 | AWS A5.1 | Basique enrobé | MMA passes de finition |

### Inox 304L / 316L
| Fil | Norme | Nb carbone | Usage |
|-----|-------|------------|-------|
| ER308L | AWS A5.9 | < 0,03% | Inox 304L — TIG/MIG |
| ER316L | AWS A5.9 | < 0,03% | Inox 316L — milieux agressifs |

> 💡 Le "L" (Low carbon) est obligatoire pour l'inox destiné à des milieux corrosifs — évite la précipitation de carbures de chrome en ZAT.

### Aluminium 5754
| Fil | Norme | Alliage | Usage |
|-----|-------|---------|-------|
| ER5356 | AWS A5.10 | AlMg5 | MIG alu — résistance mécanique |
| ER4043 | AWS A5.10 | AlSi5 | MIG alu — moins de fissuration |

---

## 4. Paramètres de Soudage

### MAG fil plein S235/S355 (KUKA KR16 CTM)
| Épaisseur | Intensité (A) | Tension (V) | Vitesse fil (m/min) | Gaz |
|-----------|---------------|-------------|--------------------|----|
| 3 mm | 120–140 | 18–20 | 4,5–5,5 | Ar + CO₂ 18% |
| 4 mm | 150–180 | 20–22 | 5,5–7,0 | Ar + CO₂ 18% |
| 6 mm | 200–230 | 24–26 | 7,0–9,0 | Ar + CO₂ 18% |
| 8 mm | 240–280 | 26–28 | 9,0–11,0 | Ar + CO₂ 18% |

### TIG Inox 304L/316L
| Épaisseur | Intensité (A) | Tungstène Ø | Gaz endroit | Gaz envers |
|-----------|---------------|-------------|-------------|-----------|
| 1,5 mm | 60–80 | 1,6 mm | Ar pur 100% | Ar (purge) |
| 3 mm | 100–130 | 2,4 mm | Ar pur 100% | Ar (purge) |
| 5 mm | 150–180 | 3,2 mm | Ar pur 100% | Ar (purge) |

> ⚠️ Inox TIG : **purge obligatoire** côté envers — sans purge, la face envers s'oxyde en "sucre" (oxydation dramatique de la résistance à la corrosion).

---

## 5. Énergie de Soudage

$$E = \frac{U \times I \times 60}{v \times 1000} \quad \text{(kJ/mm)}$$

| Variable | Signification |
|----------|---------------|
| U | Tension arc (V) |
| I | Intensité (A) |
| v | Vitesse de soudage (mm/min) |

**Valeurs guides EN 1011** :
- Acier S235/S355 : 0,5–2,5 kJ/mm
- Inox 304/316L : 0,3–1,0 kJ/mm (limiter l'énergie pour réduire la ZAT)

---

## 6. Préchauffage — EN ISO 13916

Le préchauffage est requis pour les aciers > S235 ou les grandes épaisseurs.

| Matériau | Épaisseur | T° préchauffage | Méthode |
|----------|-----------|-----------------|---------|
| S235 | < 25 mm | Pas requis | — |
| S355 | 10–25 mm | 50–100°C | Décapeur ou rampe gaz |
| S355 | > 25 mm | 100–150°C | Rampe à gaz + thermocouple |
| S690 | Tout | 150–200°C | Four ou rampe induction |

---

## 7. Soudage Robot KUKA KR16 — CTM

**Robot** : KUKA KR16 R2010 (portée 2010 mm, charge 16 kg)  
**Poste** : MAG/MIG fil ER70S-6, Ø1,2 mm  
**Gaz** : ArCO₂ 18%, débit 15 L/min

### Programmation robot CTM
```
1. Teach-in des points de soudage en mode manuel
2. Définition vitesse parcours : 400–600 mm/min
3. Paramètres MAG : I=180A, U=22V, fil=6,5 m/min
4. Séquence : pointage → soudure complète en plusieurs passes
5. Post-programme : contrôle visuel + ressuage (PT) si requis
```

> 💡 Pour les séries > 20 pièces, le robot KUKA est 3× plus rapide que le soudage manuel et garantit une reproductibilité du profil de cordon.

---

## 8. Contrôle Qualité Soudure

| Méthode | Code | Détecte | Quand utiliser |
|---------|------|---------|----------------|
| Visuel (VT) | EN 970 | Défauts surface | Systématique |
| Ressuage (PT) | EN 571 | Fissures surface | Inox, acier critique |
| Magnétoscopie (MT) | EN 1290 | Fissures sous-surface | Acier ferritique |
| Ultrasons (UT) | EN 1712 | Inclusions, soufflures | Soudures structurelles |
| Radiographie (RT) | EN 1435 | Volume complet | Pression, nucléaire |

### Niveaux d'acceptation EN ISO 5817
- **Classe B** : Exigences strictes (pression, sécurité)
- **Classe C** : Exigences intermédiaires (structures courantes)
- **Classe D** : Exigences faibles (structures non critiques)

---

## 9. Erreurs Fréquentes

| Défaut | Code EN | Cause | Remède |
|--------|---------|-------|--------|
| Manque de fusion | 401 | Vitesse trop rapide | Réduire vitesse, augmenter I |
| Soufflures | 2011 | Humidité, rouille | Sécher les pièces, nettoyer |
| Fissure à chaud | 100 | Alliage inadapté | Changer fil d'apport |
| Projection | 1811 | Tension trop élevée | Réduire tension 1–2V |
| Bain débordant | — | Intensité trop élevée | Réduire I, augmenter vitesse |

---

## 10. Qualification WPS/WPQR

Pour CTM (clients EDF, AREVA) :
- **WPS** (Welding Procedure Specification) : Document interne CTM par procédé/matériau
- **WPQR** (Welding Procedure Qualification Record) : Éprouvette qualifiée EN ISO 15614-1
- **Soudeurs certifiés** : EN ISO 9606-1 (acier) / EN ISO 9606-2 (aluminium)

---

## 11. Références

- NF EN ISO 9692-1 : Soudage et techniques connexes — préparation joints
- NF EN ISO 5817 : Niveaux de qualité pour les défauts
- EN ISO 15614-1 : Qualification des modes opératoires de soudage
- EN ISO 9606-1 : Qualification des soudeurs — acier
- KUKA KR16 R2010 : Programming Manual v3.3
