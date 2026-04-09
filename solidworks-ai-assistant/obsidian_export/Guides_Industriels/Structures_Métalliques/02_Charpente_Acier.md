# Charpente Métallique — Calcul et Optimisation Matière

> **Niveau** : Ingénieur · **Domaine** : Structures · **CTM Industrie**

---

## 1. Profils Normalisés — Masses Linéiques

### Série IPE (poutrelles en I à ailes parallèles)
| Profil | h (mm) | b (mm) | t_w (mm) | t_f (mm) | Masse (kg/m) | I_y (cm⁴) |
|--------|--------|--------|----------|----------|--------------|-----------|
| IPE 80 | 80 | 46 | 3,8 | 5,2 | 6,00 | 80,1 |
| IPE 100 | 100 | 55 | 4,1 | 5,7 | 8,10 | 171 |
| IPE 120 | 120 | 64 | 4,4 | 6,3 | 10,4 | 318 |
| IPE 160 | 160 | 82 | 5,0 | 7,4 | 15,8 | 869 |
| IPE 200 | 200 | 100 | 5,6 | 8,5 | 22,4 | 1943 |
| IPE 240 | 240 | 120 | 6,2 | 9,8 | 30,7 | 3892 |
| IPE 300 | 300 | 150 | 7,1 | 10,7 | 42,2 | 8356 |

### Série HEA (colonnes à larges ailes)
| Profil | Masse (kg/m) | I_y (cm⁴) | I_z (cm⁴) | W_y (cm³) |
|--------|--------------|-----------|-----------|-----------|
| HEA 100 | 16,7 | 349 | 134 | 72,8 |
| HEA 160 | 30,4 | 1673 | 615 | 220 |
| HEA 200 | 42,3 | 3692 | 1336 | 388 |
| HEA 240 | 60,3 | 7763 | 2769 | 675 |
| HEA 300 | 88,3 | 18260 | 6310 | 1260 |

### Tubes creux rectangulaires RHS (EN 10210)
| Profil | Masse (kg/m) | A (cm²) | I_y (cm⁴) |
|--------|--------------|---------|-----------|
| RHS 60×40×3 | 4,35 | 5,54 | 27,2 |
| RHS 80×60×3 | 5,99 | 7,62 | 67,0 |
| RHS 100×50×4 | 9,22 | 11,7 | 138 |
| RHS 100×100×4 | 12,0 | 15,3 | 221 |
| RHS 150×100×5 | 18,0 | 22,9 | 783 |
| RHS 200×100×5 | 22,0 | 28,0 | 1535 |

---

## 2. Sélection de Profil selon Charge

### Critère résistance en flexion
$$\sigma = \frac{M_{Ed}}{W_{y}} \leq f_{yd}$$

où `f_yd = 235/1,0 = 235 MPa` pour S235 (classe 1/2)

### Critère déflexion (flèche)
$$\delta_{max} = \frac{5 \times q \times L^4}{384 \times E \times I_y} \leq \frac{L}{250}$$

**Exemple** : Poutre 6 m, charge uniforme 10 kN/m, S235
```
M_max = qL²/8 = 10×36/8 = 45 kN·m = 45 000 000 N·mm
W_y requis ≥ M_max/f_yd = 45 000 000/235 = 191 535 mm³ = 192 cm³
→ IPE 240 (W_y = 324 cm³) ✓ — marge 68%
```

---

## 3. Optimisation Débit de Barres

### Algorithme First-Fit Decreasing (FFD)
1. Trier les longueurs requises par ordre décroissant
2. Pour chaque pièce, chercher la première barre avec assez de place
3. Si aucune barre disponible, ouvrir une nouvelle barre
4. Inclure le trait de scie (kerf) = 3 mm par coupe

