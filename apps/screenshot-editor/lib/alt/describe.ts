import {
  ANNOTATION_COLOR_NAMES,
  STEP_RADIUS,
  type Box,
  type Point,
} from "@/lib/design/annotations";
import { DEFAULT_MAGNIFY_ZOOM, magnifyArea } from "@/lib/design/magnify";
import {
  LINE_ENDS,
  type Annotation,
  type ArrowAnnotation,
  type LineEnd,
  type ShapeAnnotation,
} from "@/lib/design/schema";

// A suggested alt text for the export, written from the annotations: what
// each step, box and arrow marks. It never says "screenshot of": screen
// readers already announce an image. Lengths are in image widths, like the
// annotations; text found in the screenshot (by OCR) says what they mark.

/** A word found in the screenshot, with its box in image widths. */
export type FoundWord = { text: string; box: Box };
/** A line of words, in reading order. */
export type FoundLine = { words: FoundWord[]; box: Box };

/** Words of a phrase quoted from the screenshot, at most. */
const MAX_WORDS = 6;
/** How far from a step or an arrow's tip its text may be, in image widths. */
const NEAR = 0.06;
/** Words further apart than this many word heights are separate phrases. */
const PHRASE_GAP = 1.2;

const centreOf = (box: Box): Point => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

const inside = (point: Point, box: Box) =>
  point.x >= box.x &&
  point.x <= box.x + box.width &&
  point.y >= box.y &&
  point.y <= box.y + box.height;

const distanceTo = (point: Point, box: Box) =>
  Math.hypot(
    Math.max(box.x - point.x, 0, point.x - (box.x + box.width)),
    Math.max(box.y - point.y, 0, point.y - (box.y + box.height)),
  );

