export enum AttachmentIntegrityStatus {
  Ok = "Ok",
  Missing = "Missing",
  HashMismatch = "HashMismatch"
}

export interface AttachmentIntegrityResult {
  attachmentId: string;
  status: AttachmentIntegrityStatus;
  expectedPath: string;
  message: string;
}
