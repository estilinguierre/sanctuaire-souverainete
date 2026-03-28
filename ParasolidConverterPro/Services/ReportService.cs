using System;
using System.IO;
using System.Text;
using ParasolidConverterPro.Models;

namespace ParasolidConverterPro.Services
{
    public class ReportService
    {
        private readonly ILogService _log;
        public ReportService(ILogService log) => _log = log;

        public string GenerateMarkdownReport(BatchConversionSummary summary)
        {
            var sb = new StringBuilder();
            sb.AppendLine("# Rapport de conversion — Parasolid Converter Pro");
            sb.AppendLine();
            sb.AppendLine($"**Date :** {summary.StartedAt:yyyy-MM-dd HH:mm:ss}");
            sb.AppendLine($"**Durée totale :** {summary.TotalDurationSeconds:F1} s");
            sb.AppendLine($"**Taux de succès :** {summary.SuccessRate:F1}%");
            sb.AppendLine();
            sb.AppendLine("## Résumé");
            sb.AppendLine();
            sb.AppendLine($"| Indicateur | Valeur |");
            sb.AppendLine($"|------------|--------|");
            sb.AppendLine($"| Total fichiers | {summary.TotalFiles} |");
            sb.AppendLine($"| Succès | {summary.Succeeded} |");
            sb.AppendLine($"| Succès partiel | {summary.PartialSuccess} |");
            sb.AppendLine($"| Échecs | {summary.Failed} |");
            sb.AppendLine($"| Ignorés | {summary.Skipped} |");
            sb.AppendLine();
            sb.AppendLine("## Détail des conversions");
            sb.AppendLine();
            sb.AppendLine("| Fichier source | Format | Statut | Durée | Avertissements |");
            sb.AppendLine("|----------------|--------|--------|-------|----------------|");

            foreach (var r in summary.Results)
            {
                var warnings = r.Warnings.Count > 0 ? string.Join("; ", r.Warnings) : "—";
                sb.AppendLine($"| {r.SourceFile.FileName} | {r.OutputFormat} | {r.StatusDisplay} | {r.DurationSeconds:F2}s | {warnings} |");
            }

            sb.AppendLine();
            sb.AppendLine("## Erreurs");
            sb.AppendLine();
            bool hasErrors = false;
            foreach (var r in summary.Results)
            {
                foreach (var err in r.Errors)
                {
                    sb.AppendLine($"- **{r.SourceFile.FileName}** : {err}");
                    hasErrors = true;
                }
            }
            if (!hasErrors) sb.AppendLine("Aucune erreur.");

            sb.AppendLine();
            sb.AppendLine("---");
            sb.AppendLine("*Généré par Parasolid Converter Pro v1.0 — Phase 1*");

            return sb.ToString();
        }

        public void SaveReport(BatchConversionSummary summary, string outputDir)
        {
            var md = GenerateMarkdownReport(summary);
            var path = Path.Combine(outputDir, $"rapport_conversion_{DateTime.Now:yyyyMMdd_HHmmss}.md");
            File.WriteAllText(path, md, Encoding.UTF8);
            summary.ReportPath = path;
            _log.Success($"Rapport exporté : {Path.GetFileName(path)}", "Rapport");
        }
    }
}
