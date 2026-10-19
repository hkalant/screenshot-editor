"use client";

import { Dialog } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type SaveRequest, useSaveDialogStore } from "@/lib/export/saveFile";

/**
 * Asks for a file name before a save or an export, where the browser has no
 * system Save dialog to ask instead. The extension is shown and added for
 * the user.
 */
export function SaveNameDialog() {
  const request = useSaveDialogStore((state) => state.request);
  const answer = useSaveDialogStore((state) => state.answer);

  return (
    <Dialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) answer?.(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="tour-fade fixed inset-0 z-50 bg-black/45" />
        {request && (
          <NameForm
            // A new request starts from its own suggested name.
            key={`${request.title}:${request.stem}`}
            request={request}
            onAnswer={(stem) => answer?.(stem)}
          />
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NameForm({
  request,
  onAnswer,
}: {
  request: SaveRequest;
  onAnswer: (stem: string | null) => void;
}) {
  const [name, setName] = useState(request.stem);

  return (
    <Dialog.Content
      data-testid="save-name-dialog"
      onOpenAutoFocus={(event) => {
        // Focus the name, selected, so typing replaces it.
        event.preventDefault();
        const input = document.getElementById("save-file-name");
        if (input instanceof HTMLInputElement) {
          input.focus();
          input.select();
        }
      }}
      className="tour-pop fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-1/2 rounded-2xl bg-background p-6 text-foreground shadow-2xl outline-none"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onAnswer(name);
        }}
      >
        <Dialog.Title className="text-lg font-semibold">
          {request.title}
        </Dialog.Title>
        <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
          {request.description}
        </Dialog.Description>
        <label
          htmlFor="save-file-name"
          className="mt-5 block text-sm font-medium"
        >
          File name
        </label>
        <div className="mt-1.5 flex h-10 items-center rounded-full border border-input bg-background/70 pr-4 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring focus-within:outline-solid">
          <input
            id="save-file-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="save-file-extension"
            className="h-full min-w-0 flex-1 rounded-full bg-transparent pl-4 text-sm outline-none"
          />
          <span
            id="save-file-extension"
            className="shrink-0 text-sm text-muted-foreground"
          >
            {request.extension}
          </span>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Dialog.Close asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Dialog.Close>
          <Button type="submit">{request.action}</Button>
        </div>
      </form>
    </Dialog.Content>
  );
}
