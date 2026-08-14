export type OverspendingPolicy = "reduce-next-month" | "carry-category";

export interface BudgetProjectionAccountFact {
  readonly id: string;
  readonly participation: "on-budget" | "off-budget";
  readonly type?: "cash" | "credit-card";
  /** Account balance immediately before fromMonth, in integer minor units. */
  readonly openingBalance?: number;
}

export interface BudgetProjectionCategoryFact {
  readonly id: string;
  readonly groupId: string;
  readonly overspendingPolicy: OverspendingPolicy;
}

export interface BudgetProjectionAssignmentFact {
  readonly month: string;
  readonly categoryId: string;
  /** Integer minor units. */
  readonly amount: number;
}

export interface BudgetProjectionOverspendingPolicyFact {
  readonly month: string;
  readonly categoryId: string;
  readonly policy: OverspendingPolicy;
}

export interface BudgetProjectionSplitFact {
  readonly id: string;
  readonly categoryId: string | null;
  readonly transferAccountId?: string | null;
  /** Signed integer minor units. */
  readonly amount: number;
}

export interface BudgetProjectionTransactionFact {
  readonly id: string;
  readonly accountId: string;
  readonly date: string;
  readonly categoryId: string | null;
  readonly transferAccountId?: string | null;
  readonly amount: number;
  readonly splits?: readonly BudgetProjectionSplitFact[];
}

export interface BudgetProjectionInput {
  readonly budgetId: string;
  readonly fromMonth: string;
  readonly throughMonth: string;
  readonly readyToAssignCategoryId?: string;
  readonly openingReadyToAssign?: number;
  /** Non-carried overspending already resolved into the opening month. */
  readonly openingPreviousOverspending?: number;
  readonly openingAvailableByCategoryId?: Readonly<Record<string, number>>;
  readonly creditCardPolicy?: "manual" | "payment-funding";
  readonly paymentCategoryIdByAccountId?: Readonly<Record<string, string>>;
  readonly accounts: readonly BudgetProjectionAccountFact[];
  readonly categories: readonly BudgetProjectionCategoryFact[];
  readonly assignments: readonly BudgetProjectionAssignmentFact[];
  /** Month-effective policy changes applied before projecting that month. */
  readonly overspendingPolicies?: readonly BudgetProjectionOverspendingPolicyFact[];
  readonly transactions: readonly BudgetProjectionTransactionFact[];
}

export interface BudgetCategoryProjection {
  readonly categoryId: string;
  readonly groupId: string;
  readonly overspendingPolicy: OverspendingPolicy;
  readonly previousAvailable: number;
  readonly assigned: number;
  readonly activity: number;
  readonly available: number;
  readonly isOverspent: boolean;
}

export interface BudgetGroupProjection {
  readonly groupId: string;
  readonly assigned: number;
  readonly activity: number;
  readonly available: number;
}

export interface BudgetMonthProjection {
  readonly budgetId: string;
  readonly month: string;
  readonly income: number;
  readonly carriedForwardReadyToAssign: number;
  readonly previousOverspending: number;
  readonly assigned: number;
  readonly activity: number;
  readonly available: number;
  readonly readyToAssign: number;
  readonly groups: readonly BudgetGroupProjection[];
  readonly categories: readonly BudgetCategoryProjection[];
}

export interface BudgetProjectionResult {
  readonly months: readonly BudgetMonthProjection[];
}

const DEFAULT_READY_TO_ASSIGN_CATEGORY_ID = "__ready_to_assign__";

/**
 * Pure, deterministic budget projection. Inputs are canonical facts and every
 * monetary value is an integer number of minor units.
 */