### Exemple pratique CTM
```
Longueurs requises (mm) : 3500, 3500, 2800, 2800, 2100, 1200, 800
Barres de 6000 mm, kerf = 3 mm

Tri décroissant : 3500, 3500, 2800, 2800, 2100, 1200, 800

Barre 1 : 3500 (reste: 2497) → 2100 (reste: 394) → PLEIN
Barre 2 : 3500 (reste: 2497) → 1200 (reste: 1294) → 800 (reste: 491)
Barre 3 : 2800 (reste: 3197) → 2800 → PLEIN (reste: 394)

Total : 3 barres × 6000 = 18 000 mm utilisés
Pièces : 3500+2100+3500+1200+800+2800+2800 = 16 700 mm
Efficacité : 16700/18000 = 92,8% ✓
```

---

## 4. Règles de Conception Accessible à la Soudure

### Accès torche MAG/TIG
- **Angle minimal** : 45° entre la torche et la surface
- **Dégagement minimal** : 80 mm pour torche standard, 50 mm pour torche spéciale
- **Double accès** : prévoir l'accès des deux côtés pour les soudures en K ou X

```
     Torche
      ╲ 45°
       ╲
────────╲──────────────── Profil
         ╲
    ◄─80mm─►
    dégagement mini
```

### Règle d'accessibilité des jonctions
- Distance entre 2 cordons parallèles > 5 mm (risque de concentrations de contraintes)
- Longueur de cordon minimale : 4× épaisseur du plus mince des éléments assemblés
- Éviter les croisements de cordons — repenser la géométrie

---

## 5. Assemblages Boulonnés — Boulonnerie Structurelle

### Classes de boulons
| Classe | Limite élastique (MPa) | Résistance (MPa) | Usage |
|--------|----------------------|-----------------|-------|
| 4.6 | 240 | 400 | Structures légères |
| 8.8 | 640 | 800 | Charpente courante |
| 10.9 | 900 | 1000 | Structures HM |

### Diamètre de perçage
| Boulon Ø | Perçage d | Jeu |
|----------|-----------|-----|
| M12 | 13 mm | 1 mm |
| M16 | 18 mm | 2 mm |
| M20 | 22 mm | 2 mm |
| M24 | 26 mm | 2 mm |

### Distance minimale bord-à-bord (EN 1993)
- `e1 ≥ 1,2d` (bord en direction de la force)
- `e2 ≥ 1,5d` (bord perpendiculaire)
- Entraxe min `p1 ≥ 2,2d`, max `p1 ≤ 14t`

---

## 6. Traçabilité Matière EN 1090

Pour les clients CTM (EDF, AREVA) soumis à EN 1090-2 :
- **Certificat matière 3.1** obligatoire (composition + propriétés mécaniques)
- Marquage des éléments avec repère de plan
- Journal de traçabilité soudure (WPS + soudeur qualifié)
- Rapport de contrôle visuel (VT) systématique

---

## 7. Cas Réel CTM — Châssis Machine Industrielle

**Client** : Fabricant machines-outils  
**Structure** : Châssis 2400×1600×900 mm, charge dynamique 5T  
**Matériau** : S355 JR (propriétés méca supérieures au S235)

**Profils** :
```
Longrines : RHS 100×100×6   (L=2400 mm × 2)  → 28,9 kg/m
Traverses : RHS 80×80×5     (L=1600 mm × 5)  → 18,4 kg/m
Pieds :     SHS 100×100×5   (H=900 mm × 4)   → 18,0 kg/m
Platines :  Flat 200×200×12 mm × 4           → 3,77 kg/pièce
```

**Calcul masse** :
```
Longrines : 28,9 × 2,4 × 2 = 138,7 kg
Traverses : 18,4 × 1,6 × 5 = 147,2 kg
Pieds :     18,0 × 0,9 × 4 =  64,8 kg
Platines :  3,77 × 4        =  15,1 kg
TOTAL :                        365,8 kg
```

---

## 8. Références

- EN 1993-1-1 : Eurocode 3 — Structures en acier
- EN 1090-2 : Exécution structures acier
- EN 10025-2 : Aciers construction S235/S355
- EN 10210 : Profils creux finition à chaud
- EN 10219 : Profils creux finition à froid
