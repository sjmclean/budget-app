import {
  serialisePayeeIconReference,
  type PayeeEmbeddedIconFormat,
} from "./payeeIconReference.js";

export const PAYEE_ICON_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const PAYEE_ICON_MAX_DIMENSION = 256;
export const PAYEE_ICON_ACCEPT = "image/jpeg,image/png,image/webp,image/svg+xml";

const supportedInputTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
]);

export interface PayeeIconUploadCandidate {
  readonly size: number;
  readonly type: string;
}

export function validatePayeeIconUploadCandidate(
  candidate: PayeeIconUploadCandidate,
): void {
  if (!supportedInputTypes.has(candidate.type.toLowerCase())) {
    throw new TypeError("Choose a JPEG, PNG, WebP or SVG image.");
  }
  if (!Number.isFinite(candidate.size) || candidate.size <= 0) {
    throw new TypeError("The selected image is empty or invalid.");
  }
  if (candidate.size > PAYEE_ICON_UPLOAD_MAX_BYTES) {
    throw new TypeError("Choose an image smaller than 5 MB.");
  }
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new TypeError("The selected image could not be read."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new TypeError("The selected file is not a valid image."));
    };
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/webp" | "image/png",
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export function fitPayeeIconDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError("Image dimensions must be positive finite numbers.");
  }
  const longest = Math.max(width, height);
  const scale = longest > PAYEE_ICON_MAX_DIMENSION
    ? PAYEE_ICON_MAX_DIMENSION / longest
    : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function normalisePayeeIconImage(
  file: File,
  decodeImage: (candidate: File) => Promise<HTMLImageElement> = loadImage,
): Promise<string> {
  validatePayeeIconUploadCandidate(file);
  const image = await decodeImage(file);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new TypeError("The selected file has invalid image dimensions.");
  }

  const dimensions = fitPayeeIconDimensions(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable in this browser.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let format: PayeeEmbeddedIconFormat = "webp";
  let output = await canvasToBlob(canvas, "image/webp", 0.86);
  if (!output || output.type !== "image/webp") {
    format = "png";
    output = await canvasToBlob(canvas, "image/png");
  }
  if (!output) throw new Error("The image could not be processed.");

  const dataUrl = await readBlobAsDataUrl(output);
  const separator = dataUrl.indexOf(",");
  const data = separator >= 0 ? dataUrl.slice(separator + 1) : "";
  if (!data) throw new Error("The processed image is empty.");
  try {
    return serialisePayeeIconReference({ kind: "embedded", format, data });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new TypeError("The processed image is too large. Choose a simpler image.");
    }
    throw error;
  }
}