export function projectBudget(input: BudgetProjectionInput): BudgetProjectionResult {
  validateInput(input);
  const months = enumerateMonths(input.fromMonth, input.throughMonth);
  const accountById = new Map(input.accounts.map((account) => [account.id, account]));
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const readyToAssignCategoryId =
    input.readyToAssignCategoryId ?? DEFAULT_READY_TO_ASSIGN_CATEGORY_ID;
  const assignmentByMonthCategory = indexAssignments(input.assignments, categoryById);
  const activity = indexActivity(
    input.transactions,
    accountById,
    categoryById,
    readyToAssignCategoryId,
  );
  const paymentFundingState = (input.creditCardPolicy ?? "manual") === "payment-funding"
    ? {
        transactionsByMonth: indexTransactionsByMonth(input.transactions),
        runningAccountBalance: new Map(
          input.accounts.map((account) => [
            account.id,
            account.openingBalance ?? 0,
          ]),
        ),
      }
    : null;
  const opening = input.openingAvailableByCategoryId ?? {};
  const policyChangesByMonth = indexOverspendingPolicies(
    input.overspendingPolicies ?? [],
    categoryById,
  );
  const activePolicyByCategoryId = new Map(
    input.categories.map((category) => [category.id, category.overspendingPolicy]),
  );
  let priorReadyToAssign = input.openingReadyToAssign ?? 0;
  let priorCategoryById = new Map<string, BudgetCategoryProjection>();
  const projections: BudgetMonthProjection[] = [];

  for (const [monthIndex, month] of months.entries()) {
    for (const [categoryId, policy] of policyChangesByMonth.get(month) ?? []) {
      activePolicyByCategoryId.set(categoryId, policy);
    }
    let previousOverspending = monthIndex === 0
      ? input.openingPreviousOverspending ?? 0
      : 0;
    const stateByCategoryId = new Map(input.categories.map((category) => {
      const prior = priorCategoryById.get(category.id);
      const priorAvailable = prior?.available ?? opening[category.id] ?? 0;
      // Opening facts have already had the preceding month's policy applied.
      // Thereafter the closing policy stored on month M controls the rollover
      // into M+1, matching Actual Budget's prevSheet carryover dependency.
      const previousAvailable = prior === undefined
        ? priorAvailable
        : priorAvailable > 0 || (
          priorAvailable < 0 && prior.overspendingPolicy === "carry-category"
        )
          ? priorAvailable
          : 0;
      if (
        prior !== undefined &&
        priorAvailable < 0 &&
        prior.overspendingPolicy === "reduce-next-month"
      ) {
        previousOverspending += priorAvailable;
      }
      const assigned = assignmentByMonthCategory.get(month)?.get(category.id) ?? 0;
      return [category.id, { previousAvailable, assigned }] as const;
    }));
    const activityByCategoryId = new Map(activity.byMonthCategory.get(month) ?? []);
    if (paymentFundingState) {
      applyCreditCardPaymentFunding(
        input,
        paymentFundingState.transactionsByMonth.get(month) ?? [],
        paymentFundingState.runningAccountBalance,
        stateByCategoryId,
        activityByCategoryId,
        accountById,
        categoryById,
        readyToAssignCategoryId,
      );
    }
    const categories = input.categories.map((category) => {
      const overspendingPolicy = activePolicyByCategoryId.get(category.id)!;
      const { previousAvailable, assigned } = stateByCategoryId.get(category.id)!;
      const categoryActivity = activityByCategoryId.get(category.id) ?? 0;
      const available = previousAvailable + assigned + categoryActivity;
      return {
        categoryId: category.id,
        groupId: category.groupId,
        overspendingPolicy,
        previousAvailable,
        assigned,
        activity: categoryActivity,
        available,
        isOverspent: available < 0,
      } satisfies BudgetCategoryProjection;
    });
    const income = activity.incomeByMonth.get(month) ?? 0;
    const assigned = sum(categories.map((category) => category.assigned));
    const categoryActivity = sum(categories.map((category) => category.activity));
    const available = sum(categories.map((category) => category.available));
    const groups = projectGroups(categories);
    const carriedForwardReadyToAssign = priorReadyToAssign;
    const readyToAssign = carriedForwardReadyToAssign + previousOverspending + income - assigned;
    const projection: BudgetMonthProjection = {
      budgetId: input.budgetId,
      month,
      income,
      carriedForwardReadyToAssign,
      previousOverspending,
      assigned,
      activity: categoryActivity,
      available,
      readyToAssign,
      groups,
      categories,
    };
    assertBudgetMonthProjectionInvariants(projection);
    projections.push(projection);
    priorReadyToAssign = readyToAssign;
    priorCategoryById = new Map(categories.map((category) => [category.categoryId, category]));
  }
  return { months: projections };
}

