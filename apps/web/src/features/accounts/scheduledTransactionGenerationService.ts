import type { AppPersistenceGateway } from "../persistence/appPersistenceGateway";
import type { NewRegisterTransactionInput, RegisterSplitLineView, RegisterTransactionView } from "./accountRegisterTypes";
import {
  shouldSkipOccurrence,
  type ScheduledTransactionView,
} from "./scheduledTransactionService";

const MAX_OCCURRENCES_PER_RUN = 120;

const generationInFlightByGateway = new WeakMap<
  AppPersistenceGateway,
  Promise<ScheduledTransactionGenerationResult>
>();

export interface ScheduledTransactionGenerationInput {
  today?: string;
}

export interface ScheduledTransactionGenerationCreatedTransaction {
  accountId: string;
  scheduledTransactionId: string;
  occurrenceDate: string;
  payee: string;
}

export interface ScheduledTransactionGenerationResult {
  createdTransactions: ScheduledTransactionGenerationCreatedTransaction[];
  advancedScheduleIds: string[];
  skippedDuplicateOccurrences: ScheduledTransactionGenerationCreatedTransaction[];
  warnings: string[];
}

export function generateDueScheduledTransactions(
  gateway: AppPersistenceGateway,
  input: ScheduledTransactionGenerationInput = {},
): Promise<ScheduledTransactionGenerationResult> {
  const existing = generationInFlightByGateway.get(gateway);
  if (existing) {
    return existing;
  }

  const run = generateDueScheduledTransactionsInternal(gateway, input);
  generationInFlightByGateway.set(gateway, run);
  const clearInFlightRun = () => {
    if (generationInFlightByGateway.get(gateway) === run) {
      generationInFlightByGateway.delete(gateway);
    }
  };
  void run.then(clearInFlightRun, clearInFlightRun);
  return run;
}

async function generateDueScheduledTransactionsInternal(
  gateway: AppPersistenceGateway,
  input: ScheduledTransactionGenerationInput,
): Promise<ScheduledTransactionGenerationResult> {
  const today = normaliseIsoDate(input.today ?? new Date().toISOString().slice(0, 10));
  const accounts = await gateway.accounts.listAccounts();
  const result: ScheduledTransactionGenerationResult = {
    createdTransactions: [],
    advancedScheduleIds: [],
    skippedDuplicateOccurrences: [],
    warnings: [],
  };

  for (const account of accounts) {
    let guard = 0;
    let schedules = await gateway.scheduledTransactions.listByAccount(account.id);

    while (guard < MAX_OCCURRENCES_PER_RUN) {
      guard += 1;
      const dueSchedule = schedules.find((schedule) => isDue(schedule, today));

      if (!dueSchedule) {
        break;
      }

      const occurrenceDate = dueSchedule.nextDueDate;
      const anchorDate = dueSchedule.recurrenceAnchorDate ?? occurrenceDate;
      const skipOccurrence = shouldSkipOccurrence(
        anchorDate,
        dueSchedule.weekendPolicy ?? "same-day",
      );
      const existingRegister = skipOccurrence
        ? null
        : await gateway.accountRegisters.getAccountRegisterView({
            accountId: dueSchedule.accountId,
          });
      const alreadyExists = existingRegister?.transactions.some((transaction) =>
        isExistingScheduledOccurrence(transaction, dueSchedule, occurrenceDate),
      ) ?? false;

      if (skipOccurrence) {
        // The recurrence still exists and counts toward its end condition; only
        // materialisation is suppressed for this anchored occurrence.
      } else if (alreadyExists) {
        result.skippedDuplicateOccurrences.push({
          accountId: dueSchedule.accountId,
          scheduledTransactionId: dueSchedule.id,
          occurrenceDate,
          payee: dueSchedule.payee,
        });
      } else {
        const registerInput = createGeneratedRegisterTransaction(
          gateway.scheduledTransactions.toRegisterInput(dueSchedule),
          dueSchedule,
          occurrenceDate,
        );

        await gateway.accountRegisters.addTransaction({
          accountId: dueSchedule.accountId,
          transaction: registerInput,
        });

        result.createdTransactions.push({
          accountId: dueSchedule.accountId,
          scheduledTransactionId: dueSchedule.id,
          occurrenceDate,
          payee: dueSchedule.payee,
        });
      }

      await gateway.scheduledTransactions.advanceAfterEnter(
        dueSchedule.accountId,
        dueSchedule.id,
      );
      result.advancedScheduleIds.push(dueSchedule.id);

      schedules = await gateway.scheduledTransactions.listByAccount(account.id);
    }

    if (guard >= MAX_OCCURRENCES_PER_RUN) {
      result.warnings.push(
        `Stopped scheduled transaction generation for ${account.name} after ${MAX_OCCURRENCES_PER_RUN} occurrences to avoid an infinite loop.`,
      );
    }
  }

  return result;
}


function isExistingScheduledOccurrence(
  transaction: RegisterTransactionView,
  schedule: ScheduledTransactionView,
  occurrenceDate: string,
): boolean {
  if (
    transaction.generatedFromSchedule === true &&
    transaction.scheduledTransactionId === schedule.id &&
    transaction.scheduledOccurrenceDate === occurrenceDate
  ) {
    return true;
  }

  if (transaction.date !== occurrenceDate) {
    return false;
  }

  if (normaliseText(transaction.payee) !== normaliseText(schedule.payee)) {
    return false;
  }

  if (!moneyEqual(transaction.inflow, schedule.inflow)) {
    return false;
  }

  if (!moneyEqual(transaction.outflow, schedule.outflow)) {
    return false;
  }

  return splitLinesMatch(transaction.splitLines, schedule.splitLines);
}

function splitLinesMatch(
  transactionLines: RegisterSplitLineView[] | undefined,
  scheduleLines: RegisterSplitLineView[] | undefined,
): boolean {
  const left = transactionLines ?? [];
  const right = scheduleLines ?? [];

  if (left.length !== right.length) {
    return false;
  }

  return left.every((line, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }

    return (
      normaliseText(line.category) === normaliseText(other.category) &&
      (line.categoryId ?? "") === (other.categoryId ?? "") &&
      moneyEqual(line.inflow, other.inflow) &&
      moneyEqual(line.outflow, other.outflow)
    );
  });
}

function normaliseText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function moneyEqual(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

function createGeneratedRegisterTransaction(
  input: NewRegisterTransactionInput,
  schedule: ScheduledTransactionView,
  occurrenceDate: string,
): NewRegisterTransactionInput {
  return {
    ...input,
    date: occurrenceDate,
    generatedFromSchedule: true,
    scheduledTransactionId: schedule.id,
    scheduledOccurrenceDate: occurrenceDate,
  };
}

function isDue(schedule: ScheduledTransactionView, today: string): boolean {
  return Boolean(schedule.nextDueDate) && schedule.nextDueDate <= today;
}

function normaliseIsoDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}
