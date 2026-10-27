import {
  ANNOTATION_COLOR_NAMES,
  STEP_RADIUS,
  type Box,
  type Point,
} from "@/lib/design/annotations";
import { isDeviceKind, type DeviceKind } from "@/lib/design/devices";
import { FRAMES_WITH_TITLE, FRAMES_WITH_URL } from "@/lib/design/frames";
import { DEFAULT_MAGNIFY_ZOOM, magnifyArea } from "@/lib/design/magnify";
import {
  LINE_ENDS,
  type Annotation,
  type AnnotationColor,
  type ArrowAnnotation,
  type FrameKind,
  type LineEnd,
  type ScreenshotAnnotation,
  type ShapeAnnotation,
} from "@/lib/design/schema";
import { layoutGroups } from "./layout";

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

/**
 * A run of words close together on a line: a label, a heading, a link. In a
 * list or a bar, `group` says where: "in the list on the left".
 */
type Phrase = FoundLine & { group?: string };

/** " in the list on the left", or nothing for a phrase in no list or bar. */
const inGroup = (group?: string) => (group ? ` ${group}` : "");

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
export function toPhrases(lines: readonly FoundLine[]): Phrase[] {
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
    return words.length
      ? [{ words, box: boxAround(words), group: phrase.group }]
      : [];
  });
}

/** The words of the phrase nearest `point`, if one is near enough, and its group. */
function wordsNear(
  point: Point,
  phrases: Phrase[],
  near: number,
): { words: FoundWord[]; group?: string } {
  let best: Phrase | null = null;
  let bestDistance = near;
  for (const phrase of phrases) {
    const distance = distanceTo(point, phrase.box);
    if (distance <= bestDistance) {
      best = phrase;
      bestDistance = distance;
    }
  }
  if (!best) return { words: [] };
  const { words, group } = best;
  if (words.length <= MAX_WORDS) return { words, group };
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
  return { words: words.slice(start, start + MAX_WORDS - 1), group };
}

/**
 * What's inside an area: one phrase quoted, or several as the section the
 * first one heads. Null when there's no text.
 */
function textIn(box: Box, phrases: Phrase[]) {
  const inner = phrasesIn(box, phrases);
  const first = inner[0] && quote(inner[0].words);
  if (!first) return null;
  const section = inner.length > 1;
  // One item of a list or a bar says which.
  return { first, section, where: section ? "" : inGroup(inner[0].group) };
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

const colourOf = (annotation: { color: AnnotationColor }) =>
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
        ? `A magnifier enlarges ${text.first}${text.where}.`
        : `A magnifier enlarges an area ${wherePhrase(centreOf(area), aspect)}.`;
    }
    case "highlight": {
      const text = textIn(box, phrases);
      return text
        ? text.section
          ? `The ${text.first} section is highlighted in ${colour}.`
          : `${text.first}${text.where} is highlighted in ${colour}.`
        : `An area ${at} is highlighted in ${colour}.`;
    }
    default: {
      const noun = shape.shape === "circle" ? "circle" : "box";
      // A filled shape hides what's under it.
      if (shape.filled)
        return `A solid ${colour} ${noun} covers an area ${at}.`;
      const text = textIn(box, phrases);
      return text
        ? `A ${colour} ${noun} surrounds ${text.section ? `the ${text.first} section` : `${text.first}${text.where}`}.`
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
  const found = wordsNear(tip, phrases, NEAR);
  const text = quote(found.words);
  return text
    ? `A ${colour} arrow points to ${text}${inGroup(found.group)}.`
    : `A ${colour} arrow points to ${placeOf(tip, aspect)}.`;
}

/**
 * Blurred, covered by a solid shape or by a second screenshot: what's under
 * it can't be seen, so it's never quoted. A solid circle hides its whole box,
 * to be safe.
 */
const hidesText = (
  annotation: Annotation,
): annotation is ShapeAnnotation | ScreenshotAnnotation =>
  annotation.kind === "screenshot" ||
  (annotation.kind === "shape" &&
    (annotation.shape === "blur" ||
      (annotation.filled &&
        (annotation.shape === "rect" ||
          annotation.shape === "rounded" ||
          annotation.shape === "circle"))));

/** A heading is at least this many times the size of most of the text. */
const HEADING_RATIO = 1.5;
/** Text this much smaller than the largest heading still counts as one. */
const HEADING_SLACK = 0.85;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * How big a phrase's text is. OCR boxes can run tall (into a border, an
 * icon), so a word's height is capped by its width per letter.
 */
const sizeOf = (phrase: Phrase) =>
  median(
    phrase.words.map((word) =>
      Math.min(
        word.box.height,
        (2 * word.box.width) / Math.max(1, word.text.length),
      ),
    ),
  );

const lettersIn = (phrase: Phrase) =>
  phrase.words.reduce(
    (count, word) => count + (word.text.match(/\p{L}/gu)?.length ?? 0),
    0,
  );

/**
 * The screenshot's title: the first phrase of a few words set clearly larger
 * than the rest. Empty when nothing stands out, as on most app screens, where
 * a guess would mislead.
 */
function titleOf(phrases: Phrase[]): string | null {
  if (!phrases.length) return null;
  const body = median(phrases.map(sizeOf));
  const candidates = phrases.filter(
    (phrase) =>
      phrase.words.length >= 2 && lettersIn(phrase) >= 6 && quote(phrase.words),
  );
  if (!candidates.length) return null;
  const largest = Math.max(...candidates.map(sizeOf));
  const least = Math.max(body * HEADING_RATIO, largest * HEADING_SLACK);
  // Phrases are in reading order, so this is the top one.
  const heading = candidates.find((phrase) => sizeOf(phrase) >= least);
  return heading ? quote(heading.words) : null;
}

