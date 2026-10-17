import { isLineEnd, type ArrowStyle, type LineEnd } from "./schema";

// The outlines of the arrow styles and the line ends, straight or bent. Everything here is
// in canvas px: `unit` is the screenshot's width, and every size is a
// fraction of it, so an arrow looks the same at every zoom and in the export.

export type Point = { x: number; y: number };

/** One step of a canvas path, in the order the canvas methods take them. */
export type PathCommand =
  | { op: "M" | "L"; x: number; y: number }
  | { op: "arcTo"; x1: number; y1: number; x2: number; y2: number; r: number }
  | {
      op: "arc";
      x: number;
      y: number;
      r: number;
      start: number;
      end: number;
      ccw: boolean;
    }
  | { op: "Z" };

export type ArrowShape = {
  /** A filled outline (solid, halo; the dotted style's dot; a line's dot or round end), or null. */
  fill: PathCommand[] | null;
  /** A stroked path (the bold, dotted and chevron styles, lines), or null. Painted under the fill. */
  stroke: { path: PathCommand[]; width: number; cap: CanvasLineCap } | null;
  /** The halo style's white outline width on each side; 0 for the others. */
  halo: number;
  /** The soft shadow under the arrow, in px. */
  shadow: { blur: number; offsetY: number; opacity: number };
  /** The arrow's centre line, tail to tip, for pressing it. */
  spine: Point[];
  /** The head, as a closed outline, for pressing it. */
  head: Point[];
  /** Everything drawn, shadow aside. */
  bounds: { x: number; y: number; width: number; height: number };
};

/** How far the middle of an arrow can be pulled sideways, as a share of its length. */
export const MAX_ARROW_BEND = 0.5;
/** Pulled less than this, an arrow snaps back to straight. */
export const BEND_SNAP = 0.02;

const SAMPLES = 48;

/**
 * The bent arrow's curve: a quadratic from tail to tip whose middle passes
 * `bend` x length to the left of the straight line's middle. The bend stays
 * on the line's perpendicular bisector, so the curve is always symmetric.
 */
export function arrowCurve(tail: Point, tip: Point, bend: number) {
  const dx = tip.x - tail.x;
  const dy = tip.y - tail.y;
  const middle = { x: (tail.x + tip.x) / 2, y: (tail.y + tip.y) / 2 };
  // Left of the direction of travel (y runs down the canvas).
  const handle = { x: middle.x + dy * bend, y: middle.y - dx * bend };
  const control = { x: 2 * handle.x - middle.x, y: 2 * handle.y - middle.y };
  return { handle, control };
}

/** The bend that puts the curve's middle nearest `point`, kept in limits. */
export function bendToward(tail: Point, tip: Point, point: Point): number {
  const dx = tip.x - tail.x;
  const dy = tip.y - tail.y;
  const length2 = dx * dx + dy * dy;
  if (!(length2 > 0)) return 0;
  const middle = { x: (tail.x + tip.x) / 2, y: (tail.y + tip.y) / 2 };
  // Distance along the left normal (dy, -dx), as a share of the length.
  const bend =
    ((point.x - middle.x) * dy - (point.y - middle.y) * dx) / length2;
  if (Math.abs(bend) < BEND_SNAP) return 0;
  return Math.max(-MAX_ARROW_BEND, Math.min(MAX_ARROW_BEND, bend));
}

type Sample = { p: Point; s: number };

/** Points along the curve with the distance travelled to each. */
function sampleCurve(tail: Point, tip: Point, control: Point): Sample[] {
  const samples: Sample[] = [];
  let s = 0;
  let last = tail;
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    const p = {
      x: a * tail.x + b * control.x + c * tip.x,
      y: a * tail.y + b * control.y + c * tip.y,
    };
    s += Math.hypot(p.x - last.x, p.y - last.y);
    samples.push({ p, s });
    last = p;
  }
  return samples;
}

/** The point `s` px along the sampled curve. */
function pointAt(samples: Sample[], s: number): Point {
  if (s <= 0) return samples[0].p;
  for (let i = 1; i < samples.length; i += 1) {
    const b = samples[i];
    if (b.s >= s) {
      const a = samples[i - 1];
      const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
      return { x: a.p.x + (b.p.x - a.p.x) * f, y: a.p.y + (b.p.y - a.p.y) * f };
    }
  }
  return samples[samples.length - 1].p;
}

