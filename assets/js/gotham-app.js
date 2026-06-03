// Gotham Intelligence Platform — App Controller

const App = (() => {
  let graph      = null;
  let currentView = 'graph';
  let searchTimeout = null;
  let pathModeActive = false;
  const notes = {}; // entityId → string[]
  const localNodes = JSON.parse(JSON.stringify(GOTHAM_DATA.nodes));
  const localEdges = JSON.parse(JSON.stringify(GOTHAM_DATA.edges));
  let nextId = 100;

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    setupCanvas();
    setupNavigation();
    setupSearch();
    setupFilters();
    setupAlerts();
    setupModals();
    populateObjectsTable(localNodes);
    populateTimeline();
    loadInvestigationMeta();
    updateStatusBar();
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKeyDown);
    showView('graph');
  }

  // ─── Canvas ───────────────────────────────────────────────────────────────
  function setupCanvas() {
    const canvas = document.getElementById('graph-canvas');
    const parent = canvas.parentElement;
    canvas.width  = parent.offsetWidth  || window.innerWidth  - 52;
    canvas.height = parent.offsetHeight || window.innerHeight - 78 - 26;

    graph = new GothamGraph(canvas);
    graph.onSelect      = onNodeSelected;
    graph.onContextMenu = showContextMenu;
    graph.onStabilized  = () => {
      const btn = document.getElementById('btn-sim');
      btn.textContent = '▶ Simuler';
      btn.classList.remove('active');
    };
    graph.onZoomChange = (pct) => {
      document.getElementById('zoom-level').textContent = pct + '%';
    };
    graph.onPathFound = (path) => {
      showToast(`Chemin trouvé : ${path.length} nœuds`, 'success');
    };
    graph.onPathNotFound = (src, dst) => {
      showToast(`Aucun chemin entre « ${src.label} » et « ${dst.label} »`, 'warn');
    };

    graph.load(
      JSON.parse(JSON.stringify(localNodes)),
      JSON.parse(JSON.stringify(localEdges))
    );
  }

  function onResize() {
    const canvas = document.getElementById('graph-canvas');
    const parent = canvas.parentElement;
    const w = parent.offsetWidth  || window.innerWidth  - 52;
    const h = parent.offsetHeight || window.innerHeight - 78 - 26;
    canvas.width  = w;
    canvas.height = h;
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  function setupNavigation() {
    document.querySelectorAll('[data-view]').forEach(btn =>
      btn.addEventListener('click', () => showView(btn.dataset.view))
    );
    document.querySelectorAll('.sidebar-btn[data-view]').forEach(btn =>
      btn.addEventListener('click', () => showView(btn.dataset.view))
    );

    document.getElementById('btn-fit').addEventListener('click',     () => graph?.fitAll());
    document.getElementById('btn-zoom-in').addEventListener('click', () => { if (graph) { graph.scale = Math.min(5, graph.scale * 1.3); } });
    document.getElementById('btn-zoom-out').addEventListener('click',() => { if (graph) { graph.scale = Math.max(0.1, graph.scale / 1.3); } });
    document.getElementById('btn-sim').addEventListener('click',     toggleSim);
    document.getElementById('btn-path').addEventListener('click',    togglePathMode);
    document.getElementById('btn-cluster').addEventListener('click', clusterByType);
    document.getElementById('btn-export-png').addEventListener('click', exportPNG);
    document.getElementById('btn-export-json').addEventListener('click', exportJSON);
    document.getElementById('btn-add-entity').addEventListener('click', () => openModal('modal-add'));

    document.getElementById('close-detail').addEventListener('click', closeDetail);
    document.getElementById('close-ctx').addEventListener('click',    closeContextMenu);
    document.addEventListener('click', e => { if (!e.target.closest('#context-menu')) closeContextMenu(); });
  }

  function showView(view) {
    currentView = view;
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`view-${view}`);
    if (panel) panel.classList.add('active');
    document.querySelectorAll('[data-view]').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.view === view));
    document.getElementById('graph-toolbar').style.display = view === 'graph' ? 'flex' : 'none';
    if (view === 'graph') setTimeout(() => graph?.resize(), 50);
  }

  // ─── Filters ──────────────────────────────────────────────────────────────
  function setupFilters() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        applyFilters();
      });
    });
  }

  function applyFilters() {
    const active = [...document.querySelectorAll('.filter-chip.active')].map(c => c.dataset.type);
    // Pass to graph (null = show all when all selected)
    const all = document.querySelectorAll('.filter-chip').length;
    graph?.setFilter(active.length === all ? [] : active);
    updateStatusBar();
  }

  // ─── Path Mode ────────────────────────────────────────────────────────────
  function togglePathMode() {
    pathModeActive = !pathModeActive;
    const btn = document.getElementById('btn-path');
    btn.classList.toggle('active', pathModeActive);
    btn.textContent = pathModeActive ? '✕ Annuler chemin' : '⟿ Trouver chemin';
    graph?.setPathMode(pathModeActive);
    if (!pathModeActive) graph?.clearPath();
    showToast(pathModeActive ? 'Clique sur le nœud SOURCE, puis DESTINATION' : 'Mode chemin désactivé',
              pathModeActive ? 'info' : 'default', 3000);
  }

  // ─── Cluster by type ──────────────────────────────────────────────────────
  function clusterByType() {
    if (!graph) return;
    const typeOrder = ['PERSON', 'ORG', 'LOCATION', 'EVENT', 'DOCUMENT'];
    const W = graph.canvas.width, H = graph.canvas.height;
    const cx = W / 2, cy = H / 2;
    const radius = Math.min(W, H) * 0.32;

    const byType = {};
    for (const n of graph.nodes) {
      if (!byType[n.type]) byType[n.type] = [];
      byType[n.type].push(n);
    }

    typeOrder.forEach((type, ti) => {
      if (!byType[type]) return;
      const angle = (ti / typeOrder.length) * Math.PI * 2 - Math.PI / 2;
      const gcx = cx + Math.cos(angle) * radius;
      const gcy = cy + Math.sin(angle) * radius;
      const cluster = byType[type];
      cluster.forEach((n, ni) => {
        const sub = (ni / cluster.length) * Math.PI * 2;
        const sr = Math.min(60, cluster.length * 15);
        n.x = gcx + Math.cos(sub) * sr;
        n.y = gcy + Math.sin(sub) * sr;
        n.vx = 0; n.vy = 0;
      });
    });
    graph.simRunning = true;
    graph._tick = 0;
    showToast('Nœuds regroupés par type', 'success');
  }

  // ─── Simulation ───────────────────────────────────────────────────────────
  function toggleSim() {
    if (!graph) return;
    graph.simRunning = !graph.simRunning;
    if (graph.simRunning) graph._tick = 0;
    const btn = document.getElementById('btn-sim');
    btn.textContent = graph.simRunning ? '⏸ Pause' : '▶ Simuler';
    btn.classList.toggle('active', graph.simRunning);
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  function exportPNG() {
    if (!graph) return;
    // Temporarily disable dim effect
    const sel = graph.selected;
    graph.selected = null;
    graph._render();
    const link = document.createElement('a');
    link.download = 'gotham-graphe.png';
    link.href = graph.canvas.toDataURL('image/png');
    link.click();
    graph.selected = sel;
    showToast('Graphe exporté en PNG', 'success');
  }

  function exportJSON() {
    const data = {
      investigation: GOTHAM_DATA.investigations[0],
      nodes: localNodes,
      edges: localEdges,
      alerts: GOTHAM_DATA.alerts,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'gotham-investigation.json';
    link.href = URL.createObjectURL(blob);
    link.click();
    showToast('Données exportées en JSON', 'success');
  }

  // ─── Search ───────────────────────────────────────────────────────────────
  function setupSearch() {
    const input   = document.getElementById('global-search');
    const results = document.getElementById('search-results');

    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = input.value.trim().toLowerCase();
      if (!q) { results.classList.remove('open'); return; }
      searchTimeout = setTimeout(() => doSearch(q), 180);
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
    const matches = localNodes.filter(n =>
      n.label.toLowerCase().includes(q) ||
      Object.values(n.props || {}).some(v => String(v).toLowerCase().includes(q))
    ).slice(0, 8);

    results.innerHTML = matches.length
      ? matches.map(n => `<div class="search-item" data-id="${n.id}">
          <span class="search-type-badge type-${n.type.toLowerCase()}">${n.type}</span>
          <span class="search-label">${hl(n.label, q)}</span>
        </div>`).join('')
      : `<div class="search-empty">Aucun résultat pour « ${q} »</div>`;
    results.classList.add('open');

    results.querySelectorAll('.search-item').forEach(el =>
      el.addEventListener('click', () => {
        focusEntity(el.dataset.id);
        results.classList.remove('open');
        document.getElementById('global-search').value = '';
      })
    );
  }

  function hl(text, q) {
    const i = text.toLowerCase().indexOf(q);
    if (i === -1) return text;
    return text.slice(0, i) + `<mark>${text.slice(i, i + q.length)}</mark>` + text.slice(i + q.length);
  }

  // ─── Alerts ───────────────────────────────────────────────────────────────
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
    list.querySelectorAll('.alert-item').forEach(el =>
      el.addEventListener('click', () => focusEntity(el.dataset.entity))
    );
  }

  // ─── Objects Table ────────────────────────────────────────────────────────
  function populateObjectsTable(data) {
    const tbody = document.getElementById('objects-tbody');
    document.getElementById('obj-count').textContent = `${data.length} objet${data.length > 1 ? 's' : ''}`;

    tbody.innerHTML = data.map(n => {
      const cfg  = NODE_COLORS[n.type] || { stroke: '#aaa' };
      const risk = n.props?.Risque;
      const firstProp = Object.values(n.props || {})[0] || '—';
      return `<tr data-id="${n.id}" class="objects-row">
        <td><span class="type-dot" style="background:${cfg.stroke}"></span></td>
        <td><span class="type-label type-${n.type.toLowerCase()}">${n.type}</span></td>
        <td class="entity-name">${n.label}</td>
        <td style="color:var(--text2);font-size:11px">${firstProp}</td>
        <td>${risk ? `<span class="risk-badge risk-${risk.toLowerCase()}">${risk}</span>` : '—'}</td>
        <td>
          <button class="btn-sm" onclick="App.focusEntity('${n.id}')">Graphe</button>
          <button class="btn-sm" onclick="App.deleteEntity('${n.id}')" style="color:var(--red);margin-left:3px">✕</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.objects-row').forEach(row =>
      row.addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') return;
        tbody.querySelectorAll('.objects-row').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        const n = localNodes.find(n => n.id === row.dataset.id);
        if (n) showEntityDetail(n);
      })
    );

    const filterInput = document.getElementById('objects-filter');
    filterInput.oninput = () => {
      const q = filterInput.value.trim().toLowerCase();
      populateObjectsTable(q
        ? localNodes.filter(n =>
            n.label.toLowerCase().includes(q) ||
            n.type.toLowerCase().includes(q) ||
            Object.values(n.props || {}).some(v => String(v).toLowerCase().includes(q))
          )
        : localNodes);
    };
  }

  // ─── Timeline ─────────────────────────────────────────────────────────────
  function populateTimeline() {
    const events = localNodes
      .filter(n => n.type === 'EVENT')
      .sort((a, b) => (a.props?.Date || '').localeCompare(b.props?.Date || ''));

    const container = document.getElementById('timeline-events');
    container.innerHTML = events.map((n, i) => {
      const cfg = NODE_COLORS[n.type];
      return `<div class="tl-event" style="left:${8 + i * (84 / Math.max(events.length - 1, 1))}%">
        <div class="tl-dot" style="background:${cfg.stroke};border-color:${cfg.stroke}"></div>
        <div class="tl-card">
          <div class="tl-date">${n.props?.Date || ''}</div>
          <div class="tl-title">${n.label}</div>
          ${Object.entries(n.props || {}).slice(1, 3).map(([k, v]) =>
            `<div class="tl-prop"><span>${k}</span> ${v}</div>`).join('')}
          <button class="btn-sm" onclick="App.focusEntity('${n.id}')">Détails →</button>
        </div>
      </div>`;
    }).join('');
  }

  // ─── Entity Detail Panel ──────────────────────────────────────────────────
  function onNodeSelected(node) {
    if (!node) { closeDetail(); return; }
    const dataNode = localNodes.find(n => n.id === node.id) || node;
    showEntityDetail(dataNode);
  }

  function showEntityDetail(node) {
    const cfg = NODE_COLORS[node.type] || { stroke: '#aaa', icon: '?' };
    document.getElementById('detail-panel').classList.add('open');
    document.getElementById('detail-type').textContent  = node.type;
    document.getElementById('detail-type').className    = `detail-type-badge type-${node.type.toLowerCase()}`;
    document.getElementById('detail-name').textContent  = node.label;
    document.getElementById('detail-icon').textContent  = cfg.icon;
    document.getElementById('detail-icon').style.color  = cfg.stroke;
    document.getElementById('detail-edit-btn').onclick  = () => openEditModal(node);
    document.getElementById('detail-note-btn').onclick  = () => openNoteModal(node.id);
    document.getElementById('detail-delete-btn').onclick= () => { deleteEntity(node.id); closeDetail(); };

    document.getElementById('detail-props').innerHTML =
      Object.entries(node.props || {}).map(([k, v]) =>
        `<tr><th>${k}</th><td>${v}</td></tr>`).join('');

    const conns = localEdges.filter(e => e.source === node.id || e.target === node.id);
    document.getElementById('detail-connections').innerHTML = conns.map(e => {
      const oid = e.source === node.id ? e.target : e.source;
      const other = localNodes.find(n => n.id === oid);
      if (!other) return '';
      const cfg2 = NODE_COLORS[other.type] || { stroke: '#aaa' };
      return `<div class="conn-item" onclick="App.focusEntity('${other.id}')">
        <span class="conn-dir" style="color:${cfg2.stroke}">${e.source === node.id ? '→' : '←'}</span>
        <span class="conn-rel">${e.label}</span>
        <span class="conn-name">${other.label}</span>
        <span class="conn-type type-${other.type.toLowerCase()}">${other.type}</span>
      </div>`;
    }).join('') || '<div class="conn-empty">Aucune connexion</div>';

    // Notes
    const nodeNotes = notes[node.id] || [];
    document.getElementById('detail-notes-section').style.display = nodeNotes.length ? 'block' : 'none';
    document.getElementById('detail-notes-list').innerHTML = nodeNotes.map(n =>
      `<div class="note-item">${n}</div>`).join('');
  }

  function closeDetail() {
    document.getElementById('detail-panel').classList.remove('open');
    if (graph) graph.selected = null;
  }

  // ─── Context Menu ─────────────────────────────────────────────────────────
  function showContextMenu(node, x, y) {
    const menu = document.getElementById('context-menu');
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    menu.style.display = 'block';

    document.getElementById('ctx-focus').onclick = () => {
      if (graph) { const gn = graph.nodes.find(n => n.id === node.id); if (gn) graph.focusNode(gn); }
      closeContextMenu();
    };
    document.getElementById('ctx-detail').onclick = () => {
      showEntityDetail(localNodes.find(n => n.id === node.id) || node);
      closeContextMenu();
    };
    document.getElementById('ctx-expand').onclick = () => {
      expandNeighbors(node.id); closeContextMenu();
    };
    document.getElementById('ctx-path-from').onclick = () => {
      if (!pathModeActive) togglePathMode();
      if (graph) {
        const gn = graph.nodes.find(n => n.id === node.id);
        if (gn) { graph.pathSource = gn; graph.pathNodes.add(gn.id); }
      }
      closeContextMenu();
    };
    document.getElementById('ctx-delete').onclick = () => {
      deleteEntity(node.id); closeContextMenu();
    };
    document.getElementById('ctx-edit').onclick = () => {
      openEditModal(localNodes.find(n => n.id === node.id) || node); closeContextMenu();
    };
  }

  function closeContextMenu() {
    document.getElementById('context-menu').style.display = 'none';
  }

  // ─── Expand neighbors ─────────────────────────────────────────────────────
  function expandNeighbors(nodeId) {
    if (!graph) return;
    const neighborIds = graph.getNeighbors(nodeId);
    const source = graph.nodes.find(n => n.id === nodeId);
    if (!source) return;
    graph.clearPath();
    graph.pathNodes.add(nodeId);
    neighborIds.forEach(id => {
      graph.pathNodes.add(id);
      const e = localEdges.find(e =>
        (e.source === nodeId && e.target === id) ||
        (e.source === id && e.target === nodeId));
      if (e) graph.pathEdges.add(e.id);
    });
    showToast(`${neighborIds.length} voisin${neighborIds.length > 1 ? 's' : ''} mis en évidence`, 'info');
  }

  // ─── Add / Edit / Delete entity ───────────────────────────────────────────
  function setupModals() {
    // Add entity
    document.getElementById('modal-add-form').addEventListener('submit', e => {
      e.preventDefault();
      const type  = document.getElementById('add-type').value;
      const label = document.getElementById('add-label').value.trim();
      const risk  = document.getElementById('add-risk').value;
      if (!label) return;
      const id = 'custom_' + (++nextId);
      const newNode = {
        id, type, label,
        x: null, y: null,
        props: risk ? { Risque: risk } : {},
      };
      localNodes.push(newNode);
      graph?.addNode(newNode);
      graph?.simRunning || (graph.simRunning = true);
      graph._tick = 0;
      populateObjectsTable(localNodes);
      closeModal('modal-add');
      setTimeout(() => focusEntity(id), 400);
      showToast(`Entité « ${label} » ajoutée`, 'success');
    });

    // Edit entity
    document.getElementById('modal-edit-form').addEventListener('submit', e => {
      e.preventDefault();
      const id    = document.getElementById('edit-id').value;
      const label = document.getElementById('edit-label').value.trim();
      const node  = localNodes.find(n => n.id === id);
      if (!node || !label) return;
      node.label = label;
      const gn = graph?.nodes.find(n => n.id === id);
      if (gn) gn.label = label;
      populateObjectsTable(localNodes);
      showEntityDetail(node);
      closeModal('modal-edit');
      showToast(`Entité renommée en « ${label} »`, 'success');
    });

    // Note modal
    document.getElementById('modal-note-form').addEventListener('submit', e => {
      e.preventDefault();
      const id   = document.getElementById('note-entity-id').value;
      const text = document.getElementById('note-text').value.trim();
      if (!text) return;
      if (!notes[id]) notes[id] = [];
      notes[id].push(text);
      const node = localNodes.find(n => n.id === id);
      if (node) showEntityDetail(node);
      closeModal('modal-note');
      showToast('Note ajoutée', 'success');
    });

    // Modal backdrop close
    document.querySelectorAll('.modal-backdrop').forEach(m =>
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); })
    );
    document.querySelectorAll('.modal-close').forEach(btn =>
      btn.addEventListener('click', () => btn.closest('.modal-backdrop').classList.remove('open'))
    );
  }

  function openModal(id) {
    document.getElementById(id).classList.add('open');
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
  }
  function openEditModal(node) {
    document.getElementById('edit-id').value    = node.id;
    document.getElementById('edit-label').value = node.label;
    document.getElementById('edit-type-display').textContent = node.type;
    openModal('modal-edit');
  }
  function openNoteModal(nodeId) {
    document.getElementById('note-entity-id').value = nodeId;
    document.getElementById('note-text').value      = '';
    const node = localNodes.find(n => n.id === nodeId);
    document.getElementById('note-entity-name').textContent = node?.label || nodeId;
    openModal('modal-note');
  }

  function deleteEntity(id) {
    const idx = localNodes.findIndex(n => n.id === id);
    if (idx === -1) return;
    const name = localNodes[idx].label;
    localNodes.splice(idx, 1);
    for (let i = localEdges.length - 1; i >= 0; i--) {
      if (localEdges[i].source === id || localEdges[i].target === id) localEdges.splice(i, 1);
    }
    graph?.removeNode(id);
    populateObjectsTable(localNodes);
    updateStatusBar();
    showToast(`Entité « ${name} » supprimée`, 'warn');
  }

  // ─── Investigation header ─────────────────────────────────────────────────
  function loadInvestigationMeta() {
    const inv = GOTHAM_DATA.investigations[0];
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('inv-name',    inv.name);
    set('inv-analyst', inv.analyst);
    set('inv-entities', localNodes.length);
    set('inv-edges',    localEdges.length);
    set('inv-alerts',   GOTHAM_DATA.alerts.filter(a => a.severity === 'CRITIQUE').length);
    const statusEl = document.getElementById('inv-status');
    if (statusEl) {
      statusEl.textContent = inv.status;
      statusEl.className   = `inv-status status-${inv.status.replace(/ /g, '-').toLowerCase()}`;
    }
  }

  // ─── Status Bar ───────────────────────────────────────────────────────────
  function updateStatusBar() {
    const vis = graph ? graph.nodes.filter(n => graph._isVisible(n)).length : localNodes.length;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('status-nodes', `${vis} / ${localNodes.length}`);
    set('status-edges', `${localEdges.length}`);
    set('status-time',  new Date().toLocaleTimeString('fr-FR'));
    set('zoom-level',   (graph ? graph.getZoom() : 100) + '%');
  }

  setInterval(updateStatusBar, 1000);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  function onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'g')       showView('graph');
    if (k === 'o')       showView('objects');
    if (k === 't')       showView('timeline');
    if (k === 'escape')  { closeDetail(); graph?.setPathMode(false); if (pathModeActive) togglePathMode(); }
    if (k === 'f' && currentView === 'graph') graph?.fitAll();
    if (k === '/')       { e.preventDefault(); document.getElementById('global-search').focus(); }
    if (k === 'p')       togglePathMode();
    if (k === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openModal('modal-add'); }
    if (k === 'delete' && graph?.selected) { deleteEntity(graph.selected.id); closeDetail(); }
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  function showToast(msg, type = 'default', duration = 2500) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, duration);
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  function focusEntity(id) {
    const dataNode = localNodes.find(n => n.id === id);
    if (!dataNode) return;
    if (graph) {
      const gn = graph.nodes.find(n => n.id === id);
      if (gn) {
        showView('graph');
        graph.selected = gn;
        graph.focusNode(gn);
      }
    }
    showEntityDetail(dataNode);
  }

  return { init, focusEntity, deleteEntity };
})();

window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('graph-canvas')) App.init();
});
