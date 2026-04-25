'use strict';

let _entityId = 0;
function nextId() { return ++_entityId; }

class Entity {
  constructor(type) {
    this.id = nextId();
    this.type = type;
    this.layer = 0;
    this.color = null;     // null = use layer color
    this.lineWidth = null; // null = use layer line width
    this.selected = false;
    this.locked = false;
    this.visible = true;
  }
  hitTest(p, thr) { return false; }
  snapPoints() { return []; }
  bbox() { return null; }
  serialize() {
    return { id: this.id, type: this.type, layer: this.layer, color: this.color, lineWidth: this.lineWidth, locked: this.locked, visible: this.visible };
  }
  static applyBase(e, d) {
    e.id = d.id; e.layer = d.layer; e.color = d.color;
    e.lineWidth = d.lineWidth; e.locked = d.locked; e.visible = d.visible;
    return e;
  }
}

class LineEntity extends Entity {
  constructor(p1, p2) {
    super('line');
    this.p1 = Vec2.from(p1);
    this.p2 = Vec2.from(p2);
  }
  get length() { return this.p1.dist(this.p2); }
  get angle() { return rad2deg(this.p2.sub(this.p1).angle()); }
  get midpoint() { return this.p1.lerp(this.p2, 0.5); }
  hitTest(p, thr) { return distPointToSegment(p, this.p1, this.p2) <= thr; }
  snapPoints() { return [this.p1, this.p2, this.midpoint]; }
  bbox() {
    return { minX: Math.min(this.p1.x,this.p2.x), minY: Math.min(this.p1.y,this.p2.y),
             maxX: Math.max(this.p1.x,this.p2.x), maxY: Math.max(this.p1.y,this.p2.y) };
  }
  serialize() { return { ...super.serialize(), p1:{x:this.p1.x,y:this.p1.y}, p2:{x:this.p2.x,y:this.p2.y} }; }
  static deserialize(d) { return Entity.applyBase(new LineEntity(d.p1, d.p2), d); }
}

class CircleEntity extends Entity {
  constructor(center, radius) {
    super('circle');
    this.center = Vec2.from(center);
    this.radius = radius;
  }
  get diameter() { return this.radius * 2; }
  get circumference() { return 2 * Math.PI * this.radius; }
  get area() { return Math.PI * this.radius * this.radius; }
  hitTest(p, thr) { return Math.abs(p.dist(this.center) - this.radius) <= thr; }
  snapPoints() {
    const { center: c, radius: r } = this;
    return [c, new Vec2(c.x+r,c.y), new Vec2(c.x-r,c.y), new Vec2(c.x,c.y+r), new Vec2(c.x,c.y-r)];
  }
  bbox() {
    const { center: c, radius: r } = this;
    return { minX: c.x-r, minY: c.y-r, maxX: c.x+r, maxY: c.y+r };
  }
  serialize() { return { ...super.serialize(), center:{x:this.center.x,y:this.center.y}, radius:this.radius }; }
  static deserialize(d) { return Entity.applyBase(new CircleEntity(d.center, d.radius), d); }
}

class ArcEntity extends Entity {
  constructor(center, radius, startAngle, endAngle, ccw = false) {
    super('arc');
    this.center = Vec2.from(center);
    this.radius = radius;
    this.startAngle = startAngle; // radians, canvas convention (y-down)
    this.endAngle   = endAngle;
    this.ccw = ccw;
  }
  get startPoint() { return Vec2.fromAngle(this.startAngle, this.radius).add(this.center); }
  get endPoint()   { return Vec2.fromAngle(this.endAngle,   this.radius).add(this.center); }
  get sweepAngle() {
    let s = this.endAngle - this.startAngle;
    if (this.ccw) { while (s > 0) s -= 2*Math.PI; s = Math.abs(s); }
    else          { while (s < 0) s += 2*Math.PI; }
    return s;
  }
  get arcLength() { return this.radius * this.sweepAngle; }
  containsAngle(a) {
    const n = normalizeAngle;
    return this.ccw
      ? n(this.startAngle - a) <= n(this.startAngle - this.endAngle)
      : n(a - this.startAngle) <= n(this.endAngle - this.startAngle);
  }
  hitTest(p, thr) {
    if (Math.abs(p.dist(this.center) - this.radius) > thr) return false;
    return this.containsAngle(Math.atan2(p.y-this.center.y, p.x-this.center.x));
  }
  snapPoints() { return [this.startPoint, this.endPoint, this.center]; }
  serialize() {
    return { ...super.serialize(), center:{x:this.center.x,y:this.center.y},
             radius:this.radius, startAngle:this.startAngle, endAngle:this.endAngle, ccw:this.ccw };
  }
  static deserialize(d) { return Entity.applyBase(new ArcEntity(d.center,d.radius,d.startAngle,d.endAngle,d.ccw), d); }
}

