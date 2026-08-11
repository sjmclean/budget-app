import type { PayeeView } from "../../accounts/payeeService";
import type { LocalPayeeRecord } from "./registerSchema";

/** The single SQLite-row projection used by both reads and mutation responses. */
export function localPayeeRecordToView(row: LocalPayeeRecord): PayeeView {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    isArchived: row.archived,
    createdAt: row.firstUsedAt ?? row.createdAt ?? "",
    lastUsedAt: row.lastUsedAt ?? "",
    useCount: row.useCount ?? 0,
    scheduledUseCount: row.scheduledUseCount ?? 0,
    defaultCategoryId: row.defaultCategoryId,
    defaultCategoryName: row.defaultCategoryName,
    iconRef: row.iconRef,
    aliases: row.aliases ? [...row.aliases] : [],
    importRules: row.importRules ? [...row.importRules] : [],
  };
}
