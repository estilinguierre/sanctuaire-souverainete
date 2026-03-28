using System.Collections.ObjectModel;
using System.IO;
using System.Windows;
using System.Windows.Input;
using Microsoft.Win32;
using ParasolidConverterPro.Commands;
using ParasolidConverterPro.Models;
using ParasolidConverterPro.Services;

namespace ParasolidConverterPro.ViewModels
{
    public class LogViewModel : BaseViewModel
    {
        private readonly ILogService _logService;
        private LogLevel _filterLevel = LogLevel.Debug;
        private bool _autoScroll = true;

        public ObservableCollection<LogEntry> Entries => _logService.Entries;

        public LogLevel FilterLevel
        {
            get => _filterLevel;
            set { SetField(ref _filterLevel, value); OnPropertyChanged(nameof(FilteredEntries)); }
        }

        public bool AutoScroll
        {
            get => _autoScroll;
            set => SetField(ref _autoScroll, value);
        }

        public System.Collections.Generic.IEnumerable<LogEntry> FilteredEntries
        {
            get
            {
                foreach (var e in Entries)
                    if (e.Level >= FilterLevel)
                        yield return e;
            }
        }

        public ICommand ClearCommand { get; }
        public ICommand ExportCommand { get; }
        public ICommand CopyCommand { get; }

        public LogViewModel(ILogService logService)
        {
            _logService = logService;
            _logService.Entries.CollectionChanged += (_, _) => OnPropertyChanged(nameof(FilteredEntries));

            ClearCommand = new RelayCommand(() => _logService.Clear());
            ExportCommand = new RelayCommand(ExportLog);
            CopyCommand = new RelayCommand(CopyLog);
        }

        private void ExportLog()
        {
            var dlg = new SaveFileDialog
            {
                Title = "Exporter le journal",
                Filter = "Fichier texte (*.txt)|*.txt|Tous les fichiers (*.*)|*.*",
                FileName = $"log_parasolid_{System.DateTime.Now:yyyyMMdd_HHmmss}.txt"
            };
            if (dlg.ShowDialog() == true)
            {
                File.WriteAllText(dlg.FileName, _logService.ExportToText(), System.Text.Encoding.UTF8);
                _logService.Success($"Journal exporté : {Path.GetFileName(dlg.FileName)}", "Export");
            }
        }

        private void CopyLog()
        {
            Clipboard.SetText(_logService.ExportToText());
            _logService.Info("Journal copié dans le presse-papiers.", "Export");
        }
    }
}
