# Parasolid Converter Pro

Application de conversion automatique de fichiers Parasolid (`.x_t` / `.x_b`)
vers SolidWorks (`.sldprt` / `.sldasm`).

## Stack technique

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Langage | C# 9 / .NET Framework 4.8 | Requis par l'API SolidWorks COM |
| UI | WPF (XAML + MVVM) | Intégration native Windows, compatible SolidWorks Add-in |
| Moteur Phase 1 | `SimulatedConversionService` | Workflow complet sans SolidWorks installé |
| Moteur Phase 2+ | `SolidWorksConversionService` (COM Interop) | API Gold Partner officielle |
| Patron | MVVM strict | Testabilité, séparation UI/logique |

## Architecture

```
ParasolidConverterPro/
├── Models/                  # Entités métier (ParasolidFile, ConversionResult, …)
├── Services/                # Moteurs de conversion + journalisation
│   ├── IConversionService
│   ├── SimulatedConversionService   ← Phase 1
│   ├── SolidWorksConversionService  ← Phase 2 (stub documenté)
│   ├── LogService
│   └── ReportService
├── ViewModels/              # MVVM — ConversionViewModel, LogViewModel
├── Views/                   # WPF XAML
│   ├── MainWindow           # Shell + stepper + log panel
│   ├── HomeView             # Accueil + CTA
│   ├── FileSelectionView    # Import + Drag & Drop
│   ├── OptionsView          # Paramètres de conversion
│   ├── ConvertingView       # Progression en temps réel
│   └── ResultsView          # Tableau de résultats + export
├── Converters/              # ValueConverters WPF
└── Resources/Styles/        # Palette dark SolidWorks-inspired
```

## Workflow utilisateur

```
[Accueil] → [+ Fichiers] → [Analyser] → [Options] → [Lancer] → [Résultats] → [Rapport .md]
```

## Phases

| Phase | Contenu | Status |
|-------|---------|--------|
| **1** | UI complète + workflow simulé | ✅ En cours |
| **2** | `SolidWorksConversionService` COM Interop | 🔲 Planifié |
| **3** | Assemblages hiérarchiques | 🔲 Planifié |
| **4** | Export rapports + JSON | 🔲 Planifié |
| **5** | Optimisation + Add-in SW | 🔲 Planifié |

## Prérequis Phase 2

- SolidWorks 2021–2025 installé (x64)
- .NET Framework 4.8
- Décommenter les `<COMReference>` dans le `.csproj`

## Build

```bash
dotnet build ParasolidConverterPro.sln -c Debug
```