class PolylineEntity extends Entity {
  constructor(points, closed = false) {
    super('polyline');
    this.points = points.map(p => Vec2.from(p));
    this.closed = closed;
  }
  hitTest(p, thr) {
    const n = this.points.length;
    for (let i = 0; i < n - 1; i++)
      if (distPointToSegment(p, this.points[i], this.points[i+1]) <= thr) return true;
    if (this.closed && n > 2)
      if (distPointToSegment(p, this.points[n-1], this.points[0]) <= thr) return true;
    return false;
  }
  snapPoints() {
    const pts = [...this.points];
    for (let i = 0; i < this.points.length - 1; i++)
      pts.push(this.points[i].lerp(this.points[i+1], 0.5));
    return pts;
  }
  serialize() {
    return { ...super.serialize(), points: this.points.map(p=>({x:p.x,y:p.y})), closed: this.closed };
  }
  static deserialize(d) { return Entity.applyBase(new PolylineEntity(d.points, d.closed), d); }
}

class TextEntity extends Entity {
  constructor(pos, text, height = 5, angle = 0) {
    super('text');
    this.pos = Vec2.from(pos);
    this.text = text;
    this.height = height;
    this.angle = angle;
    this.align = 'left';
  }
  hitTest(p, thr) { return p.dist(this.pos) <= thr * 3; }
  snapPoints() { return [this.pos]; }
  serialize() {
    return { ...super.serialize(), pos:{x:this.pos.x,y:this.pos.y}, text:this.text, height:this.height, angle:this.angle };
  }
  static deserialize(d) { return Entity.applyBase(new TextEntity(d.pos,d.text,d.height,d.angle), d); }
}

// ── Dimension entities ──────────────────────────────────────────────────────

class LinearDimension extends Entity {
  constructor(p1, p2, offset, dir = 'aligned') {
    super('dim_linear');
    this.p1 = Vec2.from(p1);
    this.p2 = Vec2.from(p2);
    this.offset = offset; // perpendicular offset (world units)
    this.dir = dir;       // 'horizontal' | 'vertical' | 'aligned'
    this.textOverride = null;
    this.decimals = 2;
    this.suffix = '';
    this.layer = 2;
  }
  get value() {
    if (this.dir === 'horizontal') return Math.abs(this.p2.x - this.p1.x);
    if (this.dir === 'vertical')   return Math.abs(this.p2.y - this.p1.y);
    return this.p1.dist(this.p2);
  }
  get text() { return this.textOverride || (fmt(this.value, this.decimals) + this.suffix); }
  computeGeometry() {
    const { p1, p2, offset, dir } = this;
    if (dir === 'horizontal') {
      const dimY = Math.max(p1.y, p2.y) + offset;
      return {
        c1: new Vec2(p1.x, dimY), c2: new Vec2(p2.x, dimY),
        e1from: p1, e1to: new Vec2(p1.x, dimY + Math.sign(offset)*2),
        e2from: p2, e2to: new Vec2(p2.x, dimY + Math.sign(offset)*2),
        textPos: new Vec2((p1.x+p2.x)/2, dimY), textAngle: 0,
      };
    } else if (dir === 'vertical') {
      const dimX = Math.max(p1.x, p2.x) + offset;
      return {
        c1: new Vec2(dimX, p1.y), c2: new Vec2(dimX, p2.y),
        e1from: p1, e1to: new Vec2(dimX + Math.sign(offset)*2, p1.y),
        e2from: p2, e2to: new Vec2(dimX + Math.sign(offset)*2, p2.y),
        textPos: new Vec2(dimX, (p1.y+p2.y)/2), textAngle: -90,
      };
    } else {
      const dir2 = p2.sub(p1).norm(), perp = dir2.perp();
      const c1 = p1.add(perp.mul(offset)), c2 = p2.add(perp.mul(offset));
      return {
        c1, c2,
        e1from: p1, e1to: c1.add(perp.mul(2)),
        e2from: p2, e2to: c2.add(perp.mul(2)),
        textPos: c1.lerp(c2, 0.5), textAngle: rad2deg(dir2.angle()),
      };
    }
  }
  hitTest(p, thr) {
    const g = this.computeGeometry();
    return distPointToSegment(p, g.c1, g.c2) <= thr;
  }
  serialize() {
    return { ...super.serialize(), p1:{x:this.p1.x,y:this.p1.y}, p2:{x:this.p2.x,y:this.p2.y},
             offset:this.offset, dir:this.dir, textOverride:this.textOverride, decimals:this.decimals, suffix:this.suffix };
  }
  static deserialize(d) {
    return Entity.applyBase(new LinearDimension(d.p1,d.p2,d.offset,d.dir), d);
  }
}