function indexOverspendingPolicies(
  facts: readonly BudgetProjectionOverspendingPolicyFact[],
  categoryById: ReadonlyMap<string, BudgetProjectionCategoryFact>,
): Map<string, Map<string, OverspendingPolicy>> {
  const indexed = new Map<string, Map<string, OverspendingPolicy>>();
  for (const fact of facts) {
    requireMonth(fact.month);
    if (!categoryById.has(fact.categoryId)) {
      throw new Error(`Overspending policy references unknown category ${fact.categoryId}.`);
    }
    const byCategory = indexed.get(fact.month) ?? new Map<string, OverspendingPolicy>();
    if (byCategory.has(fact.categoryId)) {
      throw new Error(`Duplicate overspending policy for ${fact.categoryId} in ${fact.month}.`);
    }
    byCategory.set(fact.categoryId, fact.policy);
    indexed.set(fact.month, byCategory);
  }
  return indexed;
}

function indexTransactionsByMonth(
  transactions: readonly BudgetProjectionTransactionFact[],
): Map<string, readonly BudgetProjectionTransactionFact[]> {
  const indexed = new Map<string, BudgetProjectionTransactionFact[]>();

  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7);
    const monthly = indexed.get(month) ?? [];
    monthly.push(transaction);
    indexed.set(month, monthly);
  }

  for (const monthly of indexed.values()) {
    monthly.sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.id.localeCompare(right.id),
    );
  }

  return indexed;
}

function applyCreditCardPaymentFunding(
  input: BudgetProjectionInput,
  transactions: readonly BudgetProjectionTransactionFact[],
  runningAccountBalance: Map<string, number>,
  stateByCategoryId: ReadonlyMap<string, { previousAvailable: number; assigned: number }>,
  activityByCategoryId: Map<string, number>,
  accountById: ReadonlyMap<string, BudgetProjectionAccountFact>,
  categoryById: ReadonlyMap<string, BudgetProjectionCategoryFact>,
  readyToAssignCategoryId: string,
): void {
  if ((input.creditCardPolicy ?? "manual") !== "payment-funding") return;
  const paymentCategories = input.paymentCategoryIdByAccountId ?? {};
  const runningAvailable = new Map(
    [...stateByCategoryId].map(([categoryId, state]) => [
      categoryId,
      state.previousAvailable + state.assigned,
    ]),
  );
  const paymentDelta = new Map<string, number>();

  for (const transaction of transactions) {
    const account = accountById.get(transaction.accountId)!;
    if (account.participation !== "on-budget") continue;

    let accountBalance = runningAccountBalance.get(account.id) ?? 0;

    function applyAccountMovement(amount: number): number {
      const before = accountBalance;
      accountBalance += amount;

      if (account.type !== "credit-card" || amount >= 0) {
        return 0;
      }

      return Math.max(0, -accountBalance) - Math.max(0, -before);
    }

    if (transaction.transferAccountId) {
      const debtCreated = applyAccountMovement(transaction.amount);
      const target = accountById.get(transaction.transferAccountId);
      const paymentCategoryId = target?.type === "credit-card"
        ? paymentCategories[target.id]
        : undefined;
      if (paymentCategoryId && transaction.amount < 0) {
        addPayment(paymentCategoryId, transaction.amount);
      }
      if (target?.participation === "off-budget") {
        recordCategoryActivity(
          transaction.categoryId,
          transaction.amount,
          account,
          debtCreated,
        );
      }
      runningAccountBalance.set(account.id, accountBalance);
      continue;
    }

    const splits = transaction.splits ?? [];
    if (splits.length > 0) {
      for (const split of splits) {
        const debtCreated = applyAccountMovement(split.amount);

        if (split.transferAccountId) {
          const target = accountById.get(split.transferAccountId);
          const paymentCategoryId = target?.type === "credit-card"
            ? paymentCategories[target.id]
            : undefined;

          if (paymentCategoryId && split.amount < 0) {
            addPayment(paymentCategoryId, split.amount);
          }

          continue;
        }

        recordCategoryActivity(
          split.categoryId,
          split.amount,
          account,
          debtCreated,
        );
      }
    } else {
      const debtCreated = applyAccountMovement(transaction.amount);
      recordCategoryActivity(
        transaction.categoryId,
        transaction.amount,
        account,
        debtCreated,
      );
    }

    runningAccountBalance.set(account.id, accountBalance);
  }
  for (const [categoryId, delta] of paymentDelta) {
    activityByCategoryId.set(categoryId, (activityByCategoryId.get(categoryId) ?? 0) + delta);
  }

  function recordCategoryActivity(
    categoryId: string | null,
    amount: number,
    account: BudgetProjectionAccountFact,
    debtCreated = 0,
  ) {
    if (!categoryId || categoryId === readyToAssignCategoryId || !categoryById.has(categoryId)) return;
    const before = runningAvailable.get(categoryId) ?? 0;
    if (account.type === "credit-card") {
      const paymentCategoryId = paymentCategories[account.id];
      if (paymentCategoryId) {
        const funded = amount < 0
          ? Math.min(
              debtCreated,
              -amount,
              Math.max(0, before),
            )
          : -Math.min(
              amount,
              Math.max(0, runningAvailable.get(paymentCategoryId) ?? 0),
            );
        addPayment(paymentCategoryId, funded);
      }
    }
    runningAvailable.set(categoryId, before + amount);
  }

  function addPayment(categoryId: string, amount: number) {
    if (!categoryById.has(categoryId)) {
      throw new Error(`Credit card payment mapping references unknown category ${categoryId}.`);
    }
    paymentDelta.set(categoryId, (paymentDelta.get(categoryId) ?? 0) + amount);
    runningAvailable.set(
      categoryId,
      (runningAvailable.get(categoryId) ?? 0) + amount,
    );
  }
}

