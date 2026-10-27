"use client";

import { Check, Copy, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { isAltCurrent } from "@/lib/alt/basis";
import { describeAnnotations, type FoundLine } from "@/lib/alt/describe";
import { readText } from "@/lib/alt/ocr";
import { imageAspect } from "@/lib/design/annotations";
import { MAX_ALT_PURPOSE, MAX_ALT_TEXT } from "@/lib/design/limits";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";

/** Said under the alt text whatever its state: the suggestion is a start. */
const GUIDELINES =
  "Always follow digital accessibility guidelines for alt text.";

type Reading =
  | { state: "reading" }
  | { state: "done"; lines: FoundLine[] }
  | { state: "failed" };

/** How long "Copied" or "Couldn't copy" shows on the button. */
const COPY_FEEDBACK_MS = 1500;

/**
 * A suggested alt text for the export, from the screenshot's title and what
 * the annotations mark: the screenshot's text is read on this
 * machine to name it. Editable, with a copy button. What the user writes is
 * kept in the design, so it's saved with it, and flagged when the annotations
 * change after it was written.
 */
export function AltTextSection() {
  const image = useEditorStore(selectActiveImage);
  const design = useEditorStore((state) => state.design);
  const setAltText = useEditorStore((state) => state.setAltText);
  const setAltPurpose = useEditorStore((state) => state.setAltPurpose);
  const [reading, setReading] = useState<Reading & { id?: string }>({
    state: "reading",
  });
  // Goes up with each "Try again", to read the screenshot afresh.
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const fieldId = useId();
  const noteId = useId();
  const purposeId = useId();

  // Read the screenshot's text once per screenshot (the reader keeps it), and
  // again after a failed read when asked.
  useEffect(() => {
    if (!image) return;
    let current = true;
    readText(image).then(
      (lines) => current && setReading({ state: "done", lines, id: image.id }),
      () => current && setReading({ state: "failed", id: image.id }),
    );
    return () => {
      current = false;
    };
  }, [image, attempt]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!image) return null;
  const { annotations, altText: written, altPurpose } = design;
  const lines =
    reading.id === image.id && reading.state === "done" ? reading.lines : [];
  const stillReading = reading.id !== image.id || reading.state === "reading";
  const failed = !stillReading && reading.state === "failed";
  const suggestion = describeAnnotations(
    annotations,
    imageAspect(image),
    lines,
    { frame: design.layers[0].frame, purpose: altPurpose },
  );
  const text = written?.text ?? suggestion;
  const stale = written !== null && !isAltCurrent(design, written.basis);
  const marked = annotations.length > 0;

  const note = stale
    ? "The annotations or frame have changed since you wrote this. Check it still fits."
    : written
      ? "Your own wording."
      : stillReading
        ? "Reading the screenshot’s text…"
        : failed
          ? marked
            ? "The screenshot’s text couldn’t be read, so this says where things are."
            : "The screenshot’s text couldn’t be read. Add steps, boxes or arrows for a suggestion, or write your own."
          : !marked
            ? suggestion
              ? "Suggested from the screenshot’s text and frame. Add steps, boxes or arrows for a fuller suggestion, or write your own."
              : "Add steps, boxes or arrows for a suggestion, or write your own."
            : "Suggested from your annotations. Check it says what matters, and edit it.";

  return (
    <div className="space-y-2 border-t pt-4">
      {/* Only the user knows why the screenshot is there: one question for it.
          It shapes the suggestion, so it's set aside while they write their own. */}
      {!written && (
        <>
          <label htmlFor={purposeId} className="block text-sm font-medium">
            What should people notice?{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <input
            id={purposeId}
            type="text"
            value={altPurpose}
            maxLength={MAX_ALT_PURPOSE}
            spellCheck
            placeholder="For example: the Submit button is at the bottom."
            onChange={(event) => setAltPurpose(event.target.value)}
            className="block w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
        </>
      )}
      <label htmlFor={fieldId} className="block text-sm font-medium">
        Alt text
      </label>
      <textarea
        id={fieldId}
        value={text}
        rows={4}
        maxLength={MAX_ALT_TEXT}
        spellCheck
        aria-describedby={noteId}
        placeholder="Describe what the image shows."
        onChange={(event) => setAltText(event.target.value)}
        className="block w-full resize-y rounded-md border border-input bg-background/70 px-3 py-2 text-sm leading-snug outline-none placeholder:text-muted-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
      <p id={noteId} className="text-xs text-muted-foreground" role="status">
        {note} {GUIDELINES}
      </p>
      {(stale || (failed && !written)) && (
        <div className="flex flex-wrap gap-2">
          {stale && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="rounded-md"
                onClick={() => setAltText(null)}
              >
                Use the new suggestion
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-md"
                onClick={() => setAltText(written.text)}
              >
                Keep mine
              </Button>
            </>
          )}
          {failed && !written && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-md"
              onClick={() => {
                setReading({ state: "reading", id: image.id });
                setAttempt((count) => count + 1);
              }}
            >
              <RefreshCw aria-hidden />
              Read the text again
            </Button>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 rounded-md"
          disabled={!text.trim()}
          onClick={() => {
            const clipboard = navigator.clipboard;
            if (!clipboard) {
              setCopied("failed");
              return;
            }
            void clipboard.writeText(text).then(
              () => setCopied("copied"),
              () => setCopied("failed"),
            );
          }}
        >
          {copied === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied === "copied"
            ? "Copied"
            : copied === "failed"
              ? "Couldn’t copy. Select the text instead."
              : "Copy alt text"}
        </Button>
        {written && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-md"
            data-tip="Back to the suggestion"
            aria-label="Back to the suggestion"
            onClick={() => setAltText(null)}
          >
            <RotateCcw aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
