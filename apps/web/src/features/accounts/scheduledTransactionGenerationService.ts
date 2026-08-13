import type { BudgetPersistenceProvider } from "../persistence/budgetPersistenceProvider";
import type { NewRegisterTransactionInput, RegisterSplitLineView, RegisterTransactionView } from "./accountRegisterTypes";
import type {
  ScheduledTransactionView,
} from "./scheduledTransactionTypes";
import {
  shouldSkipOccurrence,
} from "./scheduledTransactionRecurrence";
import { localCalendarDate, normaliseLocalCalendarDate } from "../dates/localCalendarDate";

const MAX_OCCURRENCES_PER_RUN = 120;

const generationInFlightByGateway = new WeakMap<
  BudgetPersistenceProvider,
  {
    readonly scope: string;
    readonly promise: Promise<ScheduledTransactionGenerationResult>;
  }
>();
const generationResultByGateway = new WeakMap<
  BudgetPersistenceProvider,
  {
    readonly day: string;
    readonly scope: string;
    readonly completedAt: number;
    readonly result: ScheduledTransactionGenerationResult;
  }
>();
const GENERATION_CACHE_MS = 5 * 60_000;

export interface ScheduledTransactionGenerationInput {
  today?: string;
  force?: boolean;
  scope?: string;
  listAccounts?: () => Promise<readonly { readonly id: string; readonly name: string }[]>;
  hostedTransactions?: {
    listRecent(accountId: string): Promise<readonly RegisterTransactionView[]>;
    add(accountId: string, transaction: NewRegisterTransactionInput): Promise<void>;
    repairExisting?(
      accountId: string,
      existingTransaction: RegisterTransactionView,
      transaction: NewRegisterTransactionInput,
    ): Promise<void>;
  };
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
  gateway: BudgetPersistenceProvider,
  input: ScheduledTransactionGenerationInput = {},
): Promise<ScheduledTransactionGenerationResult> {
  const today = normaliseLocalCalendarDate(input.today ?? localCalendarDate());
  const scope = input.scope?.trim() ?? "";
  const cached = generationResultByGateway.get(gateway);
  if (
    !input.force &&
    cached?.day === today &&
    cached.scope === scope &&
    Date.now() - cached.completedAt < GENERATION_CACHE_MS
  ) {
    return Promise.resolve(cached.result);
  }
  const existing = generationInFlightByGateway.get(gateway);
  if (existing?.scope === scope) {
    return existing.promise;
  }

  const run = generateDueScheduledTransactionsInternal(gateway, {
    ...input,
    today,
  });
  generationInFlightByGateway.set(gateway, { scope, promise: run });
  const clearInFlightRun = () => {
    if (generationInFlightByGateway.get(gateway)?.promise === run) {
      generationInFlightByGateway.delete(gateway);
    }
  };
  void run.then((result) => {
    generationResultByGateway.set(gateway, {
      day: today,
      scope,
      completedAt: Date.now(),
      result,
    });
    clearInFlightRun();
  }, clearInFlightRun);
  return run;
}

async function generateDueScheduledTransactionsInternal(
  gateway: BudgetPersistenceProvider,
  input: ScheduledTransactionGenerationInput,
): Promise<ScheduledTransactionGenerationResult> {
  const today = normaliseLocalCalendarDate(input.today ?? localCalendarDate());
  const accounts = input.listAccounts
    ? await input.listAccounts()
    : await gateway.accounts.listAccounts();
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
      const existingTransactions = skipOccurrence
        ? []
        : input.hostedTransactions
          ? await input.hostedTransactions.listRecent(dueSchedule.accountId)
          : (await gateway.accountRegisters.getAccountRegisterView({
              accountId: dueSchedule.accountId,
            })).transactions;
      const existingOccurrence = existingTransactions.find((transaction) =>
        isExistingScheduledOccurrence(transaction, dueSchedule, occurrenceDate),
      );
      const alreadyExists = Boolean(existingOccurrence);

      if (skipOccurrence) {
        // The recurrence still exists and counts toward its end condition; only
        // materialisation is suppressed for this anchored occurrence.
      } else if (alreadyExists) {
        if (
          existingOccurrence &&
          input.hostedTransactions?.repairExisting &&
          isExactGeneratedScheduledOccurrence(
            existingOccurrence,
            dueSchedule,
            occurrenceDate,
          )
        ) {
          const registerInput = createGeneratedRegisterTransaction(
            gateway.scheduledTransactions.toRegisterInput(dueSchedule),
            dueSchedule,
            occurrenceDate,
          );

          await input.hostedTransactions.repairExisting(
            dueSchedule.accountId,
            existingOccurrence,
            registerInput,
          );
        }

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

        if (input.hostedTransactions) {
          await input.hostedTransactions.add(dueSchedule.accountId, registerInput);
        } else {
          await gateway.accountRegisters.addTransaction({
            accountId: dueSchedule.accountId,
            transaction: registerInput,
          });
        }

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


function isExactGeneratedScheduledOccurrence(
  transaction: RegisterTransactionView,
  schedule: ScheduledTransactionView,
  occurrenceDate: string,
): boolean {
  return (
    transaction.generatedFromSchedule === true &&
    transaction.scheduledTransactionId === schedule.id &&
    transaction.scheduledOccurrenceDate === occurrenceDate
  );
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
