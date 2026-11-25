import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { BackgroundKind } from "@/lib/design/schema";

/** What the picker offers. Gradients and uploaded images are both "image". */
export type BackgroundChoice = "image" | "solid" | "none";

const CHOICES: readonly {
  value: BackgroundChoice;
  label: string;
}[] = [
  { value: "image", label: "Image" },
  { value: "solid", label: "Solid" },
  { value: "none", label: "None" },
];

/** Null for kinds the picker no longer offers, such as "fromImage" in older designs. */
export function backgroundChoice(
  kind: BackgroundKind,
): BackgroundChoice | null {
  switch (kind) {
    case "linear":
    case "radial":
    case "image":
      return "image";
    case "transparent":
      return "none";
    case "solid":
      return "solid";
    default:
      return null;
  }
}

type Props = {
  value: BackgroundChoice | null;
  onChange: (choice: BackgroundChoice) => void;
};

export function BackgroundKindPicker({ value, onChange }: Props) {
  return (
    <ToggleGroup
      type="single"
      glide
      aria-label="Background type"
      value={value ?? ""}
      // Radix reports "" when the active option is clicked again; keep the current one.
      onValueChange={(next) => {
        const choice = CHOICES.find((option) => option.value === next);
        if (choice) onChange(choice.value);
      }}
      className="grid grid-cols-3 gap-0.5 rounded-md bg-muted/80 p-0.5"
    >
      {CHOICES.map(({ value: option, label }) => (
        <ToggleGroupItem
          key={option}
          value={option}
          className="h-9 px-3 text-sm"
        >
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