/** The frame around the screenshot, with the text it shows. */
export type FrameText = { kind: FrameKind; title: string; url: string };

/** "moodle.brookes.ac.uk", from what an address bar shows. */
function siteOf(url: string): string {
  const text = url.trim();
  if (!text) return "";
  try {
    const address = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
      ? text
      : `https://${text}`;
    return new URL(address).hostname.replace(/^www\./, "") || text;
  } catch {
    return text;
  }
}

/**
 * What a frame's own text says the screenshot is, as the user typed it:
 * "a page at moodle.brookes.ac.uk", "the ‘Mail’ window". Null when the frame
 * shows no text.
 */
export function frameSubject(frame: FrameText): string | null {
  if (FRAMES_WITH_URL.includes(frame.kind)) {
    const site = siteOf(frame.url);
    return site ? `a page at ${site}` : null;
  }
  const title = frame.title.trim();
  if (FRAMES_WITH_TITLE.includes(frame.kind) && title)
    return `the ‘${title}’ window`;
  return null;
}

const capitalised = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The first sentence, on what the screenshot is: from its frame's text and
 * the title found in it. "A page at moodle.ac.uk, titled ‘Week 1’."
 */
function opening(frame: FrameText | null, title: string | null): string {
  const subject = frame && frameSubject(frame);
  // A window title that says the same as the screenshot's title, once.
  const same =
    title &&
    frame &&
    title.slice(1, -1).toLowerCase() === frame.title.trim().toLowerCase();
  if (subject && title && !same)
    return `${capitalised(subject)}, titled ${title}.`;
  if (subject) return `${capitalised(subject)}.`;
  return title ? `A screen titled ${title}.` : "";
}

/** The user's answer to "What should people notice?", as a sentence. */
function purposeSentence(purpose: string): string {
  const text = purpose.trim().replace(/\s+/g, " ");
  if (!text) return "";
  const sentence = capitalised(text);
  return /[.!?…]$/.test(sentence) ? sentence : `${sentence}.`;
}

/** ", of a page at moodle.ac.uk,": what a second screenshot's frame says it is. */
function secondSubject(shot: ScreenshotAnnotation): string {
  const subject = frameSubject({
    kind: shot.frame,
    title: shot.title,
    url: shot.url,
  });
  return subject ? `, of ${subject},` : "";
}

/** "a phone": the device a frame shows the screenshot on. */
const DEVICE_NAMES: Record<DeviceKind, string> = {
  phone: "a phone",
  tablet: "a tablet",
  laptop: "a laptop",
};

/**
 * What the suggestion is written from besides the annotations: the frame
 * around the screenshot, and the user's answer to "What should people
 * notice?".
 */
export type AltContext = { frame?: FrameText | null; purpose?: string };

/**
 * The suggested alt text. It opens with what the screenshot is (the page or
 * window its frame names, and the title found in it), then what people
 * should notice, as the user put it. Then the steps, in number order, and
 * the other annotations from the top down, each naming the text it marks and
 * the list or bar that text is in. A device frame comes first ("On a
 * phone: …"), as that is often why it was chosen. `lines` is the
 * screenshot's text, or empty when it couldn't be read. Text that can't be
 * seen (under blur boxes, solid shapes and second screenshots) is never
 * quoted.
 */
export function describeAnnotations(
  annotations: readonly Annotation[],
  aspect: number,
  lines: readonly FoundLine[],
  { frame = null, purpose = "" }: AltContext = {},
): string {
  const device = frame && isDeviceKind(frame.kind) ? frame.kind : null;
  // Private text stays private.
  const hiding = annotations.filter(hidesText);
  const visible = toPhrases(
    lines.map((line) => ({
      ...line,
      words: line.words.filter(
        (word) => !hiding.some((cover) => inside(centreOf(word.box), cover)),
      ),
    })),
  );
  const groups = layoutGroups(visible, aspect);
  for (const phrase of visible) phrase.group = groups.get(phrase);

  const steps = annotations
    .filter((annotation) => annotation.kind === "step")
    .sort((a, b) => a.number - b.number)
    .map((step) => {
      const near = Math.max(NEAR, 2.5 * STEP_RADIUS * step.size);
      const found = wordsNear(step, visible, near);
      const text = quote(found.words);
      return text
        ? `Step ${step.number} marks ${text}${inGroup(found.group)}.`
        : `Step ${step.number} is ${wherePhrase(step, aspect)}.`;
    });

  const others = annotations
    .filter((annotation) => annotation.kind !== "step")
    .map((annotation) => ({
      at: annotation.y,
      text:
        annotation.kind === "shape"
          ? describeShape(annotation, visible, aspect)
          : annotation.kind === "screenshot"
            ? `A second screenshot${secondSubject(annotation)} is shown ${wherePhrase(
                {
                  x: annotation.x + annotation.width / 2,
                  y: annotation.y + annotation.height / 2,
                },
                aspect,
              )}.`
            : describeArrow(annotation, visible, aspect),
    }))
    .sort((a, b) => a.at - b.at)
    .map((sentence) => sentence.text);

  // Several blur boxes read as one sentence.
  const blurred = others.filter((text) => text.endsWith("is blurred."));
  const rest = others.filter((text) => !text.endsWith("is blurred."));
  if (blurred.length > 1) rest.push(`${blurred.length} areas are blurred.`);
  else rest.push(...blurred);

  // What the screenshot is and why, then what's marked in it.
  const text = [
    opening(device ? null : frame, titleOf(visible)),
    purposeSentence(purpose),
    ...steps,
    ...rest,
  ]
    .filter(Boolean)
    .join(" ");
  if (!device) return text;
  const on = DEVICE_NAMES[device];
  if (!text) return `Shown on ${on}.`;
  // The first sentence carries on after the colon.
  return `On ${on}: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}
