using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;
using ParasolidConverterPro.ViewModels;

namespace ParasolidConverterPro.Converters
{
    /// <summary>
    /// Multi-value converter for stepper step circles.
    /// Returns the fill color based on whether the step is active, done, or pending.
    /// </summary>
    public class StepColorMultiConverter : IMultiValueConverter
    {
        public int StepIndex { get; set; }

        private static readonly Color ColorActive  = Color.FromRgb(0x00, 0x78, 0xD4);
        private static readonly Color ColorDone    = Color.FromRgb(0x4C, 0xAF, 0x50);
        private static readonly Color ColorPending = Color.FromRgb(0x3A, 0x3A, 0x5C);

        public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
        {
            if (values.Length < 1 || values[0] is not AppStep step)
                return new SolidColorBrush(ColorPending);

            int currentIndex = step switch
            {
                AppStep.Home          => 0,
                AppStep.FileSelection => 1,
                AppStep.Options       => 2,
                AppStep.Converting    => 3,
                AppStep.Results       => 4,
                _ => 0
            };

            if (StepIndex - 1 == currentIndex) return new SolidColorBrush(ColorActive);
            if (StepIndex - 1 < currentIndex)  return new SolidColorBrush(ColorDone);
            return new SolidColorBrush(ColorPending);
        }

        public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }
}
