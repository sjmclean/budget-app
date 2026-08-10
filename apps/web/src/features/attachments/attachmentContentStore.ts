export interface StoredAttachmentContent {
  attachmentId: string;
  contentRef: string;
  mimeType: string;
  size: number;
  contentHash: string;
}

export interface AttachmentContentDescriptor extends StoredAttachmentContent {}

export interface AttachmentContentStore {
  put(input: {
    attachmentId: string;
    bytes: Uint8Array;
    mimeType: string;
    contentHash: string;
  }): Promise<StoredAttachmentContent>;
  read(contentRef: string): Promise<Blob | null>;
  readByHash(contentHash: string): Promise<Blob | null>;
  delete(contentRef: string): Promise<void>;
  exists(contentRef: string): Promise<boolean>;
  existsByHash(contentHash: string): Promise<boolean>;
  list(): Promise<AttachmentContentDescriptor[]>;
}

interface IndexedDbAttachmentRecord {
  contentRef: string;
  attachmentId: string;
  mimeType: string;
  size: number;
  contentHash: string;
  blob: Blob;
}

const DEFAULT_DATABASE_NAME = "budget-app-attachment-content";
const DATABASE_VERSION = 2;
const STORE_NAME = "attachments";
const HASH_INDEX = "content-hash";
const CONTENT_REF_PREFIX = "browser-indexeddb:";

export class BrowserIndexedDbAttachmentContentStore
  implements AttachmentContentStore
{
  constructor(
    private readonly databaseName = DEFAULT_DATABASE_NAME,
  ) {}

  async put(input: {
    attachmentId: string;
    bytes: Uint8Array;
    mimeType: string;
    contentHash: string;
  }): Promise<StoredAttachmentContent> {
    assertContentHash(input.contentHash);
    const contentRef = `${CONTENT_REF_PREFIX}${input.attachmentId}`;
    const record: IndexedDbAttachmentRecord = {
      contentRef,
      attachmentId: input.attachmentId,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      contentHash: input.contentHash,
      blob: new Blob([copyToArrayBuffer(input.bytes)], { type: input.mimeType }),
    };

    const database = await openDatabase(this.databaseName);
    try {
      await runRequest(database, "readwrite", (store) => store.put(record));
    } finally {
      database.close();
    }

    return describe(record);
  }

  async read(contentRef: string): Promise<Blob | null> {
    const database = await openDatabase(this.databaseName);
    try {
      const record = await runRequest<IndexedDbAttachmentRecord | undefined>(
        database,
        "readonly",
        (store) => store.get(contentRef),
      );
      return record?.blob ?? null;
    } finally {
      database.close();
    }
  }

  async readByHash(contentHash: string): Promise<Blob | null> {
    assertContentHash(contentHash);
    const database = await openDatabase(this.databaseName);
    try {
      const record = await runIndexRequest<IndexedDbAttachmentRecord | undefined>(
        database,
        "readonly",
        (index) => index.get(contentHash),
      );
      return record?.blob ?? null;
    } finally {
      database.close();
    }
  }

  async delete(contentRef: string): Promise<void> {
    const database = await openDatabase(this.databaseName);
    try {
      await runRequest(database, "readwrite", (store) => store.delete(contentRef));
    } finally {
      database.close();
    }
  }

  async exists(contentRef: string): Promise<boolean> {
    const database = await openDatabase(this.databaseName);
    try {
      const key = await runRequest<IDBValidKey | undefined>(
        database,
        "readonly",
        (store) => store.getKey(contentRef),
      );
      return key !== undefined;
    } finally {
      database.close();
    }
  }

  async existsByHash(contentHash: string): Promise<boolean> {
    assertContentHash(contentHash);
    const database = await openDatabase(this.databaseName);
    try {
      const key = await runIndexRequest<IDBValidKey | undefined>(
        database,
        "readonly",
        (index) => index.getKey(contentHash),
      );
      return key !== undefined;
    } finally {
      database.close();
    }
  }

  async list(): Promise<AttachmentContentDescriptor[]> {
    const database = await openDatabase(this.databaseName);
    try {
      const records = await runRequest<IndexedDbAttachmentRecord[]>(
        database,
        "readonly",
        (store) => store.getAll(),
      );
      return records.map(describe);
    } finally {
      database.close();
    }
  }
}

export class MemoryAttachmentContentStore implements AttachmentContentStore {
  private readonly records = new Map<string, IndexedDbAttachmentRecord>();

  async put(input: {
    attachmentId: string;
    bytes: Uint8Array;
    mimeType: string;
    contentHash: string;
  }): Promise<StoredAttachmentContent> {
    assertContentHash(input.contentHash);
    const contentRef = `memory:${input.attachmentId}`;
    const record: IndexedDbAttachmentRecord = {
      contentRef,
      attachmentId: input.attachmentId,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      contentHash: input.contentHash,
      blob: new Blob([copyToArrayBuffer(input.bytes)], { type: input.mimeType }),
    };
    this.records.set(contentRef, record);
    return describe(record);
  }

  async read(contentRef: string): Promise<Blob | null> {
    return this.records.get(contentRef)?.blob ?? null;
  }

  async readByHash(contentHash: string): Promise<Blob | null> {
    assertContentHash(contentHash);
    return [...this.records.values()].find((record) => record.contentHash === contentHash)?.blob ?? null;
  }

  async delete(contentRef: string): Promise<void> {
    this.records.delete(contentRef);
  }

  async exists(contentRef: string): Promise<boolean> {
    return this.records.has(contentRef);
  }

  async existsByHash(contentHash: string): Promise<boolean> {
    assertContentHash(contentHash);
    return [...this.records.values()].some((record) => record.contentHash === contentHash);
  }

  async list(): Promise<AttachmentContentDescriptor[]> {
    return [...this.records.values()].map(describe);
  }
}

let activeAttachmentContentStore: AttachmentContentStore | null = null;
let attachmentDatabaseName = DEFAULT_DATABASE_NAME;

export function getAttachmentContentStore(): AttachmentContentStore {
  if (!activeAttachmentContentStore) {
    activeAttachmentContentStore =
      typeof indexedDB === "undefined"
        ? new MemoryAttachmentContentStore()
        : new BrowserIndexedDbAttachmentContentStore(attachmentDatabaseName);
  }

  return activeAttachmentContentStore;
}

export function configureAttachmentContentStoreNamespace(namespace?: string): void {
  attachmentDatabaseName = namespace?.trim()
    ? `${DEFAULT_DATABASE_NAME}-${namespace.trim().replace(/[^a-zA-Z0-9_-]/g, "_")}`
    : DEFAULT_DATABASE_NAME;
  activeAttachmentContentStore = null;
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
    throw new Error("SHA-256 support is required for attachment storage.");
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", copyToArrayBuffer(bytes));
  return `sha256:${Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("")}`;
}

export function assertContentHash(value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("Attachment content hashes must be canonical SHA-256 values.");
  }
}

function describe(record: IndexedDbAttachmentRecord): AttachmentContentDescriptor {
  return {
    attachmentId: record.attachmentId,
    contentRef: record.contentRef,
    mimeType: record.mimeType,
    size: record.size,
    contentHash: record.contentHash,
  };
}

function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: "contentRef" });
      if (!store.indexNames.contains(HASH_INDEX)) {
        store.createIndex(HASH_INDEX, "contentHash", { unique: false });
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

function runIndexRequest<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  createRequest: (index: IDBIndex) => IDBRequest<T>,
): Promise<T> {
  return runRequest(database, mode, (store) => createRequest(store.index(HASH_INDEX)));
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
