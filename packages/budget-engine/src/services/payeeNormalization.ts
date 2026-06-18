export function normalizePayeeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function cleanPayeeDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function isTransferPayeeName(name: string): boolean {
  const clean = cleanPayeeDisplayName(name);
  return /^transfer\s*:/i.test(clean) || /^transfer\s+to\s+/i.test(clean) || /^transfer\s+from\s+/i.test(clean);
}
