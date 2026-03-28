using System;

namespace ParasolidConverterPro.Models
{
    public enum LogLevel
    {
        Debug,
        Info,
        Warning,
        Error,
        Success
    }

    public class LogEntry
    {
        public Guid Id { get; } = Guid.NewGuid();
        public DateTime Timestamp { get; set; } = DateTime.Now;
        public LogLevel Level { get; set; }
        public string Message { get; set; } = string.Empty;
        public string? Source { get; set; }
        public string? Detail { get; set; }
        public string TimestampDisplay => Timestamp.ToString("HH:mm:ss.fff");
        public string LevelDisplay => Level switch
        {
            LogLevel.Debug => "DBG",
            LogLevel.Info => "INF",
            LogLevel.Warning => "WRN",
            LogLevel.Error => "ERR",
            LogLevel.Success => "OK ",
            _ => "   "
        };
    }
}