class AngularDimension extends Entity {
  constructor(vertex, refP1, refP2, radius) {
    super('dim_angular');
    this.vertex = Vec2.from(vertex);
    this.refP1  = Vec2.from(refP1);
    this.refP2  = Vec2.from(refP2);
    this.radius = radius;
    this.decimals = 1;
    this.textOverride = null;
    this.layer = 2;
  }
  get angle() {
    const v1 = this.refP1.sub(this.vertex), v2 = this.refP2.sub(this.vertex);
    return rad2deg(positiveAngleBetween(v1, v2));
  }
  get text() { return this.textOverride || (fmt(this.angle, this.decimals) + '°'); }
  computeGeometry() {
    const { vertex: v, refP1: p1, refP2: p2, radius } = this;
    const a1 = p1.sub(v).angle(), a2 = p2.sub(v).angle();
    // always go through the smaller arc
    let amid = (a1 + a2) / 2;
    // check if mid is actually between a1 and a2 (shorter arc)
    const diff = normalizeAngle(a2 - a1);
    if (diff > Math.PI) amid += Math.PI;
    const textPos = new Vec2(v.x + radius * Math.cos(amid), v.y + radius * Math.sin(amid));
    const startA = diff > Math.PI ? a2 : a1;
    const endA   = diff > Math.PI ? a1 : a2;
    return { vertex: v, startA, endA, radius, textPos, amid };
  }
  hitTest(p, thr) {
    const g = this.computeGeometry();
    return Math.abs(p.dist(g.vertex) - g.radius) <= thr;
  }
  serialize() {
    return { ...super.serialize(),
             vertex:{x:this.vertex.x,y:this.vertex.y}, refP1:{x:this.refP1.x,y:this.refP1.y},
             refP2:{x:this.refP2.x,y:this.refP2.y}, radius:this.radius };
  }
  static deserialize(d) { return Entity.applyBase(new AngularDimension(d.vertex,d.refP1,d.refP2,d.radius), d); }
}

class RadiusDimension extends Entity {
  constructor(center, pointOnCircle, isDiameter = false) {
    super('dim_radius');
    this.center = Vec2.from(center);
    this.pointOnCircle = Vec2.from(pointOnCircle);
    this.isDiameter = isDiameter;
    this.decimals = 2;
    this.textOverride = null;
    this.layer = 2;
  }
  get radius() { return this.center.dist(this.pointOnCircle); }
  get value()  { return this.isDiameter ? this.radius * 2 : this.radius; }
  get text()   {
    const pfx = this.isDiameter ? 'Ø' : 'R';
    return this.textOverride || (pfx + fmt(this.value, this.decimals));
  }
  hitTest(p, thr) { return distPointToSegment(p, this.center, this.pointOnCircle) <= thr; }
  serialize() {
    return { ...super.serialize(), center:{x:this.center.x,y:this.center.y},
             pointOnCircle:{x:this.pointOnCircle.x,y:this.pointOnCircle.y}, isDiameter:this.isDiameter };
  }
  static deserialize(d) { return Entity.applyBase(new RadiusDimension(d.center,d.pointOnCircle,d.isDiameter), d); }
}

// ── Deserialize map ─────────────────────────────────────────────────────────
const ENTITY_DESERIALIZERS = {
  line:        LineEntity.deserialize,
  circle:      CircleEntity.deserialize,
  arc:         ArcEntity.deserialize,
  polyline:    PolylineEntity.deserialize,
  text:        TextEntity.deserialize,
  dim_linear:  LinearDimension.deserialize,
  dim_angular: AngularDimension.deserialize,
  dim_radius:  RadiusDimension.deserialize,
};

