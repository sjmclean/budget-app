import { useEffect, useMemo, useState } from "react";
import type { MutableRefObject } from "react";
import type { RegisterTransactionView } from "./accountRegisterTypes";
import type { PayeeView } from "./payeeService";
import { buildPayeeRegisterSummaries } from "./payeeRegisterSummaries";
import {
  measureRegisterPerformance,
  type RegisterPerformanceTimings,
} from "../performance/registerPerformanceInstrumentation";

interface PayeeManagerPayeesPersistence {
  listPayees(): Promise<PayeeView[]>;
  listArchivedPayees(): Promise<PayeeView[]>;
  renamePayee(input: { id: string; name: string }): Promise<PayeeView[]>;
  archivePayee(id: string): Promise<PayeeView[]>;
  restorePayee(id: string): Promise<PayeeView[]>;
  mergePayees(input: {
    sourcePayeeId: string;
    targetPayeeId: string;
  }): Promise<PayeeView[]>;
}

interface PayeeReferenceRenameInput {
  payeeId: string;
  previousName: string;
  nextName: string;
}

interface PayeeReferenceReassignInput {
  sourcePayeeId: string;
  sourceName: string;
  targetPayeeId: string;
  targetName: string;
}

interface PayeeManagerScheduledTransactionsPersistence {
  renamePayeeReferences(input: PayeeReferenceRenameInput): Promise<void>;
  reassignPayeeReferences(input: PayeeReferenceReassignInput): Promise<void>;
}

interface UsePayeeManagerWorkflowInput {
  payeesPersistence: PayeeManagerPayeesPersistence;
  scheduledTransactionsPersistence: PayeeManagerScheduledTransactionsPersistence;
  registerTransactions: readonly RegisterTransactionView[];
  renamePayeeReferences(input: PayeeReferenceRenameInput): Promise<void>;
  reassignPayeeReferences(input: PayeeReferenceReassignInput): Promise<void>;
  developerPerformanceMode: boolean;
  performanceTimingsRef: MutableRefObject<RegisterPerformanceTimings>;
}