export function assertBudgetMonthProjectionInvariants(
  month: BudgetMonthProjection,
): void {
  for (const category of month.categories) {
    if (category.available !== category.previousAvailable + category.assigned + category.activity) {
      throw new Error(`Category ${category.categoryId} violates the Available invariant.`);
    }
    if (category.isOverspent !== (category.available < 0)) {
      throw new Error(`Category ${category.categoryId} violates the overspent invariant.`);
    }
  }
  if (month.assigned !== sum(month.categories.map(({ assigned }) => assigned))) {
    throw new Error(`Budget month ${month.month} violates the Assigned total invariant.`);
  }
  if (month.activity !== sum(month.categories.map(({ activity }) => activity))) {
    throw new Error(`Budget month ${month.month} violates the Activity total invariant.`);
  }
  if (month.available !== sum(month.categories.map(({ available }) => available))) {
    throw new Error(`Budget month ${month.month} violates the Available total invariant.`);
  }
  if (month.assigned !== sum(month.groups.map(({ assigned }) => assigned))) {
    throw new Error(`Budget month ${month.month} violates the group Assigned invariant.`);
  }
  if (month.activity !== sum(month.groups.map(({ activity }) => activity))) {
    throw new Error(`Budget month ${month.month} violates the group Activity invariant.`);
  }
  if (month.available !== sum(month.groups.map(({ available }) => available))) {
    throw new Error(`Budget month ${month.month} violates the group Available invariant.`);
  }
  if (
    month.readyToAssign !==
    month.carriedForwardReadyToAssign + month.previousOverspending + month.income - month.assigned
  ) {
    throw new Error(`Budget month ${month.month} violates the Ready to Assign invariant.`);
  }
}

function indexAssignments(
  assignments: readonly BudgetProjectionAssignmentFact[],
  categoryById: ReadonlyMap<string, BudgetProjectionCategoryFact>,
): Map<string, Map<string, number>> {
  const indexed = new Map<string, Map<string, number>>();
  for (const assignment of assignments) {
    requireMonth(assignment.month);
    requireMinorUnits(assignment.amount, "Assignment amount");
    if (!categoryById.has(assignment.categoryId)) {
      throw new Error(`Assignment references unknown category ${assignment.categoryId}.`);
    }
    const byCategory = indexed.get(assignment.month) ?? new Map<string, number>();
    if (byCategory.has(assignment.categoryId)) {
      throw new Error(`Duplicate assignment for ${assignment.categoryId} in ${assignment.month}.`);
    }
    byCategory.set(assignment.categoryId, assignment.amount);
    indexed.set(assignment.month, byCategory);
  }
  return indexed;
}

