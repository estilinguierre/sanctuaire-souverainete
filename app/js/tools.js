'use strict';

// ── Base tool ────────────────────────────────────────────────────────────────
class BaseTool {
  constructor(app) {
    this.app  = app;
    this.name = 'base';
    this.hint = '';
    this.cursor = 'crosshair';
  }
  activate()   { this.app.renderer.previewEntities = []; this.app.renderer.markDirty(); }
  deactivate() { this.app.renderer.previewEntities = []; this.app.renderer.markDirty(); }
  onMouseDown(ev, worldPt, snapRes) {}
  onMouseMove(ev, worldPt, snapRes) {}
  onMouseUp(ev, worldPt, snapRes)   {}
  onDblClick(ev, worldPt, snapRes)  {}
  onKeyDown(ev)                     {}
  cancel()                          { this.activate(); }
}

// ── Select tool ──────────────────────────────────────────────────────────────
class SelectTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name   = 'select';
    this.hint   = 'Cliquer pour sélectionner • Glisser pour déplacer • Suppr pour effacer';
    this.cursor = 'default';
    this._dragging  = false;
    this._dragStart = null;
    this._boxStart  = null;
    this._boxMode   = false;
    this._moveStart = null;
    this._origPos   = new Map(); // entityId → original snap points
  }

  onMouseDown(ev, wp, snap) {
    const drawing = this.app.drawing;
    const thr = 8 / this.app.viewport.scale;
    const hit = drawing.selectAt(wp, thr);

    if (hit) {
      if (!ev.shiftKey && !hit.selected) drawing.deselectAll();
      hit.selected = true;
      this._dragging  = true;
      this._dragStart = wp.clone();
      this._boxMode   = false;
      // store original positions of all selected
      this._origPos.clear();
      for (const e of drawing.getSelected()) this._storePos(e);
    } else {
      if (!ev.shiftKey) drawing.deselectAll();
      this._boxStart = wp.clone();
      this._boxMode  = true;
      this._dragging = true;
    }
    this.app.updatePropsPanel();
    this.app.renderer.markDirty();
  }

  _storePos(e) {
    if (e instanceof LineEntity)    this._origPos.set(e.id, [e.p1.clone(), e.p2.clone()]);
    else if (e instanceof CircleEntity) this._origPos.set(e.id, [e.center.clone()]);
    else if (e instanceof ArcEntity)    this._origPos.set(e.id, [e.center.clone()]);
    else if (e instanceof PolylineEntity) this._origPos.set(e.id, e.points.map(p => p.clone()));
    else if (e instanceof TextEntity)   this._origPos.set(e.id, [e.pos.clone()]);
    else if (e instanceof LinearDimension) this._origPos.set(e.id, [e.p1.clone(), e.p2.clone()]);
    else if (e instanceof AngularDimension) this._origPos.set(e.id, [e.vertex.clone(), e.refP1.clone(), e.refP2.clone()]);
    else if (e instanceof RadiusDimension) this._origPos.set(e.id, [e.center.clone(), e.pointOnCircle.clone()]);
  }

  _applyDelta(e, delta) {
    const orig = this._origPos.get(e.id);
    if (!orig) return;
    if (e instanceof LineEntity)        { e.p1 = orig[0].add(delta); e.p2 = orig[1].add(delta); }
    else if (e instanceof CircleEntity)  { e.center = orig[0].add(delta); }
    else if (e instanceof ArcEntity)     { e.center = orig[0].add(delta); }
    else if (e instanceof PolylineEntity){ e.points = orig.map(p => p.add(delta)); }
    else if (e instanceof TextEntity)    { e.pos = orig[0].add(delta); }
    else if (e instanceof LinearDimension) { e.p1 = orig[0].add(delta); e.p2 = orig[1].add(delta); }
    else if (e instanceof AngularDimension){ e.vertex = orig[0].add(delta); e.refP1 = orig[1].add(delta); e.refP2 = orig[2].add(delta); }
    else if (e instanceof RadiusDimension) { e.center = orig[0].add(delta); e.pointOnCircle = orig[1].add(delta); }
  }

  onMouseMove(ev, wp, snap) {
    if (!this._dragging) {
      // Hover cursor
      const thr = 8 / this.app.viewport.scale;
      const hit = this.app.drawing.selectAt(wp, thr);
      this.app.canvas.style.cursor = hit ? 'move' : 'default';
      return;
    }

    if (this._boxMode) {
      // Draw selection box
      const r = this.app.renderer;
      const bs = this._boxStart, be = wp;
      const rect = new PolylineEntity([
        new Vec2(bs.x, bs.y), new Vec2(be.x, bs.y),
        new Vec2(be.x, be.y), new Vec2(bs.x, be.y)], true);
      rect.color = '#4488ff44';
      r.previewEntities = [rect];
      r.markDirty();
      return;
    }

    // Move selected
    const delta = wp.sub(this._dragStart);
    for (const e of this.app.drawing.getSelected()) this._applyDelta(e, delta);
    this.app.updatePropsPanel();
    this.app.renderer.markDirty();
  }

  onMouseUp(ev, wp, snap) {
    if (this._boxMode && this._boxStart) {
      // Select everything in box
      const bs = this._boxStart, be = wp;
      const minX = Math.min(bs.x, be.x), maxX = Math.max(bs.x, be.x);
      const minY = Math.min(bs.y, be.y), maxY = Math.max(bs.y, be.y);
      for (const e of this.app.drawing.entities) {
        if (e.locked || !e.visible) continue;
        const spts = e.snapPoints ? e.snapPoints() : [];
        if (spts.some(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY))
          e.selected = true;
      }
      this.app.renderer.previewEntities = [];
    } else if (this._dragging && !this._boxMode) {
      const delta = wp.sub(this._dragStart);
      if (delta.len() > 0.01) this.app.drawing.commit();
    }

    this._dragging = false;
    this._boxMode  = false;
    this._boxStart = null;
    this.app.updatePropsPanel();
    this.app.renderer.markDirty();
  }

  onKeyDown(ev) {
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      this.app.drawing.removeSelected();
      this.app.updatePropsPanel();
      this.app.renderer.markDirty();
    } else if (ev.key === 'Escape') {
      this.app.drawing.deselectAll();
      this.app.renderer.markDirty();
    }
  }
}

