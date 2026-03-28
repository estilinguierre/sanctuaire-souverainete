using System.Windows;

namespace ParasolidConverterPro.Views
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            DataContext = App.ConversionViewModel;

            Drop += async (_, e) =>
            {
                if (e.Data.GetDataPresent(DataFormats.FileDrop))
                {
                    var paths = (string[])e.Data.GetData(DataFormats.FileDrop);
                    if (paths != null)
                        await App.ConversionViewModel.HandleDroppedFilesAsync(paths);
                }
            };

            DragOver += (_, e) =>
            {
                e.Effects = e.Data.GetDataPresent(DataFormats.FileDrop)
                    ? DragDropEffects.Copy
                    : DragDropEffects.None;
                e.Handled = true;
            };
        }
    }
}
