using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ParasolidConverterPro.Models;

namespace ParasolidConverterPro.Services
{
    public interface IConversionService
    {
        bool IsAvailable { get; }
        string ServiceName { get; }

        Task<ParasolidFile> AnalyzeFileAsync(string filePath, CancellationToken ct = default);
        Task<ConversionResult> ConvertFileAsync(ParasolidFile file, ConversionOptions options, IProgress<int>? progress = null, CancellationToken ct = default);
        Task<BatchConversionSummary> ConvertBatchAsync(IEnumerable<ParasolidFile> files, ConversionOptions options, IProgress<(int current, int total, string fileName)>? progress = null, CancellationToken ct = default);
    }
}