// ── Line tool ────────────────────────────────────────────────────────────────
class LineTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'line';
    this.hint = 'Cliquer le 1er point • Cliquer le 2ème point • Échap pour annuler';
    this._p1 = null;
  }
  activate() { super.activate(); this._p1 = null; }
  cancel()   { this._p1 = null; super.cancel(); this.app.setHint(this.hint); }

  onMouseDown(ev, wp, snap) {
    if (!this._p1) {
      this._p1 = snap.point.clone();
      this.app.setHint('Cliquer le 2ème point de la ligne');
    } else {
      const line = new LineEntity(this._p1, snap.point.clone());
      this.app.drawing.add(line);
      this._p1 = snap.point.clone(); // chain lines
      this.app.renderer.markDirty();
      this.app.setHint('Cliquer le prochain point (ou Échap)');
    }
  }

  onMouseMove(ev, wp, snap) {
    if (!this._p1) return;
    const preview = new LineEntity(this._p1, snap.point.clone());
    preview.color = '#88aaff';

    // Ortho info
    const dx = Math.abs(snap.point.x - this._p1.x);
    const dy = Math.abs(snap.point.y - this._p1.y);
    const len = preview.length;
    const ang = preview.angle;
    this.app.setStatus(`L: ${fmt(len)} mm  | Δx: ${fmt(dx)}  Δy: ${fmt(dy)}  | Angle: ${fmt(ang)}°`);

    this.app.renderer.previewEntities = [preview];
    this.app.renderer.markDirty();
  }

  onKeyDown(ev) {
    if (ev.key === 'Escape') this.cancel();
  }
}

