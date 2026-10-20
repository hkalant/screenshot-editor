"use client";

import { ChevronDown, Download, FileImage, LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  downloadOriginal,
  runExport,
  runExportBoth,
} from "@/lib/export/controller";
import { canEncode, planExport } from "@/lib/export/exportImage";
import {
  EXPORT_FORMATS,
  EXPORT_SCALES,
  FORMAT_INFO,
  sanitizeExportOptions,
  type ExportFormat,
  type ExportOptions,
} from "@/lib/export/options";
import { readJsonPreference, writePreference } from "@/lib/persist/preferences";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";
import { useDesignLayout } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import { LabeledSlider } from "../controls/LabeledSlider";
import { Segmented } from "../controls/Segmented";

const PREFERENCE = "export-options";

/** Remembers the export options in this browser between visits. */
function useRememberedExportOptions() {
  useEffect(() => {
    const saved = readJsonPreference(PREFERENCE);
    if (saved) {
      const options = sanitizeExportOptions(saved);
      if (!canEncode(FORMAT_INFO[options.format].mime)) options.format = "png";
      useEditorStore.getState().setExportOptions(options);
    }
    return useEditorStore.subscribe((state, previous) => {
      if (state.exportOptions !== previous.exportOptions)
        writePreference(PREFERENCE, JSON.stringify(state.exportOptions));
    });
  }, []);
}

export function exportLabel({ format, scale }: ExportOptions): string {
  return `Export ${FORMAT_INFO[format].label} ${scale}×`;
}

const formatOptions = () =>
  EXPORT_FORMATS.map((format) => {
    const supported = canEncode(FORMAT_INFO[format].mime);
    return {
      value: format,
      label: FORMAT_INFO[format].label,
      disabled: !supported,
      title: supported ? undefined : "This browser can't save this format",
    };
  });
const SCALE_OPTIONS = EXPORT_SCALES.map((scale) => ({
  value: String(scale),
  label: `${scale}×`,
}));

function useCanExport() {
  const image = useEditorStore(selectActiveImage);
  const busy = useEditorStore(
    (state) => state.exporting || state.loading || state.restoring,
  );
  return !!image && !busy;
}

/** Format, quality and scale, with the size the export will have. */
function ExportOptionsForm() {
  const options = useEditorStore((state) => state.exportOptions);
  const setExportOptions = useEditorStore((state) => state.setExportOptions);
  const layout = useDesignLayout();
  const plan = layout ? planExport(layout.canvas, options.scale) : null;
  const lossy = options.format !== "png";

  return (
    <div className="space-y-4">
      <Segmented
        label="Format"
        glide
        value={options.format}
        options={formatOptions()}
        onChange={(format: ExportFormat) => setExportOptions({ format })}
      />
      {!canEncode(FORMAT_INFO.webp.mime) && (
        // Safari can't create WebP files; say so rather than leave a
        // greyed-out button with only a hover tooltip.
        <p
          className="-mt-2 text-xs text-muted-foreground"
          data-testid="webp-unavailable"
        >
          WebP isn&apos;t available in this browser. Use PNG or JPEG, or another
          browser.
        </p>
      )}
      {lossy && (
        <LabeledSlider
          label="Quality"
          value={Math.round(options.quality * 100)}
          min={50}
          max={100}
          step={1}
          unit="%"
          onChange={(quality) => setExportOptions({ quality: quality / 100 })}
        />
      )}
      <Segmented
        label="Scale"
        glide
        value={String(options.scale)}
        options={SCALE_OPTIONS}
        onChange={(scale) =>
          setExportOptions({ scale: Number(scale) as ExportOptions["scale"] })
        }
      />
      <p
        className="text-xs text-muted-foreground tabular-nums"
        data-testid="export-size"
      >
        {plan
          ? `${plan.pixels.width} × ${plan.pixels.height} px`
          : "Add a screenshot to export."}
        {plan?.capped &&
          " · reduced to the largest size this browser can export"}
        {options.format === "jpeg" && " · JPEG has no transparency"}
      </p>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WebP",
};

/**
 * The screenshot as it was imported: no background, frame or annotations,
 * so the user can start over without finding (or losing) the original.
 */
function OriginalSection() {
  const image = useEditorStore(selectActiveImage);
  const exporting = useEditorStore((state) => state.exporting);
  const canExport = useCanExport();
  const type = image ? (TYPE_LABELS[image.blob.type] ?? "image") : null;
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Original screenshot</h2>
        <p
          className="text-xs text-muted-foreground tabular-nums"
          data-testid="original-size"
        >
          {image
            ? `The file you imported, unedited · ${image.width} × ${image.height} px ${type}`
            : "Add a screenshot to download its original."}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full rounded-md"
          disabled={!image}
          onClick={downloadOriginal}
        >
          <FileImage aria-hidden />
          Download original
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full rounded-md"
          title="The export and the original, as two files"
          disabled={!canExport || exporting}
          onClick={() => void runExportBoth()}
        >
          <Download aria-hidden />
          Export both
        </Button>
      </div>
    </div>
  );
}

function ExportButton({
  className,
  inBar = false,
}: {
  className?: string;
  /** In the top bar, which shortens the label when narrow. */
  inBar?: boolean;
}) {
  const options = useEditorStore((state) => state.exportOptions);
  const exporting = useEditorStore((state) => state.exporting);
  const canExport = useCanExport();
  return (
    <Button
      size="sm"
      onClick={() => void runExport()}
      // Busy but not disabled while exporting, so the button keeps keyboard
      // focus (runExport ignores clicks until the export is done).
      disabled={!canExport && !exporting}
      aria-disabled={exporting || undefined}
      className={cn("aria-disabled:opacity-50", className)}
    >
      {exporting ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : (
        <Download aria-hidden />
      )}
      <span>
        Export
        {/* In a narrow top bar the format and scale are only read out. */}
        <span className={cn(inBar && "sr-only @min-[33rem]/bar:not-sr-only")}>
          {exportLabel(options).slice("Export".length)}
        </span>
      </span>
    </Button>
  );
}

/**
 * The export button with its options popover. `compact` (the mobile bar) is a
 * single icon that opens the popover, with the export button inside.
 */
export function ExportMenu({ compact = false }: { compact?: boolean }) {
  useRememberedExportOptions();

  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon" aria-label="Export" title="Export">
            <Download aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="space-y-4"
          aria-label="Export options"
        >
          <ExportOptionsForm />
          <ExportButton className="w-full rounded-md" />
          <OriginalSection />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="flex items-center" data-tour="export">
      <ExportButton className="rounded-r-none" inBar />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            aria-label="Export options"
            title="Export options"
            className="rounded-l-none border-l border-primary-foreground/20 px-2"
          >
            <ChevronDown aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="space-y-4"
          aria-label="Export options"
        >
          <ExportOptionsForm />
          <OriginalSection />
        </PopoverContent>
      </Popover>
    </div>
  );
}
