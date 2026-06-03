class GothamGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.edges = [];
    this.tx = 0; this.ty = 0; this.scale = 1;
    this.minScale = 0.2; this.maxScale = 4;
    this.selected = null;
    this.hovered = null;
    this.hoveredEdge = null;
    this.dragNode = null;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.animating = false;
    this.simRunning = true;
    this.onSelect = null;
    this._rafId = null;
    this._bindEvents();
  }

  load(nodes, edges) {
    const W = this.canvas.width, H = this.canvas.height;
    this.nodes = nodes.map(n => ({
      ...n,
      x: n.x || W / 2 + (Math.random() - 0.5) * 400,
      y: n.y || H / 2 + (Math.random() - 0.5) * 300,
      vx: 0, vy: 0,
      r: 22,
    }));
    this.edges = edges.map(e => ({
      ...e,
      _src: this.nodes.find(n => n.id === e.source),
      _dst: this.nodes.find(n => n.id === e.target),
    })).filter(e => e._src && e._dst);

    this._centerView();
    this.start();
  }

  start() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this.animating = true;
    const tick = () => {
      if (!this.animating) return;
      if (this.simRunning) this._simulate();
      this._render();
      this._rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  stop() {
    this.animating = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  _simulate() {
    const nodes = this.nodes;
    const edges = this.edges;
    const K_repel = 8000;
    const K_spring = 0.04;
    const L_rest = 180;
    const K_center = 0.003;
    const DAMP = 0.78;
    const cx = this.canvas.width / 2, cy = this.canvas.height / 2;

    for (let i = 0; i < nodes.length; i++) {
      nodes[i].fx = 0; nodes[i].fy = 0;
    }

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const d2 = dx * dx + dy * dy + 1;
        const f = K_repel / d2;
        const nx = dx / Math.sqrt(d2), ny = dy / Math.sqrt(d2);
        nodes[i].fx -= f * nx; nodes[i].fy -= f * ny;
        nodes[j].fx += f * nx; nodes[j].fy += f * ny;
      }
    }

    // Spring forces
    for (const e of edges) {
      const dx = e._dst.x - e._src.x;
      const dy = e._dst.y - e._src.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const f = K_spring * (d - L_rest);
      const nx = dx / d, ny = dy / d;
      e._src.fx += f * nx; e._src.fy += f * ny;
      e._dst.fx -= f * nx; e._dst.fy -= f * ny;
    }

    // Centering
    for (const n of nodes) {
      if (n === this.dragNode) continue;
      n.fx += K_center * (cx - n.x);
      n.fy += K_center * (cy - n.y);
    }

    // Integrate
    for (const n of nodes) {
      if (n === this.dragNode) continue;
      n.vx = (n.vx + n.fx) * DAMP;
      n.vy = (n.vy + n.fy) * DAMP;
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  _render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background grid
    ctx.save();
    ctx.strokeStyle = 'rgba(30,45,70,0.5)';
    ctx.lineWidth = 0.5;
    const gridSize = 40 * this.scale;
    const offX = (this.tx % gridSize + gridSize) % gridSize;
    const offY = (this.ty % gridSize + gridSize) % gridSize;
    for (let x = offX; x < W; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = offY; y < H; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(this.tx, this.ty);
    ctx.scale(this.scale, this.scale);

    this._drawEdges(ctx);
    this._drawNodes(ctx);

    ctx.restore();
  }

  _drawEdges(ctx) {
    for (const e of this.edges) {
      const s = e._src, d = e._dst;
      const dx = d.x - s.x, dy = d.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const nx = dx / dist, ny = dy / dist;
      const startX = s.x + nx * s.r, startY = s.y + ny * s.r;
      const endX = d.x - nx * (d.r + 6), endY = d.y - ny * (d.r + 6);

      const isHovered = (this.hoveredEdge === e);
      const isConnected = this.selected &&
        (e._src === this.selected || e._dst === this.selected);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = isHovered ? '#4dabf7' :
                        isConnected ? '#a8d8f8' : 'rgba(50,90,130,0.55)';
      ctx.lineWidth = isHovered ? 2 : isConnected ? 1.5 : 1;
      ctx.stroke();

      // Arrow head
      const angle = Math.atan2(dy, dx);
      const aSize = 8;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - aSize * Math.cos(angle - 0.4), endY - aSize * Math.sin(angle - 0.4));
      ctx.lineTo(endX - aSize * Math.cos(angle + 0.4), endY - aSize * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = isHovered ? '#4dabf7' : isConnected ? '#a8d8f8' : 'rgba(50,90,130,0.55)';
      ctx.fill();

      // Edge label
      if (this.scale > 0.6 && (isHovered || isConnected)) {
        const mx = (startX + endX) / 2, my = (startY + endY) / 2;
        ctx.font = `${Math.max(8, 9 / this.scale)}px Inter, sans-serif`;
        ctx.fillStyle = isHovered ? '#4dabf7' : '#6e9fc5';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const pad = 3;
        const tw = ctx.measureText(e.label).width;
        ctx.fillStyle = 'rgba(10,15,25,0.8)';
        ctx.fillRect(mx - tw / 2 - pad, my - 6, tw + pad * 2, 12);
        ctx.fillStyle = isHovered ? '#4dabf7' : '#6e9fc5';
        ctx.fillText(e.label, mx, my);
      }
      ctx.restore();
    }
  }

  _drawNodes(ctx) {
    for (const n of this.nodes) {
      const cfg = NODE_COLORS[n.type] || { fill: '#0a0a0a', stroke: '#aaa', icon: '●' };
      const isSelected = this.selected === n;
      const isHovered = this.hovered === n;
      const isConnected = this.selected && this._isConnectedTo(n, this.selected);
      const r = n.r;

      ctx.save();
      ctx.translate(n.x, n.y);

      // Selection glow
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(0, 0, r + 10, 0, Math.PI * 2);
        const grd = ctx.createRadialGradient(0, 0, r, 0, 0, r + 12);
        grd.addColorStop(0, cfg.stroke + '55');
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // Outer ring (pulse for selected)
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = cfg.stroke;
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.globalAlpha = isSelected ? 0.9 : 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Node background
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      const dim = this.selected && !isSelected && !isConnected;
      ctx.fillStyle = dim ? 'rgba(10,14,22,0.4)' : cfg.fill;
      ctx.fill();
      ctx.strokeStyle = dim ? cfg.stroke + '33' : cfg.stroke;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();

      // Icon
      ctx.font = `${r * 0.8}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = dim ? cfg.stroke + '33' : cfg.stroke;
      ctx.globalAlpha = dim ? 0.3 : 1;
      ctx.fillText(cfg.icon, 0, 0);
      ctx.globalAlpha = 1;

      // Label
      if (this.scale > 0.4) {
        const fontSize = Math.max(9, Math.min(12, 11 / this.scale));
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = dim ? 'rgba(90,110,140,0.3)' : '#c8d8ea';
        ctx.fillText(n.label, 0, r + 4);
      }

      // Risk indicator for persons
      if (n.type === 'PERSON' && n.props.Risque) {
        const rc = RISK_COLORS[n.props.Risque] || '#aaa';
        ctx.beginPath();
        ctx.arc(r * 0.65, -r * 0.65, 5, 0, Math.PI * 2);
        ctx.fillStyle = rc;
        ctx.fill();
        ctx.strokeStyle = '#0a0e17';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  _isConnectedTo(nodeA, nodeB) {
    return this.edges.some(e =>
      (e._src === nodeA && e._dst === nodeB) ||
      (e._src === nodeB && e._dst === nodeA)
    );
  }

  _screenToWorld(sx, sy) {
    return {
      x: (sx - this.tx) / this.scale,
      y: (sy - this.ty) / this.scale,
    };
  }

  _nodeAt(wx, wy) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = n.x - wx, dy = n.y - wy;
      if (Math.sqrt(dx * dx + dy * dy) <= n.r + 4) return n;
    }
    return null;
  }

  _edgeAt(wx, wy) {
    for (const e of this.edges) {
      const s = e._src, d = e._dst;
      const dx = d.x - s.x, dy = d.y - s.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      const t = ((wx - s.x) * dx + (wy - s.y) * dy) / (len * len);
      if (t < 0 || t > 1) continue;
      const px = s.x + t * dx, py = s.y + t * dy;
      const dist = Math.sqrt((wx - px) ** 2 + (wy - py) ** 2);
      if (dist < 8) return e;
    }
    return null;
  }

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => this._onMouseDown(e));
    c.addEventListener('mousemove', e => this._onMouseMove(e));
    c.addEventListener('mouseup',   e => this._onMouseUp(e));
    c.addEventListener('wheel',     e => this._onWheel(e), { passive: false });
    c.addEventListener('click',     e => this._onClick(e));
    c.addEventListener('dblclick',  e => this._onDblClick(e));
    c.addEventListener('contextmenu', e => { e.preventDefault(); this._onRightClick(e); });
  }

  _getPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _onMouseDown(e) {
    const pos = this._getPos(e);
    const w = this._screenToWorld(pos.x, pos.y);
    const n = this._nodeAt(w.x, w.y);
    if (n) {
      this.dragNode = n;
      this.simRunning = false;
    } else {
      this.isPanning = true;
      this.panStart = { x: pos.x - this.tx, y: pos.y - this.ty };
    }
  }

  _onMouseMove(e) {
    const pos = this._getPos(e);
    const w = this._screenToWorld(pos.x, pos.y);
    if (this.dragNode) {
      this.dragNode.x = w.x;
      this.dragNode.y = w.y;
      this.dragNode.vx = 0; this.dragNode.vy = 0;
    } else if (this.isPanning) {
      this.tx = pos.x - this.panStart.x;
      this.ty = pos.y - this.panStart.y;
    } else {
      const prev = this.hovered;
      this.hovered = this._nodeAt(w.x, w.y);
      if (!this.hovered) this.hoveredEdge = this._edgeAt(w.x, w.y);
      else this.hoveredEdge = null;
      this.canvas.style.cursor = this.hovered ? 'pointer' : (this.hoveredEdge ? 'crosshair' : 'grab');
    }
  }

  _onMouseUp(e) {
    if (this.dragNode) {
      this.simRunning = true;
      this.dragNode = null;
    }
    this.isPanning = false;
  }

  _onClick(e) {
    const pos = this._getPos(e);
    const w = this._screenToWorld(pos.x, pos.y);
    const n = this._nodeAt(w.x, w.y);
    if (n) {
      this.selected = (this.selected === n) ? null : n;
      if (this.onSelect) this.onSelect(this.selected);
    } else {
      if (!this.hoveredEdge) {
        this.selected = null;
        if (this.onSelect) this.onSelect(null);
      }
    }
  }

  _onDblClick(e) {
    const pos = this._getPos(e);
    const w = this._screenToWorld(pos.x, pos.y);
    const n = this._nodeAt(w.x, w.y);
    if (n) this.focusNode(n);
  }

  _onWheel(e) {
    e.preventDefault();
    const pos = this._getPos(e);
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    this.tx = pos.x - (pos.x - this.tx) * (newScale / this.scale);
    this.ty = pos.y - (pos.y - this.ty) * (newScale / this.scale);
    this.scale = newScale;
  }

  _onRightClick(e) {
    const pos = this._getPos(e);
    const w = this._screenToWorld(pos.x, pos.y);
    const n = this._nodeAt(w.x, w.y);
    if (n && this.onContextMenu) this.onContextMenu(n, e.clientX, e.clientY);
  }

  focusNode(node) {
    const W = this.canvas.width, H = this.canvas.height;
    const targetScale = 1.5;
    const targetTx = W / 2 - node.x * targetScale;
    const targetTy = H / 2 - node.y * targetScale;
    this._animateTo(targetTx, targetTy, targetScale, 400);
  }

  _animateTo(tx, ty, scale, duration) {
    const startTx = this.tx, startTy = this.ty, startScale = this.scale;
    const startTime = performance.now();
    const animate = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.tx = startTx + (tx - startTx) * ease;
      this.ty = startTy + (ty - startTy) * ease;
      this.scale = startScale + (scale - startScale) * ease;
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  _centerView() {
    if (this.nodes.length === 0) return;
    let cx = 0, cy = 0;
    for (const n of this.nodes) { cx += n.x; cy += n.y; }
    cx /= this.nodes.length; cy /= this.nodes.length;
    this.tx = this.canvas.width / 2 - cx * this.scale;
    this.ty = this.canvas.height / 2 - cy * this.scale;
  }

  fitAll() {
    if (this.nodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x - n.r);
      minY = Math.min(minY, n.y - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      maxY = Math.max(maxY, n.y + n.r);
    }
    const pad = 60;
    const scaleX = (this.canvas.width  - pad * 2) / (maxX - minX);
    const scaleY = (this.canvas.height - pad * 2) / (maxY - minY);
    const s = Math.min(scaleX, scaleY, 2);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    this._animateTo(this.canvas.width / 2 - cx * s, this.canvas.height / 2 - cy * s, s, 500);
  }

  resize() {
    const c = this.canvas;
    c.width  = c.offsetWidth;
    c.height = c.offsetHeight;
  }

  filterBy(types) {
    if (!types || types.length === 0) {
      for (const n of this.nodes) n._hidden = false;
    } else {
      for (const n of this.nodes) n._hidden = !types.includes(n.type);
    }
  }

  highlight(ids) {
    this.selected = ids && ids.length === 1
      ? this.nodes.find(n => n.id === ids[0]) || null
      : null;
  }
}