const unitVector = (from: Point, to: Point): Point => {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return length > 0
    ? { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
    : { x: 1, y: 0 };
};

/** Left of a direction of travel. */
const leftOf = (d: Point): Point => ({ x: d.y, y: -d.x });

/** Points every few px along the curve from `start` to `end` px. */
function spineBetween(samples: Sample[], start: number, end: number) {
  const points: { p: Point; s: number }[] = [];
  const steps = Math.max(2, Math.ceil((end - start) / 6));
  for (let i = 0; i <= Math.min(steps, 200); i += 1) {
    const s = start + ((end - start) * i) / Math.min(steps, 200);
    points.push({ p: pointAt(samples, s), s });
  }
  return points;
}

type FillParams = {
  /** Head length, tip to barbs. */
  head: number;
  /** Half the head's width at the barbs. */
  headHalf: number;
  /** How far the barbs reach back past where the shaft meets the head. */
  sweep: number;
  /** Half the shaft's width at the head, and at the tail. */
  neckHalf: number;
  tailHalf: number;
  /** How quickly the shaft widens: 1 is even, below 1 widens early. */
  taper: number;
  /** Corner radii: the tip, the barbs and where the head meets the shaft. */
  tipRadius: number;
  barbRadius: number;
  neckRadius: number;
};

function boundsOf(points: Point[], margin: number) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs) - margin;
  const y = Math.min(...ys) - margin;
  return {
    x,
    y,
    width: Math.max(...xs) + margin - x,
    height: Math.max(...ys) + margin - y,
  };
}

/** A filled arrow: a tapering shaft along the curve, a head on the end. */
function filledArrow(
  samples: Sample[],
  tip: Point,
  params: FillParams,
): Pick<ArrowShape, "fill" | "spine" | "head"> & { outline: Point[] } {
  const length = samples[samples.length - 1].s;
  const { head, headHalf, sweep, neckHalf, tailHalf, taper } = params;
  // Where the shaft meets the head, measured back along the curve.
  const neckDistance = Math.max(0, length - (head - sweep));
  const neck = pointAt(samples, neckDistance);
  // The head points from there to the tip, so it sits on the curve.
  const d = unitVector(neck, tip);
  const n = leftOf(d);
  // A rounded tip sits behind the sharp corner, so push the corner forward
  // until the rounded point lands on the tip.
  const sine = headHalf / Math.hypot(head, headHalf);
  const push = params.tipRadius * (1 / sine - 1);
  const at = (along: number, side: number): Point => ({
    x: tip.x + d.x * along + n.x * side,
    y: tip.y + d.y * along + n.y * side,
  });
  const sharpTip = at(push, 0);
  const barbLeft = at(push - head, headHalf);
  const barbRight = at(push - head, -headHalf);
  const neckLeft = at(push - head + sweep, neckHalf);
  const neckRight = at(push - head + sweep, -neckHalf);
  const headOutline = [sharpTip, barbLeft, neckLeft, neckRight, barbRight];

  const path: PathCommand[] = [];
  const arcTo = (corner: Point, toward: Point, r: number) =>
    path.push({
      op: "arcTo",
      x1: corner.x,
      y1: corner.y,
      x2: toward.x,
      y2: toward.y,
      r,
    });

  // The shaft, from the round tail cap to just before the head.
  const shaftEnd = neckDistance - neckHalf;
  const spine = spineBetween(samples, tailHalf, Math.max(tailHalf, shaftEnd));
  const hasShaft = shaftEnd > tailHalf * 2 && length > head * 1.1;
  if (!hasShaft) {
    // Too short for a shaft: just the head.
    const back = at(push - head + sweep / 2, 0);
    path.push({ op: "M", x: back.x, y: back.y });
    arcTo(barbLeft, sharpTip, params.barbRadius);
    arcTo(sharpTip, barbRight, params.tipRadius);
    arcTo(barbRight, back, params.barbRadius);
    path.push({ op: "L", x: back.x, y: back.y }, { op: "Z" });
    return {
      fill: path,
      spine: [neck, tip],
      head: headOutline,
      outline: headOutline,
    };
  }

  const span = Math.max(1e-6, neckDistance - tailHalf);
  const edges = spine.map(({ p, s }, i) => {
    // The direction of travel here, from the neighbouring points.
    const before = spine[Math.max(0, i - 1)].p;
    const after = i === spine.length - 1 ? neck : spine[i + 1].p;
    const t = unitVector(before, after);
    const side = leftOf(t);
    const f = Math.min(1, Math.max(0, (s - tailHalf) / span));
    const half = tailHalf + (neckHalf - tailHalf) * Math.pow(f, taper);
    return {
      centre: p,
      side,
      half,
      left: { x: p.x + side.x * half, y: p.y + side.y * half },
      right: { x: p.x - side.x * half, y: p.y - side.y * half },
    };
  });
  const first = edges[0];
  path.push({ op: "M", x: first.left.x, y: first.left.y });
  for (const edge of edges.slice(1))
    path.push({ op: "L", x: edge.left.x, y: edge.left.y });
  // Around the head: neck, barb, tip, barb, neck.
  const lastRight = edges[edges.length - 1].right;
  arcTo(neckLeft, barbLeft, params.neckRadius);
  arcTo(barbLeft, sharpTip, params.barbRadius);
  arcTo(sharpTip, barbRight, params.tipRadius);
  arcTo(barbRight, neckRight, params.barbRadius);
  arcTo(neckRight, lastRight, params.neckRadius);
  for (const edge of edges.slice().reverse())
    path.push({ op: "L", x: edge.right.x, y: edge.right.y });
  // The round tail: from the right edge, around the back, to the left edge.
  const angle = Math.atan2(first.side.y, first.side.x);
  path.push({
    op: "arc",
    x: first.centre.x,
    y: first.centre.y,
    r: first.half,
    start: angle + Math.PI,
    end: angle,
    ccw: false,
  });
  path.push({ op: "Z" });
  const outline = [
    ...edges.flatMap((edge) => [edge.left, edge.right]),
    ...headOutline,
    samples[0].p,
  ];
  return {
    fill: path,
    spine: [...samples.map((sample) => sample.p)],
    head: headOutline,
    outline,
  };
}

