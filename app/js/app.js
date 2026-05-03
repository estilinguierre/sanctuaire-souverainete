'use strict';

class App {
  constructor() {
    this.canvas   = document.getElementById('main-canvas');
    this.drawing  = new Drawing();
    this.viewport = new Viewport(this.canvas);
    this.renderer = new Renderer(this.viewport, this.drawing);

    this._tools = {};
    this._activeTool = null;
    this._panStart    = null;
    this._isPanning   = false;
    this._touchDist   = 0;
    this._lastTouchCt = 0;
    this._clipboard   = [];

    this._initTools();
    this._initEvents();
    this._initUI();
    this._selectTool('select');

    // Initial center & fit
    this.viewport.ox = this.viewport.W / 2;
    this.viewport.oy = this.viewport.H / 2;
    this.viewport.scale = 3;

    this.renderer.markDirty();
    this._updateStatus();
  }

  // ── Tools ─────────────────────────────────────────────────────────────────
  _initTools() {
    const t = this._tools;
    t.select       = new SelectTool(this);
    t.line         = new LineTool(this);
    t.polyline     = new PolylineTool(this);
    t.rect         = new RectTool(this);
    t.circle       = new CircleTool(this);
    t.arc          = new ArcTool(this);
    t.text         = new TextTool(this);
    t['dim-horiz'] = new DimLinearTool(this, 'horizontal');
    t['dim-vert']  = new DimLinearTool(this, 'vertical');
    t['dim-align'] = new DimLinearTool(this, 'aligned');
    t['dim-angle'] = new DimAngularTool(this);
    t['dim-radiu'] = new DimRadiusTool(this);
    t.measure      = new MeasureTool(this);
  }

