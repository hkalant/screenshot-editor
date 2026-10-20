import { create } from "zustand";
import { readJsonPreference, writePreference } from "@/lib/persist/preferences";

// Which sections of the desktop sidebar are open. Any number can be open at
// once; this browser remembers them between visits.

export const SIDEBAR_SECTIONS = [
  "background",
  "frame",
  "shadow",
  "border",
] as const;

export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];

const PREFERENCE = "sidebar-open";
const DEFAULT_OPEN: SidebarSection[] = ["background"];

/** The saved sections, in sidebar order, or the default when none are saved. */
export function savedOpenSections(saved: unknown): SidebarSection[] {
  if (!Array.isArray(saved)) return DEFAULT_OPEN;
  return SIDEBAR_SECTIONS.filter((section) => saved.includes(section));
}

type SidebarState = {
  open: SidebarSection[];
  setOpen: (open: SidebarSection[]) => void;
  /** Opens a section, leaving the others as they are. */
  reveal: (section: SidebarSection) => void;
  /** Reads the saved sections; call once the page is in the browser. */
  load: () => void;
};

export const useSidebarStore = create<SidebarState>()((set, get) => ({
  open: DEFAULT_OPEN,
  setOpen: (open) => {
    set({ open: SIDEBAR_SECTIONS.filter((section) => open.includes(section)) });
    writePreference(PREFERENCE, JSON.stringify(get().open));
  },
  reveal: (section) => {
    if (!get().open.includes(section)) get().setOpen([...get().open, section]);
  },
  load: () => set({ open: savedOpenSections(readJsonPreference(PREFERENCE)) }),
}));
