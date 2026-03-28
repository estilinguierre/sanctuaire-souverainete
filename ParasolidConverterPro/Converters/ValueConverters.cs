using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using ParasolidConverterPro.Models;

namespace ParasolidConverterPro.Converters
{
    public class InverseBoolToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
            => value is bool b && b ? Visibility.Collapsed : Visibility.Visible;

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class FileStatusToColorConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is FileStatus status)
                return status switch
                {
                    FileStatus.Pending => new SolidColorBrush(Color.FromRgb(0x90, 0x90, 0xB0)),
                    FileStatus.Analyzing => new SolidColorBrush(Color.FromRgb(0x21, 0x96, 0xF3)),
                    FileStatus.Ready => new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                    FileStatus.Converting => new SolidColorBrush(Color.FromRgb(0x21, 0x96, 0xF3)),
                    FileStatus.Converted => new SolidColorBrush(Color.FromRgb(0x4C, 0xAF, 0x50)),
                    FileStatus.Failed => new SolidColorBrush(Color.FromRgb(0xF4, 0x43, 0x36)),
                    FileStatus.Skipped => new SolidColorBrush(Color.FromRgb(0x60, 0x60, 0x80)),
                    _ => new SolidColorBrush(Colors.Gray)
                };
            return new SolidColorBrush(Colors.Gray);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class LogLevelToColorConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is LogLevel level)
                return level switch
                {
                    LogLevel.Debug => new SolidColorBrush(Color.FromRgb(0x60, 0x60, 0x80)),
                    LogLevel.Info => new SolidColorBrush(Color.FromRgb(0xE0, 0xE0, 0xF0)),
                    LogLevel.Warning => new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                    LogLevel.Error => new SolidColorBrush(Color.FromRgb(0xF4, 0x43, 0x36)),
                    LogLevel.Success => new SolidColorBrush(Color.FromRgb(0x4C, 0xAF, 0x50)),
                    _ => new SolidColorBrush(Colors.Gray)
                };
            return new SolidColorBrush(Colors.Gray);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class ConversionStatusToColorConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is ConversionStatus status)
                return status switch
                {
                    ConversionStatus.Success => new SolidColorBrush(Color.FromRgb(0x4C, 0xAF, 0x50)),
                    ConversionStatus.PartialSuccess => new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                    ConversionStatus.Failed => new SolidColorBrush(Color.FromRgb(0xF4, 0x43, 0x36)),
                    ConversionStatus.Skipped => new SolidColorBrush(Color.FromRgb(0x60, 0x60, 0x80)),
                    _ => new SolidColorBrush(Colors.Gray)
                };
            return new SolidColorBrush(Colors.Gray);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class EnumToStringConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
            => value?.ToString() ?? string.Empty;

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }
}
