"use client";

import { Ellipsis } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useVideoStore } from "@/lib/video";
import { ProjectItems } from "./ProjectItems";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const TEXT_TUTORIAL_URL =
  "https://docs.google.com/document/d/10Ti4Hn1kNuVGtStQZHqFbMokCOVisJW8RJdkAg14KAE/edit?usp=sharing";

// Font Awesome Free icons (solid), CC BY 4.0.
function FaIcon({ viewBox, path }: { viewBox: string; path: string }) {
  return (
    <svg viewBox={viewBox} aria-hidden="true" className="size-4 fill-current">
      <path d={path} />
    </svg>
  );
}

const VideoIcon = () => (
  <FaIcon
    viewBox="0 0 576 512"
    path="M0 128C0 92.7 28.7 64 64 64l256 0c35.3 0 64 28.7 64 64l0 256c0 35.3-28.7 64-64 64L64 448c-35.3 0-64-28.7-64-64L0 128zM559.2 101.8c10.4 5.6 16.8 16.4 16.8 28.2l0 252c0 11.8-6.4 22.6-16.8 28.2s-23 5-32.9-1.6l-96-64L416 337.1l0-17.1 0-128 0-17.1 14.2-9.5 96-64c9.8-6.5 22.4-7.2 32.9-1.6z"
  />
);

const BookIcon = () => (
  <FaIcon
    viewBox="0 0 448 512"
    path="M96 0C43 0 0 43 0 96L0 416c0 53 43 96 96 96l288 0 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l0-64c17.7 0 32-14.3 32-32l0-320c0-17.7-14.3-32-32-32L384 0 96 0zm0 384l256 0 0 64L96 448c-17.7 0-32-14.3-32-32s14.3-32 32-32zm32-240c0-8.8 7.2-16 16-16l192 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-192 0c-8.8 0-16-7.2-16-16zm16 48l192 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-192 0c-8.8 0-16-7.2-16-16s7.2-16 16-16z"
  />
);

export const itemClass =
  "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

function TutorialLink({
  href,
  icon,
  children,
  onPick,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  onPick: () => void;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={itemClass}
      onClick={onPick}
    >
      <span className="flex w-5 justify-center text-muted-foreground">
        {icon}
      </span>
      {children}
    </a>
  );
}

/** Links to the video and text tutorials; `onPick` closes the menu around them. */
export function TutorialLinks({ onPick }: { onPick: () => void }) {
  return (
    <nav aria-label="Tutorials" className="flex flex-col gap-0.5">
      {/* The video plays over the editor rather than in a new tab. */}
      <button
        type="button"
        className={itemClass}
        onClick={() => {
          onPick();
          useVideoStore.getState().setOpen(true);
        }}
      >
        <span className="flex w-5 justify-center text-muted-foreground">
          <VideoIcon />
        </span>
        Watch the video tutorial
      </button>
      <TutorialLink
        href={TEXT_TUTORIAL_URL}
        icon={<BookIcon />}
        onPick={onPick}
      >
        Read the text tutorial
      </TutorialLink>
    </nav>
  );
}

/** The phone bar's More button: projects, and links to the video and text tutorials. */
export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="More"
          title="More"
          className="data-[state=open]:bg-accent"
        >
          <Ellipsis aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2.5">
        <ProjectItems onPick={close} shortcuts={null} />
        <div className="my-1 h-px bg-border" aria-hidden />
        <TutorialLinks onPick={close} />
      </PopoverContent>
    </Popover>
  );
}
