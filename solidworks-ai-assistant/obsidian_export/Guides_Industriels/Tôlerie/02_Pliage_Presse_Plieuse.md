# Calcul de Pliage — Presse-Plieuse AMADA HFE 100-30

> **Niveau** : Ingénieur · **Domaine** : Tôlerie / Fabrication

---

## 1. Formules Fondamentales

### Bend Allowance (BA) — Allongement au pliage

$$BA = \frac{\pi}{180} \times \alpha \times (R + K \times T)$$

| Variable | Signification | Unité |
|----------|---------------|-------|
| α | Angle de pliage | degrés |
| R | Rayon intérieur | mm |
| K | K-factor (axe neutre) | sans unité |
| T | Épaisseur tôle | mm |

**Exemple** : S235 ép. 2 mm, R=3 mm, α=90°, K=0,40
```
BA = (π/180) × 90 × (3 + 0,40 × 2)
BA = 1,5708 × 3,80
BA = 5,969 mm ≈ 5,97 mm
```

---

### Outside Setback (OSSB) — Retrait extérieur

$$OSSB = \tan\!\left(\frac{\alpha}{2}\right) \times (R + T)$$

**Exemple** : α=90°, R=3, T=2
```
OSSB = tan(45°) × (3+2) = 1,0 × 5 = 5,00 mm
```

---

### Bend Deduction (BD) — Déduction de pliage

$$BD = 2 \times OSSB - BA$$

```
BD = 2 × 5,00 − 5,97 = 4,03 mm
```

> 💡 **Atelier** : Le plieur utilise la BD pour calculer les longueurs de brides depuis la cote extérieure. `L_bride_réelle = L_cote_extérieure − BD/2`

---

### Développé total (multi-plis)

$$L_{développé} = \sum_{i=1}^{n} L_{bride_i} + \sum_{j=1}^{m} BA_j$$

Pour une pièce en U (2 plis à 90°) :
```
L_dev = L1 + BA1 + L_fond + BA2 + L2
```

---

## 2. Tables V-Opening AMADA HFE 100-30

La presse-plieuse AMADA HFE 100-30 (100T, 3050 mm) utilise des matrices en V. L'ouverture V détermine le rayon de pli effectif.

| Épaisseur T (mm) | V-Opening recommandé | Rayon obtenu (approx.) | Force requise (kN/m) |
|------------------|---------------------|----------------------|---------------------|
| 0,8 | 6 mm | 0,7 mm | 120 |
| 1,0 | 8 mm | 0,9 mm | 140 |
| 1,5 | 10 mm | 1,2 mm | 180 |
| 2,0 | 12 mm | 1,8 mm | 230 |
| 3,0 | 18 mm | 2,5 mm | 320 |
| 4,0 | 25 mm | 3,5 mm | 450 |
| 5,0 | 30 mm | 4,5 mm | 580 |
| 6,0 | 35 mm | 5,5 mm | 720 |

*Règle générale : V-opening ≈ 6 × T pour acier doux*

> ⚠️ **Inox et Alu** : Majorer le V-opening de 20–30 % pour réduire le retour élastique (springback).

---

## 3. Séquence de Pliage Optimale

### Règles de priorité
1. **Plis intérieurs en premier** (les plus proches du centre)
2. **Éviter les collisions** outil / pièce à chaque étape
3. **Plis longs avant plis courts** (répartition effort)
4. **Symétrie** : plier les côtés opposés alternativement

### Exemple — Boîtier électrique 400×300×100 mm

```
Étape 1 : Plis côtés longs (400 mm) — bride 100 mm
    → Pas de collision, accès libre
Étape 2 : Plis côtés courts (300 mm) — bride 100 mm
    → Vérifier dégagement côtés déjà pliés
Étape 3 : Retournement pièce
Étape 4 : Éventuelles brides de renfort
```

> 💡 **Outil SolidWorks** : Utiliser la fonction **Séquence de pliage** (Bend Order) dans la PropertyManager du Flat Pattern. Numéroter chaque pli.

---

## 4. Retour Élastique (Springback)

Après le pliage, la pièce "reprend" partiellement. Facteurs de springback par matériau :

| Matériau | Springback typique | Compensation |
|----------|-------------------|--------------|
| S235 | 1–2° | Sur-plier de 1,5° |
| S355 | 2–3° | Sur-plier de 2,5° |
| Inox 304 | 3–5° | Sur-plier de 4° |
| Alu 5754 | 2–4° | Sur-plier de 3° |

---

## 5. Outillage Poinçon/Matrice Standard CTM

| Référence AMADA | Type poinçon | Type matrice | Usage |
|-----------------|--------------|--------------|-------|
| 1SPK-86 | 86° | V8 | Tôles minces < 2 mm |
| 2SPK-88 | 88° | V12 | Usage courant 2–4 mm |
| 1SPK-90 | 90° | V16 | Profils épais 4–6 mm |
| Hémming | Hémming | Plat | Ourlets / hems |

---

## 6. Erreurs Fréquentes Atelier

| Erreur | Symptôme | Cause | Solution |
|--------|----------|-------|----------|
| Angle incorrect | Pièce hors tolérances | Springback non compensé | Calibrer l'angle de sur-pliage |
| Marques de matrice | Traces V sur face visible | V trop petit | Utiliser V plus large ou protection |
| Rupture bride | Fissure sur rayon | R trop petit ou matière fragilisée | Augmenter R, vérifier dureté tôle |
| Bride voilée | Torsion en sortie | Appui non parallèle | Régler butées et presseur |
| Décalage longitudinal | Bride non droite | Butée mal positionnée | Recalibrer butée arrière NC |

---

## 7. Cas Réel CTM — Trémie AREVA

**Pièce** : Panneau latéral trémie collecte, S235 ép. 3 mm  
**Plis** : 4 plis à 90°, longueur 1200 mm  
**Calcul** :
```
K = 0,42 (S235, 3 mm)
R = 3 mm (V18 AMADA)
BA = (π/180) × 90 × (3 + 0,42 × 3) = 1,5708 × 4,26 = 6,69 mm
BD = 2 × tan(45°) × (3+3) − 6,69 = 12 − 6,69 = 5,31 mm

Développé = 200 + 6,69 + 800 + 6,69 + 200 = 1213,38 mm
→ Arrondi à 1214 mm (+ 0,5 mm tolérance découpe laser)
```

---

## 8. Configuration SolidWorks — Table AMADA

Fichier de table de pliage `.btl` pour AMADA :
```
Chemin : C:\SolidWorks\CTM\Tables_Pliage\AMADA_HFE100.btl
Contenu : K-factors par matériau + épaisseur
Associer via : Sheet Metal → Gauge Table → parcourir
```

> ⚠️ Toujours vérifier que la table active dans SW correspond à l'outillage monté sur la machine avant de lancer la production.

---

## 9. Références Normatives

- EN ISO 2768-1 : Tolérances générales de forme
- NF EN 10130 : Tôles laminées à froid
- AMADA Bending Manual HFE Series
- SolidWorks 2025 : Sheet Metal Bend Allowance
