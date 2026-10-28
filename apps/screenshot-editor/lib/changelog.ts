import { create } from "zustand";

/** One release in the changelog: a bold heading, a line about it and its changes. */
export type ChangelogEntry = {
  title: string;
  /** As shown, such as "2 November 2026". */
  date: string;
  summary?: string;
  changes: string[];
};

/**
 * What has changed, newest first. To add a release, put a new entry at the
 * top of the list.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    title: "Initial Release",
    date: "2 November 2026",
    summary: "Screenshot Editor launches with a plethora of new features:",
    changes: [
      "Capture a screenshot of a tab, window or the whole screen without leaving the editor",
      "Oxford Brookes-branded backgrounds (gradient/solid)",
      "Upload your own background",
      "Various canvas sizes",
      "Windows and device frames that adapt to your screenshot",
      "Padding, border and shadow options",
      "Annotation tools: select, steps, shapes, arrows, blur, magnifier, highlighter, crop.",
      "Add a second screenshot (via upload or capture)",
      "Export options: 1x (normal) and 2x (sharp)",
      "Export file formats: JPEG, PNG, WEBP",
      "Suggested alt text and ability to copy to clipboard",
      "Export both the edited and original screenshot (without annotations)",
      "Copy the final image to clipboard",
      "Save project to continue later",
      "Replace a screenshot",
      "Keyboard shortcuts menu",
      "Tutorials in video and text format",
      "Available in light and dark interface",
    ],
  },
];

/** Whether the changelog is open. */
export const useChangelogStore = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>()((set) => ({ open: false, setOpen: (open) => set({ open }) }));
