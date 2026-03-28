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

            // Auto-scroll when new entries arrive
            App.LogService.Entries.CollectionChanged += (_, e) =>
            {
                if (e.Action == NotifyCollectionChangedAction.Add && LogListBox.Items.Count > 0)
                {
                    LogListBox.ScrollIntoView(LogListBox.Items[^1]);
                }
            };
        }
    }
}
