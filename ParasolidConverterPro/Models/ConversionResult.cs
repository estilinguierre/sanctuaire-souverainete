using System;
using System.Collections.Generic;

namespace ParasolidConverterPro.Models
{
    public enum ConversionStatus
    {
        Success,
        PartialSuccess,
        Failed,
        Skipped
    }

    public class ConversionResult
    {
        public Guid Id { get; } = Guid.NewGuid();
        public ParasolidFile SourceFile { get; set; } = null!;
        public ConversionStatus Status { get; set; }
        public string OutputPath { get; set; } = string.Empty;
        public string OutputFileName { get; set; } = string.Empty;
        public string OutputFormat { get; set; } = string.Empty;
        public double DurationSeconds { get; set; }
        public long OutputFileSizeBytes { get; set; }
        public int BodiesConverted { get; set; }
        public int BodiesFailed { get; set; }
        public List<string> Warnings { get; set; } = new();
        public List<string> Errors { get; set; } = new();
        public DateTime Timestamp { get; set; } = DateTime.Now;
        public string StatusDisplay => Status switch
        {
            ConversionStatus.Success => "Succès",
            ConversionStatus.PartialSuccess => "Partiel",
            ConversionStatus.Failed => "Échec",
            ConversionStatus.Skipped => "Ignoré",
            _ => "Inconnu"
        };
    }

    public class BatchConversionSummary
    {
        public int TotalFiles { get; set; }
        public int Succeeded { get; set; }
        public int PartialSuccess { get; set; }
        public int Failed { get; set; }
        public int Skipped { get; set; }
        public double TotalDurationSeconds { get; set; }
        public DateTime StartedAt { get; set; }
        public DateTime CompletedAt { get; set; }
        public List<ConversionResult> Results { get; set; } = new();
        public string ReportPath { get; set; } = string.Empty;
        public double SuccessRate => TotalFiles == 0 ? 0 : (double)Succeeded / TotalFiles * 100;
    }
}