// ── Polyline tool ────────────────────────────────────────────────────────────
class PolylineTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name   = 'polyline';
    this.hint   = 'Cliquer les points • Double-clic pour terminer • Échap pour annuler';
    this._points = [];
  }
  activate() { super.activate(); this._points = []; }
  cancel()   { this._points = []; super.cancel(); }

  onMouseDown(ev, wp, snap) {
    this._points.push(snap.point.clone());
  }

  onDblClick(ev, wp, snap) {
    if (this._points.length >= 2) {
      const pl = new PolylineEntity(this._points, false);
      this.app.drawing.add(pl);
    }
    this._points = [];
    this.app.renderer.previewEntities = [];
    this.app.renderer.markDirty();
  }

  onMouseMove(ev, wp, snap) {
    if (!this._points.length) return;
    const pts = [...this._points, snap.point.clone()];
    const preview = new PolylineEntity(pts, false);
    preview.color = '#88aaff';
    this.app.renderer.previewEntities = [preview];
    this.app.renderer.markDirty();
  }

  onKeyDown(ev) {
    if (ev.key === 'Escape') this.cancel();
    if ((ev.key === 'Enter' || ev.key === 'Return') && this._points.length >= 2) {
      const pl = new PolylineEntity(this._points, false);
      this.app.drawing.add(pl);
      this._points = [];
      this.app.renderer.previewEntities = [];
      this.app.renderer.markDirty();
    }
  }
}

// ── Rectangle tool ───────────────────────────────────────────────────────────
class RectTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'rect';
    this.hint = '1er coin puis coin opposé';
    this._p1  = null;
  }
  activate() { super.activate(); this._p1 = null; }
  cancel()   { this._p1 = null; super.cancel(); }

  onMouseDown(ev, wp, snap) {
    if (!this._p1) {
      this._p1 = snap.point.clone();
      this.app.setHint('Cliquer le coin opposé du rectangle');
    } else {
      const p1 = this._p1, p2 = snap.point.clone();
      const pts = [p1, new Vec2(p2.x, p1.y), p2, new Vec2(p1.x, p2.y)];
      const rect = new PolylineEntity(pts, true);
      this.app.drawing.add(rect);
      this._p1 = null;
      this.app.renderer.previewEntities = [];
      this.app.renderer.markDirty();
      this.app.setHint(this.hint);
      const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
      this.app.setStatus(`Rectangle: ${fmt(w)} × ${fmt(h)} mm`);
    }
  }

  onMouseMove(ev, wp, snap) {
    if (!this._p1) return;
    const p1 = this._p1, p2 = snap.point.clone();
    const pts = [p1, new Vec2(p2.x, p1.y), p2, new Vec2(p1.x, p2.y)];
    const preview = new PolylineEntity(pts, true);
    preview.color = '#88aaff';
    this.app.renderer.previewEntities = [preview];
    const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
    this.app.setStatus(`W: ${fmt(w)} mm  H: ${fmt(h)} mm`);
    this.app.renderer.markDirty();
  }

  onKeyDown(ev) { if (ev.key === 'Escape') this.cancel(); }
}

// ── Circle tool ──────────────────────────────────────────────────────────────
class CircleTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name   = 'circle';
    this.hint   = 'Cliquer le centre du cercle';
    this._center = null;
  }
  activate() { super.activate(); this._center = null; }
  cancel()   { this._center = null; super.cancel(); }

  onMouseDown(ev, wp, snap) {
    if (!this._center) {
      this._center = snap.point.clone();
      this.app.setHint('Cliquer un point sur le cercle (rayon)');
    } else {
      const r = snap.point.dist(this._center);
      if (r > 1e-6) this.app.drawing.add(new CircleEntity(this._center, r));
      this._center = null;
      this.app.renderer.previewEntities = [];
      this.app.setHint(this.hint);
      this.app.renderer.markDirty();
    }
  }

  onMouseMove(ev, wp, snap) {
    if (!this._center) return;
    const r = snap.point.dist(this._center);
    const preview = new CircleEntity(this._center, Math.max(r, 0.1));
    preview.color = '#88aaff';
    this.app.renderer.previewEntities = [preview];
    this.app.setStatus(`R: ${fmt(r)} mm  | Ø: ${fmt(r*2)} mm`);
    this.app.renderer.markDirty();
  }

  onKeyDown(ev) { if (ev.key === 'Escape') this.cancel(); }
}

