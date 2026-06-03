class GothamGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.edges = [];
    this.tx = 0; this.ty = 0; this.scale = 1;
    this.minScale = 0.1; this.maxScale = 5;
    this.selected = null;
    this.hovered = null;
    this.hoveredEdge = null;
    this.dragNode = null;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.animating = false;
    this.simRunning = true;
    this.onSelect = null;
    this.onPathSelect = null;
    this._rafId = null;
    this._tick = 0;
    // Filtering
    this.visibleTypes = null; // null = all visible
    // Path highlighting
    this.pathNodes = new Set();
    this.pathEdges = new Set();
    this.pathMode = false;
    this.pathSource = null;
    // Energy for auto-stabilize
    this.energy = Infinity;
    this._bindEvents();
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  load(nodes, edges) {
    const W = this.canvas.width, H = this.canvas.height;
    this.nodes = nodes.map(n => ({
      ...n,
      x:  n.x  || W / 2 + (Math.random() - 0.5) * 400,
      y:  n.y  || H / 2 + (Math.random() - 0.5) * 300,
      vx: 0, vy: 0, fx: 0, fy: 0,
      r:  22,
    }));
    this.edges = edges.map(e => ({
      ...e,
      _src: this.nodes.find(n => n.id === e.source),
      _dst: this.nodes.find(n => n.id === e.target),
    })).filter(e => e._src && e._dst);
    this._centerView();
    this.start();
  }

  addNode(node) {
    const W = this.canvas.width, H = this.canvas.height;
    const n = { ...node, x: W / 2 + (Math.random() - 0.5) * 100, y: H / 2 + (Math.random() - 0.5) * 100, vx: 0, vy: 0, fx: 0, fy: 0, r: 22 };
    this.nodes.push(n);
    return n;
  }

  addEdge(edge) {
    const e = { ...edge, _src: this.nodes.find(n => n.id === edge.source), _dst: this.nodes.find(n => n.id === edge.target) };
    if (e._src && e._dst) { this.edges.push(e); return e; }
    return null;
  }

  removeNode(id) {
    this.nodes = this.nodes.filter(n => n.id !== id);
    this.edges = this.edges.filter(e => e._src.id !== id && e._dst.id !== id);
    if (this.selected?.id === id) this.selected = null;
  }

  setFilter(types) {
    this.visibleTypes = (types && types.length > 0) ? new Set(types) : null;
  }

  setPathMode(active) {
    this.pathMode = active;
    this.pathSource = null;
    if (!active) { this.pathNodes.clear(); this.pathEdges.clear(); }
    this.canvas.style.cursor = active ? 'crosshair' : 'grab';
  }

  findPath(srcId, dstId) {
    const queue = [[srcId]];
    const visited = new Set([srcId]);
    while (queue.length) {
      const path = queue.shift();
      const last = path[path.length - 1];
      if (last === dstId) return path;
      for (const e of this.edges) {
        const n = e._src.id === last ? e._dst.id : e._dst.id === last ? e._src.id : null;
        if (n && !visited.has(n)) { visited.add(n); queue.push([...path, n]); }
      }
    }
    return null;
  }

  highlightPath(nodeIds) {
    this.pathNodes = new Set(nodeIds);
    this.pathEdges = new Set();
    if (nodeIds.length < 2) return;
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const a = nodeIds[i], b = nodeIds[i + 1];
      for (const e of this.edges) {
        if ((e._src.id === a && e._dst.id === b) || (e._src.id === b && e._dst.id === a)) {
          this.pathEdges.add(e.id); break;
        }
      }
    }
  }

  clearPath() {
    this.pathNodes.clear(); this.pathEdges.clear(); this.pathSource = null;
  }

  getNeighbors(nodeId) {
    const ids = new Set();
    for (const e of this.edges) {
      if (e._src.id === nodeId) ids.add(e._dst.id);
      if (e._dst.id === nodeId) ids.add(e._src.id);
    }
    return [...ids];
  }

  start() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this.animating = true;
    const tick = () => {
      if (!this.animating) return;
      this._tick++;
      if (this.simRunning) this._simulate();
      this._render();
      this._rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  stop() { this.animating = false; if (this._rafId) cancelAnimationFrame(this._rafId); }

  fitAll() {
    const vis = this.nodes.filter(n => this._isVisible(n));
    if (!vis.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of vis) {
      minX = Math.min(minX, n.x - n.r); minY = Math.min(minY, n.y - n.r);
      maxX = Math.max(maxX, n.x + n.r); maxY = Math.max(maxY, n.y + n.r);
    }
    const pad = 80;
    const s = Math.min((this.canvas.width  - pad * 2) / (maxX - minX || 1),
                       (this.canvas.height - pad * 2) / (maxY - minY || 1), 2);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    this._animateTo(this.canvas.width / 2 - cx * s, this.canvas.height / 2 - cy * s, s, 500);
  }

  focusNode(node) {
    const s = Math.max(this.scale, 1.4);
    this._animateTo(this.canvas.width / 2 - node.x * s, this.canvas.height / 2 - node.y * s, s, 350);
  }

  resize() {
    const p = this.canvas.parentElement;
    this.canvas.width  = p.offsetWidth  || this.canvas.width;
    this.canvas.height = p.offsetHeight || this.canvas.height;
  }

  getZoom() { return Math.round(this.scale * 100); }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  _isVisible(node) { return !this.visibleTypes || this.visibleTypes.has(node.type); }

  _screenToWorld(sx, sy) {
    return { x: (sx - this.tx) / this.scale, y: (sy - this.ty) / this.scale };
  }

  _nodeAt(wx, wy) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (!this._isVisible(n)) continue;
      const dx = n.x - wx, dy = n.y - wy;
      if (Math.sqrt(dx * dx + dy * dy) <= n.r + 5) return n;
    }
    return null;
  }

  _edgeAt(wx, wy) {
    for (const e of this.edges) {
      if (!this._isVisible(e._src) || !this._isVisible(e._dst)) continue;
      const s = e._src, d = e._dst;
      const dx = d.x - s.x, dy = d.y - s.y, len = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const t = ((wx - s.x) * dx + (wy - s.y) * dy) / (len * len);
      if (t < 0.1 || t > 0.9) continue;
      const px = s.x + t * dx, py = s.y + t * dy;
      if (Math.sqrt((wx - px) ** 2 + (wy - py) ** 2) < 8) return e;
    }
    return null;
  }

  // ─── Simulation ───────────────────────────────────────────────────────────
  _simulate() {
    const nodes = this.nodes.filter(n => this._isVisible(n));
    const edges  = this.edges.filter(e => this._isVisible(e._src) && this._isVisible(e._dst));
    const K_r = 9000, K_s = 0.05, L = 160, K_c = 0.003, DAMP = 0.78;
    const cx = this.canvas.width / 2, cy = this.canvas.height / 2;

    for (const n of nodes) { n.fx = 0; n.fy = 0; }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
        const d2 = dx * dx + dy * dy + 1;
        const f = K_r / d2;
        const inv = 1 / Math.sqrt(d2);
        nodes[i].fx -= f * dx * inv; nodes[i].fy -= f * dy * inv;
        nodes[j].fx += f * dx * inv; nodes[j].fy += f * dy * inv;
      }
    }

    for (const e of edges) {
      const dx = e._dst.x - e._src.x, dy = e._dst.y - e._src.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const f = K_s * (d - L);
      const nx = dx / d, ny = dy / d;
      e._src.fx += f * nx; e._src.fy += f * ny;
      e._dst.fx -= f * nx; e._dst.fy -= f * ny;
    }

    let totalE = 0;
    for (const n of nodes) {
      if (n === this.dragNode) continue;
      n.fx += K_c * (cx - n.x); n.fy += K_c * (cy - n.y);
      n.vx = (n.vx + n.fx) * DAMP; n.vy = (n.vy + n.fy) * DAMP;
      n.x += n.vx; n.y += n.vy;
      totalE += n.vx * n.vx + n.vy * n.vy;
    }
    this.energy = totalE;

    // Auto-stabilize after energy drops
    if (this.energy < 0.05 && this._tick > 60) {
      this.simRunning = false;
      if (this.onStabilized) this.onStabilized();
    }
  }

  // ─── Rendering ────────────────────────────────────────────────────────────
  _render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    this._drawGrid(ctx, W, H);
    ctx.save();
    ctx.translate(this.tx, this.ty);
    ctx.scale(this.scale, this.scale);
    this._drawEdges(ctx);
    this._drawNodes(ctx);
    ctx.restore();
    this._drawMinimap(ctx, W, H);
    this._drawZoomIndicator(ctx, W, H);
    if (this.pathMode && this.pathSource) this._drawPathHint(ctx, W, H);
  }

  _drawGrid(ctx, W, H) {
    ctx.save();
    ctx.strokeStyle = 'rgba(25,45,70,0.45)';
    ctx.lineWidth = 0.5;
    const gs = 48 * this.scale;
    const ox = ((this.tx % gs) + gs) % gs;
    const oy = ((this.ty % gs) + gs) % gs;
    for (let x = ox; x < W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = oy; y < H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
  }

  _drawEdges(ctx) {
    const t = this._tick;
    for (const e of this.edges) {
      if (!this._isVisible(e._src) || !this._isVisible(e._dst)) continue;
      const s = e._src, d = e._dst;
      const dx = d.x - s.x, dy = d.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const nx = dx / dist, ny = dy / dist;
      const startX = s.x + nx * s.r, startY = s.y + ny * s.r;
      const endX   = d.x - nx * (d.r + 7), endY = d.y - ny * (d.r + 7);

      const isPath     = this.pathEdges.has(e.id);
      const isHovered  = this.hoveredEdge === e;
      const isSelected = this.selected && (e._src === this.selected || e._dst === this.selected);
      const isDim      = (this.selected && !isSelected) || (this.pathNodes.size > 0 && !isPath);

      ctx.save();

      if (isPath) {
        // Animated dashed path
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -(t % 24);
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#ffd166';
        ctx.shadowBlur = 6;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = isHovered ? '#4dabf7' : isSelected ? '#80bdff' : isDim ? 'rgba(30,55,80,0.25)' : 'rgba(44,80,120,0.5)';
        ctx.lineWidth = isHovered ? 2 : isSelected ? 1.5 : 1;
      }

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(dy, dx);
      const aSize = isPath ? 10 : 8;
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - aSize * Math.cos(angle - 0.4), endY - aSize * Math.sin(angle - 0.4));
      ctx.lineTo(endX - aSize * Math.cos(angle + 0.4), endY - aSize * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = isPath ? '#ffd166' : (isHovered ? '#4dabf7' : isSelected ? '#80bdff' : isDim ? 'rgba(30,55,80,0.2)' : 'rgba(44,80,120,0.5)');
      ctx.fill();

      // Edge label
      if (this.scale > 0.55 && (isHovered || isSelected || isPath)) {
        const mx = (startX + endX) / 2, my = (startY + endY) / 2;
        const fs = Math.max(8, 9 / this.scale);
        ctx.font = `${fs}px Inter, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(e.label).width;
        ctx.fillStyle = 'rgba(8,14,22,0.85)';
        ctx.fillRect(mx - tw / 2 - 4, my - 7, tw + 8, 14);
        ctx.fillStyle = isPath ? '#ffd166' : (isHovered ? '#4dabf7' : '#80bdff');
        ctx.fillText(e.label, mx, my);
      }
      ctx.restore();
    }
  }

  _drawNodes(ctx) {
    const t = this._tick;
    for (const n of this.nodes) {
      if (!this._isVisible(n)) continue;
      const cfg = NODE_COLORS[n.type] || { fill: '#0a0a0a', stroke: '#aaa', icon: '●' };
      const isSel   = this.selected === n;
      const isHov   = this.hovered   === n;
      const isPath  = this.pathNodes.has(n.id);
      const isPathSrc = this.pathMode && this.pathSource === n;
      const isConn  = this.selected && this._isConnectedTo(n, this.selected);
      const isCrit  = n.props?.Risque === 'CRITIQUE';
      const isDim   = (this.selected && !isSel && !isConn) ||
                      (this.pathNodes.size > 0 && !isPath);

      ctx.save();
      ctx.translate(n.x, n.y);

      // Pulse glow for CRITIQUE nodes
      if (isCrit && !isDim) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.06);
        ctx.beginPath();
        ctx.arc(0, 0, n.r + 14 + pulse * 6, 0, Math.PI * 2);
        const grd = ctx.createRadialGradient(0, 0, n.r, 0, 0, n.r + 20);
        grd.addColorStop(0, `rgba(230,57,70,${0.25 * pulse})`);
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // Path node halo
      if (isPath) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.1 + (isPathSrc ? 0 : 2));
        ctx.beginPath();
        ctx.arc(0, 0, n.r + 10 + pulse * 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,209,102,${0.6 * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Selection ring
      if (isSel || isHov) {
        ctx.beginPath();
        ctx.arc(0, 0, n.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = cfg.stroke;
        ctx.lineWidth = isSel ? 2.5 : 1.5;
        ctx.globalAlpha = isSel ? 0.9 : 0.45;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Node body
      ctx.beginPath();
      ctx.arc(0, 0, n.r, 0, Math.PI * 2);
      ctx.fillStyle = isDim ? 'rgba(10,14,22,0.35)' : cfg.fill;
      ctx.globalAlpha = isDim ? 0.35 : 1;
      ctx.fill();
      ctx.strokeStyle = isDim ? cfg.stroke + '22' : isPath ? '#ffd166' : cfg.stroke;
      ctx.lineWidth = isSel ? 2.5 : 1.5;
      ctx.stroke();

      // Icon
      ctx.font = `${n.r * 0.75}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = isDim ? cfg.stroke + '22' : cfg.stroke;
      ctx.fillText(cfg.icon, 0, 0);
      ctx.globalAlpha = 1;

      // Label
      if (this.scale > 0.35) {
        const fs = Math.max(9, Math.min(13, 11 / this.scale));
        ctx.font = `${fs}px Inter, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = isDim ? 'rgba(80,100,130,0.25)' : isPath ? '#ffd166' : '#c4d4e4';
        ctx.globalAlpha = isDim ? 0.3 : 1;
        ctx.fillText(n.label, 0, n.r + 5);
        ctx.globalAlpha = 1;
      }

      // Risk dot
      if (n.type === 'PERSON' && n.props?.Risque) {
        const rc = RISK_COLORS[n.props.Risque] || '#aaa';
        ctx.beginPath();
        ctx.arc(n.r * 0.65, -n.r * 0.65, 5, 0, Math.PI * 2);
        ctx.fillStyle = rc;
        ctx.fill();
        ctx.strokeStyle = '#0a0e17'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      // Path source indicator
      if (isPathSrc) {
        ctx.font = `bold ${n.r * 0.6}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd166';
        ctx.fillText('A', n.r + 12, -n.r - 8);
      }

      ctx.restore();
    }
  }

  _drawMinimap(ctx, W, H) {
    const MM_W = 170, MM_H = 110, MM_PAD = 8;
    const mx = W - MM_W - 12, my = H - MM_H - 12;

    ctx.save();
    ctx.fillStyle = 'rgba(10,16,28,0.9)';
    ctx.strokeStyle = '#1c2d42';
    ctx.lineWidth = 1;
    this._roundRect(ctx, mx, my, MM_W, MM_H, 6);
    ctx.fill(); ctx.stroke();

    // Find bounds of all visible nodes
    const vis = this.nodes.filter(n => this._isVisible(n));
    if (!vis.length) { ctx.restore(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of vis) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y);
    }
    const rw = maxX - minX || 1, rh = maxY - minY || 1;
    const s = Math.min((MM_W - MM_PAD * 2) / rw, (MM_H - MM_PAD * 2) / rh);
    const ox = mx + MM_PAD + (MM_W - MM_PAD * 2 - rw * s) / 2;
    const oy = my + MM_PAD + (MM_H - MM_PAD * 2 - rh * s) / 2;

    const toMM = (x, y) => ({
      x: ox + (x - minX) * s,
      y: oy + (y - minY) * s,
    });

    // Draw edges
    ctx.lineWidth = 0.5;
    for (const e of this.edges) {
      if (!this._isVisible(e._src) || !this._isVisible(e._dst)) continue;
      const ps = toMM(e._src.x, e._src.y), pd = toMM(e._dst.x, e._dst.y);
      ctx.strokeStyle = 'rgba(40,80,120,0.4)';
      ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(pd.x, pd.y); ctx.stroke();
    }

    // Draw nodes
    for (const n of vis) {
      const p = toMM(n.x, n.y);
      const cfg = NODE_COLORS[n.type] || { stroke: '#aaa' };
      ctx.beginPath();
      ctx.arc(p.x, p.y, n === this.selected ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = n === this.selected ? '#fff' : cfg.stroke;
      ctx.fill();
    }

    // Viewport rectangle
    const vpX1 = -this.tx / this.scale, vpY1 = -this.ty / this.scale;
    const vpX2 = vpX1 + W / this.scale, vpY2 = vpY1 + H / this.scale;
    const vp1 = toMM(vpX1, vpY1), vp2 = toMM(vpX2, vpY2);
    ctx.strokeStyle = 'rgba(28,111,205,0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(vp1.x, vp1.y, vp2.x - vp1.x, vp2.y - vp1.y);
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(90,120,150,0.6)';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MINIMAP', mx + 5, my + 9);

    ctx.restore();
  }

  _drawZoomIndicator(ctx, W, H) {
    ctx.save();
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(100,130,160,0.7)';
    ctx.fillText(`${this.getZoom()}%`, W - 12, H - 136);
    ctx.restore();
  }

  _drawPathHint(ctx, W, H) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,209,102,0.9)';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    const srcName = this.pathSource?.label || '?';
    ctx.fillText(`▶ Sélectionne la destination du chemin depuis « ${srcName} »`, W / 2, 20);
    ctx.restore();
  }

  // ─── Geometry helpers ─────────────────────────────────────────────────────
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,       y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r,   y,         r);
    ctx.closePath();
  }

  // ─── Animation helpers ────────────────────────────────────────────────────
  _animateTo(tx, ty, scale, duration) {
    const sTx = this.tx, sTy = this.ty, sS = this.scale;
    const t0 = performance.now();
    const go = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const e = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      this.tx = sTx + (tx - sTx) * e;
      this.ty = sTy + (ty - sTy) * e;
      this.scale = sS + (scale - sS) * e;
      if (p < 1) requestAnimationFrame(go);
    };
    requestAnimationFrame(go);
  }

  _centerView() {
    if (!this.nodes.length) return;
    let cx = 0, cy = 0;
    for (const n of this.nodes) { cx += n.x; cy += n.y; }
    cx /= this.nodes.length; cy /= this.nodes.length;
    this.tx = this.canvas.width  / 2 - cx * this.scale;
    this.ty = this.canvas.height / 2 - cy * this.scale;
  }

  _isConnectedTo(a, b) {
    return this.edges.some(e => (e._src === a && e._dst === b) || (e._src === b && e._dst === a));
  }

  // ─── Event binding ────────────────────────────────────────────────────────
  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown',  e => this._onDown(e));
    c.addEventListener('mousemove',  e => this._onMove(e));
    c.addEventListener('mouseup',    e => this._onUp(e));
    c.addEventListener('wheel',      e => this._onWheel(e), { passive: false });
    c.addEventListener('click',      e => this._onClick(e));
    c.addEventListener('dblclick',   e => this._onDbl(e));
    c.addEventListener('contextmenu',e => { e.preventDefault(); this._onRight(e); });
  }

  _getPos(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  _onDown(e) {
    const pos = this._getPos(e);
    const w   = this._screenToWorld(pos.x, pos.y);
    const n   = this._nodeAt(w.x, w.y);
    if (n && !this.pathMode) {
      this.dragNode = n;
      this.simRunning = false;
    } else if (!n) {
      this.isPanning  = true;
      this.panStart   = { x: pos.x - this.tx, y: pos.y - this.ty };
      this.canvas.style.cursor = 'grabbing';
    }
  }

  _onMove(e) {
    const pos = this._getPos(e);
    const w   = this._screenToWorld(pos.x, pos.y);
    if (this.dragNode) {
      this.dragNode.x = w.x; this.dragNode.y = w.y;
      this.dragNode.vx = 0;  this.dragNode.vy = 0;
    } else if (this.isPanning) {
      this.tx = pos.x - this.panStart.x;
      this.ty = pos.y - this.panStart.y;
    } else {
      this.hovered = this._nodeAt(w.x, w.y);
      this.hoveredEdge = this.hovered ? null : this._edgeAt(w.x, w.y);
      if (!this.pathMode)
        this.canvas.style.cursor = this.hovered ? 'pointer' : (this.hoveredEdge ? 'crosshair' : 'grab');
    }
    if (this.onZoomChange) this.onZoomChange(this.getZoom());
  }

  _onUp(e) {
    if (this.dragNode) {
      this.dragNode = null;
      this.simRunning = true;
      this._tick = 0;
    }
    this.isPanning = false;
    if (!this.pathMode) this.canvas.style.cursor = this.hovered ? 'pointer' : 'grab';
  }

  _onClick(e) {
    const pos = this._getPos(e);
    const w   = this._screenToWorld(pos.x, pos.y);
    const n   = this._nodeAt(w.x, w.y);

    if (this.pathMode) {
      if (!n) return;
      if (!this.pathSource) {
        this.pathSource = n;
        this.pathNodes.clear(); this.pathEdges.clear();
        this.pathNodes.add(n.id);
      } else if (n !== this.pathSource) {
        const path = this.findPath(this.pathSource.id, n.id);
        if (path) {
          this.highlightPath(path);
          if (this.onPathFound) this.onPathFound(path);
        } else {
          if (this.onPathNotFound) this.onPathNotFound(this.pathSource, n);
          this.pathSource = n;
          this.pathNodes.clear(); this.pathEdges.clear();
          this.pathNodes.add(n.id);
        }
      }
      return;
    }

    if (n) {
      this.selected = (this.selected === n) ? null : n;
      if (this.onSelect) this.onSelect(this.selected);
    } else if (!this.hoveredEdge) {
      this.selected = null;
      if (this.onSelect) this.onSelect(null);
    }
  }

  _onDbl(e) {
    const pos = this._getPos(e);
    const w   = this._screenToWorld(pos.x, pos.y);
    const n   = this._nodeAt(w.x, w.y);
    if (n) this.focusNode(n);
    else this.fitAll();
  }

  _onWheel(e) {
    e.preventDefault();
    const pos    = this._getPos(e);
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const ns     = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    this.tx = pos.x - (pos.x - this.tx) * (ns / this.scale);
    this.ty = pos.y - (pos.y - this.ty) * (ns / this.scale);
    this.scale = ns;
    if (this.onZoomChange) this.onZoomChange(this.getZoom());
  }

  _onRight(e) {
    const pos = this._getPos(e);
    const w   = this._screenToWorld(pos.x, pos.y);
    const n   = this._nodeAt(w.x, w.y);
    if (n && this.onContextMenu) this.onContextMenu(n, e.clientX, e.clientY);
  }
}
