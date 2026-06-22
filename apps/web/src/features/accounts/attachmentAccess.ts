import type { RegisterAttachmentView } from "./accountRegisterTypes";

export interface AttachmentAccessState {
  canAccess: boolean;
  reason?: string;
}

export function getAttachmentAccessState(
  attachment: RegisterAttachmentView,
): AttachmentAccessState {
  if (!attachment.contentDataUrl) {
    return {
      canAccess: false,
      reason: "Attachment content is not stored in this browser register yet.",
    };
  }

  if (!isSafeDataUrl(attachment.contentDataUrl)) {
    return {
      canAccess: false,
      reason: "Attachment content is not in a supported stored format.",
    };
  }

  return { canAccess: true };
}

export function getSafeAttachmentFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  return cleaned || "attachment";
}

export function isSafeDataUrl(value: string): boolean {
  return /^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,[a-z0-9+/=\r\n]+$/i.test(value);
}