function indexActivity(
  transactions: readonly BudgetProjectionTransactionFact[],
  accountById: ReadonlyMap<string, BudgetProjectionAccountFact>,
  categoryById: ReadonlyMap<string, BudgetProjectionCategoryFact>,
  readyToAssignCategoryId: string,
) {
  const byMonthCategory = new Map<string, Map<string, number>>();
  const incomeByMonth = new Map<string, number>();
  const transactionIds = new Set<string>();
  for (const transaction of transactions) {
    if (transactionIds.has(transaction.id)) throw new Error(`Duplicate transaction ${transaction.id}.`);
    transactionIds.add(transaction.id);
    requireMinorUnits(transaction.amount, "Transaction amount");
    const month = requireTransactionMonth(transaction.date);
    const account = accountById.get(transaction.accountId);
    if (!account) throw new Error(`Transaction ${transaction.id} references unknown account ${transaction.accountId}.`);
    if (transaction.transferAccountId && !accountById.has(transaction.transferAccountId)) {
      throw new Error(`Transaction ${transaction.id} references unknown transfer account ${transaction.transferAccountId}.`);
    }
    if (account.participation !== "on-budget") continue;
    if (transaction.transferAccountId) {
      const target = accountById.get(transaction.transferAccountId)!;
      // Transfers between budget accounts only move cash and have no budget
      // activity. A categorised transfer out to an off-budget account is real
      // spending (for example, a mortgage payment) and must consume the
      // category on the on-budget leg. The reciprocal off-budget leg was
      // already excluded above.
      if (target.participation === "off-budget") {
        addActivity(month, transaction.categoryId, null, transaction.amount);
      }
      continue;
    }
    const splits = transaction.splits ?? [];
    if (splits.length > 0) {
      const splitIds = new Set<string>();
      for (const split of splits) {
        if (splitIds.has(split.id)) throw new Error(`Duplicate split ${split.id} on transaction ${transaction.id}.`);
        splitIds.add(split.id);
        requireMinorUnits(split.amount, "Split amount");
        if (split.transferAccountId && !accountById.has(split.transferAccountId)) {
          throw new Error(`Split ${split.id} references unknown transfer account ${split.transferAccountId}.`);
        }
        const splitTarget = split.transferAccountId
          ? accountById.get(split.transferAccountId)
          : undefined;
        addActivity(
          month,
          split.categoryId,
          splitTarget?.participation === "off-budget"
            ? null
            : split.transferAccountId,
          split.amount,
        );
      }
      if (sum(splits.map(({ amount }) => amount)) !== transaction.amount) {
        throw new Error(`Split transaction ${transaction.id} does not conserve its parent amount.`);
      }
    } else {
      addActivity(month, transaction.categoryId, null, transaction.amount);
    }
  }
  return { byMonthCategory, incomeByMonth };

  function addActivity(
    month: string,
    categoryId: string | null,
    transferAccountId: string | null | undefined,
    amount: number,
  ) {
    if (!categoryId || transferAccountId) return;
    if (categoryId === readyToAssignCategoryId) {
      incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + amount);
      return;
    }
    if (!categoryById.has(categoryId)) {
      throw new Error(`Transaction activity references unknown category ${categoryId}.`);
    }
    const byCategory = byMonthCategory.get(month) ?? new Map<string, number>();
    byCategory.set(categoryId, (byCategory.get(categoryId) ?? 0) + amount);
    byMonthCategory.set(month, byCategory);
  }
}

function validateInput(input: BudgetProjectionInput): void {
  requireMonth(input.fromMonth);
  requireMonth(input.throughMonth);
  if (input.fromMonth > input.throughMonth) throw new Error("Projection month range is reversed.");
  requireMinorUnits(input.openingReadyToAssign ?? 0, "Opening Ready to Assign");
  requireMinorUnits(
    input.openingPreviousOverspending ?? 0,
    "Opening previous overspending",
  );
  const accountIds = new Set<string>();
  for (const account of input.accounts) {
    if (accountIds.has(account.id)) throw new Error(`Duplicate account ${account.id}.`);
    accountIds.add(account.id);
  }
  const categoryIds = new Set<string>();
  for (const category of input.categories) {
    if (categoryIds.has(category.id)) throw new Error(`Duplicate category ${category.id}.`);
    categoryIds.add(category.id);
    requireMinorUnits(input.openingAvailableByCategoryId?.[category.id] ?? 0, "Opening category Available");
  }
  for (const categoryId of Object.keys(input.openingAvailableByCategoryId ?? {})) {
    if (!categoryIds.has(categoryId)) {
      throw new Error(`Opening Available references unknown category ${categoryId}.`);
    }
  }
  for (const [accountId, categoryId] of Object.entries(input.paymentCategoryIdByAccountId ?? {})) {
    const account = input.accounts.find(({ id }) => id === accountId);
    if (!account || account.type !== "credit-card") {
      throw new Error(`Credit card payment mapping references non-credit account ${accountId}.`);
    }
    if (!categoryIds.has(categoryId)) {
      throw new Error(`Credit card payment mapping references unknown category ${categoryId}.`);
    }
  }
}

