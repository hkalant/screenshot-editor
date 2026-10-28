"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { CHANGELOG, useChangelogStore } from "@/lib/changelog";

/** The changelog, newest release first, over the editor. */
export function ChangelogDialog() {
  const open = useChangelogStore((state) => state.open);
  const setOpen = useChangelogStore((state) => state.setOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="tour-fade fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          data-testid="changelog-dialog"
          aria-describedby={undefined}
          className="tour-pop fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] -translate-1/2 flex-col rounded-xl bg-background text-foreground shadow-2xl outline-none"
        >
          <div className="flex items-center gap-2 py-3 pr-3 pl-6">
            <Dialog.Title className="flex-1 text-lg font-semibold">
              Changelog
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close changelog"
                data-tip="Close changelog"
              >
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-6 pb-6">
            {CHANGELOG.map((entry) => (
              <section
                key={`${entry.title} ${entry.date}`}
                className="not-first:mt-6 not-first:border-t not-first:pt-6"
              >
                <h3 className="text-sm font-bold">
                  {entry.title} - {entry.date}
                </h3>
                {entry.summary && (
                  <p className="mt-3 text-sm">{entry.summary}</p>
                )}
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                  {entry.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
