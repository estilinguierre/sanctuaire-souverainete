using System;
using System.Collections.Generic;
using System.IO;

namespace ParasolidConverterPro.Models
{
    public enum ParasolidFileType
    {
        Unknown,
        PartText,       // .x_t
        PartBinary,     // .x_b
        AssemblyText,   // multiple bodies in one file
        AssemblyBinary
    }

    public enum FileStatus
    {
        Pending,
        Analyzing,
        Ready,
        Converting,
        Converted,
        Failed,
        Skipped
    }

    public class ParasolidFile
    {
        public Guid Id { get; } = Guid.NewGuid();
        public string FilePath { get; set; } = string.Empty;
        public string FileName => Path.GetFileName(FilePath);
        public string FileNameWithoutExtension => Path.GetFileNameWithoutExtension(FilePath);
        public long FileSizeBytes { get; set; }
        public string FileSizeDisplay => FormatSize(FileSizeBytes);
        public ParasolidFileType FileType { get; set; } = ParasolidFileType.Unknown;
        public FileStatus Status { get; set; } = FileStatus.Pending;
        public int BodyCount { get; set; }
        public int SurfaceCount { get; set; }
        public int EdgeCount { get; set; }
        public string SchemaVersion { get; set; } = string.Empty;
        public bool IsAssembly => BodyCount > 1;
        public List<string> ChildComponents { get; set; } = new();
        public string? OutputPath { get; set; }
        public string? ErrorMessage { get; set; }
        public DateTime? AnalyzedAt { get; set; }
        public DateTime? ConvertedAt { get; set; }

        private static string FormatSize(long bytes)
        {
            if (bytes < 1024) return $"{bytes} B";
            if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1} KB";
            return $"{bytes / (1024.0 * 1024):F1} MB";
        }
    }
}
