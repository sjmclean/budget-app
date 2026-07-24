import { readFile } from "node:fs/promises";

const required = [
  ["apps/web/src/features/attachments/attachmentContentStore.ts", "readByHash"],
  ["apps/web/src/features/persistence/replication.ts", "uploadBlob"],
  ["apps/web/src/features/persistence/replicationTransport.ts", "/api/replication/blobs/"],
  ["apps/web/src/features/persistence/replicationEngine.ts", "uploadLocalAttachmentBlobs"],
  ["apps/web/src/features/persistence/replicationEngine.ts", "calculateAttachmentContentHash"],
  ["apps/server/src/replicationStore.mjs", "replication_blobs"],
  ["apps/server/src/replicationStore.mjs", "BLOB_HASH_MISMATCH"],
  ["apps/server/src/server.mjs", "blobMatch"],
  ["docs/architecture/attachment-blob-replication.md", "binary content never enters"],
];

for (const [file, marker] of required) {
  const text = await readFile(file, "utf8");
  if (!text.includes(marker)) throw new Error(`${file} is missing ${marker}`);
}

const engine = await readFile("apps/web/src/features/persistence/replicationEngine.ts", "utf8");
if (engine.indexOf("await uploadLocalAttachmentBlobs") > engine.indexOf("await transport.pushOperations")) {
  throw new Error("Attachment blobs must be uploaded before metadata operations are pushed.");
}

console.log("Milestone 7 attachment replication validation passed");