// ── Drawing ─────────────────────────────────────────────────────────────────
class Drawing {
  constructor() {
    this.entities = [];
    this.layers = [
      { id: 0, name: 'Dessin',        color: '#e0e0e0', lw: 1.2, visible: true, locked: false },
      { id: 1, name: 'Lignes de pli', color: '#4499ff', lw: 1.5, visible: true, locked: false },
      { id: 2, name: 'Cotes',         color: '#00d4d4', lw: 0.8, visible: true, locked: false },
      { id: 3, name: 'Construction',  color: '#ff5555', lw: 0.7, visible: true, locked: false },
    ];
    this.activeLayer = 0;
    this.units = 'mm';
    this.title = 'Sans titre';
    this.gridSpacing = 10;
    this.snapGrid      = true;
    this.snapEndpoint  = true;
    this.snapMidpoint  = true;
    this.snapCenter    = true;
    this._history = [];
    this._historyPos = -1;
    this._pushHistory();
  }

  _serialize() {
    return JSON.stringify(this.entities.map(e => e.serialize()));
  }

  _deserialize(json) {
    const data = JSON.parse(json);
    _entityId = 0;
    const ents = data.map(d => {
      const fn = ENTITY_DESERIALIZERS[d.type];
      if (!fn) return null;
      const e = fn(d);
      if (e && e.id > _entityId) _entityId = e.id;
      return e;
    }).filter(Boolean);
    return ents;
  }

  _pushHistory() {
    this._history.splice(this._historyPos + 1);
    this._history.push(this._serialize());
    if (this._history.length > 80) this._history.shift();
    this._historyPos = this._history.length - 1;
  }

  commit() { this._pushHistory(); }

  undo() {
    if (this._historyPos > 0) {
      this._historyPos--;
      this.entities = this._deserialize(this._history[this._historyPos]);
      return true;
    }
    return false;
  }

  redo() {
    if (this._historyPos < this._history.length - 1) {
      this._historyPos++;
      this.entities = this._deserialize(this._history[this._historyPos]);
      return true;
    }
    return false;
  }

  add(entity) {
    entity.layer = entity.layer ?? this.activeLayer;
    this.entities.push(entity);
    this._pushHistory();
    return entity;
  }

  addMany(entities) {
    entities.forEach(e => { e.layer = e.layer ?? this.activeLayer; this.entities.push(e); });
    this._pushHistory();
  }

  removeSelected() {
    const before = this.entities.length;
    this.entities = this.entities.filter(e => !e.selected);
    if (this.entities.length < before) this._pushHistory();
  }

  getSelected() { return this.entities.filter(e => e.selected); }
  selectAll()    { this.entities.forEach(e => { if (!e.locked && e.visible) e.selected = true; }); }
  deselectAll()  { this.entities.forEach(e => e.selected = false); }

