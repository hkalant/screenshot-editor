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

/** Resolves once the video shows a real frame (Chrome's first can be blank). */
function waitForFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("No frame from the screen capture")),
      FRAME_TIMEOUT_MS,
    );
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    // Safari before 15.4 has no requestVideoFrameCallback.
    if (typeof video.requestVideoFrameCallback === "function")
      video.requestVideoFrameCallback(() => done());
    else video.addEventListener("loadeddata", done, { once: true });
  });
}

/**
 * Opens the browser's tab, window or screen picker and takes one still frame
 * of what is picked. The stream stops as soon as the frame is taken, so
 * nothing is recorded. Must be called from a click.
 */
export async function captureScreenFrame(): Promise<File> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
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

  const video = document.createElement("video");
  try {
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const frame = waitForFrame(video);
    await video.play();
    await frame;
    const { videoWidth: width, videoHeight: height } = video;
    if (!width || !height) throw new Error("Empty screen capture");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    // Stop before encoding, so the browser's "sharing" bar goes at once.
    stopStream(stream, video);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("Couldn't encode the screen capture");
    // A generic name, as for a paste, so the export gets a dated one.
    return new File([blob], "image.png", { type: "image/png" });
  } finally {
    stopStream(stream, video);
  }
}

function stopStream(stream: MediaStream, video: HTMLVideoElement) {
  for (const track of stream.getTracks()) track.stop();
  video.srcObject = null;
}
