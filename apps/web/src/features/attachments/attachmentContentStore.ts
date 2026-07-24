export interface StoredAttachmentContent {
  attachmentId: string;
  contentRef: string;
  mimeType: string;
  size: number;
  contentHash: string;
}

export interface AttachmentContentStore {
  put(input: {
    attachmentId: string;
    bytes: Uint8Array;
    mimeType: string;
    contentHash: string;
  }): Promise<StoredAttachmentContent>;
  read(contentRef: string): Promise<Blob | null>;
  delete(contentRef: string): Promise<void>;
  exists(contentRef: string): Promise<boolean>;
}

interface IndexedDbAttachmentRecord {
  contentRef: string;
  attachmentId: string;
  mimeType: string;
  size: number;
  contentHash: string;
  blob: Blob;
}

const DATABASE_NAME = "budget-app-attachment-content";
const DATABASE_VERSION = 1;
const STORE_NAME = "attachments";
const CONTENT_REF_PREFIX = "browser-indexeddb:";

export class BrowserIndexedDbAttachmentContentStore
  implements AttachmentContentStore
{
  async put(input: {
    attachmentId: string;
    bytes: Uint8Array;
    mimeType: string;
    contentHash: string;
  }): Promise<StoredAttachmentContent> {
    const contentRef = `${CONTENT_REF_PREFIX}${input.attachmentId}`;
    const record: IndexedDbAttachmentRecord = {
      contentRef,
      attachmentId: input.attachmentId,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      contentHash: input.contentHash,
      blob: new Blob([copyToArrayBuffer(input.bytes)], { type: input.mimeType }),
    };

    const database = await openDatabase();
    await runRequest(database, "readwrite", (store) => store.put(record));

    return {
      attachmentId: input.attachmentId,
      contentRef,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      contentHash: input.contentHash,
    };
  }

  async read(contentRef: string): Promise<Blob | null> {
    const database = await openDatabase();
    const record = await runRequest<IndexedDbAttachmentRecord | undefined>(
      database,
      "readonly",
      (store) => store.get(contentRef),
    );
    return record?.blob ?? null;
  }

  async delete(contentRef: string): Promise<void> {
    const database = await openDatabase();
    await runRequest(database, "readwrite", (store) => store.delete(contentRef));
  }

  async exists(contentRef: string): Promise<boolean> {
    const database = await openDatabase();
    const key = await runRequest<IDBValidKey | undefined>(
      database,
      "readonly",
      (store) => store.getKey(contentRef),
    );
    return key !== undefined;
  }
}

export class MemoryAttachmentContentStore implements AttachmentContentStore {
  private readonly records = new Map<string, Blob>();

  async put(input: {
    attachmentId: string;
    bytes: Uint8Array;
    mimeType: string;
    contentHash: string;
  }): Promise<StoredAttachmentContent> {
    const contentRef = `memory:${input.attachmentId}`;
    this.records.set(contentRef, new Blob([copyToArrayBuffer(input.bytes)], { type: input.mimeType }));
    return {
      attachmentId: input.attachmentId,
      contentRef,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      contentHash: input.contentHash,
    };
  }

  async read(contentRef: string): Promise<Blob | null> {
    return this.records.get(contentRef) ?? null;
  }

  async delete(contentRef: string): Promise<void> {
    this.records.delete(contentRef);
  }

  async exists(contentRef: string): Promise<boolean> {
    return this.records.has(contentRef);
  }
}

let activeAttachmentContentStore: AttachmentContentStore | null = null;

export function getAttachmentContentStore(): AttachmentContentStore {
  if (!activeAttachmentContentStore) {
    activeAttachmentContentStore =
      typeof indexedDB === "undefined"
        ? new MemoryAttachmentContentStore()
        : new BrowserIndexedDbAttachmentContentStore();
  }

  return activeAttachmentContentStore;
}

export function setAttachmentContentStoreForTests(
  store: AttachmentContentStore | null,
): void {
  activeAttachmentContentStore = store;
}

export async function calculateAttachmentContentHash(
  bytes: Uint8Array,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return `unavailable:${bytes.byteLength}`;
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", copyToArrayBuffer(bytes));
  return `sha256:${Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "contentRef" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open attachment storage."));
  });
}

function runRequest<T = IDBValidKey>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = createRequest(transaction.objectStore(STORE_NAME));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Attachment storage request failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Attachment storage transaction aborted."));
  });
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
