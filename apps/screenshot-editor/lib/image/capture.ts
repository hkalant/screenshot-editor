/** Whether this browser can capture the screen (desktop browsers; not phones). */
export function canCaptureScreen(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function"
  );
}

/** Thrown when the person closes the browser's picker without sharing. */
export class CaptureCancelled extends Error {
  constructor() {
    super("Screen capture cancelled");
    this.name = "CaptureCancelled";
  }
}

// How long to wait for the first frame before giving up.
const FRAME_TIMEOUT_MS = 5000;

// Chrome's CaptureController and ImageCapture.grabFrame(), which TypeScript's
// DOM types don't have yet.
type FocusController = {
  setFocusBehavior: (
    behavior: "focus-captured-surface" | "no-focus-change",
  ) => void;
};
type FrameGrabber = { grabFrame: () => Promise<ImageBitmap> };

function createController(): FocusController | undefined {
  const Controller = (
    window as unknown as { CaptureController?: new () => FocusController }
  ).CaptureController;
  return Controller ? new Controller() : undefined;
}

/**
 * Opens the browser's tab, window or screen picker and takes one still frame
 * of what is picked. The stream stops as soon as the frame is taken, so
 * nothing is recorded. Must be called from a click.
 */
export async function captureScreenFrame(): Promise<File> {
  const controller = createController();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
      controller,
      // Offer this tab too, and no switching or audio controls: it's one frame.
      selfBrowserSurface: "include",
      surfaceSwitching: "exclude",
      systemAudio: "exclude",
    } as DisplayMediaStreamOptions);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError")
      throw new CaptureCancelled();
    throw error;
  }
  // Chrome brings a shared tab or window to the front, which puts the editor
  // in the background. Stay here instead: the screenshot opens in the editor.
  // Only allowed straight after the picker closes, and only for a tab or a
  // window, so a refusal is fine.
  try {
    controller?.setFocusBehavior("no-focus-change");
  } catch {
    // A whole screen, or an older browser.
  }

  try {
    const canvas = await grabFrame(stream);
    // Stop before encoding, so the browser's "sharing" bar goes at once.
    stopStream(stream);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("Couldn't encode the screen capture");
    // A generic name, as for a paste, so the export gets a dated one.
    return new File([blob], "image.png", { type: "image/png" });
  } finally {
    stopStream(stream);
  }
}

/**
 * The stream's current frame, on a canvas. Works while this tab is in the
 * background, where frame callbacks don't run: ImageCapture where there is
 * one (Chrome), else a video element's first decoded frame.
 */
async function grabFrame(stream: MediaStream): Promise<HTMLCanvasElement> {
  const [track] = stream.getVideoTracks();
  if (!track) throw new Error("No video in the screen capture");
  const Capture = (
    window as unknown as {
      ImageCapture?: new (track: MediaStreamTrack) => FrameGrabber;
    }
  ).ImageCapture;
  if (Capture) {
    try {
      const bitmap = await new Capture(track).grabFrame();
      try {
        return toCanvas(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall back to the video element below.
    }
  }
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    const frame = waitForData(video);
    await video.play();
    await frame;
    return toCanvas(video, video.videoWidth, video.videoHeight);
  } finally {
    video.srcObject = null;
  }
}

/** Resolves once the video has a frame to draw. Media events still fire in a background tab. */
function waitForData(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("No frame from the screen capture")),
      FRAME_TIMEOUT_MS,
    );
    video.addEventListener(
      "loadeddata",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function toCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  if (!width || !height) throw new Error("Empty screen capture");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(source, 0, 0);
  return canvas;
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}
