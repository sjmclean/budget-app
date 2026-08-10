import { throwIfAborted, Ynab4SourceError } from "./errors.js";
import type {
  Ynab4ChunkSource,
  Ynab4ReaderDiagnostics,
  Ynab4ReaderProgress,
  Ynab4SourceRecord,
} from "./types.js";

const COMPACT_AT = 64 * 1024;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export class IncrementalJsonCursor {
  private buffer = "";
  private index = 0;
  private sourceOffset = 0;
  private finished = false;
  private recordsYielded = 0;
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });

  constructor(
    private readonly source: Ynab4ChunkSource,
    private readonly sourceName: string,
    private readonly chunkSize: number,
    private readonly signal: AbortSignal | undefined,
    private readonly diagnostics: Ynab4ReaderDiagnostics | undefined,
    private readonly progress: ((value: Ynab4ReaderProgress) => void) | undefined,
  ) {}

  get offset(): number {
    return this.sourceOffset - new TextEncoder().encode(this.buffer.slice(this.index)).byteLength;
  }

  async scanTopLevel(
    visitor: (key: string, cursor: IncrementalJsonCursor) => Promise<void>,
  ): Promise<readonly string[]> {
    await this.expect("{", null);
    const keys: string[] = [];
    if (await this.consume("}", null)) return keys;
    while (true) {
      const key = await this.readString(null);
      if (keys.includes(key)) this.fail(`Duplicate top-level property "${key}".`, key, "schema");
      keys.push(key);
      await this.expect(":", key);
      await visitor(key, this);
      if (await this.consume("}", null)) break;
      await this.expect(",", null);
    }
    await this.skipWhitespace(null);
    if ((await this.peek(null)) !== null) this.fail("Unexpected content after the top-level object.", null);
    return keys;
  }

  async *streamTopLevelRecords(collection: string): AsyncGenerator<Ynab4SourceRecord> {
    await this.expect("{", null);
    const keys = new Set<string>();
    let found = false;
    if (await this.consume("}", null)) this.fail(`Required collection "${collection}" is missing.`, collection, "schema");
    while (true) {
      const key = await this.readString(null);
      if (keys.has(key)) this.fail(`Duplicate top-level property "${key}".`, key, "schema");
      keys.add(key);
      await this.expect(":", key);
      if (key === collection) {
        found = true;
        if ((await this.peek(collection)) !== "[") {
          this.fail(`Expected "${collection}" to be an array.`, collection, "schema");
        }
        await this.expect("[", collection);
        if (!(await this.consume("]", collection))) {
          while (true) {
            const value = await this.readValue(collection);
            if (!isRecord(value)) this.fail("Expected every collection member to be an object.", collection, "schema");
            this.recordsYielded += 1;
            yield value;
            if (await this.consume("]", collection)) break;
            await this.expect(",", collection);
          }
        }
      } else {
        await this.readValue(key);
      }
      if (await this.consume("}", null)) break;
      await this.expect(",", null);
    }
    await this.skipWhitespace(null);
    if ((await this.peek(null)) !== null) this.fail("Unexpected content after the top-level object.", null);
    if (!found) this.fail(`Required collection "${collection}" is missing.`, collection, "schema");
  }

  async readArrayRecords(
    collection: string,
    onRecord: (record: Ynab4SourceRecord) => Promise<void>,
  ): Promise<void> {
    if ((await this.peek(collection)) !== "[") {
      this.fail(`Expected "${collection}" to be an array.`, collection, "schema");
    }
    await this.expect("[", collection);
    if (await this.consume("]", collection)) return;
    while (true) {
      const value = await this.readValue(collection);
      if (!isRecord(value)) this.fail("Expected every collection member to be an object.", collection, "schema");
      await onRecord(value);
      if (await this.consume("]", collection)) break;
      await this.expect(",", collection);
    }
  }

  async readValue(collection: string | null, depth = 0): Promise<unknown> {
    if (depth > 512) this.fail("JSON nesting exceeds the supported limit of 512.", collection, "unsupported");
    const char = await this.peek(collection);
    if (char === '"') return this.readString(collection);
    if (char === "{") {
      await this.expect("{", collection);
      const value: Record<string, unknown> = {};
      if (await this.consume("}", collection)) return value;
      while (true) {
        const key = await this.readString(collection);
        await this.expect(":", collection);
        const member = await this.readValue(collection, depth + 1);
        if (!FORBIDDEN_KEYS.has(key)) {
          Object.defineProperty(value, key, {
            value: member,
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
        if (await this.consume("}", collection)) return value;
        await this.expect(",", collection);
      }
    }
    if (char === "[") {
      await this.expect("[", collection);
      const value: unknown[] = [];
      if (await this.consume("]", collection)) return value;
      while (true) {
        value.push(await this.readValue(collection, depth + 1));
        if (await this.consume("]", collection)) return value;
        await this.expect(",", collection);
      }
    }
    if (char === "t") return this.readLiteral("true", true, collection);
    if (char === "f") return this.readLiteral("false", false, collection);
    if (char === "n") return this.readLiteral("null", null, collection);
    if (char === "-" || (char !== null && char >= "0" && char <= "9")) {
      return this.readNumber(collection);
    }
    this.fail(char === null ? "Unexpected end of JSON input." : `Unexpected token "${char}".`, collection);
  }

  private async readString(collection: string | null): Promise<string> {
    await this.expect('"', collection);
    let result = "";
    while (true) {
      const char = await this.takeRaw(collection);
      if (char === null) this.fail("Unterminated JSON string.", collection);
      if (char === '"') return result;
      if (char === "\\") {
        const escaped = await this.takeRaw(collection);
        if (escaped === null) this.fail("Unterminated JSON escape.", collection);
        const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (escaped in simple) result += simple[escaped];
        else if (escaped === "u") {
          let hex = "";
          for (let count = 0; count < 4; count += 1) hex += await this.takeRequired(collection);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("Invalid Unicode escape.", collection);
          result += String.fromCharCode(Number.parseInt(hex, 16));
        } else this.fail("Invalid JSON escape.", collection);
      } else {
        if (char.charCodeAt(0) < 0x20) this.fail("Unescaped control character in JSON string.", collection);
        result += char;
      }
    }
  }

  private async readNumber(collection: string | null): Promise<number> {
    let raw = "";
    while (true) {
      const char = await this.peekRaw(collection);
      if (char === null || !/[0-9eE+.-]/.test(char)) break;
      raw += await this.takeRequired(collection);
    }
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) this.fail("Invalid JSON number.", collection);
    const value = Number(raw);
    if (!Number.isFinite(value)) this.fail("JSON number is outside the supported finite range.", collection, "unsupported");
    return value;
  }

  private async readLiteral<T>(raw: string, value: T, collection: string | null): Promise<T> {
    for (const expected of raw) {
      if ((await this.takeRaw(collection)) !== expected) this.fail(`Invalid JSON literal; expected "${raw}".`, collection);
    }
    return value;
  }

  private async consume(expected: string, collection: string | null): Promise<boolean> {
    if ((await this.peek(collection)) !== expected) return false;
    this.index += 1;
    return true;
  }

  private async expect(expected: string, collection: string | null): Promise<void> {
    const actual = await this.take(collection);
    if (actual !== expected) this.fail(`Expected "${expected}" but found ${actual === null ? "end of input" : `"${actual}"`}.`, collection);
  }

  private async peek(collection: string | null): Promise<string | null> {
    await this.skipWhitespace(collection);
    return this.peekRaw(collection);
  }

  private async take(collection: string | null): Promise<string | null> {
    await this.skipWhitespace(collection);
    const value = await this.peekRaw(collection);
    if (value !== null) this.index += 1;
    return value;
  }

  private async takeRequired(collection: string | null): Promise<string> {
    const value = await this.peekRaw(collection);
    if (value === null) this.fail("Unexpected end of JSON input.", collection);
    this.index += 1;
    return value;
  }

  private async takeRaw(collection: string | null): Promise<string | null> {
    const value = await this.peekRaw(collection);
    if (value !== null) this.index += 1;
    return value;
  }

  private async skipWhitespace(collection: string | null): Promise<void> {
    while (true) {
      const char = await this.peekRaw(collection);
      if (char === null || !/\s/.test(char)) return;
      this.index += 1;
    }
  }

  private async peekRaw(collection: string | null): Promise<string | null> {
    throwIfAborted(this.signal);
    while (this.index >= this.buffer.length && !this.finished) await this.fill(collection);
    return this.index < this.buffer.length ? this.buffer[this.index] : null;
  }

  private async fill(collection: string | null): Promise<void> {
    throwIfAborted(this.signal);
    if (this.index >= COMPACT_AT) {
      this.buffer = this.buffer.slice(this.index);
      this.index = 0;
    }
    const bytes = await this.source.read(this.sourceOffset, this.chunkSize, this.signal);
    throwIfAborted(this.signal);
    if (bytes.byteLength === 0) {
      try {
        this.buffer += this.decoder.decode();
      } catch {
        this.fail("Invalid UTF-8 sequence.", collection);
      }
      this.finished = true;
      return;
    }
    this.sourceOffset += bytes.byteLength;
    try {
      this.buffer += this.decoder.decode(bytes, { stream: true });
    } catch {
      this.fail("Invalid UTF-8 sequence.", collection);
    }
    if (this.diagnostics) {
      this.diagnostics.bytesRead += bytes.byteLength;
      this.diagnostics.chunksRead += 1;
      this.diagnostics.maximumBufferedBytes = Math.max(
        this.diagnostics.maximumBufferedBytes,
        new TextEncoder().encode(this.buffer.slice(this.index)).byteLength,
      );
    }
    this.progress?.({
      unitsConsumed: this.sourceOffset,
      totalUnits: this.source.size,
      phase: collection,
      bytesConsumed: this.sourceOffset,
      totalBytes: this.source.size,
      collection,
      recordsYielded: this.recordsYielded,
    });
  }

  private fail(
    message: string,
    collection: string | null,
    kind: "syntax" | "schema" | "unsupported" = "syntax",
  ): never {
    throw new Ynab4SourceError(message, this.sourceName, collection, Math.max(0, this.offset), kind);
  }
}

function isRecord(value: unknown): value is Ynab4SourceRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
