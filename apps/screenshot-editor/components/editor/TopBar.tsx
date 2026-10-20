"use client";

import { X } from "lucide-react";
import { BrookesLogo } from "./BrookesLogo";
import { CopyButton } from "./topbar/CopyButton";
import { ExportMenu } from "./topbar/ExportMenu";
import { HistoryButtons } from "./topbar/HistoryButtons";
import { MainMenu } from "./topbar/MainMenu";
import { SizeMenu } from "./topbar/SizeMenu";

type Props = { onReplace: () => void };

/** The desktop top bar: the menu and the name on the left; the canvas size and history in
    the middle (centred where the bar has room); then secondary actions as
    icons, and Export, the main action, last. What it shows follows the bar's
    own width, which the sidebar beside it takes from the window's. */
export function TopBar({ onReplace }: Props) {
  return (
    <header
      data-pane="bar"
      className="@container/bar relative z-20 flex h-14 shrink-0 items-center gap-2 rounded-xl pane px-3"
    >
      <MainMenu onReplace={onReplace} />
      <h1 className="flex shrink-0 items-center gap-3 font-semibold whitespace-nowrap">
        {/* The logo only where the bar has room for it. */}
        <BrookesLogo className="hidden h-8 w-auto text-(--obu-charcoal) @min-[59rem]/bar:block dark:text-foreground" />
        {/* A partnership mark: the university × the app. */}
        <X
          className="hidden size-4 text-muted-foreground @min-[59rem]/bar:block"
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="sr-only @min-[46rem]/bar:not-sr-only">
          Screenshot Editor
        </span>
      </h1>
      <div
        className="mx-1 hidden h-6 w-px bg-border @min-[46rem]/bar:block @min-[72rem]/bar:hidden"
        aria-hidden
      />
      <div className="flex items-center gap-2 @min-[72rem]/bar:absolute @min-[72rem]/bar:left-1/2 @min-[72rem]/bar:-translate-x-1/2">
        <SizeMenu />
        <HistoryButtons />
      </div>
      <div className="flex-1" />
      <CopyButton />
      <div
        className="mx-1 h-6 w-px bg-border @max-[33rem]/bar:hidden"
        aria-hidden
      />
      <ExportMenu />
    </header>
  );
}
