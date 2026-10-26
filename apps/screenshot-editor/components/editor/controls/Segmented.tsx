import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Props<T extends string> = {
  label: string;
  value: T;
  options: readonly {
    value: T;
    label: string;
    disabled?: boolean;
    title?: string;
  }[];
  onChange: (value: T) => void;
  /** Hide the visible label when a section heading already names the group. */
  hideLabel?: boolean;
  /** The highlight glides to the option under the mouse. */
  glide?: boolean;
};

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  glide = false,
}: Props<T>) {
  return (
    <div className="space-y-2.5">
      {!hideLabel && <div className="text-sm font-medium">{label}</div>}
      <ToggleGroup
        type="single"
        glide={glide}
        aria-label={label}
        value={value}
        // Radix reports "" when the active option is clicked again; keep the current one.
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            data-tip={option.title}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
