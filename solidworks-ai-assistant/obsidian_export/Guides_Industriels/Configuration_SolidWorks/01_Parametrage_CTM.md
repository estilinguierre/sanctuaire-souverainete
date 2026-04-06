# Configuration SolidWorks CTM Industrie

> **Niveau** : Ingénieur · **Domaine** : Configuration SolidWorks 2025

---

## 1. Structure des Fichiers CTM

```
C:\SolidWorks_CTM\
├── Templates\
│   ├── ctm_piece.prtdot          ← template pièce standard
│   ├── ctm_assemblage.asmdot     ← template assemblage
│   ├── ctm_plan_A3.drwdot        ← mise en plan A3
│   ├── ctm_plan_A4.drwdot        ← mise en plan A4
│   └── ctm_tolerie.prtdot        ← template tôlerie (K-factor + table)
│
├── Bibliotheques\
│   ├── Materiaux\
│   │   └── CTM_Materiaux.sldmat  ← bibliothèque matériaux CTM
│   ├── Profils_Soudure\
│   │   ├── ISO\                  ← profils ISO standard
│   │   └── CTM-Custom\           ← profils spéciaux CTM
│   └── Composants\
│       └── Visserie\             ← vis, écrous, rondelles standard
│
├── Tables_Pliage\
│   └── AMADA_HFE100.btl          ← table K-factor AMADA
│
└── Macros\
    ├── Export_DXF.swp             ← export DXF Flat Pattern auto
    ├── Export_PDF.swp             ← export PDF plan auto
    └── Remplir_Cartouche.swp      ← remplissage propriétés auto
```

---

## 2. Template Pièce — ctm_piece.prtdot

### Paramètres de base
```
Outils → Options → Propriétés du document :
├── Unités : MMGS (mm, gramme, seconde)
├── Standard de dessin : ISO
├── Tolérances : EN ISO 2768-mK (standard CTM)
└── Précision décimale : 2 (cotation), 3 (masse)
```

### Propriétés personnalisées à créer
```
Outils → Propriétés personnalisées :
┌─────────────────┬──────────────────────────────────┐
│ Propriété        │ Valeur / Lien                    │
├─────────────────┼──────────────────────────────────┤
│ Référence        │ SW-File Name (automatique)       │
│ Description      │ [saisir manuellement]            │
│ Matière          │ SW-Material (automatique)        │
│ Masse_kg         │ SW-Mass (automatique, en kg)     │
│ Revision         │ A                                │
│ Date_Création    │ SW-Created Date                  │
│ Dessinateur      │ Ricardo                          │
│ Approuvé_par     │ [saisir manuellement]            │
│ Client           │ [saisir manuellement]            │
└─────────────────┴──────────────────────────────────┘
```

---

## 3. Template Tôlerie — ctm_tolerie.prtdot

Configuration Sheet Metal par défaut :
```
Outils → Options → Propriétés du document → Tôlerie :
├── Épaisseur par défaut : 2,0 mm
├── Rayon de pli par défaut : 2,0 mm
├── Table de pliage : C:\SolidWorks_CTM\Tables_Pliage\AMADA_HFE100.btl
├── K-factor par défaut : 0,42
└── Matière par défaut : S235 JR (depuis bibliothèque CTM)
```

---

## 4. Cartouche CTM (Mise en Plan)

### Champs du cartouche lié aux propriétés
```
Cartouche A3 (270×190 mm zone dessin) :
┌──────────────────────────────────────────────────┐
│ Titre : $PRPSHEET:"Description"                  │
│ Réf   : $PRPSHEET:"Référence"                    │
│ Mat.  : $PRPSHEET:"Matière"                      │
│ Masse : $PRPSHEET:"Masse_kg" kg                  │
│ Éch.  : $PRPSHEET:"SW-Sheet Scale"               │
│ Rév.  : $PRPSHEET:"Revision"                     │
│ Dessi.: $PRPSHEET:"Dessinateur"                  │
│ Date  : $PRPSHEET:"Date_Création"                │
│ Appro.: $PRPSHEET:"Approuvé_par"                 │
├──────────────────────────────────────────────────┤
│  [LOGO CTM]    CTM INDUSTRIE    Dives-sur-Mer     │
└──────────────────────────────────────────────────┘
```

> 💡 Lier chaque champ de cartouche à une propriété de fiche technique via `$PRPSHEET`. Si la propriété n'existe pas, le champ reste vide (pas d'erreur).

---

## 5. Bibliothèque Matériaux CTM

Fichier `CTM_Materiaux.sldmat` — matériaux avec propriétés réelles :

| Matériau | Densité (kg/m³) | E (MPa) | Re (MPa) | Rm (MPa) |
|----------|-----------------|---------|----------|----------|
| S235 JR | 7850 | 210 000 | 235 | 360–510 |
| S355 JR | 7850 | 210 000 | 355 | 470–630 |
| Inox 304L | 7900 | 193 000 | 170 | 485 |
| Inox 316L | 7980 | 193 000 | 170 | 485 |
| Alu 5754 H111 | 2660 | 68 000 | 80 | 190 |

