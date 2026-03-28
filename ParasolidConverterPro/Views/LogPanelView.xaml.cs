using System.Collections.Specialized;
using System.Windows.Controls;

namespace ParasolidConverterPro.Views
{
    public partial class LogPanelView : UserControl
    {
        public LogPanelView()
        {
            InitializeComponent();
            DataContext = App.LogViewModel;

            App.LogService.Entries.CollectionChanged += OnEntriesChanged;
        }

        private void OnEntriesChanged(object? sender, NotifyCollectionChangedEventArgs e)
        {
            if (e.Action == NotifyCollectionChangedAction.Add && LogListBox.Items.Count > 0)
            {
                var last = LogListBox.Items[LogListBox.Items.Count - 1];
                LogListBox.ScrollIntoView(last);
            }
        }
    }
}