/**
 * A line of one weight from a plain end at `tail` to a styled end at `tip`:
 * cut square, a dot, rounded, or a bar across it.
 */
function lineShape(end: LineEnd, samples: Sample[], unit: number): ArrowShape {
  const width = 0.006 * unit;
  const spine = samples.map((sample) => sample.p);
  const tip = spine[spine.length - 1];
  const d = unitVector(
    pointAt(samples, samples[samples.length - 1].s - width),
    tip,
  );
  const n = leftOf(d);
  const path: PathCommand[] = [
    { op: "M", x: spine[0].x, y: spine[0].y },
    ...spine.slice(1).map((p) => ({ op: "L" as const, x: p.x, y: p.y })),
  ];
  let fill: PathCommand[] | null = null;
  let head: Point[] = [tip];
  let extent = width / 2;
  const circle = (r: number): PathCommand[] => [
    { op: "M", x: tip.x + r, y: tip.y },
    {
      op: "arc",
      x: tip.x,
      y: tip.y,
      r,
      start: 0,
      end: Math.PI * 2,
      ccw: false,
    },
    { op: "Z" },
  ];
  const ring = (r: number) =>
    Array.from({ length: 12 }, (_, i) => ({
      x: tip.x + r * Math.cos((i * Math.PI) / 6),
      y: tip.y + r * Math.sin((i * Math.PI) / 6),
    }));
  if (end === "dot") {
    const r = width * 1.9;
    fill = circle(r);
    head = ring(r);
    extent = r;
  } else if (end === "round") {
    fill = circle(width / 2);
    head = ring(width / 2);
  } else if (end === "bar") {
    const half = width * 2.6;
    const a = { x: tip.x + n.x * half, y: tip.y + n.y * half };
    const b = { x: tip.x - n.x * half, y: tip.y - n.y * half };
    path.push({ op: "M", x: a.x, y: a.y }, { op: "L", x: b.x, y: b.y });
    head = [a, b];
    extent = half;
  }
  return {
    fill,
    stroke: { path, width, cap: "butt" },
    halo: 0,
    shadow: { blur: 0.005 * unit, offsetY: 0.0016 * unit, opacity: 0.28 },
    spine,
    head,
    bounds: boundsOf([...spine, ...head, ...ring(extent)], width / 2),
  };
}

/** The weight of the bold styles' lines: lighter on short arrows. */
function boldWidth(length: number, unit: number) {
  const short = Math.min(1, length / (0.1 * unit));
  // Never more than a fifth of the arrow, so short ones stay arrows.
  return Math.min(0.013 * unit * (0.6 + 0.4 * short), length * 0.2);
}

/** The two ends of an open V whose point is `vertex`, pointing along `d`. */
function vWings(vertex: Point, d: Point, wing: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [1, -1].map((sign) => ({
    x: vertex.x + (-d.x * c + sign * d.y * s) * wing,
    y: vertex.y + (-d.y * c - sign * d.x * s) * wing,
  }));
}

