export function evaluateAssignedInput(input: string, currentValue: number): number | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  const normalised = trimmed.replace(/[$,\s]/g, "");

  if (/^[+-]\d+(\.\d+)?$/.test(normalised)) {
    return currentValue + Number.parseFloat(normalised);
  }

  if (/^\d+(\.\d+)?$/.test(normalised)) {
    return Number.parseFloat(normalised);
  }

  if (!/^[\d.+\-*/()]+$/.test(normalised)) {
    return null;
  }

  try {
    const result = Function(`"use strict"; return (${normalised});`)();

    if (typeof result !== "number" || !Number.isFinite(result)) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}
