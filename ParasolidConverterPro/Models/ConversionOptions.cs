using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace ParasolidConverterPro.Models
{
    public enum OutputFormat
    {
        SldPrt,     // Single part
        SldAsm,     // Assembly
        Auto        // Auto-detect based on body count
    }

    public enum SolidWorksVersion
    {
        SW2021,
        SW2022,
        SW2023,
        SW2024,
        SW2025
    }

    public class ConversionOptions : INotifyPropertyChanged
    {
        private string _outputDirectory = string.Empty;
        private OutputFormat _outputFormat = OutputFormat.Auto;
        private SolidWorksVersion _targetVersion = SolidWorksVersion.SW2024;
        private bool _importAsSolid = true;
        private bool _healGeometry = true;
        private bool _runDiagnostics = true;
        private bool _preserveFeatureTree = false;
        private bool _generateReport = true;
        private bool _overwriteExisting = false;
        private bool _simulatedMode = true;
        private int _maxParallelConversions = 1;

        public string OutputDirectory
        {
            get => _outputDirectory;
            set { _outputDirectory = value; OnPropertyChanged(); }
        }

        public OutputFormat OutputFormat
        {
            get => _outputFormat;
            set { _outputFormat = value; OnPropertyChanged(); }
        }

        public SolidWorksVersion TargetVersion
        {
            get => _targetVersion;
            set { _targetVersion = value; OnPropertyChanged(); }
        }

        public bool ImportAsSolid
        {
            get => _importAsSolid;
            set { _importAsSolid = value; OnPropertyChanged(); }
        }

        public bool HealGeometry
        {
            get => _healGeometry;
            set { _healGeometry = value; OnPropertyChanged(); }
        }

        public bool RunDiagnostics
        {
            get => _runDiagnostics;
            set { _runDiagnostics = value; OnPropertyChanged(); }
        }

        public bool PreserveFeatureTree
        {
            get => _preserveFeatureTree;
            set { _preserveFeatureTree = value; OnPropertyChanged(); }
        }

        public bool GenerateReport
        {
            get => _generateReport;
            set { _generateReport = value; OnPropertyChanged(); }
        }

        public bool OverwriteExisting
        {
            get => _overwriteExisting;
            set { _overwriteExisting = value; OnPropertyChanged(); }
        }

        public bool SimulatedMode
        {
            get => _simulatedMode;
            set { _simulatedMode = value; OnPropertyChanged(); }
        }

        public int MaxParallelConversions
        {
            get => _maxParallelConversions;
            set { _maxParallelConversions = value; OnPropertyChanged(); }
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged([CallerMemberName] string? name = null)
            => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
