"use client";

import { ExternalLink, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import {
  useVideoStore,
  VIDEO_EMBED_URL,
  VIDEO_TITLE,
  VIDEO_VIEWER_URL,
} from "@/lib/video";

/**
 * The video tutorial, played over the editor so staff can pause it, try a
 * step and carry on. Panopto's own player keeps its captions, speed and full
 * screen; the video can also be opened on Panopto.
 */
export function VideoDialog() {
  const open = useVideoStore((state) => state.open);
  const setOpen = useVideoStore((state) => state.setOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="tour-fade fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          data-testid="video-dialog"
          aria-describedby={undefined}
          className="tour-pop fixed top-1/2 left-1/2 z-50 w-[min(960px,calc(100vw-2rem))] -translate-1/2 overflow-hidden rounded-xl bg-background text-foreground shadow-2xl outline-none"
        >
          <div className="flex items-center gap-2 px-5 py-3">
            <Dialog.Title className="flex-1 text-base font-semibold">
              {VIDEO_TITLE}
            </Dialog.Title>
            <Button variant="ghost" size="sm" asChild>
              <a
                href={VIDEO_VIEWER_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink aria-hidden />
                Open in Panopto
              </a>
            </Button>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close video"
                title="Close video"
              >
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <div className="relative aspect-video bg-black">
            <iframe
              src={VIDEO_EMBED_URL}
              title={VIDEO_TITLE}
              className="absolute inset-0 size-full border-0"
              allow="autoplay; fullscreen"
              allowFullScreen
              aria-label="Panopto Embedded Video Player"
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
