using System;
using System.Collections.ObjectModel;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using Microsoft.Win32;
using ParasolidConverterPro.Commands;
using ParasolidConverterPro.Models;
using ParasolidConverterPro.Services;

namespace ParasolidConverterPro.ViewModels
{
    public enum AppStep
    {
        Home,
        FileSelection,
        Options,
        Converting,
        Results
    }

    public class ConversionViewModel : BaseViewModel
    {
        private readonly IConversionService _conversionService;
        private readonly ILogService _log;
        private readonly ReportService _reportService;

        private AppStep _currentStep = AppStep.Home;
        private bool _isBusy;
        private string _busyMessage = string.Empty;
        private int _progressValue;
        private int _batchProgress;
        private string _batchStatus = string.Empty;
        private CancellationTokenSource? _cts;
        private BatchConversionSummary? _lastSummary;

        // ── Step ─────────────────────────────────────────────────────────────
        public AppStep CurrentStep
        {
            get => _currentStep;
            set
            {
                SetField(ref _currentStep, value);
                OnPropertyChanged(nameof(IsStepHome));
                OnPropertyChanged(nameof(IsStepFileSelection));
                OnPropertyChanged(nameof(IsStepOptions));
                OnPropertyChanged(nameof(IsStepConverting));
                OnPropertyChanged(nameof(IsStepResults));
            }
        }

        public bool IsStepHome => CurrentStep == AppStep.Home;
        public bool IsStepFileSelection => CurrentStep == AppStep.FileSelection;
        public bool IsStepOptions => CurrentStep == AppStep.Options;
        public bool IsStepConverting => CurrentStep == AppStep.Converting;
        public bool IsStepResults => CurrentStep == AppStep.Results;

        // ── Busy state ────────────────────────────────────────────────────────
        public bool IsBusy { get => _isBusy; set { SetField(ref _isBusy, value); } }
        public string BusyMessage { get => _busyMessage; set => SetField(ref _busyMessage, value); }
        public int ProgressValue { get => _progressValue; set => SetField(ref _progressValue, value); }
        public int BatchProgress { get => _batchProgress; set => SetField(ref _batchProgress, value); }
        public string BatchStatus { get => _batchStatus; set => SetField(ref _batchStatus, value); }

        // ── Files ─────────────────────────────────────────────────────────────
        public ObservableCollection<ParasolidFile> Files { get; } = new();
        public bool HasFiles => Files.Count > 0;
        public int FileCount => Files.Count;
        public string FileCountDisplay => Files.Count == 1 ? "1 fichier" : $"{Files.Count} fichiers";

        // ── Options ───────────────────────────────────────────────────────────
        public ConversionOptions Options { get; } = new();

        // ── Results ───────────────────────────────────────────────────────────
        public BatchConversionSummary? LastSummary { get => _lastSummary; set => SetField(ref _lastSummary, value); }
        public ObservableCollection<ConversionResult> Results { get; } = new();

        // ── Service info ──────────────────────────────────────────────────────
        public string ServiceName => _conversionService.ServiceName;
        public bool IsSimulatedMode => _conversionService is SimulatedConversionService;

        // ── Commands ──────────────────────────────────────────────────────────
        public ICommand GoToFileSelectionCommand { get; }
        public ICommand AddFilesCommand { get; }
        public ICommand AddFolderCommand { get; }
        public ICommand RemoveFileCommand { get; }
        public ICommand ClearFilesCommand { get; }
        public ICommand AnalyzeFilesCommand { get; }
        public ICommand GoToOptionsCommand { get; }
        public ICommand BrowseOutputDirCommand { get; }
        public ICommand StartConversionCommand { get; }
        public ICommand CancelConversionCommand { get; }
        public ICommand ExportReportCommand { get; }
        public ICommand NewSessionCommand { get; }
        public ICommand OpenOutputFolderCommand { get; }

