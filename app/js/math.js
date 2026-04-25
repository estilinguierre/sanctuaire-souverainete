'use strict';

class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
  mul(s) { return new Vec2(this.x * s, this.y * s); }
  div(s) { return new Vec2(this.x / s, this.y / s); }
  len() { return Math.hypot(this.x, this.y); }
  lenSq() { return this.x * this.x + this.y * this.y; }
  norm() { const l = this.len(); return l > 1e-12 ? this.div(l) : new Vec2(1, 0); }
  dot(v) { return this.x * v.x + this.y * v.y; }
  cross(v) { return this.x * v.y - this.y * v.x; }
  dist(v) { return this.sub(v).len(); }
  distSq(v) { return this.sub(v).lenSq(); }
  angle() { return Math.atan2(this.y, this.x); }
  rot(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }
  perp() { return new Vec2(-this.y, this.x); }
  lerp(v, t) { return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t); }
  clone() { return new Vec2(this.x, this.y); }
  eq(v, eps = 1e-8) { return Math.abs(this.x - v.x) < eps && Math.abs(this.y - v.y) < eps; }
  neg() { return new Vec2(-this.x, -this.y); }
  static fromAngle(a, r = 1) { return new Vec2(Math.cos(a) * r, Math.sin(a) * r); }
  static from(o) { return new Vec2(o.x, o.y); }
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
function deg2rad(d) { return d * DEG; }
function rad2deg(r) { return r * RAD; }

function normalizeAngle(a) {
  a = a % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
}

function positiveAngleBetween(v1, v2) {
  const dot = Math.max(-1, Math.min(1, v1.norm().dot(v2.norm())));
  return Math.acos(dot);
}

function distPointToSegment(p, a, b) {
  const ab = b.sub(a), lenSq = ab.lenSq();
  if (lenSq < 1e-20) return p.dist(a);
  const t = Math.max(0, Math.min(1, p.sub(a).dot(ab) / lenSq));
  return p.dist(a.add(ab.mul(t)));
}

function closestPointOnSegment(p, a, b) {
  const ab = b.sub(a), lenSq = ab.lenSq();
  if (lenSq < 1e-20) return { pt: a.clone(), t: 0 };
  const t = Math.max(0, Math.min(1, p.sub(a).dot(ab) / lenSq));
  return { pt: a.add(ab.mul(t)), t };
}

function circumcircle(p1, p2, p3) {
  const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-10) return null;
  const ux = ((ax*ax + ay*ay)*(by - cy) + (bx*bx + by*by)*(cy - ay) + (cx*cx + cy*cy)*(ay - by)) / D;
  const uy = ((ax*ax + ay*ay)*(cx - bx) + (bx*bx + by*by)*(ax - cx) + (cx*cx + cy*cy)*(bx - ax)) / D;
  const center = new Vec2(ux, uy);
  return { center, radius: center.dist(p1) };
}

function fmt(n, dec = 2) {
  if (typeof n !== 'number' || isNaN(n)) return '?';
  if (Math.abs(n) < 1e-10) return '0';
  return parseFloat(n.toFixed(dec)).toString();
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function pointInBox(p, x, y, w, h) {
  return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
}
