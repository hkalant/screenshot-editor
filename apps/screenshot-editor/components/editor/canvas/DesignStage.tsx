"use client";

import type Konva from "konva";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Layer, Stage } from "react-konva";
import type { DesignLayout } from "@/lib/design/layout";
import { previewPixelRatio } from "@/lib/design/zoom";
import { registerExportStage } from "@/lib/export/controller";
import { useDevicePixelRatio } from "@/lib/hooks/useDevicePixelRatio";
import type { LoadedImage } from "@/lib/image/load";
import {
  selectBackgroundImage,
  selectShot,
  useEditorStore,
} from "@/lib/store/editor";
import { BackgroundNode } from "./nodes/Background";
import { GuidesNode } from "./nodes/Guides";
import { ShotNode } from "./nodes/Shot";
import { ArrowStyleMenu } from "./ArrowStyleMenu";
import { SecondShotCorners } from "./SecondShotCorners";
import { SelectionActions } from "./SelectionActions";
import { ShotHandle } from "./ShotHandle";

type Props = {
  image: LoadedImage;
  layout: DesignLayout;
  /** On-screen zoom. The export ignores it and renders at true size. */
  scale: number;
};

export function DesignStage({ image, layout, scale }: Props) {
  const pixelRatio = useDevicePixelRatio();
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const background = useEditorStore((state) => state.design.background);
  const fx = useEditorStore((state) => state.design.backgroundFx);
  const shot = useEditorStore(selectShot);
  const backgroundImage = useEditorStore(selectBackgroundImage);
  // Whole pixels: Konva rounds bitmap sizes down, which would blur fractional sizes.
  const width = Math.max(1, Math.floor(layout.canvas.width * scale));
  const height = Math.max(1, Math.floor(layout.canvas.height * scale));
  // Zoomed in, a full-sharpness bitmap could pass the browser's canvas limit.
  const bitmapRatio = previewPixelRatio(pixelRatio, { width, height });

  // The Stage remounts when the pixel ratio changes (key below), so register
  // and set up the layer again each time.
  useEffect(() => {
    const stage = stageRef.current;
    const layer = layerRef.current;
    if (!stage || !layer) return;
    // Large screenshots are drawn much smaller than their size in the preview.
    // "high" smoothing keeps them sharp; canvases reset it whenever they resize.
    layer.on("beforeDraw.quality", () => {
      layer.getContext()._context.imageSmoothingQuality = "high";
    });
    layer.batchDraw();
    const unregister = registerExportStage(stage, layer);
    return () => {
      layer.off("beforeDraw.quality");
      unregister();
    };
  }, [pixelRatio]);

  // Before paint, so a resized stage never shows at the wrong sharpness.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || layer.getCanvas().getPixelRatio() === bitmapRatio) return;
    layer.getCanvas().setPixelRatio(bitmapRatio);
    layer.batchDraw();
  }, [pixelRatio, bitmapRatio]);

  return (
    // The move handle and delete button sit beside the image role, which
    // would hide them from screen readers.
    <div className="relative" style={{ width, height }}>
      <div
        role="img"
        aria-label="Design preview"
        data-testid="design-stage"
        data-width={layout.canvas.width}
        data-height={layout.canvas.height}
        className="shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.08)]"
        // A touch moves the shot or an annotation, or draws, instead of
        // panning the page.
        style={{ width, height, touchAction: "none" }}
      >
        <Stage
          key={pixelRatio}
          ref={stageRef}
          width={width}
          height={height}
          scaleX={scale}
          scaleY={scale}
        >
          <Layer ref={layerRef}>
            <BackgroundNode
              canvas={layout.canvas}
              background={background}
              fx={fx}
              screenshot={image}
              backgroundImage={backgroundImage}
            />
            <ShotNode image={image} shot={shot} layout={layout} zoom={scale} />
            <GuidesNode canvas={layout.canvas} zoom={scale} />
          </Layer>
        </Stage>
      </div>
      <ShotHandle
        layout={layout}
        scale={scale}
        stage={stageRef}
        width={width}
        height={height}
      />
      <SecondShotCorners width={width} height={height} />
      <SelectionActions width={width} height={height} />
      <ArrowStyleMenu width={width} height={height} />
    </div>
  );
}
