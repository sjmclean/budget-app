export type LocalSqliteAttachmentReader = (
  budgetId: string,
  attachmentId: string,
) => Promise<Blob | null>;

let reader: LocalSqliteAttachmentReader | null = null;

export function registerLocalSqliteAttachmentReader(
  nextReader: LocalSqliteAttachmentReader,
): () => void {
  reader = nextReader;
  return () => {
    if (reader === nextReader) reader = null;
  };
}

export async function readLocalSqliteAttachment(
  contentRef: string,
): Promise<Blob | null> {
  const match = /^local-sqlite:([^:]+):(.+)$/.exec(contentRef);
  if (!match || !reader) return null;
  return reader(decodeURIComponent(match[1]), decodeURIComponent(match[2]));
}