// ── Arc tool (3-point) ───────────────────────────────────────────────────────
class ArcTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name  = 'arc';
    this.hint  = 'Cliquer le point de départ de l\'arc';
    this._pts  = [];
  }
  activate() { super.activate(); this._pts = []; }
  cancel()   { this._pts = []; super.cancel(); }

  onMouseDown(ev, wp, snap) {
    this._pts.push(snap.point.clone());
    if (this._pts.length === 1) this.app.setHint('Cliquer un point sur l\'arc');
    if (this._pts.length === 2) this.app.setHint('Cliquer le point d\'arrivée');
    if (this._pts.length === 3) {
      const cc = circumcircle(this._pts[0], this._pts[1], this._pts[2]);
      if (cc) {
        const sa = this._pts[0].sub(cc.center).angle();
        const ea = this._pts[2].sub(cc.center).angle();
        this.app.drawing.add(new ArcEntity(cc.center, cc.radius, sa, ea, false));
      }
      this._pts = [];
      this.app.renderer.previewEntities = [];
      this.app.setHint(this.hint);
      this.app.renderer.markDirty();
    }
  }

  onMouseMove(ev, wp, snap) {
    if (!this._pts.length) return;
    const previews = [];
    // Show line from first point
    if (this._pts.length >= 1) {
      previews.push(Object.assign(new LineEntity(this._pts[0], snap.point.clone()), { color: '#888888' }));
    }
    if (this._pts.length === 2) {
      const cc = circumcircle(this._pts[0], this._pts[1], snap.point.clone());
      if (cc) {
        const sa = this._pts[0].sub(cc.center).angle();
        const ea = snap.point.sub(cc.center).angle();
        const arc = new ArcEntity(cc.center, cc.radius, sa, ea, false);
        arc.color = '#88aaff';
        previews.push(arc);
      }
    }
    this.app.renderer.previewEntities = previews;
    this.app.renderer.markDirty();
  }

  onKeyDown(ev) { if (ev.key === 'Escape') this.cancel(); }
}

// ── Text tool ────────────────────────────────────────────────────────────────
class TextTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name   = 'text';
    this.hint   = 'Cliquer pour placer du texte';
    this.cursor = 'text';
  }

  onMouseDown(ev, wp, snap) {
    const txt = prompt('Texte à placer :');
    if (txt && txt.trim()) {
      const te = new TextEntity(snap.point.clone(), txt.trim(), 5);
      this.app.drawing.add(te);
      this.app.renderer.markDirty();
    }
  }
}

// ── Linear dimension tool ─────────────────────────────────────────────────────
class DimLinearTool extends BaseTool {
  constructor(app, dir) {
    super(app);
    this.dir  = dir; // 'horizontal' | 'vertical' | 'aligned'
    this.name = 'dim-' + dir.slice(0, 4);
    this.hint = 'Cliquer le 1er point de mesure';
    this._pts = [];
    this._dimOffset = null;
  }
  activate() { super.activate(); this._pts = []; this._dimOffset = null; }
  cancel()   { this._pts = []; this._dimOffset = null; super.cancel(); }

  onMouseDown(ev, wp, snap) {
    if (this._pts.length < 2) {
      this._pts.push(snap.point.clone());
      if (this._pts.length === 1) this.app.setHint('Cliquer le 2ème point de mesure');
      if (this._pts.length === 2) this.app.setHint('Déplacer pour positionner la cote • Cliquer pour valider');
    } else {
      // place dimension
      const dim = new LinearDimension(this._pts[0], this._pts[1], this._dimOffset || 20, this.dir);
      dim.suffix = ' mm';
      this.app.drawing.add(dim);
      this._pts = [];
      this._dimOffset = null;
      this.app.renderer.previewEntities = [];
      this.app.setHint(this.hint);
      this.app.renderer.markDirty();
    }
  }

