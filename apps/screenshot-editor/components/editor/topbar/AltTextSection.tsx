"use client";

import { Check, Copy, RotateCcw } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { describeAnnotations, type FoundLine } from "@/lib/alt/describe";
import { readText } from "@/lib/alt/ocr";
import { imageAspect } from "@/lib/design/annotations";
import { isDeviceKind } from "@/lib/design/devices";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";
import { originalImageId } from "@/lib/image/crop";

/** Said under the alt text whatever its state: the suggestion is a start. */
const GUIDELINES =
  "Always follow digital accessibility guidelines for alt text.";

type Reading =
  | { state: "reading" }
  | { state: "done"; lines: FoundLine[] }
  | { state: "failed" };

/**
 * The alt text the user has written over the suggestion, by screenshot, so
 * it's still there when the menu opens again. Not saved: it goes with the
 * exported image, wherever that's used.
 */
const useWrittenAlt = create<{
  byImage: Record<string, string>;
  set: (imageId: string, text: string | null) => void;
}>()((set) => ({
  byImage: {},
  set: (imageId, text) =>
    set(({ byImage }) => {
      const next = { ...byImage };
      if (text === null) delete next[imageId];
      else next[imageId] = text;
      return { byImage: next };
    }),
}));

/**
 * A suggested alt text for the export, from what the annotations mark: the
 * screenshot's text is read on this machine to name it. Editable, with a
 * copy button.
 */
export function AltTextSection() {
  const image = useEditorStore(selectActiveImage);
  const annotations = useEditorStore((state) => state.design.annotations);
  const frameKind = useEditorStore(
    (state) => state.design.layers[0].frame.kind,
  );
  // What's written stays through a crop.
  const writtenFor = image ? originalImageId(image.id) : null;
  const written = useWrittenAlt((state) =>
    writtenFor ? state.byImage[writtenFor] : undefined,
  );
  const setWritten = useWrittenAlt((state) => state.set);
  const [reading, setReading] = useState<Reading & { id?: string }>({
    state: "reading",
  });
  const [copied, setCopied] = useState(false);
  const fieldId = useId();
  const noteId = useId();

  // Read the screenshot's text once per screenshot, when there's something
  // to describe.
  const needsText = annotations.length > 0;
  useEffect(() => {
    if (!image || !needsText) return;
    let current = true;
    readText(image).then(
      (lines) => current && setReading({ state: "done", lines, id: image.id }),
      () => current && setReading({ state: "failed", id: image.id }),
    );
    return () => {
      current = false;
    };
  }, [image, needsText]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!image) return null;
  const lines =
    reading.id === image.id && reading.state === "done" ? reading.lines : [];
  const stillReading =
    needsText && (reading.id !== image.id || reading.state === "reading");
  const suggestion = describeAnnotations(
    annotations,
    imageAspect(image),
    lines,
    isDeviceKind(frameKind) ? frameKind : null,
  );
  const text = written ?? suggestion;

  const note = written
    ? "Your own wording."
    : !needsText
      ? suggestion
        ? "Add steps, boxes or arrows for a fuller suggestion, or write your own."
        : "Add steps, boxes or arrows for a suggestion, or write your own."
      : stillReading
        ? "Reading the screenshot’s text…"
        : reading.state === "failed"
          ? "The screenshot’s text couldn’t be read, so this says where things are."
          : "Suggested from your annotations. Check it says what matters, and edit it.";

  return (
    <div className="space-y-2 border-t pt-4">
      <label htmlFor={fieldId} className="block text-sm font-medium">
        Alt text
      </label>
      <textarea
        id={fieldId}
        value={text}
        rows={4}
        spellCheck
        aria-describedby={noteId}
        placeholder="Describe what the image shows."
        onChange={(event) =>
          setWritten(originalImageId(image.id), event.target.value)
        }
        className="block w-full resize-y rounded-md border border-input bg-background/70 px-3 py-2 text-sm leading-snug outline-none placeholder:text-muted-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
      <p id={noteId} className="text-xs text-muted-foreground" role="status">
        {note} {GUIDELINES}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 rounded-md"
          disabled={!text.trim()}
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(
              () => setCopied(true),
              () => undefined,
            );
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy alt text"}
        </Button>
        {written !== undefined && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-md"
            data-tip="Back to the suggestion"
            aria-label="Back to the suggestion"
            onClick={() => setWritten(originalImageId(image.id), null)}
          >
            <RotateCcw aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
