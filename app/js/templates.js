'use strict';

// ── Sheet metal flat-pattern generators ──────────────────────────────────────
// All dimensions in mm. Results are arrays of entities placed at origin.

const Templates = {

  // ── Cylindrical body (pipe/tube) ──────────────────────────────────────────
  // Flat pattern = rectangle: width = π×D, height = L
  // with a bend line at the center of the long dimension
  cylinder({ diameter, length, thickness = 0 }) {
    const D = diameter, L = length;
    const W = Math.PI * D; // developed length
    const entities = [];
    const origin = new Vec2(0, 0);

    // Outer rectangle
    const rect = new PolylineEntity([
      new Vec2(0, 0), new Vec2(W, 0), new Vec2(W, L), new Vec2(0, L)
    ], true);
    rect.layer = 0;
    entities.push(rect);

    // Optional: seam line (weld joint)
    const seam = new LineEntity(new Vec2(0, 0), new Vec2(0, L));
    seam.layer = 1;
    seam.color = '#ff5555';
    entities.push(seam);

    // Width dimension
    const dW = new LinearDimension(new Vec2(0, 0), new Vec2(W, 0), -15, 'horizontal');
    dW.suffix = ' mm'; dW.layer = 2;
    dW.textOverride = `π×${fmt(D)} = ${fmt(W)} mm`;
    entities.push(dW);

    // Height dimension
    const dL = new LinearDimension(new Vec2(W, 0), new Vec2(W, L), 15, 'vertical');
    dL.suffix = ' mm'; dL.layer = 2;
    entities.push(dL);

    // Labels
    const tTitle = new TextEntity(new Vec2(W/2, L/2), `Cylindre Ø${fmt(D)} × L${fmt(L)}`, 6);
    tTitle.align = 'center'; tTitle.layer = 0; tTitle.color = '#888888';
    entities.push(tTitle);

    const tW = new TextEntity(new Vec2(W/2, -5), `Développé: ${fmt(W, 1)} mm`, 4);
    tW.layer = 2; tW.color = '#00d4d4';
    entities.push(tW);

    return { entities, info: { pattern: 'Cylindre', width: W, height: L } };
  },

  // ── Cone / frustum ────────────────────────────────────────────────────────
  // Flat pattern = annular sector
  // r_top: top radius (0 for full cone)
  // r_bot: bottom radius
  // height: cone height
  cone({ rTop, rBot, height }) {
    const R1 = rTop, R2 = rBot, H = height;
    if (R2 <= R1) throw new Error('rBot doit être > rTop');

    // Slant height of full cone from apex to base
    const slanFull = Math.sqrt(H * H + R2 * R2); // from apex to bottom
    // Slant height from apex to top circle
    const slanTop = R1 === 0 ? 0 : (slanFull * R1 / R2);
    const slanBot = slanFull;

    // Flat pattern: sector with inner radius = slanTop, outer radius = slanBot
    // Sector angle = 2π × R2 / slanBot (in radians)
    const sectorAngle = 2 * Math.PI * R2 / slanBot;
    const sectorDeg   = rad2deg(sectorAngle);

    const entities = [];
    const cx = 0, cy = 0;
    const center = new Vec2(cx, cy);

    // Outer arc
    const outerArc = new ArcEntity(center, slanBot, -sectorAngle/2, sectorAngle/2, false);
    outerArc.layer = 0;
    entities.push(outerArc);

    // Inner arc (if frustum, not full cone)
    if (R1 > 0.01) {
      const innerArc = new ArcEntity(center, slanTop, -sectorAngle/2, sectorAngle/2, false);
      innerArc.layer = 0;
      entities.push(innerArc);
    }

    // Side lines
    const p1 = Vec2.fromAngle(-sectorAngle/2, slanBot).add(center);
    const p2 = Vec2.fromAngle( sectorAngle/2, slanBot).add(center);
    const q1 = Vec2.fromAngle(-sectorAngle/2, slanTop || 0.01).add(center);
    const q2 = Vec2.fromAngle( sectorAngle/2, slanTop || 0.01).add(center);

    entities.push(new LineEntity(R1 > 0.01 ? q1 : center, p1));
    entities.push(new LineEntity(R1 > 0.01 ? q2 : center, p2));

    // Radius dimensions
    if (R1 > 0.01) {
      const dR1 = new RadiusDimension(center, q1, false);
      dR1.textOverride = `R_int=${fmt(slanTop)}`;
      dR1.layer = 2;
      entities.push(dR1);
    }
    const dR2 = new RadiusDimension(center, p1, false);
    dR2.textOverride = `R_ext=${fmt(slanBot)}`;
    dR2.layer = 2;
    entities.push(dR2);

    // Angle dimension
    const angDim = new AngularDimension(center, p1, p2, slanBot * 0.7);
    angDim.textOverride = `α=${fmt(sectorDeg, 1)}°`;
    angDim.layer = 2;
    entities.push(angDim);

    // Info text
    const info = new TextEntity(new Vec2(0, slanBot + 15),
      `Cône: Ø_haut=${fmt(R1*2)} Ø_bas=${fmt(R2*2)} H=${fmt(H)} | α=${fmt(sectorDeg,1)}°`, 5);
    info.layer = 2; info.color = '#00d4d4';
    entities.push(info);

    return {
      entities,
      info: { pattern: 'Cône', sectorAngleDeg: sectorDeg, innerRadius: slanTop, outerRadius: slanBot }
    };
  },

  // ── Segmented elbow ───────────────────────────────────────────────────────
  // Each segment is an elliptical cut of the pipe
  // diameter: pipe OD, bendRadius: CL radius, angle: total angle (deg), segments: nb of pieces
  elbow({ diameter, bendRadius, angle: totalAngleDeg, segments }) {
    const D  = diameter;
    const R  = bendRadius;
    const n  = Math.max(2, segments);
    const TA = deg2rad(totalAngleDeg);

    const segAngle = TA / n;           // angle of each full segment
    const halfAngle = segAngle / 2;    // half-angle cut at each joint
    const entities = [];

    // Each segment develops into a rectangle cut with angled ends
    // Width = π×D (circumference), Height varies along the length
    // Height at center = R × segAngle
    // Cut angle at ends = arctan(D/2 / R × tan(halfAngle)) — simplified
    const W = Math.PI * D;
    const Hmid = R * segAngle;
    const cutH = (D / 2) * Math.tan(halfAngle); // extra height at edge due to cut

    let yOffset = 0;
    const colors = ['#e0e0e0', '#aaaaff'];

    for (let i = 0; i < n; i++) {
      const col = colors[i % 2];
      const x0 = 0;
      const y0 = yOffset;
      // Bottom cut
      const ybl = y0 - (i === 0 ? 0 : cutH);
      const ybr = y0 + (i === 0 ? 0 : cutH);
      // Top cut
      const ytl = y0 + Hmid - cutH;
      const ytr = y0 + Hmid + cutH;

      const pts = [
        new Vec2(x0,   ybl),
        new Vec2(x0+W, ybr),
        new Vec2(x0+W, ytr),
        new Vec2(x0,   ytl),
      ];
      const seg = new PolylineEntity(pts, true);
      seg.color = col; seg.layer = 0;
      entities.push(seg);

      // Label
      const lbl = new TextEntity(new Vec2(x0 + W/2, y0 + Hmid/2),
        `S${i+1}`, 4);
      lbl.color = '#888888'; lbl.layer = 3;
      entities.push(lbl);

      yOffset += Hmid;
    }

    // Width dim at top
    const dW = new LinearDimension(new Vec2(0, yOffset+5), new Vec2(W, yOffset+5), 15, 'horizontal');
    dW.textOverride = `π×${fmt(D)} = ${fmt(W, 1)}`; dW.layer = 2;
    entities.push(dW);

    // Info
    const info = new TextEntity(new Vec2(W/2, yOffset + 25),
      `Coude ${fmt(totalAngleDeg)}° | Ø${fmt(D)} | R_CL=${fmt(R)} | ${n} segments`, 5);
    info.layer = 2; info.color = '#00d4d4';
    entities.push(info);

    return {
      entities,
      info: { pattern: 'Coude', diameter: D, bendRadius: R, angle: totalAngleDeg, segments: n,
              segmentWidth: W, segmentHeight: Hmid }
    };
  },

  // ── Rectangular-to-round transition ──────────────────────────────────────
  // Top: circle of diameter Dc; Bottom: rectangle W×H; height: ht
  rectToRound({ rectW, rectH, circDiam, height }) {
    const rw = rectW, rh = rectH, rd = circDiam / 2, ht = height;
    const entities = [];

    // The flat pattern consists of 4 triangular/conical panels and 4 corner cones
    // Simplified: approximate with straight-line development

    // Corner points of rectangle (bottom)
    const corners = [
      new Vec2(-rw/2, -rh/2),
      new Vec2( rw/2, -rh/2),
      new Vec2( rw/2,  rh/2),
      new Vec2(-rw/2,  rh/2),
    ];

    // Points on circle (top) — equally spaced at each corner's quadrant
    const circPts = corners.map(c => {
      const a = c.angle();
      return Vec2.fromAngle(a, rd);
    });

    // Draw base rectangle
    const base = new PolylineEntity(corners, true);
    base.layer = 0; base.color = '#e0e0e0';
    entities.push(base);

    // Draw top circle
    const topCirc = new CircleEntity(new Vec2(0,0), rd);
    topCirc.layer = 0; topCirc.color = '#e0e0e0';
    entities.push(topCirc);

    // Corner connection lines
    for (let i = 0; i < 4; i++) {
      const ln = new LineEntity(corners[i], circPts[i]);
      ln.layer = 3; ln.color = '#555555';
      entities.push(ln);
    }

    // Side panel lines (midpoints of rect sides to circle points)
    const midSides = [
      new Vec2(0, -rh/2),
      new Vec2(rw/2, 0),
      new Vec2(0,  rh/2),
      new Vec2(-rw/2, 0),
    ];
    const midCirc = midSides.map(m => {
      const a = m.angle(); return Vec2.fromAngle(a, rd);
    });
    for (let i = 0; i < 4; i++) {
      const ln = new LineEntity(midSides[i], midCirc[i]);
      ln.layer = 3; ln.color = '#555555';
      entities.push(ln);
    }

    // Dimensions
    entities.push(Object.assign(
      new LinearDimension(corners[0], corners[1], -15, 'horizontal'),
      { suffix: ' mm', layer: 2 }));
    entities.push(Object.assign(
      new LinearDimension(corners[1], corners[2], 15, 'vertical'),
      { suffix: ' mm', layer: 2 }));
    const dR = new RadiusDimension(new Vec2(0,0), new Vec2(rd, 0), true);
    dR.layer = 2;
    entities.push(dR);

    // Info
    const infoTxt = new TextEntity(new Vec2(0, -rh/2 - 20),
      `Transition rect→rond | Base:${fmt(rw)}×${fmt(rh)} Ø:${fmt(circDiam)} H:${fmt(ht)}`, 5);
    infoTxt.layer = 2; infoTxt.color = '#00d4d4';
    entities.push(infoTxt);

    return { entities, info: { pattern: 'Rect→Rond' } };
  },

  // ── Bend allowance calculator ─────────────────────────────────────────────
  bendAllowance({ angle, innerRadius, thickness, kFactor = 0.44 }) {
    const A = deg2rad(angle);
    const BA = A * (innerRadius + kFactor * thickness);
    const BD = 2 * (innerRadius + thickness) * Math.tan(A / 2) - BA;
    return {
      bendAllowance: BA,
      bendDeduction: BD,
      outsideSetback: (innerRadius + thickness) * Math.tan(A / 2),
    };
  },

  // ── Flat blank from bent part ─────────────────────────────────────────────
  // segments: [{length: mm}], bends: [{angle, innerRadius}]
  flatBlank({ thickness, kFactor = 0.44, segments, bends }) {
    let total = 0;
    for (const s of segments) total += s.length;
    for (const b of bends) {
      const ba = Templates.bendAllowance({ ...b, thickness, kFactor });
      total += ba.bendAllowance;
    }
    return { flatLength: total };
  },
};
