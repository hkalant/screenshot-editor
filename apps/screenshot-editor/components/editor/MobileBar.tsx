"use client";

import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";
import { CaptureButton } from "./topbar/CaptureButton";
import { CopyButton } from "./topbar/CopyButton";
import { ExportMenu } from "./topbar/ExportMenu";
import { HelpMenu } from "./topbar/HelpMenu";
import { HistoryButtons } from "./topbar/HistoryButtons";

type Props = { onReplace: () => void };

/** The compact top bar of the mobile layout. */
export function MobileBar({ onReplace }: Props) {
  const image = useEditorStore(selectActiveImage);
  const loading = useEditorStore((state) => state.loading);

  return (
    // The shared top bar buttons are 32px or less; at least 40px suits fingers.
    <header
      data-pane="bar"
      className="relative z-20 flex h-13 shrink-0 items-center gap-1 border-b bg-background px-2 [&_[data-slot=button]]:min-h-10 [&_[data-slot=button]]:min-w-10"
    >
      {/* Shortened before any button is pushed off a narrow screen. */}
      <h1 className="flex h-10 min-w-0 items-center px-2 text-sm font-semibold whitespace-nowrap">
        <span className="truncate">Screenshot Editor</span>
      </h1>
      <HistoryButtons />
      <div className="flex-1" />
      {image && (
        <Button
          variant="outline"
          size="icon"
          onClick={onReplace}
          disabled={loading}
          aria-label="Replace image"
          title="Replace image"
        >
          <ImageUp aria-hidden />
        </Button>
      )}
      <CopyButton compact />
      <CaptureButton compact />
      <ExportMenu compact />
      <HelpMenu />
    </header>
  );
}