        public ConversionViewModel(IConversionService conversionService, ILogService log)
        {
            _conversionService = conversionService;
            _log = log;
            _reportService = new ReportService(log);

            Files.CollectionChanged += (_, _) =>
            {
                OnPropertyChanged(nameof(HasFiles));
                OnPropertyChanged(nameof(FileCount));
                OnPropertyChanged(nameof(FileCountDisplay));
            };

            GoToFileSelectionCommand = new RelayCommand(() => CurrentStep = AppStep.FileSelection);
            AddFilesCommand = new AsyncRelayCommand(AddFilesAsync);
            AddFolderCommand = new AsyncRelayCommand(AddFolderAsync);
            RemoveFileCommand = new RelayCommand(p => RemoveFile(p as ParasolidFile));
            ClearFilesCommand = new RelayCommand(() => Files.Clear(), () => Files.Count > 0);
            AnalyzeFilesCommand = new AsyncRelayCommand(AnalyzeFilesAsync, () => Files.Count > 0 && !IsBusy);
            GoToOptionsCommand = new RelayCommand(() => CurrentStep = AppStep.Options, () => Files.Any(f => f.Status == FileStatus.Ready));
            BrowseOutputDirCommand = new RelayCommand(BrowseOutputDir);
            StartConversionCommand = new AsyncRelayCommand(StartConversionAsync, () => !IsBusy);
            CancelConversionCommand = new RelayCommand(CancelConversion, () => IsBusy);
            ExportReportCommand = new RelayCommand(ExportReport, () => LastSummary != null);
            NewSessionCommand = new RelayCommand(NewSession);
            OpenOutputFolderCommand = new RelayCommand(OpenOutputFolder, () => !string.IsNullOrEmpty(Options.OutputDirectory));
        }

        private async Task AddFilesAsync()
        {
            var dlg = new OpenFileDialog
            {
                Title = "Sélectionner des fichiers Parasolid",
                Filter = "Fichiers Parasolid (*.x_t;*.x_b)|*.x_t;*.x_b|Tous les fichiers (*.*)|*.*",
                Multiselect = true
            };

            if (dlg.ShowDialog() != true) return;

            foreach (var path in dlg.FileNames)
                await AddFileIfNewAsync(path);
        }

