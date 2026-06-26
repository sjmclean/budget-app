import { useRef } from "react";
import { Paperclip } from "lucide-react";
import {
  getAttachmentAccessState,
  getSafeAttachmentFileName,
} from "../attachmentAccess";
import type { RegisterTransactionView } from "../accountRegisterTypes";
import { formatDateForDisplay } from "../../settings/dateFormatting";
import { useDateFormatPreference } from "../../settings/useDateFormatPreference";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentManager({
  transaction,
  onClose,
  onAddAttachment,
  onRemoveAttachment,
}: {
  transaction: RegisterTransactionView;
  onClose: () => void;
  onAddAttachment: (file: File) => void;
  onRemoveAttachment: (attachmentId: string) => void;
}) {
  const dateFormat = useDateFormatPreference();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachments = transaction.attachments ?? [];

  return (
    <div
      className="attachment-dialog-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="attachment-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Transaction attachments"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="attachment-dialog-header">
          <div>
            <strong>Attachments</strong>
            <p className="muted">
              {transaction.payee} ·{" "}
              {formatDateForDisplay(transaction.date, dateFormat)}
            </p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="attachment-list">
          {attachments.length === 0 ? (
            <p className="muted">No attachments yet.</p>
          ) : (
            attachments.map((attachment) => {
              const access = getAttachmentAccessState(attachment);
              const safeFileName = getSafeAttachmentFileName(
                attachment.fileName,
              );

              return (
                <div className="attachment-list-item" key={attachment.id}>
                  <Paperclip size={15} />
                  <div>
                    <strong>{attachment.fileName}</strong>
                    <span>
                      {formatFileSize(attachment.fileSize)} ·{" "}
                      {attachment.mimeType || "Unknown type"}
                      {attachment.contentDataUrl
                        ? " · Stored"
                        : " · Metadata only"}
                    </span>
                    {!access.canAccess ? <small>{access.reason}</small> : null}
                  </div>
                  <div className="attachment-list-actions">
                    {access.canAccess && attachment.contentDataUrl ? (
                      <>
                        <a
                          className="button button-secondary"
                          href={attachment.contentDataUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                        <a
                          className="button button-secondary"
                          href={attachment.contentDataUrl}
                          download={safeFileName}
                        >
                          Download
                        </a>
                      </>
                    ) : null}
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => onRemoveAttachment(attachment.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="attachment-dialog-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="attachment-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (!file) {
                return;
              }

              onAddAttachment(file);
              event.target.value = "";
            }}
          />
          <button
            className="button button-primary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Add attachment
          </button>
        </div>
      </div>
    </div>
  );
}
