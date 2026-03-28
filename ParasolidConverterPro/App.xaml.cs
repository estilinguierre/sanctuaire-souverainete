using System.Windows;
using ParasolidConverterPro.Services;
using ParasolidConverterPro.ViewModels;

namespace ParasolidConverterPro
{
    public partial class App : Application
    {
        public static ILogService LogService { get; private set; } = null!;
        public static ConversionViewModel ConversionViewModel { get; private set; } = null!;
        public static LogViewModel LogViewModel { get; private set; } = null!;

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Composition root — Phase 1 uses SimulatedConversionService
            LogService = new LogService();
            var conversionService = new SimulatedConversionService(LogService);

            ConversionViewModel = new ConversionViewModel(conversionService, LogService);
            LogViewModel = new LogViewModel(LogService);

            LogService.Info("Parasolid Converter Pro démarré.", "App");
            LogService.Info($"Mode : {conversionService.ServiceName}", "App");
        }
    }
}
