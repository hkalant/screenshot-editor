"use client";

import {
  ClipboardPaste,
  FolderOpen,
  ImageDown,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  loading: boolean;
  /** The last design is being read from storage. */
  restoring?: boolean;
  onUpload: () => void;
  onSample: () => void;
};

const OPTIONS: { icon: LucideIcon; text: ReactNode }[] = [
  {
    icon: ImageDown,
    text: "Drag and drop screenshots directly into the editor.",
  },
  {
    icon: FolderOpen,
    text: "Click to choose and import your screenshot from the file browser.",
  },
  {
    icon: ClipboardPaste,
    text: (
      <>
        Paste a screenshot from your clipboard here with{" "}
        <span className="whitespace-nowrap">
          Ctrl/
          <abbr title="Cmd" aria-label="Cmd" className="no-underline">
            ⌘
          </abbr>{" "}
          + V.
        </span>
      </>
    ),
  },
];

export function EmptyState({ loading, restoring, onUpload, onSample }: Props) {
  const busy = loading || restoring;

  return (
    <div
      className="flex min-h-full flex-col gap-3 p-4 sm:p-6"
      data-testid="empty-state"
    >
      {/* The whole workspace is the drop zone; a click opens the file picker. */}
      <button
        type="button"
        onClick={onUpload}
        disabled={busy}
        className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dotted border-muted-foreground/40 bg-transparent px-6 py-10 text-center transition-colors outline-none hover:border-muted-foreground/70 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress"
      >
        {busy && (
          <LoaderCircle
            className="size-6 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
        <span className="text-xl font-semibold text-balance sm:text-2xl">
          {restoring
            ? "Restoring your last design…"
            : loading
              ? "Loading image…"
              : "Welcome to Screenshot Editor"}
        </span>
        {!busy && (
          <>
            <span className="text-sm font-medium text-muted-foreground">
              To get started, do any of the following:
            </span>
            {/* Inside the button, so spans rather than a list. */}
            <span className="mt-4 grid max-w-3xl gap-6 sm:grid-cols-3">
              {OPTIONS.map(({ icon: Icon, text }, index) => (
                <span
                  key={index}
                  className="flex flex-col items-center gap-3 text-sm text-balance text-foreground"
                >
                  <Icon
                    className="size-10 text-[#BDBDBD] dark:text-[#D9DBDC]"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span>{text}</span>
                </span>
              ))}
            </span>
          </>
        )}
      </button>
      <Button
        variant="ghost"
        size="sm"
        className="self-center"
        onClick={onSample}
        disabled={busy}
      >
        Try a sample image
      </Button>
    </div>
  );
}