const quote = (words: FoundWord[]) => {
  const text = words
    .slice(0, MAX_WORDS)
    .map((word) => word.text)
    .join(" ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}?!)]+$/gu, "");
  if (!text) return null;
  return `‘${text}${words.length > MAX_WORDS ? "…" : ""}’`;
};

/** A run of words close together on a line: a label, a heading, a link. */
type Phrase = FoundLine;

const boxAround = (words: FoundWord[]): Box => {
  const left = Math.min(...words.map((word) => word.box.x));
  const top = Math.min(...words.map((word) => word.box.y));
  const right = Math.max(...words.map((word) => word.box.x + word.box.width));
  const bottom = Math.max(...words.map((word) => word.box.y + word.box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * The lines split into phrases where the gap between words is wider than a
 * space: OCR runs side-by-side columns into one line. Stray symbols (|, >)
 * are dropped.
 */
function toPhrases(lines: readonly FoundLine[]): Phrase[] {
  const phrases: Phrase[] = [];
  for (const line of lines) {
    const words = line.words
      .filter((word) => /[\p{L}\p{N}]/u.test(word.text))
      .sort((a, b) => a.box.x - b.box.x);
    let run: FoundWord[] = [];
    words.forEach((word, index) => {
      const previous = words[index - 1];
      const gap = previous
        ? word.box.x - (previous.box.x + previous.box.width)
        : 0;
      if (
        previous &&
        gap > Math.max(word.box.height, previous.box.height) * PHRASE_GAP
      ) {
        phrases.push({ words: run, box: boxAround(run) });
        run = [];
      }
      run.push(word);
    });
    if (run.length) phrases.push({ words: run, box: boxAround(run) });
  }
  // Reading order: top down, then left to right.
  return phrases.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

/** The phrases (or their parts) inside `box`, in reading order. */
function phrasesIn(box: Box, phrases: Phrase[]): Phrase[] {
  return phrases.flatMap((phrase) => {
    const words = phrase.words.filter((word) =>
      inside(centreOf(word.box), box),
    );
    return words.length ? [{ words, box: boxAround(words) }] : [];
  });
}

/** The words of the phrase nearest `point`, if one is near enough. */
function wordsNear(point: Point, phrases: Phrase[], near: number) {
  let best: Phrase | null = null;
  let bestDistance = near;
  for (const phrase of phrases) {
    const distance = distanceTo(point, phrase.box);
    if (distance <= bestDistance) {
      best = phrase;
      bestDistance = distance;
    }
  }
  if (!best) return [];
  const { words } = best;
  if (words.length <= MAX_WORDS) return words;
  // A long phrase: the words around the nearest one.
  let nearest = 0;
  words.forEach((word, index) => {
    if (distanceTo(point, word.box) < distanceTo(point, words[nearest].box))
      nearest = index;
  });
  const start = Math.max(
    0,
    Math.min(nearest - 2, words.length - MAX_WORDS + 1),
  );
  return words.slice(start, start + MAX_WORDS - 1);
}

/**
 * What's inside an area: one phrase quoted, or several as the section the
 * first one heads. Null when there's no text.
 */
function textIn(box: Box, phrases: Phrase[]) {
  const inner = phrasesIn(box, phrases);
  const first = inner[0] && quote(inner[0].words);
  if (!first) return null;
  return { first, section: inner.length > 1 };
}

/** "the top left", "the right" and so on: where on the screenshot. */
function placeOf(point: Point, aspect: number) {
  const across = point.x < 1 / 3 ? "left" : point.x > 2 / 3 ? "right" : "";
  const down =
    point.y < aspect / 3 ? "top" : point.y > (2 * aspect) / 3 ? "bottom" : "";
  if (down && across) return `the ${down} ${across}`;
  if (down || across) return `the ${down || across}`;
  return "the middle";
}

/** The same, after "is": "at the top left", "on the right", "in the middle". */
function wherePhrase(point: Point, aspect: number) {
  const place = placeOf(point, aspect);
  if (place === "the middle") return "in the middle";
  if (place === "the left" || place === "the right") return `on ${place}`;
  return `at ${place}`;
}

const colourOf = (annotation: { color: Annotation["color"] }) =>
  ANNOTATION_COLOR_NAMES[annotation.color].toLowerCase();

const isLine = (arrow: ArrowAnnotation) =>
  (LINE_ENDS as readonly string[]).includes(arrow.style as LineEnd);

function describeShape(
  shape: ShapeAnnotation,
  phrases: Phrase[],
  aspect: number,
): string {
  const box = {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
  };
  const at = wherePhrase(centreOf(box), aspect);
  const colour = colourOf(shape);
  switch (shape.shape) {
    case "blur":
      return `An area ${at} is blurred.`;
    case "magnify": {
      const zoom = shape.zoom ?? DEFAULT_MAGNIFY_ZOOM;
      const area = magnifyArea(shape, zoom, aspect, shape.from);
      const text = textIn(area, phrases);
      return text
        ? `A magnifier enlarges ${text.first}.`
        : `A magnifier enlarges an area ${wherePhrase(centreOf(area), aspect)}.`;
    }
    case "highlight": {
      const text = textIn(box, phrases);
      return text
        ? text.section
          ? `The ${text.first} section is highlighted in ${colour}.`
          : `${text.first} is highlighted in ${colour}.`
        : `An area ${at} is highlighted in ${colour}.`;
    }
    default: {
      const noun = shape.shape === "circle" ? "circle" : "box";
      // A filled shape hides what's under it.
      if (shape.filled)
        return `A solid ${colour} ${noun} covers an area ${at}.`;
      const text = textIn(box, phrases);
      return text
        ? `A ${colour} ${noun} surrounds ${text.section ? `the ${text.first} section` : text.first}.`
        : `A ${colour} ${noun} marks an area ${at}.`;
    }
  }
}

function describeArrow(
  arrow: ArrowAnnotation,
  phrases: Phrase[],
  aspect: number,
): string {
  const colour = colourOf(arrow);
  const tip = { x: arrow.x + arrow.dx, y: arrow.y + arrow.dy };
  if (isLine(arrow)) {
    const middle = { x: arrow.x + arrow.dx / 2, y: arrow.y + arrow.dy / 2 };
    return `A ${colour} line is drawn ${wherePhrase(middle, aspect)}.`;
  }
  const text = quote(wordsNear(tip, phrases, NEAR));
  return text
    ? `A ${colour} arrow points to ${text}.`
    : `A ${colour} arrow points to ${placeOf(tip, aspect)}.`;
}

/**
 * The suggested alt text: steps first, in number order, then the other
 * annotations from the top down. `lines` is the screenshot's text, or empty
 * when it couldn't be read. Text under blur boxes is never quoted.
 */
export function describeAnnotations(
  annotations: readonly Annotation[],
  aspect: number,
  lines: readonly FoundLine[],
): string {
  const blurs = annotations.filter(
    (annotation): annotation is ShapeAnnotation =>
      annotation.kind === "shape" && annotation.shape === "blur",
  );
  // Private text stays private.
  const visible = toPhrases(
    lines.map((line) => ({
      ...line,
      words: line.words.filter(
        (word) => !blurs.some((blur) => inside(centreOf(word.box), blur)),
      ),
    })),
  );

  const steps = annotations
    .filter((annotation) => annotation.kind === "step")
    .sort((a, b) => a.number - b.number)
    .map((step) => {
      const near = Math.max(NEAR, 2.5 * STEP_RADIUS * step.size);
      const text = quote(wordsNear(step, visible, near));
      return text
        ? `Step ${step.number} marks ${text}.`
        : `Step ${step.number} is ${wherePhrase(step, aspect)}.`;
    });

  const others = annotations
    .filter((annotation) => annotation.kind !== "step")
    .map((annotation) => ({
      at: annotation.y,
      text:
        annotation.kind === "shape"
          ? describeShape(annotation, visible, aspect)
          : describeArrow(annotation, visible, aspect),
    }))
    .sort((a, b) => a.at - b.at)
    .map((sentence) => sentence.text);

  // Several blur boxes read as one sentence.
  const blurred = others.filter((text) => text.endsWith("is blurred."));
  const rest = others.filter((text) => !text.endsWith("is blurred."));
  if (blurred.length > 1) rest.push(`${blurred.length} areas are blurred.`);
  else rest.push(...blurred);

  return [...steps, ...rest].join(" ");
}
