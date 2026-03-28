using System;
using System.Collections.ObjectModel;
using ParasolidConverterPro.Models;

namespace ParasolidConverterPro.Services
{
    public interface ILogService
    {
        ObservableCollection<LogEntry> Entries { get; }
        void Log(LogLevel level, string message, string? source = null, string? detail = null);
        void Debug(string message, string? source = null);
        void Info(string message, string? source = null);
        void Warning(string message, string? source = null);
        void Error(string message, string? source = null, string? detail = null);
        void Success(string message, string? source = null);
        void Clear();
        string ExportToText();
    }
}