  onMouseMove(ev, wp, snap) {
    if (this._pts.length === 0) return;

    if (this._pts.length === 1) {
      const preview = new LineEntity(this._pts[0], snap.point.clone());
      preview.color = '#888888';
      this.app.renderer.previewEntities = [preview];
      this.app.renderer.markDirty();
      return;
    }

    // compute offset from current mouse position
    const p1 = this._pts[0], p2 = this._pts[1];
    let offset;
    if (this.dir === 'horizontal') {
      offset = wp.y - Math.max(p1.y, p2.y);
      if (Math.abs(offset) < 5) offset = 5;
    } else if (this.dir === 'vertical') {
      offset = wp.x - Math.max(p1.x, p2.x);
      if (Math.abs(offset) < 5) offset = 5;
    } else {
      const perpDir = p2.sub(p1).norm().perp();
      offset = wp.sub(p1).dot(perpDir);
      if (Math.abs(offset) < 5) offset = 5;
    }
    this._dimOffset = offset;

    const dim = new LinearDimension(p1, p2, offset, this.dir);
    dim.suffix = ' mm';
    dim.color  = '#00d4d4';
    this.app.renderer.previewEntities = [dim];
    this.app.setStatus(`Cote: ${fmt(dim.value)} mm`);
    this.app.renderer.markDirty();
  }

  onKeyDown(ev) { if (ev.key === 'Escape') this.cancel(); }
}

// ── Angular dimension tool ────────────────────────────────────────────────────
class DimAngularTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'dim-angl';
    this.hint = 'Cliquer le sommet de l\'angle';
    this._pts = [];
  }
  activate() { super.activate(); this._pts = []; }
  cancel()   { this._pts = []; super.cancel(); }

  onMouseDown(ev, wp, snap) {
    this._pts.push(snap.point.clone());
    if (this._pts.length === 1) this.app.setHint('Cliquer le 1er bras de l\'angle');
    if (this._pts.length === 2) this.app.setHint('Cliquer le 2ème bras pour positionner la cote');
    if (this._pts.length === 3) {
      const [vtx, p1, p2] = this._pts;
      const r1 = vtx.dist(p1), r2 = vtx.dist(p2);
      const radius = Math.max(r1, r2) * 0.6;
      const dim = new AngularDimension(vtx, p1, p2, radius);
      this.app.drawing.add(dim);
      this._pts = [];
      this.app.renderer.previewEntities = [];
      this.app.setHint(this.hint);
      this.app.renderer.markDirty();
    }
  }

  onMouseMove(ev, wp, snap) {
    const previews = [];
    if (this._pts.length >= 1) {
      previews.push(Object.assign(new LineEntity(this._pts[0], snap.point.clone()), { color: '#888888' }));
    }
    if (this._pts.length === 2) {
      const [vtx, p1] = this._pts;
      previews.push(Object.assign(new LineEntity(vtx, p1), { color: '#888888' }));
      const r = Math.max(vtx.dist(p1), vtx.dist(snap.point)) * 0.6;
      const dim = new AngularDimension(vtx, p1, snap.point.clone(), r);
      dim.color = '#00d4d4';
      previews.push(dim);
      this.app.setStatus(`Angle: ${fmt(dim.angle)}°`);
    }
    this.app.renderer.previewEntities = previews;
    this.app.renderer.markDirty();
  }

  onKeyDown(ev) { if (ev.key === 'Escape') this.cancel(); }
}

// ── Radius dimension tool ─────────────────────────────────────────────────────
class DimRadiusTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'dim-radi';
    this.hint = 'Cliquer un cercle ou arc pour coter le rayon/diamètre';
    this._useDiameter = false;
  }

  onMouseDown(ev, wp, snap) {
    const thr = 10 / this.app.viewport.scale;
    for (const e of this.app.drawing.entities) {
      if (!e.visible) continue;
      if (e instanceof CircleEntity && e.hitTest(wp, thr)) {
        const angle = wp.sub(e.center).angle();
        const poc = Vec2.fromAngle(angle, e.radius).add(e.center);
        const dim = new RadiusDimension(e.center, poc, this._useDiameter);
        this.app.drawing.add(dim);
        this.app.renderer.markDirty();
        return;
      }
      if (e instanceof ArcEntity && e.hitTest(wp, thr)) {
        const poc = e.startPoint;
        const dim = new RadiusDimension(e.center, poc, this._useDiameter);
        this.app.drawing.add(dim);
        this.app.renderer.markDirty();
        return;
      }
    }
    this.app.setStatus('Aucun cercle/arc trouvé — cliquer sur le contour');
  }
}
