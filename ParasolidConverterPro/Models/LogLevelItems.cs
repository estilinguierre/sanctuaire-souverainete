using System.Collections.Generic;

namespace ParasolidConverterPro.Models
{
    public static class LogLevelItems
    {
        public static IReadOnlyList<string> All { get; } = new[]
        {
            "Tout (Debug+)",
            "Info+",
            "Avertissements+",
            "Erreurs"
        };
    }
}
