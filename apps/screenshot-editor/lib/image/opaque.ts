// Whether an image has no see-through pixels. Opaque screenshots can cast
// their shadow from a plain rounded rectangle, which every browser blurs
// reliably; see-through ones need the shadow to follow their alpha.

const SAMPLE = 256;
const known = new WeakMap<CanvasImageSource, boolean>();

export function isOpaque(
  source: HTMLImageElement | HTMLCanvasElement,
  type: string,
): boolean {
  if (type === "image/jpeg") return true;
  const cached = known.get(source);
  if (cached !== undefined) return cached;
  let opaque = false;
  try {
    const width = Math.max(1, Math.min(SAMPLE, source.width));
    const height = Math.max(1, Math.min(SAMPLE, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context) {
      // Scaling down averages alpha, so any see-through area still shows.
      context.drawImage(source, 0, 0, width, height);
      const { data } = context.getImageData(0, 0, width, height);
      opaque = true;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          opaque = false;
          break;
        }
      }
    }
  } catch {
    // Unreadable: keep the shadow that follows the alpha.
  }
  known.set(source, opaque);
  return opaque;
}