/**
 * A round-capped line of one weight from `start` px along the curve, with
 * an open V head on the tip.
 */
function openArrow(
  samples: Sample[],
  tip: Point,
  start: number,
  width: number,
  unit: number,
): ArrowShape {
  const length = samples[samples.length - 1].s;
  const wing = Math.min(2.2 * width, length * 0.6);
  // The direction at the tip, and the vertex pulled back so the round
  // join ends on the tip.
  const d = unitVector(pointAt(samples, length - wing / 2), tip);
  const back = Math.min(width / 2, length / 2);
  const vertex = { x: tip.x - d.x * back, y: tip.y - d.y * back };
  const wings = vWings(vertex, d, wing, (45 * Math.PI) / 180);
  const from = Math.min(start, Math.max(0, length - back));
  const spine = spineBetween(samples, from, Math.max(from, length - back)).map(
    ({ p }) => p,
  );
  spine[spine.length - 1] = vertex;
  const path: PathCommand[] = [
    { op: "M", x: spine[0].x, y: spine[0].y },
    ...spine.slice(1).map((p) => ({ op: "L" as const, x: p.x, y: p.y })),
    { op: "M", x: wings[0].x, y: wings[0].y },
    { op: "L", x: vertex.x, y: vertex.y },
    { op: "L", x: wings[1].x, y: wings[1].y },
  ];
  return {
    fill: null,
    stroke: { path, width, cap: "round" },
    halo: 0,
    shadow: { blur: 0.005 * unit, offsetY: 0.0016 * unit, opacity: 0.28 },
    spine: [...spine, tip],
    head: [tip, wings[0], wings[1]],
    bounds: boundsOf([...spine, ...wings, tip], width / 2),
  };
}

/** The outline of an arrow (or line) from `tail` to `tip` in a style, bent by `bend`. */
export function arrowShape(
  style: ArrowStyle | LineEnd,
  tail: Point,
  tip: Point,
  bend: number,
  unit: number,
): ArrowShape | null {
  const chord = Math.hypot(tip.x - tail.x, tip.y - tail.y);
  if (!(chord > 0.5) || !(unit > 0) || !Number.isFinite(chord)) return null;
  // Chevrons always point straight along the arrow.
  const curve = style === "chevrons" || !Number.isFinite(bend) ? 0 : bend;
  const { control } = arrowCurve(tail, tip, curve);
  const samples = sampleCurve(tail, tip, control);
  const length = samples[samples.length - 1].s;

  if (isLineEnd(style)) return lineShape(style, samples, unit);

  if (style === "bold" || style === "dotted") {
    // A heavy round-capped line with an open V head, one stroke weight;
    // "dotted" starts with a dot and a gap.
    const width = boldWidth(length, unit);
    // The dot is a touch heavier than the line, so it holds its own.
    const r = width * 0.75;
    const gap = width * 0.45;
    // Where the line starts: after the dot, its gap and the line's round cap.
    const start =
      style === "dotted" ? Math.min(2 * r + gap + width / 2, length * 0.45) : 0;
    const shape = openArrow(samples, tip, start, width, unit);
    if (style === "bold") return shape;
    const centre = pointAt(samples, Math.min(r, length / 2));
    return {
      ...shape,
      fill: [
        { op: "M", x: centre.x + r, y: centre.y },
        {
          op: "arc",
          x: centre.x,
          y: centre.y,
          r,
          start: 0,
          end: Math.PI * 2,
          ccw: false,
        },
        { op: "Z" },
      ],
      spine: [tail, ...shape.spine],
      bounds: boundsOf(
        [
          ...shape.spine,
          ...shape.head,
          { x: centre.x - r, y: centre.y - r },
          { x: centre.x + r, y: centre.y + r },
        ],
        width / 2,
      ),
    };
  }

  if (style === "chevrons") {
    // Three open Vs at the tip, each pointing along the curve; the rest of
    // the drag only sets their direction. Short arrows shrink them to fit.
    const count = 3;
    const angle = (45 * Math.PI) / 180;
    const size = (width: number) => {
      const wing = 2.6 * width;
      const depth = wing * Math.cos(angle);
      return { wing, depth, spacing: depth + width * 1.15 };
    };
    let width = 0.0085 * unit;
    const full = size(width);
    const needed = width / 2 + full.depth + (count - 1) * full.spacing;
    if (needed > length) width *= length / needed;
    const { wing, depth, spacing } = size(width);
    const back = width / 2;
    const path: PathCommand[] = [];
    const points: Point[] = [];
    let head: Point[] = [];
    for (let i = 0; i < count; i += 1) {
      const at = length - back - i * spacing;
      const vertex = pointAt(samples, at);
      const d = unitVector(pointAt(samples, Math.max(0, at - depth)), vertex);
      const wings = vWings(vertex, d, wing, angle);
      path.push(
        { op: "M", x: wings[0].x, y: wings[0].y },
        { op: "L", x: vertex.x, y: vertex.y },
        { op: "L", x: wings[1].x, y: wings[1].y },
      );
      points.push(vertex, ...wings);
      if (i === 0) head = [tip, wings[0], wings[1]];
    }
    // Pressed along the chevrons only, not the empty stretch behind them.
    const start = Math.max(0, length - back - (count - 1) * spacing - depth);
    const spine = spineBetween(samples, start, length).map(({ p }) => p);
    return {
      fill: null,
      stroke: { path, width, cap: "round" },
      halo: 0,
      shadow: { blur: 0.005 * unit, offsetY: 0.0016 * unit, opacity: 0.28 },
      spine,
      head,
      bounds: boundsOf([...points, tip], width / 2),
    };
  }

  // Solid or halo: a solid arrow with a soft shadow; the halo style adds
  // a white outline, legible on anything.
  const full = 0.03 * unit;
  const k = Math.min(1, Math.max(0.5, Math.sqrt(length / (4 * full))));
  const kw = Math.sqrt(k);
  const head = Math.max(Math.min(full * k, length * 0.62), 0.011 * unit);
  const headHalf = head * 0.52;
  const neckHalf = Math.min(0.0034 * unit * kw, headHalf * 0.42);
  const halo =
    style === "halo" ? Math.min(0.0024 * unit * kw, headHalf * 0.4) : 0;
  const shape = filledArrow(samples, tip, {
    head,
    headHalf,
    sweep: head * 0.28,
    neckHalf,
    tailHalf: neckHalf * 0.7,
    taper: 1,
    tipRadius: headHalf * 0.08,
    barbRadius: headHalf * 0.16,
    neckRadius: neckHalf * 0.5,
  });
  return {
    ...shape,
    stroke: null,
    halo,
    shadow: {
      blur: 0.009 * unit * kw,
      offsetY: 0.0022 * unit * kw,
      opacity: 0.26,
    },
    bounds: boundsOf(shape.outline, halo * 1.25),
  };
}

