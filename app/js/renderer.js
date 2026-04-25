'use strict';

// ── Viewport ─────────────────────────────────────────────────────────────────
// World coord: origin bottom-left, Y-up, units = mm
// Canvas coord: origin top-left, Y-down, units = px
class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 3;      // px per mm
    this.ox = 0;         // canvas X of world origin
    this.oy = 0;         // canvas Y of world origin
    this._resize();
  }

  _resize() {
    const c = this.canvas;
    const pr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width  = w * pr;
    c.height = h * pr;
    this.ctx.scale(pr, pr);
    this.W = w; this.H = h;
    if (this.ox === 0 && this.oy === 0) {
      this.ox = w / 2;
      this.oy = h / 2;
    }
  }

  // World → canvas
  toCanvas(wx, wy) {
    return { x: this.ox + wx * this.scale, y: this.oy - wy * this.scale };
  }
  toCanvasVec(v) { return this.toCanvas(v.x, v.y); }

  // Canvas → world
  toWorld(cx, cy) {
    return new Vec2((cx - this.ox) / this.scale, -(cy - this.oy) / this.scale);
  }

  pan(dx, dy) { this.ox += dx; this.oy += dy; }

  zoom(factor, cx, cy) {
    const wx = (cx - this.ox) / this.scale;
    const wy = (cy - this.oy) / this.scale;
    this.scale = clamp(this.scale * factor, 0.1, 500);
    this.ox = cx - wx * this.scale;
    this.oy = cy + wy * this.scale;
  }

  zoomToFit(drawing, padding = 40) {
    const ents = drawing.entities.filter(e => e.bbox && e.visible);
    if (!ents.length) { this.scale = 3; this.ox = this.W/2; this.oy = this.H/2; return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of ents) {
      const b = e.bbox();
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    const dw = maxX - minX, dh = maxY - minY;
    if (dw < 1e-6 && dh < 1e-6) return;
    const sx = (this.W - padding*2) / dw, sy = (this.H - padding*2) / dh;
    this.scale = Math.min(sx, sy, 500);
    this.ox = this.W/2 - ((minX + maxX)/2) * this.scale;
    this.oy = this.H/2 + ((minY + maxY)/2) * this.scale;
  }

  get pixelsPerMM() { return this.scale; }
}

// ── Renderer ─────────────────────────────────────────────────────────────────
const SNAP_COLORS = {
  grid: '#888888', endpoint: '#00ff88', midpoint: '#ffaa00',
  center: '#ff44ff', quadrant: '#44ffff', free: '#555555',
};

const ARROW_SIZE = 8; // pixels

function drawArrow(ctx, from, to) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - ARROW_SIZE * Math.cos(angle - 0.35), to.y - ARROW_SIZE * Math.sin(angle - 0.35));
  ctx.lineTo(to.x - ARROW_SIZE * Math.cos(angle + 0.35), to.y - ARROW_SIZE * Math.sin(angle + 0.35));
  ctx.closePath();
  ctx.fill();
}

class Renderer {
  constructor(viewport, drawing) {
    this.vp = viewport;
    this.drawing = drawing;
    this.showGrid = true;
    this.showRulers = true;
    this.snapPoint = null;   // { point, type } in world coords
    this.previewEntities = []; // temp entities being drawn
    this.animFrame = null;
    this._dirty = true;
  }

  markDirty() {
    if (!this._dirty) {
      this._dirty = true;
      if (this.animFrame === null)
        this.animFrame = requestAnimationFrame(() => { this.animFrame = null; this.render(); });
    }
  }

  render() {
    this._dirty = false;
    const { vp, drawing } = this;
    const ctx = vp.ctx;
    const W = vp.W, H = vp.H;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#12121e';
    ctx.fillRect(0, 0, W, H);

    // Grid
    if (this.showGrid) this._drawGrid(ctx, W, H);

    // Entities
    for (const e of drawing.entities) {
      if (!e.visible) continue;
      const layer = drawing.getLayer(e.layer);
      if (!layer.visible) continue;
      this._drawEntity(ctx, e, false);
    }

    // Preview entities (current tool)
    for (const e of this.previewEntities) {
      this._drawEntity(ctx, e, false, true);
    }

    // Snap indicator
    if (this.snapPoint && this.snapPoint.type !== 'free') {
      this._drawSnapIndicator(ctx, this.snapPoint);
    }

    // Rulers
    if (this.showRulers) this._drawRulers(ctx, W, H);
  }