function projectGroups(
  categories: readonly BudgetCategoryProjection[],
): BudgetGroupProjection[] {
  const groups = new Map<string, { assigned: number; activity: number; available: number }>();
  for (const category of categories) {
    const group = groups.get(category.groupId) ?? { assigned: 0, activity: 0, available: 0 };
    group.assigned += category.assigned;
    group.activity += category.activity;
    group.available += category.available;
    requireMinorUnits(group.assigned, `Group ${category.groupId} Assigned`);
    requireMinorUnits(group.activity, `Group ${category.groupId} Activity`);
    requireMinorUnits(group.available, `Group ${category.groupId} Available`);
    groups.set(category.groupId, group);
  }
  return [...groups].map(([groupId, totals]) => ({ groupId, ...totals }));
}

function enumerateMonths(fromMonth: string, throughMonth: string): string[] {
  const [fromYear, fromNumber] = fromMonth.split("-").map(Number);
  const [throughYear, throughNumber] = throughMonth.split("-").map(Number);
  const result: string[] = [];
  let year = fromYear!;
  let month = fromNumber!;
  while (year < throughYear! || (year === throughYear && month <= throughNumber!)) {
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) { month = 1; year += 1; }
  }
  return result;
}

function requireMonth(value: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error(`Invalid budget month ${value}.`);
  return value;
}

function requireTransactionMonth(value: string): string {
  if (
    value.length !== 10 ||
    value.charCodeAt(4) !== 45 ||
    value.charCodeAt(7) !== 45
  ) {
    throw new Error(`Invalid transaction date ${value}.`);
  }

  const y0 = value.charCodeAt(0) - 48;
  const y1 = value.charCodeAt(1) - 48;
  const y2 = value.charCodeAt(2) - 48;
  const y3 = value.charCodeAt(3) - 48;
  const m0 = value.charCodeAt(5) - 48;
  const m1 = value.charCodeAt(6) - 48;
  const d0 = value.charCodeAt(8) - 48;
  const d1 = value.charCodeAt(9) - 48;

  if (
    y0 < 0 || y0 > 9 ||
    y1 < 0 || y1 > 9 ||
    y2 < 0 || y2 > 9 ||
    y3 < 0 || y3 > 9 ||
    m0 < 0 || m0 > 9 ||
    m1 < 0 || m1 > 9 ||
    d0 < 0 || d0 > 9 ||
    d1 < 0 || d1 > 9
  ) {
    throw new Error(`Invalid transaction date ${value}.`);
  }

  const year = y0 * 1000 + y1 * 100 + y2 * 10 + y3;
  const month = m0 * 10 + m1;
  const day = d0 * 10 + d1;

  if (month < 1 || month > 12 || day < 1) {
    throw new Error(`Invalid transaction date ${value}.`);
  }

  const leap =
    year % 4 === 0 &&
    (year % 100 !== 0 || year % 400 === 0);

  const daysInMonth =
    month === 2
      ? leap ? 29 : 28
      : month === 4 ||
          month === 6 ||
          month === 9 ||
          month === 11
        ? 30
        : 31;

  if (day > daysInMonth) {
    throw new Error(`Invalid transaction date ${value}.`);
  }

  return value.slice(0, 7);
}

function requireMinorUnits(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must use safe integer minor units.`);
}

function sum(values: readonly number[]): number {
  const result = values.reduce((total, value) => total + value, 0);
  requireMinorUnits(result, "Money total");
  return result;
}