        private async Task AddFolderAsync()
        {
            var dlg = new System.Windows.Forms.FolderBrowserDialog
            {
                Description = "Sélectionner un dossier contenant des fichiers Parasolid",
                UseDescriptionForTitle = true
            };

            if (dlg.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;

            var paths = Directory.GetFiles(dlg.SelectedPath, "*.*", SearchOption.AllDirectories)
                .Where(f => f.EndsWith(".x_t", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".x_b", StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (paths.Count == 0)
            {
                _log.Warning($"Aucun fichier Parasolid trouvé dans : {dlg.SelectedPath}", "Import");
                return;
            }

            foreach (var path in paths)
                await AddFileIfNewAsync(path);

            _log.Info($"{paths.Count} fichier(s) ajouté(s) depuis {dlg.SelectedPath}", "Import");
        }

        private async Task AddFileIfNewAsync(string path)
        {
            if (Files.Any(f => f.FilePath.Equals(path, StringComparison.OrdinalIgnoreCase)))
            {
                _log.Warning($"Doublon ignoré : {Path.GetFileName(path)}", "Import");
                return;
            }

            // Quick placeholder — full analysis happens in AnalyzeFilesAsync
            var file = new ParasolidFile
            {
                FilePath = path,
                FileSizeBytes = new FileInfo(path).Exists ? new FileInfo(path).Length : 0,
                Status = FileStatus.Pending
            };

            var ext = Path.GetExtension(path).ToLowerInvariant();
            file.FileType = ext == ".x_t" ? ParasolidFileType.PartText
                          : ext == ".x_b" ? ParasolidFileType.PartBinary
                          : ParasolidFileType.Unknown;

            Files.Add(file);
            _log.Info($"Ajouté : {file.FileName} ({file.FileSizeDisplay})", "Import");
            await Task.CompletedTask;
        }

        private async Task AnalyzeFilesAsync()
        {
            IsBusy = true;
            BusyMessage = "Analyse en cours…";
            _cts = new CancellationTokenSource();

            var pending = Files.Where(f => f.Status == FileStatus.Pending).ToList();
            _log.Info($"Analyse de {pending.Count} fichier(s)…", "Analyse");

            try
            {
                for (int i = 0; i < pending.Count; i++)
                {
                    _cts.Token.ThrowIfCancellationRequested();
                    ProgressValue = (int)((double)(i + 1) / pending.Count * 100);
                    var file = pending[i];
                    var analyzed = await _conversionService.AnalyzeFileAsync(file.FilePath, _cts.Token);

                    // Update in-place
                    var idx = Files.IndexOf(file);
                    if (idx >= 0) Files[idx] = analyzed;
                }

                CurrentStep = AppStep.Options;
            }
            catch (OperationCanceledException)
            {
                _log.Warning("Analyse annulée.", "Analyse");
            }
            finally
            {
                IsBusy = false;
                ProgressValue = 0;
            }
        }

        private void RemoveFile(ParasolidFile? file)
        {
            if (file != null) Files.Remove(file);
        }

        private void BrowseOutputDir()
        {
            var dlg = new System.Windows.Forms.FolderBrowserDialog
            {
                Description = "Dossier de sortie pour les fichiers SolidWorks",
                UseDescriptionForTitle = true,
                SelectedPath = Options.OutputDirectory
            };
            if (dlg.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                Options.OutputDirectory = dlg.SelectedPath;
        }

        private async Task StartConversionAsync()
        {
            if (string.IsNullOrWhiteSpace(Options.OutputDirectory))
            {
                _log.Warning("Veuillez sélectionner un dossier de sortie.", "Options");
                return;
            }

            Directory.CreateDirectory(Options.OutputDirectory);

            IsBusy = true;
            CurrentStep = AppStep.Converting;
            Results.Clear();
            _cts = new CancellationTokenSource();

            var readyFiles = Files.Where(f => f.Status == FileStatus.Ready).ToList();

            var progressReporter = new Progress<(int current, int total, string fileName)>(p =>
            {
                BatchProgress = (int)((double)p.current / p.total * 100);
                BatchStatus = $"[{p.current}/{p.total}] {p.fileName}";
            });

            try
            {
                var summary = await _conversionService.ConvertBatchAsync(
                    readyFiles, Options, progressReporter, _cts.Token);

                LastSummary = summary;
                foreach (var r in summary.Results) Results.Add(r);

                if (Options.GenerateReport)
                    _reportService.SaveReport(summary, Options.OutputDirectory);

                CurrentStep = AppStep.Results;
            }
            catch (OperationCanceledException)
            {
                _log.Warning("Conversion annulée par l'utilisateur.", "Conversion");
                CurrentStep = AppStep.Options;
            }
            finally
            {
                IsBusy = false;
                BatchProgress = 0;
                BatchStatus = string.Empty;
            }
        }

        private void CancelConversion() => _cts?.Cancel();

        private void ExportReport()
        {
            if (LastSummary == null) return;
            var dlg = new SaveFileDialog
            {
                Title = "Exporter le rapport",
                Filter = "Markdown (*.md)|*.md|Tous les fichiers (*.*)|*.*",
                FileName = $"rapport_conversion_{DateTime.Now:yyyyMMdd_HHmmss}.md"
            };
            if (dlg.ShowDialog() == true)
            {
                var md = _reportService.GenerateMarkdownReport(LastSummary);
                File.WriteAllText(dlg.FileName, md, System.Text.Encoding.UTF8);
                _log.Success($"Rapport exporté : {Path.GetFileName(dlg.FileName)}", "Export");
            }
        }

        private void NewSession()
        {
            Files.Clear();
            Results.Clear();
            LastSummary = null;
            Options.OutputDirectory = string.Empty;
            CurrentStep = AppStep.Home;
            _log.Info("Nouvelle session démarrée.", "Session");
        }

        private void OpenOutputFolder()
        {
            if (!string.IsNullOrEmpty(Options.OutputDirectory) && Directory.Exists(Options.OutputDirectory))
                System.Diagnostics.Process.Start("explorer.exe", Options.OutputDirectory);
        }

        // ── Drag & Drop support ───────────────────────────────────────────────
        public async Task HandleDroppedFilesAsync(IEnumerable<string> paths)
        {
            foreach (var path in paths)
            {
                if (Directory.Exists(path))
                {
                    var files = Directory.GetFiles(path, "*.*", SearchOption.AllDirectories)
                        .Where(f => f.EndsWith(".x_t", StringComparison.OrdinalIgnoreCase)
                                 || f.EndsWith(".x_b", StringComparison.OrdinalIgnoreCase));
                    foreach (var f in files) await AddFileIfNewAsync(f);
                }
                else if (path.EndsWith(".x_t", StringComparison.OrdinalIgnoreCase)
                      || path.EndsWith(".x_b", StringComparison.OrdinalIgnoreCase))
                {
                    await AddFileIfNewAsync(path);
                }
            }

            if (CurrentStep == AppStep.Home)
                CurrentStep = AppStep.FileSelection;
        }
    }
}