  _drawGrid(ctx, W, H) {
    const { vp } = this;
    const gs = this.drawing.gridSpacing;
    const pxPerMM = vp.scale;
    const majorStep = gs;
    const minorStep = gs / 5;

    const wMin = vp.toWorld(0, H);
    const wMax = vp.toWorld(W, 0);

    // Minor grid
    if (pxPerMM * minorStep >= 4) {
      ctx.strokeStyle = '#1e1e32';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const startX = Math.floor(wMin.x / minorStep) * minorStep;
      const startY = Math.floor(wMin.y / minorStep) * minorStep;
      for (let x = startX; x <= wMax.x + minorStep; x += minorStep) {
        const cx = vp.toCanvas(x, 0).x;
        ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
      }
      for (let y = startY; y <= wMax.y + minorStep; y += minorStep) {
        const cy = vp.toCanvas(0, y).y;
        ctx.moveTo(0, cy); ctx.lineTo(W, cy);
      }
      ctx.stroke();
    }

    // Major grid
    ctx.strokeStyle = '#252540';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startX = Math.floor(wMin.x / majorStep) * majorStep;
    const startY = Math.floor(wMin.y / majorStep) * majorStep;
    for (let x = startX; x <= wMax.x + majorStep; x += majorStep) {
      const cx = vp.toCanvas(x, 0).x;
      ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
    }
    for (let y = startY; y <= wMax.y + majorStep; y += majorStep) {
      const cy = vp.toCanvas(0, y).y;
      ctx.moveTo(0, cy); ctx.lineTo(W, cy);
    }
    ctx.stroke();

    // Axes
    const ox = vp.toCanvas(0, 0);
    ctx.strokeStyle = '#333366';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox.x, 0); ctx.lineTo(ox.x, H);
    ctx.moveTo(0, ox.y); ctx.lineTo(W, ox.y);
    ctx.stroke();

