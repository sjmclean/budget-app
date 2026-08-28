import { useRef, useState, type ChangeEvent } from "react";
import type { PayeeView } from "../accounts/payeeService.js";
import { PayeeIcon } from "./PayeeIcon.js";
import {
  normalisePayeeIconImage,
  PAYEE_ICON_ACCEPT,
} from "./payeeCustomImage.js";
import { parsePayeeIconReference } from "./payeeIconReference.js";

export function PayeeCustomImagePicker({
  payee,
  value,
  onChange,
}: {
  readonly payee: Pick<PayeeView, "id" | "name" | "iconRef">;
  readonly value: string;
  readonly onChange: (iconRef: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const isCustomImage = parsePayeeIconReference(value).kind === "embedded";

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setProcessing(true);
    setError("");
    try {
      onChange(await normalisePayeeIconImage(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be processed.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section
      aria-label="Custom payee image"
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "0.9rem",
        alignItems: "center",
        padding: "0.9rem",
        marginBottom: "1rem",
        border: "1px solid var(--border-subtle, rgba(127, 127, 127, 0.25))",
        borderRadius: "0.75rem",
      }}
    >
      <PayeeIcon payee={{ ...payee, iconRef: value }} size={64} decorative />
      <div style={{ display: "grid", gap: "0.4rem" }}>
        <strong>{isCustomImage ? "Custom image" : "Use your own image"}</strong>
        <span className="muted">JPG, PNG, WebP or SVG · maximum 5 MB. Images are resized to fit within 256 × 256.</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            className="button button-secondary"
            type="button"
            disabled={processing}
            onClick={() => inputRef.current?.click()}
          >
            {processing ? "Processing…" : isCustomImage ? "Choose another" : "Upload image"}
          </button>
          {isCustomImage ? (
            <button className="button button-ghost" type="button" disabled={processing} onClick={() => onChange("")}>
              Remove custom image
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={PAYEE_ICON_ACCEPT}
          hidden
          onChange={(event) => void handleFile(event)}
        />
        {error ? <span role="alert" style={{ color: "var(--danger, #b42318)" }}>{error}</span> : null}
      </div>
    </section>
  );
}
