// Gotham Intelligence Platform – App Controller

const App = (() => {
  let graph = null;
  let currentView = 'graph';
  let searchTimeout = null;
  let currentInvestigation = GOTHAM_DATA.investigations[0];

  function init() {
    setupCanvas();
    setupNavigation();
    setupSearch();
    setupFilterPanel();
    setupAlerts();
    populateObjectsTable();
    populateTimeline();
    loadInvestigation();
    updateStatusBar();
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKeyDown);
    showView('graph');
  }

  // ─── Canvas ──────────────────────────────────────────────────────────────────
  function setupCanvas() {
    const canvas = document.getElementById('graph-canvas');
    const parent = canvas.parentElement;
    canvas.width  = parent.offsetWidth  || window.innerWidth  - 52;
    canvas.height = parent.offsetHeight || window.innerHeight - 52 - 26 - 40;

    graph = new GothamGraph(canvas);
    graph.onSelect = onNodeSelected;
    graph.onContextMenu = showContextMenu;

    graph.load(
      JSON.parse(JSON.stringify(GOTHAM_DATA.nodes)),
      JSON.parse(JSON.stringify(GOTHAM_DATA.edges))
    );
  }

  function onResize() {
    const canvas = document.getElementById('graph-canvas');
    const parent = canvas.parentElement;
    canvas.width  = parent.offsetWidth  || window.innerWidth  - 52;
    canvas.height = parent.offsetHeight || window.innerHeight - 52 - 26 - 40;
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────
  function setupNavigation() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => showView(btn.dataset.view));
    });
    document.querySelectorAll('.sidebar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.view) showView(btn.dataset.view);
      });
    });
    document.getElementById('btn-fit').addEventListener('click', () => graph && graph.fitAll());
    document.getElementById('btn-zoom-in').addEventListener('click', () => graph && (graph.scale = Math.min(4, graph.scale * 1.3)));
    document.getElementById('btn-zoom-out').addEventListener('click', () => graph && (graph.scale = Math.max(0.2, graph.scale / 1.3)));
    document.getElementById('btn-sim').addEventListener('click', toggleSim);
    document.getElementById('close-detail').addEventListener('click', closeDetail);
    document.getElementById('close-ctx').addEventListener('click', closeContextMenu);
    document.addEventListener('click', e => {
      if (!e.target.closest('#context-menu')) closeContextMenu();
    });
  }

  function showView(view) {
    currentView = view;
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`view-${view}`);
    if (panel) panel.classList.add('active');

    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    document.querySelectorAll('.sidebar-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    document.getElementById('graph-toolbar').style.display = view === 'graph' ? 'flex' : 'none';

    if (view === 'graph' && graph) {
      setTimeout(() => { if (graph) graph.resize(); }, 50);
    }
  }

  // ─── Search ───────────────────────────────────────────────────────────────────
  function setupSearch() {
    const input = document.getElementById('global-search');
    const results = document.getElementById('search-results');

    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = input.value.trim().toLowerCase();
      if (!q) { results.classList.remove('open'); return; }
      searchTimeout = setTimeout(() => doSearch(q), 200);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { results.classList.remove('open'); input.value = ''; }
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrap')) results.classList.remove('open');
    });
  }

  function doSearch(q) {
    const results = document.getElementById('search-results');
    const matches = GOTHAM_DATA.nodes.filter(n =>
      n.label.toLowerCase().includes(q) ||
      Object.values(n.props || {}).some(v => String(v).toLowerCase().includes(q))
    ).slice(0, 8);

    results.innerHTML = matches.length
      ? matches.map(n => `
          <div class="search-item" data-id="${n.id}">
            <span class="search-type-badge type-${n.type.toLowerCase()}">${n.type}</span>
            <span class="search-label">${highlight(n.label, q)}</span>
          </div>`).join('')
      : `<div class="search-empty">Aucun résultat pour "${q}"</div>`;

    results.classList.add('open');
    results.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', () => {
        const node = graph.nodes.find(n => n.id === el.dataset.id);
        if (node) {
          showView('graph');
          graph.selected = node;
          graph.focusNode(node);
          onNodeSelected(node);
        }
        results.classList.remove('open');
        document.getElementById('global-search').value = '';
      });
    });
  }

  function highlight(text, q) {
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return text.slice(0, idx) +
           `<mark>${text.slice(idx, idx + q.length)}</mark>` +
           text.slice(idx + q.length);
  }

  // ─── Filter Panel ─────────────────────────────────────────────────────────────
  function setupFilterPanel() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        applyFilters();
      });
    });
  }

  function applyFilters() {
    const active = [...document.querySelectorAll('.filter-chip.active')].map(c => c.dataset.type);
    updateStatusBar();
  }

  // ─── Alerts ───────────────────────────────────────────────────────────────────
  function setupAlerts() {
    const list = document.getElementById('alerts-list');
    list.innerHTML = GOTHAM_DATA.alerts.map(a => `
      <div class="alert-item sev-${a.severity.toLowerCase()}" data-entity="${a.entity}">
        <span class="alert-sev">${a.severity}</span>
        <div class="alert-body">
          <div class="alert-title">${a.title}</div>
          <div class="alert-desc">${a.desc}</div>
          <div class="alert-date">${a.date}</div>
        </div>
      </div>`).join('');

    list.querySelectorAll('.alert-item').forEach(el => {
      el.addEventListener('click', () => {
        const nodeId = el.dataset.entity;
        const node = graph && graph.nodes.find(n => n.id === nodeId);
        if (node) {
          showView('graph');
          graph.selected = node;
          graph.focusNode(node);
          onNodeSelected(node);
        }
      });
    });
  }

  // ─── Objects Table ────────────────────────────────────────────────────────────
  function populateObjectsTable() {
    const tbody = document.getElementById('objects-tbody');
    const filterInput = document.getElementById('objects-filter');

    function render(data) {
      tbody.innerHTML = data.map(n => {
        const cfg = NODE_COLORS[n.type] || { stroke: '#aaa' };
        const risk = n.props.Risque;
        return `<tr data-id="${n.id}" class="objects-row">
          <td><span class="type-dot" style="background:${cfg.stroke}"></span></td>
          <td><span class="type-label type-${n.type.toLowerCase()}">${n.type}</span></td>
          <td class="entity-name">${n.label}</td>
          <td>${Object.values(n.props)[0] || '—'}</td>
          <td>${risk ? `<span class="risk-badge risk-${risk.toLowerCase()}">${risk}</span>` : '—'}</td>
          <td><button class="btn-sm" onclick="App.focusEntity('${n.id}')">Voir</button></td>
        </tr>`;
      }).join('');

      tbody.querySelectorAll('.objects-row').forEach(row => {
        row.addEventListener('click', e => {
          if (e.target.tagName === 'BUTTON') return;
          tbody.querySelectorAll('.objects-row').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
          focusEntity(row.dataset.id);
        });
      });
    }

    render(GOTHAM_DATA.nodes);

    filterInput.addEventListener('input', () => {
      const q = filterInput.value.trim().toLowerCase();
      render(q ? GOTHAM_DATA.nodes.filter(n =>
        n.label.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        Object.values(n.props).some(v => String(v).toLowerCase().includes(q))
      ) : GOTHAM_DATA.nodes);
    });
  }

  // ─── Timeline ─────────────────────────────────────────────────────────────────
  function populateTimeline() {
    const events = GOTHAM_DATA.nodes
      .filter(n => n.type === 'EVENT')
      .sort((a, b) => (a.props.Date || '').localeCompare(b.props.Date || ''));

    const container = document.getElementById('timeline-events');
    container.innerHTML = events.map((n, i) => {
      const cfg = NODE_COLORS[n.type];
      return `<div class="tl-event" style="left:${10 + i * (80 / (events.length || 1))}%">
        <div class="tl-dot" style="background:${cfg.stroke}; border-color:${cfg.stroke}"></div>
        <div class="tl-card">
          <div class="tl-date">${n.props.Date || ''}</div>
          <div class="tl-title">${n.label}</div>
          ${Object.entries(n.props).slice(1, 3).map(([k, v]) =>
            `<div class="tl-prop"><span>${k}</span> ${v}</div>`).join('')}
          <button class="btn-sm" onclick="App.focusEntity('${n.id}')">Détails</button>
        </div>
      </div>`;
    }).join('');
  }

  // ─── Entity Detail Panel ──────────────────────────────────────────────────────
  function onNodeSelected(node) {
    if (!node) { closeDetail(); return; }
    showEntityDetail(node);
  }

  function showEntityDetail(node) {
    const data = GOTHAM_DATA.nodes.find(n => n.id === node.id) || node;
    const cfg = NODE_COLORS[data.type] || { stroke: '#aaa', icon: '?' };

    document.getElementById('detail-panel').classList.add('open');
    document.getElementById('detail-type').textContent = data.type;
    document.getElementById('detail-type').className = `detail-type-badge type-${data.type.toLowerCase()}`;
    document.getElementById('detail-name').textContent = data.label;
    document.getElementById('detail-icon').textContent = cfg.icon;
    document.getElementById('detail-icon').style.color = cfg.stroke;

    const propsEl = document.getElementById('detail-props');
    propsEl.innerHTML = Object.entries(data.props || {}).map(([k, v]) => `
      <tr><th>${k}</th><td>${v}</td></tr>`).join('');

    const conns = GOTHAM_DATA.edges.filter(e =>
      e.source === data.id || e.target === data.id
    );
    const connEl = document.getElementById('detail-connections');
    connEl.innerHTML = conns.map(e => {
      const otherId = e.source === data.id ? e.target : e.source;
      const other = GOTHAM_DATA.nodes.find(n => n.id === otherId);
      if (!other) return '';
      const cfg2 = NODE_COLORS[other.type] || { stroke: '#aaa' };
      const dir = e.source === data.id ? '→' : '←';
      return `<div class="conn-item" onclick="App.focusEntity('${other.id}')">
        <span class="conn-dir" style="color:${cfg2.stroke}">${dir}</span>
        <span class="conn-rel">${e.label}</span>
        <span class="conn-name">${other.label}</span>
        <span class="conn-type type-${other.type.toLowerCase()}">${other.type}</span>
      </div>`;
    }).join('') || '<div class="conn-empty">Aucune connexion</div>';
  }

  function closeDetail() {
    document.getElementById('detail-panel').classList.remove('open');
    if (graph) { graph.selected = null; }
  }

  // ─── Context Menu ─────────────────────────────────────────────────────────────
  function showContextMenu(node, x, y) {
    const menu = document.getElementById('context-menu');
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    menu.style.display = 'block';
    menu.dataset.nodeId = node.id;

    document.getElementById('ctx-focus').onclick = () => {
      graph.focusNode(graph.nodes.find(n => n.id === node.id));
      closeContextMenu();
    };
    document.getElementById('ctx-detail').onclick = () => {
      showEntityDetail(node);
      closeContextMenu();
    };
    document.getElementById('ctx-expand').onclick = () => {
      closeContextMenu();
    };
  }

  function closeContextMenu() {
    document.getElementById('context-menu').style.display = 'none';
  }

  // ─── Simulation Toggle ────────────────────────────────────────────────────────
  function toggleSim() {
    if (!graph) return;
    graph.simRunning = !graph.simRunning;
    const btn = document.getElementById('btn-sim');
    btn.textContent = graph.simRunning ? '⏸ Pause' : '▶ Simuler';
    btn.classList.toggle('active', graph.simRunning);
  }

  // ─── Investigation Loader ─────────────────────────────────────────────────────
  function loadInvestigation() {
    const inv = currentInvestigation;
    document.getElementById('inv-name').textContent   = inv.name;
    document.getElementById('inv-status').textContent = inv.status;
    document.getElementById('inv-status').className   = `inv-status status-${inv.status.replace(/ /g, '-').toLowerCase()}`;
    document.getElementById('inv-analyst').textContent = inv.analyst;
    document.getElementById('inv-created').textContent = inv.created;
    document.getElementById('inv-entities').textContent = GOTHAM_DATA.nodes.length;
    document.getElementById('inv-edges').textContent    = GOTHAM_DATA.edges.length;
    document.getElementById('inv-alerts').textContent   = GOTHAM_DATA.alerts.filter(a => a.severity === 'CRITIQUE').length;
  }

  // ─── Status Bar ───────────────────────────────────────────────────────────────
  function updateStatusBar() {
    document.getElementById('status-nodes').textContent = GOTHAM_DATA.nodes.length + ' objets';
    document.getElementById('status-edges').textContent = GOTHAM_DATA.edges.length + ' liens';
    document.getElementById('status-time').textContent  = new Date().toLocaleTimeString('fr-FR');
  }

  setInterval(updateStatusBar, 1000);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'g') showView('graph');
    if (e.key === 'o') showView('objects');
    if (e.key === 't') showView('timeline');
    if (e.key === 'Escape') { closeDetail(); if (graph) graph.selected = null; }
    if (e.key === 'f' && graph) graph.fitAll();
    if (e.key === '/') { e.preventDefault(); document.getElementById('global-search').focus(); }
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  function focusEntity(id) {
    const dataNode = GOTHAM_DATA.nodes.find(n => n.id === id);
    if (!dataNode) return;

    if (graph) {
      const gNode = graph.nodes.find(n => n.id === id);
      if (gNode) {
        showView('graph');
        graph.selected = gNode;
        graph.focusNode(gNode);
      }
    }
    showEntityDetail(dataNode);
  }

  return { init, focusEntity };
})();

window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('graph-canvas')) App.init();
});
