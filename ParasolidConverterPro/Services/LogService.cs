using System;
using System.Collections.ObjectModel;
using System.Text;
using System.Windows;
using ParasolidConverterPro.Models;

namespace ParasolidConverterPro.Services
{
    public class LogService : ILogService
    {
        public ObservableCollection<LogEntry> Entries { get; } = new();

        public void Log(LogLevel level, string message, string? source = null, string? detail = null)
        {
            var entry = new LogEntry
            {
                Level = level,
                Message = message,
                Source = source,
                Detail = detail,
                Timestamp = DateTime.Now
            };

            if (Application.Current?.Dispatcher?.CheckAccess() == false)
                Application.Current.Dispatcher.Invoke(() => Entries.Add(entry));
            else
                Entries.Add(entry);
        }

        public void Debug(string message, string? source = null) => Log(LogLevel.Debug, message, source);
        public void Info(string message, string? source = null) => Log(LogLevel.Info, message, source);
        public void Warning(string message, string? source = null) => Log(LogLevel.Warning, message, source);
        public void Error(string message, string? source = null, string? detail = null) => Log(LogLevel.Error, message, source, detail);
        public void Success(string message, string? source = null) => Log(LogLevel.Success, message, source);

        public void Clear()
        {
            if (Application.Current?.Dispatcher?.CheckAccess() == false)
                Application.Current.Dispatcher.Invoke(() => Entries.Clear());
            else
                Entries.Clear();
        }

        public string ExportToText()
        {
            var sb = new StringBuilder();
            sb.AppendLine("=== Parasolid Converter Pro - Journal d'exécution ===");
            sb.AppendLine($"Exporté le : {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            sb.AppendLine(new string('=', 60));
            sb.AppendLine();

            foreach (var entry in Entries)
            {
                sb.AppendLine($"[{entry.TimestampDisplay}] [{entry.LevelDisplay}] " +
                              $"{(entry.Source != null ? $"[{entry.Source}] " : "")}{entry.Message}");
                if (!string.IsNullOrEmpty(entry.Detail))
                    sb.AppendLine($"         Detail: {entry.Detail}");
            }

            return sb.ToString();
        }
    }
}
