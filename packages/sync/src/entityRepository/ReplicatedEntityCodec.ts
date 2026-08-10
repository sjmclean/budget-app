import {
  createHybridTimestamp,
  type HybridTimestamp,
} from "../primitives/HybridTimestamp.js";
import {
  createLwwRegister,
  type LwwRegister,
} from "../primitives/LwwRegister.js";
import type {
  ReplicatedEntity,
  ReplicatedFields,
} from "../primitives/ReplicatedEntity.js";

export interface ReplicatedEntityCodec<T extends object> {
  serialize(entity: ReplicatedEntity<T>): string;
  deserialize(value: string): ReplicatedEntity<T>;
}

export class ReplicatedEntityDecodeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReplicatedEntityDecodeError";
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeTimestamp(value: unknown, path: string): HybridTimestamp {
  if (!isRecord(value)) {
    throw new ReplicatedEntityDecodeError(`${path} must be an object.`);
  }

  try {
    return createHybridTimestamp(
      value.wallTime as number,
      value.counter as number,
      value.nodeId as string,
    );
  } catch (error) {
    throw new ReplicatedEntityDecodeError(`${path} is not a valid hybrid timestamp.`, {
      cause: error,
    });
  }
}

function decodeRegister(value: unknown, path: string): LwwRegister<unknown> {
  if (!isRecord(value) || !("value" in value) || !("timestamp" in value)) {
    throw new ReplicatedEntityDecodeError(`${path} must be an LWW register.`);
  }

  return createLwwRegister(
    value.value,
    decodeTimestamp(value.timestamp, `${path}.timestamp`),
  );
}

export function createJsonReplicatedEntityCodec<T extends object>(
  validateFields?: (fields: Readonly<Record<string, unknown>>) => boolean,
): ReplicatedEntityCodec<T> {
  return {
    serialize(entity) {
      return JSON.stringify(entity);
    },

    deserialize(value) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        throw new ReplicatedEntityDecodeError("Entity record is not valid JSON.", {
          cause: error,
        });
      }

      if (!isRecord(parsed) || !isRecord(parsed.metadata) || !isRecord(parsed.fields)) {
        throw new ReplicatedEntityDecodeError("Entity record must contain metadata and fields objects.");
      }

      const id = parsed.metadata.id;
      if (typeof id !== "string" || id.trim().length === 0) {
        throw new ReplicatedEntityDecodeError("Entity metadata.id must be a non-empty string.");
      }

      const tombstoneValue = parsed.metadata.tombstone;
      const tombstone = tombstoneValue === null
        ? null
        : decodeTimestamp(tombstoneValue, "metadata.tombstone");

      const decodedFieldValues: Record<string, unknown> = {};
      const decodedRegisters: Record<string, LwwRegister<unknown>> = {};
      for (const [fieldName, registerValue] of Object.entries(parsed.fields)) {
        const register = decodeRegister(registerValue, `fields.${fieldName}`);
        decodedRegisters[fieldName] = register;
        decodedFieldValues[fieldName] = register.value;
      }

      if (validateFields && !validateFields(decodedFieldValues)) {
        throw new ReplicatedEntityDecodeError("Entity fields failed domain validation.");
      }

      return Object.freeze({
        metadata: Object.freeze({
          id,
          createdAt: decodeTimestamp(parsed.metadata.createdAt, "metadata.createdAt"),
          tombstone,
        }),
        fields: Object.freeze(decodedRegisters) as ReplicatedFields<T>,
      });
    },
  };
}
