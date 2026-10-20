"use client";

import { useSyncExternalStore } from "react";
import { currentPlatform, isApplePlatform } from "@/lib/platform";
import { shortcutGroups } from "@/lib/shortcutList";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

// Font Awesome Free "keyboard" (solid), CC BY 4.0.
export const KeyboardIcon = () => (
  <svg viewBox="0 0 576 512" aria-hidden="true" className="size-4 fill-current">
    <path d="M64 64C28.7 64 0 92.7 0 128L0 384c0 35.3 28.7 64 64 64l448 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64L64 64zm16 64l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zM64 240c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zm16 80l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80-176c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zm16 80l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zM160 336c0-8.8 7.2-16 16-16l224 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-224 0c-8.8 0-16-7.2-16-16l0-32zM272 128l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zM256 240c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM368 128l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zM352 240c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM464 128l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zM448 240c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zm16 80l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16z" />
  </svg>
);

// Most fonts draw the Mac modifier symbols, ⇧ above all, smaller than
// letters, so they are set a size up.
const SYMBOL = /([⇧⌘⌥⌃])/;
const SYMBOL_CLASS = "text-sm leading-none";

/** A shortcut at the end of a menu item, such as ⇧⌘S. */
export function MenuShortcut({ keys }: { keys: string }) {
  return (
    <kbd className="ml-auto flex items-center gap-px font-sans text-xs whitespace-nowrap text-muted-foreground">
      {keys
        .split(SYMBOL)
        .filter(Boolean)
        .map((part, index) => (
          <span key={index} className={cn(SYMBOL.test(part) && SYMBOL_CLASS)}>
            {part}
          </span>
        ))}
    </kbd>
  );
}

/** Every keyboard shortcut, in groups; shown from the top bar's menu. */
export function ShortcutList() {
  const apple = useSyncExternalStore(
    subscribe,
    () => isApplePlatform(currentPlatform()),
    () => false,
  );
  return (
    <div className="flex flex-col gap-3">
      {shortcutGroups(apple).map((group) => (
        <section key={group.title}>
          <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.title}
          </h3>
          <dl className="flex flex-col gap-1">
            {group.items.map((item) => (
              <div
                key={item.action}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <dt>{item.action}</dt>
                <dd className="flex shrink-0 gap-1">
                  {item.keys.map((key) => (
                    <kbd
                      key={key}
                      className={cn(
                        "min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-sans text-xs",
                        SYMBOL.test(key) && SYMBOL_CLASS,
                      )}
                    >
                      {key}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