function normalisePayeeKey(name: string) {
  return name.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function hasSamePayeeName(left: string, right: string) {
  return normalisePayeeKey(left) === normalisePayeeKey(right);
}

export function usePayeeManagerWorkflow({
  payeesPersistence,
  scheduledTransactionsPersistence,
  registerTransactions,
  renamePayeeReferences,
  reassignPayeeReferences,
  developerPerformanceMode,
  performanceTimingsRef,
}: UsePayeeManagerWorkflowInput) {
  const [payeeOptions, setPayeeOptions] = useState<PayeeView[]>([]);
  const [archivedPayeeOptions, setArchivedPayeeOptions] = useState<PayeeView[]>(
    [],
  );
  const [isPayeeManagerOpen, setIsPayeeManagerOpen] = useState(false);
  const [selectedPayeeId, setSelectedPayeeId] = useState<string | null>(null);
  const [payeeRenameDraft, setPayeeRenameDraft] = useState("");
  const [payeeMergeTargetId, setPayeeMergeTargetId] = useState("");
  const [payeeManagerMessage, setPayeeManagerMessage] = useState<string | null>(
    null,
  );
  const [payeeManagerError, setPayeeManagerError] = useState<string | null>(
    null,
  );

  async function refreshPayees(): Promise<PayeeView[]> {
    const [payees, archivedPayees] = await Promise.all([
      payeesPersistence.listPayees(),
      payeesPersistence.listArchivedPayees(),
    ]);

    setPayeeOptions(payees);
    setArchivedPayeeOptions(archivedPayees);
    return payees;
  }

  useEffect(() => {
    let isMounted = true;

    void Promise.all([
      payeesPersistence.listPayees(),
      payeesPersistence.listArchivedPayees(),
    ]).then(([payees, archivedPayees]) => {
      if (isMounted) {
        setPayeeOptions(payees);
        setArchivedPayeeOptions(archivedPayees);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [payeesPersistence]);

  const allManagedPayees = useMemo(
    () => [...payeeOptions, ...archivedPayeeOptions],
    [payeeOptions, archivedPayeeOptions],
  );

  const payeeSummaries = useMemo(
    () =>
      isPayeeManagerOpen
        ? measureRegisterPerformance(
            developerPerformanceMode,
            performanceTimingsRef.current,
            "payee summary build",
            () =>
              buildPayeeRegisterSummaries(
                allManagedPayees,
                registerTransactions,
              ),
          )
        : [],
    [
      allManagedPayees,
      registerTransactions,
      isPayeeManagerOpen,
      developerPerformanceMode,
      performanceTimingsRef,
    ],
  );

  const activePayeeSummaries = useMemo(
    () => payeeSummaries.filter((summary) => !summary.payee.isArchived),
    [payeeSummaries],
  );

  const archivedPayeeSummaries = useMemo(
    () => payeeSummaries.filter((summary) => summary.payee.isArchived),
    [payeeSummaries],
  );

  const selectedPayeeSummary = useMemo(
    () =>
      payeeSummaries.find((summary) => summary.payee.id === selectedPayeeId) ??
      null,
    [payeeSummaries, selectedPayeeId],
  );

  const mergeTargetOptions = useMemo(
    () =>
      selectedPayeeSummary
        ? activePayeeSummaries.filter(
            (summary) => summary.payee.id !== selectedPayeeSummary.payee.id,
          )
        : [],
    [activePayeeSummaries, selectedPayeeSummary],
  );

  async function handleRenamePayee() {
    if (!selectedPayeeSummary) {
      return;
    }

    const nextName = payeeRenameDraft.replace(/\s+/g, " ").trim();

    setPayeeManagerMessage(null);
    setPayeeManagerError(null);

    if (!nextName) {
      setPayeeManagerError("Enter a payee name before saving.");
      return;
    }

    if (hasSamePayeeName(nextName, selectedPayeeSummary.payee.name)) {
      setPayeeManagerMessage("Payee name is unchanged.");
      return;
    }

    const duplicate = allManagedPayees.find(
      (payee) =>
        payee.id !== selectedPayeeSummary.payee.id &&
        hasSamePayeeName(payee.name, nextName),
    );

    if (duplicate) {
      setPayeeManagerError(
        "Another payee already uses that name. Merge payees will be added separately.",
      );
      return;
    }

    const previousName = selectedPayeeSummary.payee.name;

    await payeesPersistence.renamePayee({
      id: selectedPayeeSummary.payee.id,
      name: nextName,
    });
    await scheduledTransactionsPersistence.renamePayeeReferences({
      payeeId: selectedPayeeSummary.payee.id,
      previousName,
      nextName,
    });
    await renamePayeeReferences({
      payeeId: selectedPayeeSummary.payee.id,
      previousName,
      nextName,
    });
    await refreshPayees();

    setPayeeRenameDraft(nextName);
    setPayeeManagerMessage(`Renamed ${previousName} to ${nextName}.`);
  }

  async function handleArchiveSelectedPayee() {
    if (!selectedPayeeSummary || selectedPayeeSummary.payee.isArchived) {
      return;
    }

    setPayeeManagerMessage(null);
    setPayeeManagerError(null);

    const payeeName = selectedPayeeSummary.payee.name;
    await payeesPersistence.archivePayee(selectedPayeeSummary.payee.id);
    await refreshPayees();
    setPayeeManagerMessage(
      `Archived ${payeeName}. Existing transactions still keep this payee.`,
    );
  }

  async function handleRestoreSelectedPayee() {
    if (!selectedPayeeSummary || !selectedPayeeSummary.payee.isArchived) {
      return;
    }

    setPayeeManagerMessage(null);
    setPayeeManagerError(null);

    const payeeName = selectedPayeeSummary.payee.name;
    await payeesPersistence.restorePayee(selectedPayeeSummary.payee.id);
    await refreshPayees();
    setPayeeManagerMessage(
      `Restored ${payeeName}. It will appear in payee suggestions again.`,
    );
  }

  async function handleMergeSelectedPayee() {
    if (!selectedPayeeSummary) {
      return;
    }

    setPayeeManagerMessage(null);
    setPayeeManagerError(null);

    if (selectedPayeeSummary.payee.isArchived) {
      setPayeeManagerError(
        "Restore this payee before merging it into another payee.",
      );
      return;
    }

    const targetSummary = activePayeeSummaries.find(
      (summary) => summary.payee.id === payeeMergeTargetId,
    );

    if (!targetSummary) {
      setPayeeManagerError("Choose an active target payee before merging.");
      return;
    }

    const sourcePayee = selectedPayeeSummary.payee;
    const targetPayee = targetSummary.payee;

    await payeesPersistence.mergePayees({
      sourcePayeeId: sourcePayee.id,
      targetPayeeId: targetPayee.id,
    });
    await scheduledTransactionsPersistence.reassignPayeeReferences({
      sourcePayeeId: sourcePayee.id,
      sourceName: sourcePayee.name,
      targetPayeeId: targetPayee.id,
      targetName: targetPayee.name,
    });
    await reassignPayeeReferences({
      sourcePayeeId: sourcePayee.id,
      sourceName: sourcePayee.name,
      targetPayeeId: targetPayee.id,
      targetName: targetPayee.name,
    });
    await refreshPayees();

    setSelectedPayeeId(targetPayee.id);
    setPayeeRenameDraft(targetPayee.name);
    setPayeeMergeTargetId("");
    setPayeeManagerMessage(
      `Merged ${sourcePayee.name} into ${targetPayee.name}. Historical references now use ${targetPayee.name}.`,
    );
  }

  return {
  // State
  payeeOptions,
  archivedPayeeOptions,
  refreshPayees,

  isPayeeManagerOpen,
  setIsPayeeManagerOpen,

  selectedPayeeId,
  setSelectedPayeeId,

  payeeRenameDraft,
  setPayeeRenameDraft,

  payeeMergeTargetId,
  setPayeeMergeTargetId,

  payeeManagerMessage,
  setPayeeManagerMessage,

  payeeManagerError,
  setPayeeManagerError,

  // Derived data
  allManagedPayees,
  payeeSummaries,
  activePayeeSummaries,
  archivedPayeeSummaries,
  selectedPayeeSummary,
  mergeTargetOptions,

  // Actions
  handleRenamePayee,
  handleArchiveSelectedPayee,
  handleRestoreSelectedPayee,
  handleMergeSelectedPayee,
};
}
