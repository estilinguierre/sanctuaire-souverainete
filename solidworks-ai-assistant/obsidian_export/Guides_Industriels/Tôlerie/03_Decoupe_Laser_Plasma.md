# Découpe Laser et Plasma — Tôlerie CTM

> **Machines CTM** : TRUMPF TruLaser 3030 (CO2 4 kW) · Format 3000×1500 mm

---

## 1. TRUMPF TruLaser 3030 — Spécifications

| Paramètre | Valeur |
|-----------|--------|
| Source laser | CO2, 4 kW |
| Format plateau | 3000 × 1500 mm |
| Épaisseur max acier | 20 mm |
| Épaisseur max inox | 12 mm |
| Épaisseur max alu | 8 mm |
| Précision positionnement | ±0,05 mm |
| Vitesse max | 140 m/min |

---

## 2. Paramètres de Coupe par Matériau

### Acier S235 / S355
| Épaisseur | Vitesse (m/min) | Puissance (%) | Gaz | Pression (bar) |
|-----------|----------------|---------------|-----|----------------|
| 1 mm | 12,0 | 60 | O₂ | 4 |
| 2 mm | 7,5 | 75 | O₂ | 3,5 |
| 3 mm | 5,0 | 85 | O₂ | 3 |
| 4 mm | 3,5 | 90 | O₂ | 2,5 |
| 6 mm | 2,0 | 100 | O₂ | 2 |
| 10 mm | 1,0 | 100 | O₂ | 1,5 |

### Inox 304 / 316L
| Épaisseur | Vitesse (m/min) | Gaz | Note |
|-----------|----------------|-----|------|
| 1 mm | 8,0 | N₂ | Bord brillant sans oxydation |
| 2 mm | 4,5 | N₂ | |
| 3 mm | 3,0 | N₂ | |
| 4 mm | 2,0 | N₂ | Pression N₂ 12–16 bar |
| 6 mm | 1,0 | N₂ | |

> 💡 Inox : toujours découper avec N₂ (azote) pour éviter la coloration thermique sur les bords. L'O₂ oxyde et brûle la surface.

### Aluminium 5754
| Épaisseur | Vitesse (m/min) | Gaz | Note |
|-----------|----------------|-----|------|
| 1,5 mm | 10,0 | N₂ | Protéger film plastique |
| 2 mm | 7,0 | N₂ | |
| 3 mm | 4,5 | N₂ | |
| 4 mm | 2,5 | N₂ | Surveiller bavures |

---

## 3. DXF Propre pour Découpe Laser

### Règles de préparation DXF

1. **Contour fermé** : Pas de gaps, pas de segments dupliqués
2. **Pas d'entités cachées** : Supprimer les features cachées avant export
3. **Textes sur couche séparée** : Ne jamais laisser du texte sur la couche DECOUPE
4. **Polylignes préférées** aux segments isolés
5. **Pas d'arcs < 0,5 mm** : Minimiser pour éviter les micro-arrêts
6. **Unités millimètres** : Vérifier avant export

### Structure couches CTM
```
DECOUPE        → contour de découpe (trait plein)
PLIS_MONTANT   → lignes de pli haut (tiret long)
PLIS_DESCENDANT→ lignes de pli bas (tiret court)
GRAVURE        → repères, n° pièce
INTERIEUR      → découpes intérieures (trous, fenêtres)
```

### Export depuis SolidWorks
```
Flat Pattern → Clic droit → Exporter en DXF/DWG
Options :
  ☑ Inclure les lignes d'esquisse (plis)
  ☑ Lignes de pli marquées séparément
  ☑ Supprimer les lignes masquées
  Format : DXF R2010 (compatible TRUMPF TruTops)
```

---

## 4. Nesting (Imbrication des Pièces)

L'imbrication optimise l'utilisation du format de tôle (3000×1500 mm).

### Règles d'imbrication CTM
- **Distance bord-à-bord** : 5 mm minimum entre pièces
- **Distance bord tôle** : 10 mm minimum (zone de bridage)
- **Orientation des fibres** : Aligner le laminage dans le sens principal si reqnie
- **Micro-joints** : 2 mm — maintiennent les petites pièces dans le reste

### Taux d'utilisation typiques CTM
| Type de pièce | Taux utilisation |
|---------------|-----------------|
| Pièces rectangulaires | 85–92% |
| Pièces complexes | 70–80% |
| Mix petites/grandes | 75–85% |

---

## 5. Zone Thermique Affectée (ZTA)

La découpe laser génère une ZTA sur les bords — zone de métal écroui/trempé.

| Matériau | ZTA (µm) | Impact |
|----------|----------|--------|
| S235 | 50–150 | Faible — ok pour pliage direct |
| S355 | 100–200 | Vérifier si pliage proche du bord |
| Inox 304 | 30–80 (N₂) | Minime avec azote |
| Alu 5754 | 80–120 | Surveiller micro-fissures |

> ⚠️ Si un pli est prévu à moins de 5 mm d'un bord découpé laser, augmenter le rayon de pli de 20 % pour éviter les fissures en ZTA.

---

## 6. Finitions de Bords

| Finition | Méthode | Rugosité Ra |
|----------|---------|-------------|
| Laser brut (O₂) | Aucune | Ra 6,3–12,5 µm |
| Laser brut (N₂) | Aucune | Ra 3,2–6,3 µm |
| Ébavurage manuel | Lime/meule | Ra 3,2–6,3 µm |
| Chanfreinage | Machine | Angle 45°, 0,5–2 mm |
| Rectification | Meuleuse | Ra 1,6 µm |

---

## 7. Erreurs Fréquentes

| Erreur | Cause | Solution |
|--------|-------|----------|
| Bords brûlés (acier) | Vitesse trop lente | Augmenter vitesse 10% |
| Bord strié (inox) | Pression N₂ insuffisante | Augmenter à 14 bar |
| Micro-arrêts | Arcs trop petits dans DXF | Simplifier la géométrie |
| Pièces non découpées | Contour DXF non fermé | Vérifier gaps dans l'esquisse |
| Bavures alu | Température trop élevée | Réduire puissance 5% |

---

## 8. Références

- TRUMPF TruLaser 3030 : Manuel opérateur v4.2
- NF EN ISO 9013 : Découpage thermique — classification
- SolidWorks 2025 : Export DXF Sheet Metal