### Ajouter un matériau CTM
```
1. Outils → Bibliothèques de matériaux
2. Clic droit sur "CTM Matériaux" → Nouveau matériau
3. Renseigner : nom, catégorie, densité, module Young
4. Sauvegarder le fichier .sldmat
```

---

## 6. Macros VBA CTM — Export Automatique

### Macro Export DXF (Flat Pattern)
```vba
' Export_DXF.swp — CTM Industrie
Sub ExportDXFFlatPattern()
    Dim swApp As Object
    Dim swDoc As Object
    Dim sPath As String
    
    Set swApp = Application.SldWorks
    Set swDoc = swApp.ActiveDoc
    
    If swDoc Is Nothing Then
        MsgBox "Aucun document actif."
        Exit Sub
    End If
    
    ' Construire le chemin DXF dans le même dossier que la pièce
    sPath = Left(swDoc.GetPathName, Len(swDoc.GetPathName) - 7) & ".dxf"
    
    ' Export DXF Flat Pattern
    Dim exportData As Object
    Set exportData = swApp.GetExportFileData(1)
    exportData.SetSheetMetalOptions 1, 1, 0, 0, 0, 0  ' flatten + bend lines
    
    Dim bRet As Boolean
    bRet = swDoc.Extension.SaveAs(sPath, 0, 0, exportData, 0, 0)
    
    If bRet Then
        MsgBox "DXF exporté : " & sPath
    Else
        MsgBox "Échec export DXF."
    End If
End Sub
```

### Macro Export PDF Plan
```vba
' Export_PDF.swp — CTM Industrie
Sub ExportPDFDrawing()
    Dim swApp As Object
    Dim swDraw As Object
    Dim sPath As String
    
    Set swApp = Application.SldWorks
    Set swDraw = swApp.ActiveDoc
    
    If swDraw Is Nothing Then
        MsgBox "Aucun plan actif."
        Exit Sub
    End If
    
    sPath = Left(swDraw.GetPathName, Len(swDraw.GetPathName) - 6) & ".pdf"
    
    Dim exportData As Object
    Set exportData = swApp.GetExportFileData(20)  ' swExportData_e.swEXPORTDATA_EXPORTPDF
    
    Dim bRet As Boolean
    bRet = swDraw.Extension.SaveAs(sPath, 0, 0, exportData, 0, 0)
    
    If bRet Then
        MsgBox "PDF exporté : " & sPath
    Else
        MsgBox "Échec export PDF."
    End If
End Sub
```

---

## 7. Bonnes Pratiques Sketch

| Pratique | Pourquoi |
|----------|----------|
| Toujours commencer à l'origine | Esquisse entièrement définie facilement |
| Utiliser les relations avant les cotes | Moins de cotes, modèle plus robuste |
| Symétrie > duplication | Modification propagée automatiquement |
| Éviter les segments superposés | Cause des erreurs de feature |
| Nommer les cotes importantes | Facilite les équations et la config table |
| Contrainte "entièrement définie" | Éviter les segments bleus non contraints |

> ⚠️ Un sketch **sous-contraint** (segments bleus) est dangereux en production — une dimension peut dériver si le modèle est régénéré avec un contexte différent.

---

## 8. Gestion des Configurations

### Configurations multi-épaisseurs (tôlerie)
```
Configuration Manager → Ajouter configuration
├── Config "ép2mm"   : Épaisseur = 2 mm, K = 0,40
├── Config "ép3mm"   : Épaisseur = 3 mm, K = 0,42
└── Config "ép4mm"   : Épaisseur = 4 mm, K = 0,43

Utilisation dans la Design Table (Excel) :
│ Config      │ Épaisseur │ K-factor │ Matière  │
│ ép2mm       │ 2         │ 0.40     │ S235     │
│ ép3mm_S355  │ 3         │ 0.42     │ S355     │
```

---

## 9. Astuces Productivité CTM

| Astuce | Gain temps |
|--------|-----------|
| Raccourci `S` → barre outils contextuelle | -30% clics |
| `G` → vue loupe (zoom local) | Précision cotation |
| `Alt + glisser` une cote → déplacer sans changer valeur | Mise en page plan |
| Copier/coller feature entre pièces | Réutilisation features |
| SpeedPak (assemblage allégé) | -60% temps chargement |
| Enregistrement auto toutes les 10 min | Sécurité données |

---

## 10. Références

- SolidWorks 2025 : Guide de l'administrateur système
- Macro VBA SolidWorks API Reference
- EN ISO 128 : Principes généraux de représentation
- CTM Industrie : Charte graphique et standards plans v2.3