    // Grid labels
    if (pxPerMM * majorStep >= 30) {
      ctx.fillStyle = '#44446688';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      for (let x = startX; x <= wMax.x + majorStep; x += majorStep) {
        if (Math.abs(x) < 1e-8) continue;
        const cx = vp.toCanvas(x, 0).x;
        ctx.fillText(fmt(x, 0), cx, Math.min(H - 2, Math.max(12, ox.y + 12)));
      }
      ctx.textAlign = 'right';
      for (let y = startY; y <= wMax.y + majorStep; y += majorStep) {
        if (Math.abs(y) < 1e-8) continue;
        const cy = vp.toCanvas(0, y).y;
        ctx.fillText(fmt(y, 0), Math.min(W - 2, Math.max(30, ox.x - 4)), cy + 4);
      }
    }
  }

  _drawRulers(ctx, W, H) {
    const { vp } = this;
    const RW = 20;
    ctx.fillStyle = '#1a1a28';
    ctx.fillRect(0, 0, W, RW);
    ctx.fillRect(0, 0, RW, H);

    const gs = this.drawing.gridSpacing;
    const pxPerMM = vp.scale;
    let step = gs;
    while (pxPerMM * step < 40) step *= 2;
    while (pxPerMM * step > 120) step /= 2;
    if (step < 0.001) step = 0.001;

    const wMin = vp.toWorld(RW, H);
    const wMax = vp.toWorld(W, RW);

    ctx.strokeStyle = '#55556688';
    ctx.lineWidth = 0.5;
    ctx.fillStyle = '#888888bb';
    ctx.font = '9px monospace';

    // Horizontal ruler
    ctx.textAlign = 'center';
    const stX = Math.floor(wMin.x / step) * step;
    for (let x = stX; x <= wMax.x + step; x += step) {
      const cx = vp.toCanvas(x, 0).x;
      if (cx < RW || cx > W) continue;
      ctx.beginPath(); ctx.moveTo(cx, RW - 5); ctx.lineTo(cx, RW); ctx.stroke();
      ctx.fillText(fmt(x, 0), cx, RW - 7);
    }

    // Vertical ruler
    ctx.textAlign = 'right';
    ctx.save(); ctx.translate(RW, 0); ctx.rotate(Math.PI/2);
    const stY = Math.floor(wMin.y / step) * step;
    for (let y = stY; y <= wMax.y + step; y += step) {
      const cy = vp.toCanvas(0, y).y;
      if (cy < RW || cy > H) continue;
      ctx.beginPath(); ctx.moveTo(H - cy, RW - 5); ctx.lineTo(H - cy, RW); ctx.stroke();
      ctx.fillText(fmt(y, 0), H - cy, RW - 7);
    }
    ctx.restore();

    // Corner square
    ctx.fillStyle = '#1a1a28';
    ctx.fillRect(0, 0, RW, RW);
  }

  _setEntityStyle(ctx, e, isPreview) {
    const drawing = this.drawing;
    let color = drawing.layerColor(e);
    let lw    = drawing.layerLineWidth(e);

    if (e.selected) {
      color = '#ff9900';
      lw = Math.max(lw, 1.5);
    }
    if (isPreview) {
      ctx.setLineDash([4, 4]);
      color = color + 'cc';
    } else {
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = lw;
    return { color, lw };
  }

  _drawEntity(ctx, e, isSelected, isPreview = false) {
    ctx.save();
    this._setEntityStyle(ctx, e, isPreview);
    const { color } = { color: this.drawing.layerColor(e) };

    if (e instanceof LineEntity)         this._drawLine(ctx, e);
    else if (e instanceof CircleEntity)  this._drawCircle(ctx, e);
    else if (e instanceof ArcEntity)     this._drawArc(ctx, e);
    else if (e instanceof PolylineEntity)this._drawPolyline(ctx, e);
    else if (e instanceof TextEntity)    this._drawText(ctx, e);
    else if (e instanceof LinearDimension)  this._drawLinearDim(ctx, e);
    else if (e instanceof AngularDimension) this._drawAngularDim(ctx, e);
    else if (e instanceof RadiusDimension)  this._drawRadiusDim(ctx, e);

    // Selection handles
    if (e.selected && !isPreview) this._drawSelectionHandles(ctx, e);

    ctx.restore();
  }

  _cp(p) { return this.vp.toCanvasVec(p); }

  _drawLine(ctx, e) {
    const c1 = this._cp(e.p1), c2 = this._cp(e.p2);
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.stroke();
  }

  _drawCircle(ctx, e) {
    const cc = this._cp(e.center), r = e.radius * this.vp.scale;
    ctx.beginPath();
    ctx.arc(cc.x, cc.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawArc(ctx, e) {
    const cc = this._cp(e.center), r = e.radius * this.vp.scale;
    // World y-up → canvas y-down: angles need negation
    const sa = -e.startAngle, ea = -e.endAngle;
    ctx.beginPath();
    ctx.arc(cc.x, cc.y, r, sa, ea, e.ccw ? false : true);
    ctx.stroke();
  }

  _drawPolyline(ctx, e) {
    if (!e.points.length) return;
    ctx.beginPath();
    const p0 = this._cp(e.points[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < e.points.length; i++) {
      const p = this._cp(e.points[i]);
      ctx.lineTo(p.x, p.y);
    }
    if (e.closed) ctx.closePath();
    ctx.stroke();
  }

  _drawText(ctx, e) {
    const cp = this._cp(e.pos);
    const fontSize = Math.max(8, e.height * this.vp.scale);
    ctx.font = `${fontSize}px monospace`;
    ctx.save();
    ctx.translate(cp.x, cp.y);
    ctx.rotate(-deg2rad(e.angle));
    ctx.scale(1, -1); // flip for y-up world
    ctx.fillText(e.text, 0, 0);
    ctx.restore();
  }

  _drawLinearDim(ctx, e) {
    const g = e.computeGeometry();
    const col = this.drawing.layerColor(e);
    ctx.strokeStyle = col;
    ctx.fillStyle   = col;
    ctx.setLineDash([]);
    ctx.lineWidth   = 0.8;

    const c1 = this._cp(g.c1), c2 = this._cp(g.c2);
    const ef = this._cp(g.e1from), et = this._cp(g.e1to);
    const ef2= this._cp(g.e2from), et2= this._cp(g.e2to);
    const tp = this._cp(g.textPos);

    // Extension lines (with gap)
    this._drawExtLine(ctx, ef, et);
    this._drawExtLine(ctx, ef2, et2);

    // Dimension line
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.stroke();

    // Arrows
    drawArrow(ctx, c2, c1);
    drawArrow(ctx, c1, c2);

    // Text
    this._drawDimText(ctx, tp, e.text, g.textAngle, col);
  }

  _drawExtLine(ctx, from, to) {
    // Small gap from origin point
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
    if (len < 1) return;
    const gap = Math.min(3, len * 0.1);
    const ux = dx/len, uy = dy/len;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(from.x + ux * gap, from.y + uy * gap);
    ctx.lineTo(to.x + ux * 2, to.y + uy * 2);
    ctx.stroke();
  }

  _drawDimText(ctx, cp, text, angleDeg, color) {
    const fontSize = Math.max(9, 3.5 * this.vp.scale);
    ctx.save();
    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = color;
    ctx.translate(cp.x, cp.y);
    ctx.rotate(-deg2rad(angleDeg));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // White background behind text
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = '#12121e';
    ctx.fillRect(-tw/2 - 2, -fontSize - 2, tw + 4, fontSize + 4);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  _drawAngularDim(ctx, e) {
    const g = e.computeGeometry();
    const col = this.drawing.layerColor(e);
    const r = g.radius * this.vp.scale;
    const cv = this._cp(g.vertex);
    ctx.strokeStyle = col;
    ctx.fillStyle   = col;
    ctx.lineWidth   = 0.8;
    ctx.setLineDash([]);

    // Arc
    ctx.beginPath();
    ctx.arc(cv.x, cv.y, r, -g.endA, -g.startA, false);
    ctx.stroke();

    // Arm lines
    const rOut = g.radius + 5;
    const a1p = { x: cv.x + rOut * this.vp.scale * Math.cos(-g.startA), y: cv.y + rOut * this.vp.scale * Math.sin(-g.startA) };
    const a2p = { x: cv.x + rOut * this.vp.scale * Math.cos(-g.endA),   y: cv.y + rOut * this.vp.scale * Math.sin(-g.endA)   };
    const v1 = this._cp(e.refP1), v2 = this._cp(e.refP2);

    ctx.beginPath();
    ctx.moveTo(cv.x, cv.y);
    ctx.lineTo(a1p.x, a1p.y);
    ctx.moveTo(cv.x, cv.y);
    ctx.lineTo(a2p.x, a2p.y);
    ctx.stroke();

    // Text at arc midpoint
    const tp = this._cp(g.textPos);
    this._drawDimText(ctx, tp, e.text, 0, col);
  }

  _drawRadiusDim(ctx, e) {
    const col = this.drawing.layerColor(e);
    ctx.strokeStyle = col;
    ctx.fillStyle   = col;
    ctx.lineWidth   = 0.8;
    ctx.setLineDash([]);

    const cc = this._cp(e.center), cp = this._cp(e.pointOnCircle);

    // Leader line from center to edge
    ctx.beginPath();
    ctx.moveTo(cc.x, cc.y);
    ctx.lineTo(cp.x, cp.y);
    ctx.stroke();

    // Arrow at edge
    drawArrow(ctx, cc, cp);

    // Center mark
    const cm = 4;
    ctx.beginPath();
    ctx.moveTo(cc.x - cm, cc.y); ctx.lineTo(cc.x + cm, cc.y);
    ctx.moveTo(cc.x, cc.y - cm); ctx.lineTo(cc.x, cc.y + cm);
    ctx.stroke();

    // Text slightly beyond edge point
    const dir = e.pointOnCircle.sub(e.center).norm();
    const textWorld = e.pointOnCircle.add(dir.mul(6));
    const tp = this._cp(textWorld);
    this._drawDimText(ctx, tp, e.text, 0, col);
  }

  _drawSelectionHandles(ctx, e) {
    const pts = e.snapPoints ? e.snapPoints() : [];
    ctx.fillStyle = '#ff990088';
    ctx.strokeStyle = '#ff9900';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (const p of pts) {
      const cp = this._cp(p);
      ctx.fillRect(cp.x - 4, cp.y - 4, 8, 8);
      ctx.strokeRect(cp.x - 4, cp.y - 4, 8, 8);
    }
  }

  _drawSnapIndicator(ctx, snap) {
    const cp = this.vp.toCanvasVec(snap.point);
    const color = SNAP_COLORS[snap.type] || '#00ff88';
    ctx.strokeStyle = color;
    ctx.fillStyle   = color + '44';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([]);

    const r = 8;
    if (snap.type === 'endpoint') {
      ctx.strokeRect(cp.x - r/2, cp.y - r/2, r, r);
    } else if (snap.type === 'midpoint') {
      ctx.beginPath();
      ctx.moveTo(cp.x, cp.y - r); ctx.lineTo(cp.x + r, cp.y + r); ctx.lineTo(cp.x - r, cp.y + r);
      ctx.closePath(); ctx.stroke();
    } else if (snap.type === 'center') {
      ctx.beginPath(); ctx.arc(cp.x, cp.y, r/2, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cp.x - r, cp.y); ctx.lineTo(cp.x + r, cp.y);
      ctx.moveTo(cp.x, cp.y - r); ctx.lineTo(cp.x, cp.y + r);
      ctx.stroke();
    } else if (snap.type === 'quadrant') {
      ctx.beginPath();
      ctx.moveTo(cp.x, cp.y - r); ctx.lineTo(cp.x + r, cp.y);
      ctx.lineTo(cp.x, cp.y + r); ctx.lineTo(cp.x - r, cp.y);
      ctx.closePath(); ctx.stroke();
    } else if (snap.type === 'grid') {
      ctx.beginPath();
      ctx.moveTo(cp.x - r/2, cp.y); ctx.lineTo(cp.x + r/2, cp.y);
      ctx.moveTo(cp.x, cp.y - r/2); ctx.lineTo(cp.x, cp.y + r/2);
      ctx.stroke();
    }
  }
}