  selectAt(p, thr) {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (!e.visible || e.locked) continue;
      if (e.hitTest(p, thr)) return e;
    }
    return null;
  }

  layerColor(entity) {
    if (entity.color) return entity.color;
    const l = this.layers.find(l => l.id === entity.layer);
    return l ? l.color : '#e0e0e0';
  }

  layerLineWidth(entity) {
    if (entity.lineWidth) return entity.lineWidth;
    const l = this.layers.find(l => l.id === entity.layer);
    return l ? l.lw : 1;
  }

  getLayer(id) { return this.layers.find(l => l.id === id) || this.layers[0]; }

  findSnapPoint(worldPos, viewScale, excludeIds = []) {
    const thr = 16 / viewScale; // 16 px in world units
    const candidates = [];

    if (this.snapGrid) {
      const gs = this.gridSpacing;
      const gx = Math.round(worldPos.x / gs) * gs;
      const gy = Math.round(worldPos.y / gs) * gs;
      const gp = new Vec2(gx, gy);
      candidates.push({ point: gp, type: 'grid', dist: worldPos.dist(gp) });
    }

    for (const e of this.entities) {
      if (!e.visible || excludeIds.includes(e.id)) continue;
      const spts = e.snapPoints();
      for (const sp of spts) {
        const d = worldPos.dist(sp);
        if (d > thr) continue;
        let type = 'endpoint';
        if (e instanceof LineEntity) {
          type = sp.eq(e.midpoint) ? 'midpoint' : 'endpoint';
          if (type === 'midpoint' && !this.snapMidpoint) continue;
          if (type === 'endpoint' && !this.snapEndpoint) continue;
        } else if (e instanceof CircleEntity) {
          type = sp.eq(e.center) ? 'center' : 'quadrant';
          if (type === 'center' && !this.snapCenter) continue;
          if (type === 'quadrant' && !this.snapEndpoint) continue;
        } else if (e instanceof ArcEntity) {
          type = sp.eq(e.center) ? 'center' : 'endpoint';
          if (type === 'center' && !this.snapCenter) continue;
          if (type === 'endpoint' && !this.snapEndpoint) continue;
        } else {
          if (!this.snapEndpoint) continue;
        }
        candidates.push({ point: sp, type, dist: d });
      }
    }

    if (!candidates.length) return { point: worldPos.clone(), type: 'free' };
    const entitySnaps = candidates.filter(c => c.type !== 'grid');
    const pool = entitySnaps.length ? entitySnaps : candidates;
    pool.sort((a, b) => a.dist - b.dist);
    return pool[0];
  }

  toSVG(opts = {}) {
    const margin = opts.margin || 20;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of this.entities) {
      const b = e.bbox ? e.bbox() : null;
      if (!b) continue;
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
    minX -= margin; minY -= margin; maxX += margin; maxY += margin;
    const W = maxX - minX, H = maxY - minY;
    // SVG y-axis is down; our world y is up → flip
    const tx = x => x - minX;
    const ty = y => H - (y - minY);

    const lines = [`<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
      `<rect width="${W}" height="${H}" fill="#1a1a2e"/>`,
      `<g font-family="monospace" font-size="4" fill="none" stroke-linecap="round" stroke-linejoin="round">`];

    for (const e of this.entities) {
      if (!e.visible) continue;
      const col = this.layerColor(e);
      const lw  = this.layerLineWidth(e);
      const attr = `stroke="${col}" stroke-width="${lw}"`;

      if (e instanceof LineEntity) {
        lines.push(`<line x1="${tx(e.p1.x)}" y1="${ty(e.p1.y)}" x2="${tx(e.p2.x)}" y2="${ty(e.p2.y)}" ${attr}/>`);
      } else if (e instanceof CircleEntity) {
        lines.push(`<circle cx="${tx(e.center.x)}" cy="${ty(e.center.y)}" r="${e.radius}" ${attr}/>`);
      } else if (e instanceof ArcEntity) {
        const sp = e.startPoint, ep = e.endPoint;
        const largeArc = e.sweepAngle > Math.PI ? 1 : 0;
        // In SVG y is down, so ccw in world = cw in SVG = sweep-flag=0
        const sweep = e.ccw ? 0 : 1;
        lines.push(`<path d="M ${tx(sp.x)} ${ty(sp.y)} A ${e.radius} ${e.radius} 0 ${largeArc} ${sweep} ${tx(ep.x)} ${ty(ep.y)}" ${attr}/>`);
      } else if (e instanceof PolylineEntity) {
        const pts = e.points.map(p => `${tx(p.x)},${ty(p.y)}`).join(' ');
        if (e.closed)
          lines.push(`<polygon points="${pts}" ${attr} fill="none"/>`);
        else
          lines.push(`<polyline points="${pts}" ${attr} fill="none"/>`);
      } else if (e instanceof TextEntity) {
        lines.push(`<text x="${tx(e.pos.x)}" y="${ty(e.pos.y)}" fill="${col}" font-size="${e.height}">${e.text}</text>`);
      } else if (e instanceof LinearDimension) {
        const g = e.computeGeometry();
        const dc = this.layerColor(e), dlw = 0.5;
        const da = `stroke="${dc}" stroke-width="${dlw}"`;
        lines.push(`<line x1="${tx(g.c1.x)}" y1="${ty(g.c1.y)}" x2="${tx(g.c2.x)}" y2="${ty(g.c2.y)}" ${da}/>`);
        lines.push(`<line x1="${tx(g.e1from.x)}" y1="${ty(g.e1from.y)}" x2="${tx(g.e1to.x)}" y2="${ty(g.e1to.y)}" ${da}/>`);
        lines.push(`<line x1="${tx(g.e2from.x)}" y1="${ty(g.e2from.y)}" x2="${tx(g.e2to.x)}" y2="${ty(g.e2to.y)}" ${da}/>`);
        lines.push(`<text x="${tx(g.textPos.x)}" y="${ty(g.textPos.y)}" fill="${dc}" font-size="4" text-anchor="middle" dominant-baseline="middle">${e.text}</text>`);
      }
    }

    lines.push('</g>', '</svg>');
    return lines.join('\n');
  }
}
