import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPayeeService } from "../../../apps/web/src/features/accounts/payeeService.js";
import {
  isExplicitPayeeIconReference,
  mergePayeeIconReferences,
  parsePayeeIconReference,
  serialisePayeeIconReference,
  validatePayeeIconReferenceForWrite,
} from "../../../apps/web/src/features/icons/payeeIconReference.js";
import { resolvePayeeIcon } from "../../../apps/web/src/features/icons/payeeIconResolver.js";
import {
  fitPayeeIconDimensions,
  normalisePayeeIconImage,
  PAYEE_ICON_MAX_DIMENSION,
  PAYEE_ICON_UPLOAD_MAX_BYTES,
  validatePayeeIconUploadCandidate,
} from "../../../apps/web/src/features/icons/payeeCustomImage.js";

const embeddedData = "AQIDBA==";
const embeddedWebp = `embedded:v1:webp:${embeddedData}`;
const embeddedPng = `embedded:v1:png:${embeddedData}`;

function payee(iconRef = "") {
  return {
    id: "payee-1",
    name: "Merchant",
    iconRef,
  };
}

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

describe("custom payee icon references", () => {
  it("parses, serialises and validates embedded WebP and PNG references", () => {
    assert.deepEqual(parsePayeeIconReference(embeddedWebp), {
      kind: "embedded",
      format: "webp",
      data: embeddedData,
    });
    assert.deepEqual(parsePayeeIconReference(embeddedPng), {
      kind: "embedded",
      format: "png",
      data: embeddedData,
    });
    assert.equal(
      serialisePayeeIconReference({ kind: "embedded", format: "webp", data: embeddedData }),
      embeddedWebp,
    );
    assert.equal(validatePayeeIconReferenceForWrite(embeddedPng), embeddedPng);
  });

  it("rejects unsupported formats and malformed embedded data", () => {
    assert.equal(parsePayeeIconReference(`embedded:v1:svg:${embeddedData}`).kind, "unknown");
    assert.equal(parsePayeeIconReference("embedded:v1:webp:not base64").kind, "unknown");
    assert.equal(parsePayeeIconReference("embedded:v1:webp:AQIDB").kind, "unknown");
    assert.throws(() => validatePayeeIconReferenceForWrite("embedded:v1:svg:AQIDBA=="));
  });

  it("treats uploaded images as explicit merge overrides", () => {
    assert.equal(isExplicitPayeeIconReference(embeddedWebp), true);
    assert.equal(mergePayeeIconReferences("", [embeddedWebp]), embeddedWebp);
    assert.equal(mergePayeeIconReferences("builtin:v1:shopping", [embeddedWebp]), "builtin:v1:shopping");
    assert.equal(mergePayeeIconReferences("", [embeddedWebp, "builtin:v1:shopping"]), "");
  });

  it("resolves uploaded images to a data URL while reserved content refs still fall back", () => {
    assert.deepEqual(resolvePayeeIcon({ payee: payee(embeddedWebp) }), {
      kind: "image",
      src: `data:image/webp;base64,${embeddedData}`,
    });
    assert.equal(
      resolvePayeeIcon({ payee: payee(`content:v1:${"a".repeat(64)}`) }).kind,
      "initials",
    );
  });

  it("persists embedded references through the existing payee write contract", async () => {
    const service = createPayeeService({ storage: storage() });
    await service.recordPayee("Merchant");
    const current = (await service.listPayees())[0];
    await service.updatePayee({
      id: current.id,
      name: current.name,
      note: "",
      iconUpdate: { kind: "set", iconRef: embeddedWebp },
    });
    assert.equal((await service.listPayees())[0].iconRef, embeddedWebp);
  });
});

describe("custom payee image upload policy", () => {
  it("accepts supported image MIME types up to the upload limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]) {
      assert.doesNotThrow(() => validatePayeeIconUploadCandidate({ size: 1024, type }));
    }
    assert.doesNotThrow(() => validatePayeeIconUploadCandidate({
      size: PAYEE_ICON_UPLOAD_MAX_BYTES,
      type: "image/jpeg",
    }));
  });

  it("rejects empty files and files over 5 MB, including SVG", () => {
    assert.throws(() => validatePayeeIconUploadCandidate({ size: 0, type: "image/png" }));
    assert.throws(() => validatePayeeIconUploadCandidate({
      size: PAYEE_ICON_UPLOAD_MAX_BYTES + 1,
      type: "image/jpeg",
    }));
    assert.throws(() => validatePayeeIconUploadCandidate({
      size: PAYEE_ICON_UPLOAD_MAX_BYTES + 1,
      type: "image/svg+xml",
    }));
  });

  it("does not add SVG as a persisted embedded icon format", () => {
    assert.equal(parsePayeeIconReference(`embedded:v1:svg:${embeddedData}`).kind, "unknown");
    for (const format of ["webp", "png"] as const) {
      const reference = serialisePayeeIconReference({ kind: "embedded", format, data: embeddedData });
      assert.equal(parsePayeeIconReference(reference).kind, "embedded");
    }
  });

  it("surfaces malformed SVG or raster decode failures as a safe error", async () => {
    const malformedSvg = {
      size: 128,
      type: "image/svg+xml",
    } as File;

    await assert.rejects(
      normalisePayeeIconImage(
        malformedSvg,
        async () => { throw new TypeError("The selected file is not a valid image."); },
      ),
      /selected file is not a valid image/i,
    );
  });

  it("fits images within 256px without changing aspect ratio", () => {
    assert.deepEqual(fitPayeeIconDimensions(128, 64), { width: 128, height: 64 });
    assert.deepEqual(fitPayeeIconDimensions(1024, 512), {
      width: PAYEE_ICON_MAX_DIMENSION,
      height: PAYEE_ICON_MAX_DIMENSION / 2,
    });
    assert.deepEqual(fitPayeeIconDimensions(400, 800), {
      width: PAYEE_ICON_MAX_DIMENSION / 2,
      height: PAYEE_ICON_MAX_DIMENSION,
    });
    assert.throws(() => fitPayeeIconDimensions(0, 100));
  });
});
