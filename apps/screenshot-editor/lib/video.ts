import { create } from "zustand";

// The video tutorial, on the university's Panopto. The id is permanent: the
// video plays here once it is published.
const PANOPTO = "https://brookes.cloud.panopto.eu/Panopto/Pages";
const VIDEO_ID = "85fe6444-f450-4178-af97-b4e7014550ff";

export const VIDEO_TITLE = "Getting started with Screenshot Editor";

/** The embedded player, as Panopto's embed code gives it. */
export const VIDEO_EMBED_URL = `${PANOPTO}/Embed.aspx?id=${VIDEO_ID}&autoplay=false&offerviewer=true&showtitle=false&showbrand=false&captions=true&interactivity=all`;

/** The same video on Panopto itself, for watching there instead. */
export const VIDEO_VIEWER_URL = `${PANOPTO}/Viewer.aspx?id=${VIDEO_ID}`;

/** Whether the video tutorial's player is open. */
export const useVideoStore = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>()((set) => ({ open: false, setOpen: (open) => set({ open }) }));