  _selectTool(name) {
    if (this._activeTool) this._activeTool.deactivate();
    this._activeTool = this._tools[name] || this._tools.select;
    this._activeTool.activate();
    this.canvas.style.cursor = this._activeTool.cursor || 'crosshair';
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === name);
    });
    const hintEl = document.getElementById('status-hint');
    if (hintEl) hintEl.textContent = this._activeTool.hint;
    document.getElementById('status-tool').textContent = 'Outil: ' + this._toolLabel(name);
  }

  _toolLabel(name) {
    const labels = {
      select: 'Sélection', line: 'Ligne', polyline: 'Polyligne', rect: 'Rectangle',
      circle: 'Cercle', arc: 'Arc', text: 'Texte',
      'dim-horiz': 'Cote H', 'dim-vert': 'Cote V', 'dim-align': 'Cote alignée',
      'dim-angle': 'Cote angulaire', 'dim-radiu': 'Rayon/Diam.', measure: 'Mesure',
    };
    return labels[name] || name;
  }

  // ── Canvas events ─────────────────────────────────────────────────────────
  _initEvents() {
    const cv = this.canvas;

    // Resize
    const ro = new ResizeObserver(() => { this.viewport._resize(); this.renderer.markDirty(); });
    ro.observe(cv);

    // Mouse
    cv.addEventListener('mousedown',  e => this._onMouseDown(e));
    cv.addEventListener('mousemove',  e => this._onMouseMove(e));
    cv.addEventListener('mouseup',    e => this._onMouseUp(e));
    cv.addEventListener('dblclick',   e => this._onDblClick(e));
    cv.addEventListener('contextmenu',e => { e.preventDefault(); this._onContextMenu(e); });
    cv.addEventListener('wheel',      e => { e.preventDefault(); this._onWheel(e); }, { passive: false });

    // Touch
    cv.addEventListener('touchstart',  e => this._onTouchStart(e),  { passive: false });
    cv.addEventListener('touchmove',   e => this._onTouchMove(e),   { passive: false });
    cv.addEventListener('touchend',    e => this._onTouchEnd(e),    { passive: false });

    // Keyboard
    window.addEventListener('keydown', e => this._onKeyDown(e));

    // Menu / toolbar buttons
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => this._selectTool(btn.dataset.tool));
    });

    // Undo / Redo / Export / Save
    document.getElementById('btn-undo')?.addEventListener('click',   () => this._undo());
    document.getElementById('btn-redo')?.addEventListener('click',   () => this._redo());
    document.getElementById('btn-export')?.addEventListener('click', () => this._exportSVG());
    document.getElementById('btn-save')?.addEventListener('click',   () => this._saveJSON());
    document.getElementById('btn-open')?.addEventListener('click',   () => this._openJSON());
    document.getElementById('btn-new')?.addEventListener('click',    () => this._newDrawing());
    document.getElementById('btn-print')?.addEventListener('click',   () => this._printSVG());
    document.getElementById('btn-zoom-fit')?.addEventListener('click',() => { this.viewport.zoomToFit(this.drawing); this.renderer.markDirty(); });
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => { this.viewport.zoom(1.25, this.viewport.W/2, this.viewport.H/2); this.renderer.markDirty(); this._updateStatus(); });
    document.getElementById('btn-zoom-out')?.addEventListener('click',() => { this.viewport.zoom(0.8,  this.viewport.W/2, this.viewport.H/2); this.renderer.markDirty(); this._updateStatus(); });

    // Snap checkboxes
    ['grid','endpoint','midpoint','center'].forEach(k => {
      const el = document.getElementById('snap-' + k);
      if (el) {
        el.checked = this.drawing['snap' + k[0].toUpperCase() + k.slice(1)];
        el.addEventListener('change', () => {
          this.drawing['snap' + k[0].toUpperCase() + k.slice(1)] = el.checked;
        });
      }
    });

    // Grid spacing
    const gsEl = document.getElementById('grid-spacing');
    if (gsEl) {
      gsEl.value = this.drawing.gridSpacing;
      gsEl.addEventListener('change', () => {
        const v = parseFloat(gsEl.value);
        if (v > 0) { this.drawing.gridSpacing = v; this.renderer.markDirty(); }
      });
    }

    // Grid visible
    const gvEl = document.getElementById('grid-visible');
    if (gvEl) {
      gvEl.checked = this.renderer.showGrid;
      gvEl.addEventListener('change', () => { this.renderer.showGrid = gvEl.checked; this.renderer.markDirty(); });
    }

    // Paper format / scale / orientation
    const pfEl = document.getElementById('paper-format');
    if (pfEl) {
      pfEl.value = this.drawing.paperFormat;
      pfEl.addEventListener('change', () => { this.drawing.paperFormat = pfEl.value; this.renderer.markDirty(); });
    }
    const poEl = document.getElementById('paper-orient');
    if (poEl) {
      poEl.value = this.drawing.paperOrientation;
      poEl.addEventListener('change', () => { this.drawing.paperOrientation = poEl.value; this.renderer.markDirty(); });
    }
    const scEl = document.getElementById('drawing-scale');
    if (scEl) {
      scEl.value = String(this.drawing.drawingScale);
      scEl.addEventListener('change', () => {
        const v = parseFloat(scEl.value);
        if (v > 0 && v <= 1) { this.drawing.drawingScale = v; this.renderer.markDirty(); }
      });
    }
    const spEl = document.getElementById('show-paper');
    if (spEl) {
      spEl.checked = this.drawing.showPaperFrame;
      spEl.addEventListener('change', () => { this.drawing.showPaperFrame = spEl.checked; this.renderer.markDirty(); });
    }
    const titleEl = document.getElementById('drawing-title');
    if (titleEl) {
      titleEl.value = this.drawing.title;
      titleEl.addEventListener('input', () => { this.drawing.title = titleEl.value; });
    }

    // Template buttons
    document.querySelectorAll('.tpl-btn[data-template]').forEach(btn => {
      btn.addEventListener('click', () => this._showTemplateDialog(btn.dataset.template));
    });

    // Context menu
    document.getElementById('ctx-delete')?.addEventListener('click', () => {
      this.drawing.removeSelected(); this.renderer.markDirty(); this._hideContextMenu();
    });
    document.getElementById('ctx-select-all')?.addEventListener('click', () => {
      this.drawing.selectAll(); this.renderer.markDirty(); this._hideContextMenu();
    });
    document.getElementById('ctx-deselect')?.addEventListener('click', () => {
      this.drawing.deselectAll(); this.renderer.markDirty(); this._hideContextMenu();
    });
    document.addEventListener('click', () => this._hideContextMenu());

    // Layers
    document.querySelectorAll('.layer-item[data-layer]').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.layer-item').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        this.drawing.activeLayer = parseInt(el.dataset.layer, 10);
      });
    });
  }

  _canvasPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return { cx: e.clientX - r.left, cy: e.clientY - r.top };
  }

  _worldSnap(cx, cy) {
    const world = this.viewport.toWorld(cx, cy);
    const snap  = this.drawing.findSnapPoint(world, this.viewport.scale);
    this.renderer.snapPoint = snap;
    return { world, snap };
  }

  _onMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this._isPanning = true;
      this._panStart  = { cx: e.clientX, cy: e.clientY };
      return;
    }
    if (e.button === 2) return;
    const { cx, cy } = this._canvasPoint(e);
    const { world, snap } = this._worldSnap(cx, cy);
    this._activeTool.onMouseDown(e, world, snap);
    this._updateStatus(snap);
  }

  _onMouseMove(e) {
    if (this._isPanning) {
      const dx = e.clientX - this._panStart.cx;
      const dy = e.clientY - this._panStart.cy;
      this.viewport.pan(dx, dy);
      this._panStart = { cx: e.clientX, cy: e.clientY };
      this.renderer.markDirty();
      return;
    }
    const { cx, cy } = this._canvasPoint(e);
    const { world, snap } = this._worldSnap(cx, cy);
    this._activeTool.onMouseMove(e, world, snap);
    this._updateStatus(snap);
    this.renderer.markDirty();
  }

  _onMouseUp(e) {
    if (this._isPanning) { this._isPanning = false; return; }
    const { cx, cy } = this._canvasPoint(e);
    const { world, snap } = this._worldSnap(cx, cy);
    this._activeTool.onMouseUp(e, world, snap);
    this._updateStatus(snap);
  }

  _onDblClick(e) {
    const { cx, cy } = this._canvasPoint(e);
    const { world, snap } = this._worldSnap(cx, cy);
    this._activeTool.onDblClick(e, world, snap);
  }

  _onContextMenu(e) {
    const { cx, cy } = this._canvasPoint(e);
    const { world, snap } = this._worldSnap(cx, cy);
    // auto-select if nothing selected
    const thr = 8 / this.viewport.scale;
    const hit = this.drawing.selectAt(world, thr);
    if (hit && !hit.selected) { this.drawing.deselectAll(); hit.selected = true; }
    this._showContextMenu(e.clientX, e.clientY);
    this.renderer.markDirty();
  }

  _onWheel(e) {
    const { cx, cy } = this._canvasPoint(e);
    const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
    this.viewport.zoom(factor, cx, cy);
    this.renderer.markDirty();
    this._updateStatus();
  }

  // Touch support (Android)
  _onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const { cx, cy } = this._canvasPoint(t);
      const { world, snap } = this._worldSnap(cx, cy);
      this._lastTouchCt = Date.now();
      this._activeTool.onMouseDown({ button: 0, shiftKey: false }, world, snap);
      this._updateStatus(snap);
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this._touchDist = Math.hypot(dx, dy);
      this._panStart = {
        cx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        cy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const { cx, cy } = this._canvasPoint(t);
      const { world, snap } = this._worldSnap(cx, cy);
      this._activeTool.onMouseMove({ button: 0 }, world, snap);
      this._updateStatus(snap);
      this.renderer.markDirty();
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      if (this._touchDist > 0) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect  = this.canvas.getBoundingClientRect();
        this.viewport.zoom(newDist / this._touchDist, midX - rect.left, midY - rect.top);
        if (this._panStart) {
          this.viewport.pan(midX - this._panStart.cx, midY - this._panStart.cy);
          this._panStart = { cx: midX, cy: midY };
        }
      }
      this._touchDist = newDist;
      this.renderer.markDirty();
    }
  }

  _onTouchEnd(e) {
    e.preventDefault();
    if (e.touches.length === 0) {
      const t = e.changedTouches[0];
      const { cx, cy } = this._canvasPoint(t);
      const { world, snap } = this._worldSnap(cx, cy);
      this._activeTool.onMouseUp({ button: 0 }, world, snap);
      // Double-tap detection
      const now = Date.now();
      if (now - this._lastTouchCt < 300) {
        this._activeTool.onDblClick({ button: 0 }, world, snap);
      }
    }
    this._touchDist = 0;
  }

  _onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Global Ctrl shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'z': e.preventDefault(); this._undo(); return;
        case 'y': e.preventDefault(); this._redo(); return;
        case 'a': e.preventDefault(); this.drawing.selectAll(); this.renderer.markDirty(); return;
        case 's': e.preventDefault(); this._saveJSON(); return;
        case 'e': e.preventDefault(); this._exportSVG(); return;
        case 'p': e.preventDefault(); this._printSVG(); return;
        case 'c':
          e.preventDefault();
          this._clipboard = this.drawing.getSelected().map(ent => this._cloneEntity(ent, 10, 10)).filter(Boolean);
          this.setStatus(`${this._clipboard.length} élément(s) copié(s) — Ctrl+V pour coller`);
          return;
        case 'x':
          e.preventDefault();
          this._clipboard = this.drawing.getSelected().map(ent => this._cloneEntity(ent, 10, 10)).filter(Boolean);
          this.drawing.removeSelected();
          this.renderer.markDirty();
          this.setStatus(`${this._clipboard.length} élément(s) coupé(s)`);
          return;
        case 'v':
          e.preventDefault();
          if (this._clipboard.length) {
            this.drawing.deselectAll();
            const fresh = this._clipboard.map(ent => this._cloneEntity(ent, 0, 0)).filter(Boolean);
            fresh.forEach(ent => { ent.selected = true; this.drawing.entities.push(ent); });
            // Offset clipboard for successive pastes
            this._clipboard = this._clipboard.map(ent => this._cloneEntity(ent, 10, 10)).filter(Boolean);
            this.drawing.commit();
            this.renderer.markDirty();
            this.updatePropsPanel();
            this.setStatus(`${fresh.length} élément(s) collé(s)`);
          }
          return;
        case 'd':
          e.preventDefault();
          this.drawing.deselectAll();
          this.renderer.markDirty();
          return;
      }
    }

    // Arrow keys → nudge selected elements
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      const sel = this.drawing.getSelected();
      if (sel.length) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : this.drawing.gridSpacing;
        const off  = new Vec2(
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
          e.key === 'ArrowUp'   ?  step : e.key === 'ArrowDown'  ? -step : 0
        );
        sel.forEach(ent => this._nudgeEntity(ent, off));
        this.drawing.commit();
        this.renderer.markDirty();
        this.updatePropsPanel();
        return;
      }
    }

    // Tool shortcuts
    const shortcuts = {
      'Escape': 'select', 'v': 'select',
      'l': 'line', 'p': 'polyline', 'r': 'rect',
      'c': 'circle', 'a': 'arc', 't': 'text',
      'h': 'dim-horiz', 'q': 'dim-vert',
      'd': 'dim-align', 'g': 'dim-angle', 'f': 'dim-radiu',
      'm': 'measure',
    };
    if (shortcuts[e.key] && !e.ctrlKey) {
      this._selectTool(shortcuts[e.key]);
      return;
    }

    this._activeTool.onKeyDown(e);
  }

  // ── Clone / Nudge ─────────────────────────────────────────────────────────
  _cloneEntity(e, dx = 0, dy = 0) {
    const off = new Vec2(dx, dy);
    let ne;
    if      (e instanceof LineEntity)        ne = new LineEntity(e.p1.add(off), e.p2.add(off));
    else if (e instanceof CircleEntity)      ne = new CircleEntity(e.center.add(off), e.radius);
    else if (e instanceof ArcEntity)         ne = new ArcEntity(e.center.add(off), e.radius, e.startAngle, e.endAngle, e.ccw);
    else if (e instanceof PolylineEntity)    ne = new PolylineEntity(e.points.map(p => p.add(off)), e.closed);
    else if (e instanceof TextEntity)        ne = new TextEntity(e.pos.add(off), e.text, e.height, e.angle);
    else if (e instanceof LinearDimension) {
      ne = new LinearDimension(e.p1.add(off), e.p2.add(off), e.offset, e.dir);
      ne.textOverride = e.textOverride; ne.suffix = e.suffix; ne.decimals = e.decimals;
    } else return null;
    ne.layer = e.layer; ne.color = e.color; ne.lineWidth = e.lineWidth;
    return ne;
  }

  _nudgeEntity(e, off) {
    if      (e instanceof LineEntity)         { e.p1 = e.p1.add(off); e.p2 = e.p2.add(off); }
    else if (e instanceof CircleEntity)       { e.center = e.center.add(off); }
    else if (e instanceof ArcEntity)          { e.center = e.center.add(off); }
    else if (e instanceof PolylineEntity)     { e.points = e.points.map(p => p.add(off)); }
    else if (e instanceof TextEntity)         { e.pos = e.pos.add(off); }
    else if (e instanceof LinearDimension)    { e.p1 = e.p1.add(off); e.p2 = e.p2.add(off); }
    else if (e instanceof AngularDimension)   { e.vertex = e.vertex.add(off); e.refP1 = e.refP1.add(off); e.refP2 = e.refP2.add(off); }
    else if (e instanceof RadiusDimension)    { e.center = e.center.add(off); e.pointOnCircle = e.pointOnCircle.add(off); }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  setHint(txt) {
    const el = document.getElementById('status-hint');
    if (el) el.textContent = txt;
  }

  setStatus(txt) {
    const el = document.getElementById('status-info');
    if (el) el.textContent = txt;
  }

  _updateStatus(snap) {
    const vp = this.viewport;
    document.getElementById('status-zoom').textContent = `Zoom: ${Math.round(vp.scale * 100 / 3)}%`;

    if (snap) {
      const p = snap.point;
      document.getElementById('status-coords').textContent = `X: ${fmt(p.x, 2)}  Y: ${fmt(p.y, 2)}`;
      const snapNames = { grid: 'GRILLE', endpoint: 'EXTRÉMITÉ', midpoint: 'MILIEU',
                          center: 'CENTRE', quadrant: 'QUADRANT', free: '' };
      document.getElementById('status-snap').textContent = snap.type !== 'free' ? `ACCRO: ${snapNames[snap.type] || snap.type.toUpperCase()}` : '';
    }
  }

  updatePropsPanel() {
    const sel = this.drawing.getSelected();
    const noSel = document.getElementById('no-selection');
    const selPan = document.getElementById('selection-props');
    if (!noSel || !selPan) return;

    if (!sel.length) {
      noSel.style.display = ''; selPan.style.display = 'none'; return;
    }
    noSel.style.display = 'none'; selPan.style.display = '';

    const e = sel[0];
    const hide = id => { const el = document.getElementById(id); if (el) el.closest('.prop-row').style.display = 'none'; };
    const show = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.closest('.prop-row').style.display = '';
      if (el.tagName === 'SPAN') el.textContent = val;
      else if (el.tagName !== 'INPUT' || el.type !== 'number') el.value = val;
      else el.value = typeof val === 'number' ? parseFloat(val.toFixed(4)) : val;
    };

    ['prop-x','prop-y','prop-length','prop-angle','prop-radius','prop-diam'].forEach(hide);

    const typeNames = { line:'Ligne', circle:'Cercle', arc:'Arc', polyline:'Polyligne',
                        text:'Texte', dim_linear:'Cote lin.', dim_angular:'Cote ang.', dim_radius:'Rayon/Diam.' };
    document.getElementById('prop-type').textContent = typeNames[e.type] || e.type;

    if (e instanceof LineEntity) {
      show('prop-x',      e.p1.x);
      show('prop-y',      e.p1.y);
      show('prop-length', fmt(e.length) + ' mm');
      show('prop-angle',  fmt(e.angle) + '°');
    } else if (e instanceof CircleEntity) {
      show('prop-x',      e.center.x);
      show('prop-y',      e.center.y);
      show('prop-radius', fmt(e.radius) + ' mm');
      show('prop-diam',   fmt(e.diameter) + ' mm');
      show('prop-length', 'C=' + fmt(e.circumference) + ' mm');
    } else if (e instanceof ArcEntity) {
      show('prop-x',      e.center.x);
      show('prop-y',      e.center.y);
      show('prop-radius', fmt(e.radius) + ' mm');
      show('prop-angle',  fmt(rad2deg(e.sweepAngle), 1) + '°');
      show('prop-length', fmt(e.arcLength) + ' mm');
    } else if (e instanceof TextEntity) {
      show('prop-x', e.pos.x); show('prop-y', e.pos.y);
    } else if (e instanceof LinearDimension) {
      show('prop-length', fmt(e.value) + ' mm');
    } else if (e instanceof AngularDimension) {
      show('prop-angle', fmt(e.angle, 1) + '°');
    } else if (e instanceof RadiusDimension) {
      show('prop-radius', fmt(e.radius) + ' mm');
      show('prop-diam',   fmt(e.radius * 2) + ' mm');
    }

    // Color
    const colEl = document.getElementById('prop-color');
    if (colEl) {
      const c = this.drawing.layerColor(e);
      try { colEl.value = c.length === 7 ? c : '#e0e0e0'; } catch {}
      colEl.onchange = () => { e.color = colEl.value; this.renderer.markDirty(); };
    }
  }

  // ── Context menu ──────────────────────────────────────────────────────────
  _showContextMenu(x, y) {
    const cm = document.getElementById('context-menu');
    if (!cm) return;
    cm.style.display = 'block';
    cm.style.left = x + 'px';
    cm.style.top  = y + 'px';
  }
  _hideContextMenu() {
    const cm = document.getElementById('context-menu');
    if (cm) cm.style.display = 'none';
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  _undo() {
    if (this.drawing.undo()) { this.renderer.markDirty(); this.updatePropsPanel(); }
  }
  _redo() {
    if (this.drawing.redo()) { this.renderer.markDirty(); this.updatePropsPanel(); }
  }

  _exportSVG() {
    const svg  = this.drawing.toSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = (this.drawing.title || 'dessin') + '.svg';
    a.click(); URL.revokeObjectURL(url);
  }

  _printSVG() {
    const svg = this.drawing.toSVG();
    const PAPER = { A0:[841,1189], A1:[594,841], A2:[420,594], A3:[297,420], A4:[210,297], Letter:[216,279] };
    const [pw, ph] = PAPER[this.drawing.paperFormat] || PAPER.A4;
    const isLand   = this.drawing.paperOrientation === 'landscape';
    const pageW    = isLand ? Math.max(pw, ph) : Math.min(pw, ph);
    const pageH    = isLand ? Math.min(pw, ph) : Math.max(pw, ph);
    const win = window.open('', '_blank');
    if (!win) { alert('Autoriser les popups pour imprimer.'); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${this.drawing.title || 'MetalSketch'}</title><style>
*{margin:0;padding:0;box-sizing:border-box}
@page{size:${pageW}mm ${pageH}mm;margin:0}
body{width:${pageW}mm;height:${pageH}mm;overflow:hidden}
svg{width:${pageW}mm;height:${pageH}mm;display:block}
</style></head><body>${svg}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  }

  _saveJSON() {
    const data = {
      title: this.drawing.title,
      units: this.drawing.units,
      entities: this.drawing.entities.map(e => e.serialize()),
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = (this.drawing.title || 'dessin') + '.json';
    a.click(); URL.revokeObjectURL(url);
  }

  _openJSON() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          this.drawing = new Drawing();
          const DESER = {
            line: LineEntity.deserialize, circle: CircleEntity.deserialize,
            arc: ArcEntity.deserialize, polyline: PolylineEntity.deserialize,
            text: TextEntity.deserialize, dim_linear: LinearDimension.deserialize,
            dim_angular: AngularDimension.deserialize, dim_radius: RadiusDimension.deserialize,
          };
          for (const d of (data.entities || [])) {
            const fn = DESER[d.type]; if (fn) this.drawing.entities.push(fn(d));
          }
          this.renderer.drawing = this.drawing;
          this.viewport.zoomToFit(this.drawing);
          this.renderer.markDirty();
        } catch (err) { alert('Erreur de lecture: ' + err.message); }
      };
      reader.readAsText(f);
    };
    inp.click();
  }

  _newDrawing() {
    if (this.drawing.entities.length && !confirm('Créer un nouveau dessin ? Les modifications non sauvegardées seront perdues.')) return;
    this.drawing = new Drawing();
    this.renderer.drawing = this.drawing;
    this.renderer.markDirty();
    this.updatePropsPanel();
  }

  // ── Template dialogs ──────────────────────────────────────────────────────
  _initUI() {
    // Wire template dialog close
    document.getElementById('dialog-cancel')?.addEventListener('click', () => this._closeDialog());
  }

  _showTemplateDialog(name) {
    const overlay = document.getElementById('dialog-overlay');
    const title   = document.getElementById('dialog-title');
    const content = document.getElementById('dialog-content');
    const okBtn   = document.getElementById('dialog-ok');
    if (!overlay) return;

    const templates = {
      cylinder: {
        label: 'Cylindre / Corps de tube',
        fields: [
          { id: 'tpl-diam',  label: 'Diamètre (mm)',  type: 'number', value: 100, min: 1 },
          { id: 'tpl-len',   label: 'Longueur (mm)',  type: 'number', value: 200, min: 1 },
          { id: 'tpl-thick', label: 'Épaisseur (mm)', type: 'number', value: 2,   min: 0.1, step: 0.1 },
        ],
        run: () => {
          const D = parseFloat(document.getElementById('tpl-diam').value);
          const L = parseFloat(document.getElementById('tpl-len').value);
          const t = parseFloat(document.getElementById('tpl-thick').value);
          return Templates.cylinder({ diameter: D, length: L, thickness: t });
        },
      },
      cone: {
        label: 'Cône / Tronc de cône',
        fields: [
          { id: 'tpl-rtop',  label: 'Rayon haut (mm)', type: 'number', value: 30, min: 0 },
          { id: 'tpl-rbot',  label: 'Rayon bas (mm)',  type: 'number', value: 80, min: 1 },
          { id: 'tpl-ht',    label: 'Hauteur (mm)',    type: 'number', value: 150, min: 1 },
        ],
        run: () => {
          const r1 = parseFloat(document.getElementById('tpl-rtop').value);
          const r2 = parseFloat(document.getElementById('tpl-rbot').value);
          const h  = parseFloat(document.getElementById('tpl-ht').value);
          return Templates.cone({ rTop: r1, rBot: r2, height: h });
        },
      },
      elbow: {
        label: 'Coude segmenté',
        fields: [
          { id: 'tpl-diam',  label: 'Diamètre tube (mm)',  type: 'number', value: 100, min: 1 },
          { id: 'tpl-rcl',   label: 'Rayon CL (mm)',       type: 'number', value: 200, min: 1 },
          { id: 'tpl-ang',   label: 'Angle total (°)',     type: 'number', value: 90,  min: 1, max: 180 },
          { id: 'tpl-seg',   label: 'Nb de segments',      type: 'number', value: 5,   min: 2, max: 20 },
        ],
        run: () => {
          return Templates.elbow({
            diameter:   parseFloat(document.getElementById('tpl-diam').value),
            bendRadius: parseFloat(document.getElementById('tpl-rcl').value),
            angle:      parseFloat(document.getElementById('tpl-ang').value),
            segments:   parseInt(document.getElementById('tpl-seg').value, 10),
          });
        },
      },
      rect2round: {
        label: 'Transition Rectangulaire → Rond',
        fields: [
          { id: 'tpl-rw',  label: 'Largeur rect. (mm)',   type: 'number', value: 200, min: 1 },
          { id: 'tpl-rh',  label: 'Hauteur rect. (mm)',   type: 'number', value: 150, min: 1 },
          { id: 'tpl-cd',  label: 'Diamètre cercle (mm)', type: 'number', value: 100, min: 1 },
          { id: 'tpl-cht', label: 'Hauteur trans. (mm)',  type: 'number', value: 200, min: 1 },
        ],
        run: () => {
          return Templates.rectToRound({
            rectW:    parseFloat(document.getElementById('tpl-rw').value),
            rectH:    parseFloat(document.getElementById('tpl-rh').value),
            circDiam: parseFloat(document.getElementById('tpl-cd').value),
            height:   parseFloat(document.getElementById('tpl-cht').value),
          });
        },
      },
      bend: {
        label: 'Calculateur de pli (développé)',
        fields: [
          { id: 'tpl-bang',  label: 'Angle de pli (°)',         type: 'number', value: 90,   min: 1, max: 180 },
          { id: 'tpl-bir',   label: 'Rayon intérieur (mm)',     type: 'number', value: 3,    min: 0 },
          { id: 'tpl-bthk',  label: 'Épaisseur tôle (mm)',      type: 'number', value: 2,    min: 0.1, step: 0.1 },
          { id: 'tpl-bkf',   label: 'Facteur K',                type: 'number', value: 0.44, min: 0.1, max: 0.5, step: 0.01 },
          { id: 'tpl-bl1',   label: 'Bras 1 (mm)',              type: 'number', value: 100,  min: 0 },
          { id: 'tpl-bl2',   label: 'Bras 2 (mm)',              type: 'number', value: 100,  min: 0 },
        ],
        run: () => {
          const angle = parseFloat(document.getElementById('tpl-bang').value);
          const ir    = parseFloat(document.getElementById('tpl-bir').value);
          const thk   = parseFloat(document.getElementById('tpl-bthk').value);
          const kf    = parseFloat(document.getElementById('tpl-bkf').value);
          const l1    = parseFloat(document.getElementById('tpl-bl1').value);
          const l2    = parseFloat(document.getElementById('tpl-bl2').value);
          const ba    = Templates.bendAllowance({ angle, innerRadius: ir, thickness: thk, kFactor: kf });
          const flat  = l1 + l2 + ba.bendAllowance;
          alert(
            `═══ Résultat calcul de pli ═══\n` +
            `Développé du pli (BA): ${fmt(ba.bendAllowance, 3)} mm\n` +
            `Déduction de pli (BD): ${fmt(ba.bendDeduction, 3)} mm\n` +
            `Recul extérieur (OSSB): ${fmt(ba.outsideSetback, 3)} mm\n\n` +
            `Longueur développée totale: ${fmt(flat, 2)} mm\n` +
            `(Bras 1: ${fmt(l1)} + BA: ${fmt(ba.bendAllowance,2)} + Bras 2: ${fmt(l2)})`
          );
          return null;
        },
      },
    };

    const tpl = templates[name];
    if (!tpl) return;

    title.textContent = tpl.label;
    content.innerHTML = tpl.fields.map(f => `
      <div class="dialog-field">
        <label for="${f.id}">${f.label}</label>
        <input type="${f.type}" id="${f.id}" value="${f.value}"
               ${f.min  !== undefined ? `min="${f.min}"`   : ''}
               ${f.max  !== undefined ? `max="${f.max}"`   : ''}
               ${f.step !== undefined ? `step="${f.step}"` : ''}>
      </div>`).join('');

    okBtn.onclick = () => {
      try {
        const result = tpl.run();
        if (result) {
          // Place entities offset from current view center
          const cx = this.viewport.toWorld(this.viewport.W/2, this.viewport.H/2);
          this.drawing.addMany(result.entities);
          this.viewport.zoomToFit(this.drawing);
          this.renderer.markDirty();
        }
      } catch (err) {
        alert('Erreur: ' + err.message);
      }
      this._closeDialog();
    };

    overlay.style.display = 'flex';
  }

  _closeDialog() {
    const overlay = document.getElementById('dialog-overlay');
    if (overlay) overlay.style.display = 'none';
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();

  // Service Worker registration
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
