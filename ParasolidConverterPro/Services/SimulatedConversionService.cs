using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ParasolidConverterPro.Models;

namespace ParasolidConverterPro.Services
{
    /// <summary>
    /// Phase 1 — Moteur de conversion simulé.
    /// Reproduit fidèlement le workflow réel sans nécessiter SolidWorks.
    /// Remplacé par SolidWorksConversionService en Phase 2.
    /// </summary>
    public class SimulatedConversionService : IConversionService
    {
        private readonly ILogService _log;
        private readonly Random _rng = new(42);

        public bool IsAvailable => true;
        public string ServiceName => "Simulateur (Phase 1)";

        public SimulatedConversionService(ILogService log) => _log = log;

        public async Task<ParasolidFile> AnalyzeFileAsync(string filePath, CancellationToken ct = default)
        {
            _log.Info($"Analyse : {Path.GetFileName(filePath)}", "Analyse");

            var file = new ParasolidFile
            {
                FilePath = filePath,
                FileSizeBytes = new FileInfo(filePath).Exists ? new FileInfo(filePath).Length : _rng.Next(50_000, 5_000_000),
                Status = FileStatus.Analyzing
            };

            // Simulate analysis delay
            await Task.Delay(400 + _rng.Next(200), ct);

            var ext = Path.GetExtension(filePath).ToLowerInvariant();
            file.FileType = ext switch
            {
                ".x_t" => ParasolidFileType.PartText,
                ".x_b" => ParasolidFileType.PartBinary,
                _ => ParasolidFileType.Unknown
            };

            file.SchemaVersion = $"PARASOLID_BINARY_FILE  VERSION {28 + _rng.Next(3)}";
            file.BodyCount = 1 + _rng.Next(5);
            file.SurfaceCount = 12 + _rng.Next(200);
            file.EdgeCount = 24 + _rng.Next(400);

            if (file.BodyCount > 1)
            {
                file.ChildComponents = Enumerable.Range(1, file.BodyCount)
                    .Select(i => $"{file.FileNameWithoutExtension}_body_{i:D3}")
                    .ToList();
            }

            file.AnalyzedAt = DateTime.Now;
            file.Status = FileStatus.Ready;

            _log.Success(
                $"{file.FileName} — {file.BodyCount} corps, {file.SurfaceCount} surfaces, {file.EdgeCount} arêtes",
                "Analyse");

            return file;
        }

        public async Task<ConversionResult> ConvertFileAsync(
            ParasolidFile file,
            ConversionOptions options,
            IProgress<int>? progress = null,
            CancellationToken ct = default)
        {
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            file.Status = FileStatus.Converting;
            _log.Info($"Conversion : {file.FileName}", "Conversion");

            var result = new ConversionResult { SourceFile = file };

            // Determine output format
            var useAsm = options.OutputFormat == OutputFormat.SldAsm
                         || (options.OutputFormat == OutputFormat.Auto && file.IsAssembly);

            var ext = useAsm ? "SLDASM" : "SLDPRT";
            var outName = $"{file.FileNameWithoutExtension}.{ext.ToLower()}";
            var outDir = string.IsNullOrWhiteSpace(options.OutputDirectory)
                ? Path.GetDirectoryName(file.FilePath) ?? "."
                : options.OutputDirectory;

            result.OutputPath = Path.Combine(outDir, outName);
            result.OutputFileName = outName;
            result.OutputFormat = ext;

            // Simulate conversion steps with progress
            var steps = new[]
            {
                (10, "Chargement du noyau Parasolid"),
                (25, "Lecture des corps solides"),
                (40, "Reconstruction topologique"),
                (55, "Application des matériaux"),
                (70, "Guérison géométrique"),
                (85, "Validation du modèle"),
                (95, "Écriture du fichier SolidWorks"),
                (100, "Finalisation")
            };

            foreach (var (pct, stepName) in steps)
            {
                ct.ThrowIfCancellationRequested();
                _log.Debug($"  [{pct:D3}%] {stepName}", "Conversion");
                progress?.Report(pct);
                await Task.Delay(150 + _rng.Next(200), ct);
            }

            // Simulate occasional warnings/errors
            var roll = _rng.NextDouble();
            if (roll < 0.15)
            {
                result.Warnings.Add("Entité de tolérance réduite détectée sur 2 arêtes — corrigée automatiquement.");
                _log.Warning("Tolérance réduite détectée — correction automatique appliquée.", "Validation");
            }
            if (roll < 0.05)
            {
                result.Warnings.Add("1 surface dégénérée ignorée.");
                _log.Warning("Surface dégénérée ignorée lors de la reconstruction.", "Validation");
            }

            stopwatch.Stop();
            result.BodiesConverted = file.BodyCount;
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.OutputFileSizeBytes = (long)(file.FileSizeBytes * (0.8 + _rng.NextDouble() * 0.4));
            result.Status = ConversionStatus.Success;

            file.OutputPath = result.OutputPath;
            file.ConvertedAt = DateTime.Now;
            file.Status = FileStatus.Converted;

            _log.Success($"Converti : {result.OutputFileName} ({result.DurationSeconds:F2}s)", "Conversion");
            return result;
        }

        public async Task<BatchConversionSummary> ConvertBatchAsync(
            IEnumerable<ParasolidFile> files,
            ConversionOptions options,
            IProgress<(int current, int total, string fileName)>? progress = null,
            CancellationToken ct = default)
        {
            var summary = new BatchConversionSummary
            {
                StartedAt = DateTime.Now
            };

            var fileList = files.ToList();
            summary.TotalFiles = fileList.Count;
            _log.Info($"Démarrage batch — {summary.TotalFiles} fichier(s)", "Batch");

            for (int i = 0; i < fileList.Count; i++)
            {
                ct.ThrowIfCancellationRequested();
                var file = fileList[i];
                progress?.Report((i + 1, fileList.Count, file.FileName));

                try
                {
                    var result = await ConvertFileAsync(file, options, ct: ct);
                    summary.Results.Add(result);

                    switch (result.Status)
                    {
                        case ConversionStatus.Success: summary.Succeeded++; break;
                        case ConversionStatus.PartialSuccess: summary.PartialSuccess++; break;
                        case ConversionStatus.Failed: summary.Failed++; break;
                        case ConversionStatus.Skipped: summary.Skipped++; break;
                    }
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    summary.Failed++;
                    file.Status = FileStatus.Failed;
                    file.ErrorMessage = ex.Message;
                    _log.Error($"Échec : {file.FileName}", "Batch", ex.Message);
                    summary.Results.Add(new ConversionResult
                    {
                        SourceFile = file,
                        Status = ConversionStatus.Failed,
                        Errors = { ex.Message }
                    });
                }
            }

            summary.CompletedAt = DateTime.Now;
            summary.TotalDurationSeconds = (summary.CompletedAt - summary.StartedAt).TotalSeconds;
            _log.Success(
                $"Batch terminé — {summary.Succeeded}/{summary.TotalFiles} succès en {summary.TotalDurationSeconds:F1}s",
                "Batch");

            return summary;
        }
    }
}
