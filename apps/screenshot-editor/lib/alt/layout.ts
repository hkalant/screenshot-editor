import type { Box } from "@/lib/design/annotations";
import type { FoundWord } from "./describe";

// Where text sits in the screenshot's layout, read from the OCR boxes alone:
// a column of short phrases is a list (a menu, a set of links), and a row of
// short phrases along the top is a bar. Annotations that mark text in one say
// so: "Step 1 marks ‘Assessment’ in the list on the left."

/** A run of words close together on a line, as describe.ts splits them. */
export type LaidPhrase = { words: FoundWord[]; box: Box };

/** At least this many phrases make a list or a bar. */
const MIN_ITEMS = 4;
/** List items have at most this many words; longer phrases are prose. */
const MAX_ITEM_WORDS = 5;
/** Bar items have at most this many words. */
const MAX_BAR_WORDS = 3;
/** Left edges this many text heights apart still line up. */
const ALIGN = 0.6;
/** A gap of this many text heights between items ends a list. */
const MAX_GAP = 4;
/** A bar sits within this share of the screenshot's height from the top. */
const TOP_BAR = 0.25;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** "in the list on the left", by where the list's middle is. */
function listName(box: Box) {
  const middle = box.x + box.width / 2;
  return middle < 1 / 3
    ? "in the list on the left"
    : middle > 2 / 3
      ? "in the list on the right"
      : "in the list in the middle";
}

/** Columns of short phrases with their left edges lined up. */
function findLists(phrases: LaidPhrase[]): LaidPhrase[][] {
  const items = phrases
    .filter((phrase) => phrase.words.length <= MAX_ITEM_WORDS)
    .sort((a, b) => a.box.x - b.box.x);
  const lists: LaidPhrase[][] = [];
  const used = new Set<LaidPhrase>();
  for (const first of items) {
    if (used.has(first)) continue;
    const height = first.box.height;
    const column = items
      .filter(
        (phrase) =>
          !used.has(phrase) &&
          Math.abs(phrase.box.x - first.box.x) <= ALIGN * height,
      )
      .sort((a, b) => a.box.y - b.box.y);
    // Split the column where the items are too far apart to be one list.
    let run: LaidPhrase[] = [];
    const flush = () => {
      if (run.length >= MIN_ITEMS) {
        lists.push(run);
        for (const phrase of run) used.add(phrase);
      }
      run = [];
    };
    for (const phrase of column) {
      const previous = run.at(-1);
      if (previous) {
        const gap = phrase.box.y - (previous.box.y + previous.box.height);
        const size = median(run.map((item) => item.box.height));
        if (gap > MAX_GAP * size) flush();
      }
      run.push(phrase);
    }
    flush();
  }
  return lists;
}

/** Rows of short phrases near the top: a navigation bar or tabs. */
function findTopBars(phrases: LaidPhrase[], aspect: number): LaidPhrase[][] {
  const items = phrases.filter(
    (phrase) =>
      phrase.words.length <= MAX_BAR_WORDS &&
      phrase.box.y + phrase.box.height / 2 < aspect * TOP_BAR,
  );
  const bars: LaidPhrase[][] = [];
  const used = new Set<LaidPhrase>();
  for (const first of items) {
    if (used.has(first)) continue;
    const middle = first.box.y + first.box.height / 2;
    const row = items.filter(
      (phrase) =>
        !used.has(phrase) &&
        Math.abs(phrase.box.y + phrase.box.height / 2 - middle) <=
          first.box.height / 2,
    );
    if (row.length >= MIN_ITEMS - 1) {
      bars.push(row);
      for (const phrase of row) used.add(phrase);
    }
  }
  return bars;
}

/**
 * Where each phrase sits, for those in a list or a top bar: "in the list on
 * the left", "in the top bar". A phrase in both counts as in the bar.
 */
export function layoutGroups(
  phrases: LaidPhrase[],
  aspect: number,
): Map<LaidPhrase, string> {
  const groups = new Map<LaidPhrase, string>();
  for (const list of findLists(phrases)) {
    const box = {
      x: Math.min(...list.map((phrase) => phrase.box.x)),
      y: 0,
      width:
        Math.max(...list.map((phrase) => phrase.box.x + phrase.box.width)) -
        Math.min(...list.map((phrase) => phrase.box.x)),
      height: 0,
    };
    const name = listName(box);
    for (const phrase of list) groups.set(phrase, name);
  }
  for (const bar of findTopBars(phrases, aspect))
    for (const phrase of bar) groups.set(phrase, "in the top bar");
  return groups;
}
