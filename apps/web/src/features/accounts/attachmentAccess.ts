import type { RegisterAttachmentView } from "./accountRegisterTypes";
import { getAttachmentContentStore } from "../attachments/attachmentContentStore";

export interface AttachmentAccessState {
  canAccess: boolean;
  reason?: string;
}

export function getAttachmentAccessState(
  attachment: RegisterAttachmentView,
): AttachmentAccessState {
  if (attachment.contentDataUrl) {
    if (!isSafeDataUrl(attachment.contentDataUrl)) {
      return {
        canAccess: false,
        reason: "Attachment content is not in a supported stored format.",
      };
    }

    return { canAccess: true };
  }

  if (attachment.contentRef) {
    return { canAccess: true };
  }

  return {
    canAccess: false,
    reason: "Attachment content is not available on this device yet.",
  };
}

export async function readAttachmentBlob(
  attachment: RegisterAttachmentView,
): Promise<Blob | null> {
  if (attachment.contentDataUrl) {
    if (!isSafeDataUrl(attachment.contentDataUrl)) {
      return null;
    }

    return await fetch(attachment.contentDataUrl).then((response) => response.blob());
  }

  if (!attachment.contentRef) {
    return null;
  }

  return await getAttachmentContentStore().read(attachment.contentRef);
}

export async function isAttachmentAvailableLocally(
  attachment: RegisterAttachmentView,
): Promise<boolean> {
  if (attachment.contentDataUrl) {
    return isSafeDataUrl(attachment.contentDataUrl);
  }

  return attachment.contentRef
    ? await getAttachmentContentStore().exists(attachment.contentRef)
    : false;
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