/** Traces path commands on a canvas (or Konva) context. */
export function tracePath(
  context: Pick<
    CanvasRenderingContext2D,
    "beginPath" | "moveTo" | "lineTo" | "arcTo" | "arc" | "closePath"
  >,
  path: PathCommand[],
) {
  context.beginPath();
  for (const command of path) {
    if (command.op === "M") context.moveTo(command.x, command.y);
    else if (command.op === "L") context.lineTo(command.x, command.y);
    else if (command.op === "arcTo")
      context.arcTo(command.x1, command.y1, command.x2, command.y2, command.r);
    else if (command.op === "arc")
      context.arc(
        command.x,
        command.y,
        command.r,
        command.start,
        command.end,
        command.ccw,
      );
    else context.closePath();
  }
}

/**
 * Paints an arrow on a canvas context already transformed to canvas px.
 * Shadow sizes ignore the transform, so they are scaled by it here.
 */
export function paintArrow(
  ctx: CanvasRenderingContext2D,
  shape: ArrowShape,
  color: string,
) {
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.b) || 1;
  const shadow = () => {
    ctx.shadowColor = `rgba(0, 0, 0, ${shape.shadow.opacity})`;
    ctx.shadowBlur = shape.shadow.blur * scale;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = shape.shadow.offsetY * scale;
  };
  const noShadow = () => {
    ctx.shadowColor = "rgba(0, 0, 0, 0)";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  };
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (shape.stroke) {
    tracePath(ctx, shape.stroke.path);
    shadow();
    ctx.lineCap = shape.stroke.cap;
    ctx.lineWidth = shape.stroke.width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  if (shape.fill) {
    tracePath(ctx, shape.fill);
    if (shape.halo > 0) {
      // A white outline casting the shadow, a faint grey keyline around it,
      // then the arrow on top.
      const key = shape.halo * 0.25;
      shadow();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = (shape.halo + key) * 2;
      ctx.stroke();
      noShadow();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.11)";
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = shape.halo * 2;
      ctx.stroke();
    } else {
      shadow();
    }
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}
