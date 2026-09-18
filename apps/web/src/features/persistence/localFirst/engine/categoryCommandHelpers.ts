import type { BudgetMonthView } from "../../../budget/budgetViewTypes";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";

export function mutateBudgetCategory(
  view: BudgetMonthView,
  input: { readonly operation: string; readonly [key: string]: unknown },
): BudgetMonthView {
  let groups = view.categoryGroups.map((group) => ({
    ...group,
    categories: group.categories.map((category) => ({ ...category })),
  }));
  const categoryId = String(input.categoryId ?? "");
  const groupId = String(input.groupId ?? "");
  if (input.operation === "create") {
    let group = groups.find(({ id }) => id === groupId);
    if (!group) {
      group = {
        id: groupId || createRuntimeUuid(),
        name: String(input.groupName ?? "New group"),
        previousAvailable: 0, assigned: 0, activity: 0, available: 0,
        note: "", categories: [],
      };
      groups = [...groups, group];
    }
    group.categories.push({
      id: categoryId || createRuntimeUuid(),
      name: String(input.name ?? "New category"),
      previousAvailable: 0, assigned: 0, activity: 0, available: 0,
      isOverspent: false, isArchived: false, note: "",
    });
  }
  if (["rename", "archive", "overspending", "category-note"].includes(input.operation)) {
    groups = groups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => category.id !== categoryId
        ? category
        : {
            ...category,
            ...(input.operation === "rename" ? { name: String(input.name) } : {}),
            ...(input.operation === "archive" ? { isArchived: Boolean(input.isArchived) } : {}),
            ...(input.operation === "overspending"
              ? { overspendingHandling: input.overspendingHandling as "reduce-next-month" | "carry-category" }
              : {}),
            ...(input.operation === "category-note" ? { note: String(input.note ?? "") } : {}),
          }),
    }));
  }
  if (input.operation === "group-note") {
    groups = groups.map((group) => group.id === groupId
      ? { ...group, note: String(input.note ?? "") }
      : group);
  }
  if (input.operation === "move-category") {
    groups = groups.map((group) => ({
      ...group,
      categories: moveByDirection(group.categories, categoryId, String(input.direction)),
    }));
  }
  if (input.operation === "move-group") {
    groups = moveByDirection(groups, groupId, String(input.direction));
  }
  if (input.operation === "position-category") {
    groups = moveBudgetCategoryToTarget(
      groups,
      categoryId,
      input.targetCategoryId === undefined ? undefined : String(input.targetCategoryId),
      String(input.placement),
      input.targetGroupId === undefined ? undefined : String(input.targetGroupId),
    );
  }
  if (input.operation === "position-group") {
    groups = moveToTarget(
      groups, groupId, String(input.targetGroupId), String(input.placement),
    );
  }
  if (input.operation === "merge") {
    const targetId = String(input.targetCategoryId);
    const source = groups.flatMap(({ categories }) => categories)
      .find(({ id }) => id === categoryId);
    if (source) {
      groups = groups.map((group) => ({
        ...group,
        categories: group.categories
          .filter(({ id }) => id !== categoryId)
          .map((category) => category.id === targetId ? {
            ...category,
            previousAvailable: category.previousAvailable + source.previousAvailable,
            assigned: category.assigned + source.assigned,
            activity: category.activity + source.activity,
            available: category.available + source.available,
          } : category),
      }));
    }
  }
  return { ...view, categoryGroups: groups };
}

export function moveBudgetCategoryToTarget<
  TGroup extends {
    readonly id: string;
    readonly categories: readonly TCategory[];
  },
  TCategory extends { readonly id: string },
>(
  groups: readonly TGroup[],
  categoryId: string,
  targetCategoryId: string | undefined,
  placement: string,
  targetGroupId?: string,
): TGroup[] {
  if (targetCategoryId && categoryId === targetCategoryId) {
    return groups.map((group) => ({
      ...group,
      categories: [...group.categories],
    }));
  }

  let categoryToMove: TCategory | undefined;
  const withoutSource = groups.map((group) => {
    const source = group.categories.find((category) => category.id === categoryId);
    if (!source) return { ...group, categories: [...group.categories] };
    categoryToMove = source;
    return {
      ...group,
      categories: group.categories.filter((category) => category.id !== categoryId),
    };
  });
  if (!categoryToMove) return withoutSource;

  let inserted = false;
  const moved = withoutSource.map((group) => {
    if (!targetCategoryId && group.id === targetGroupId) {
      inserted = true;
      return { ...group, categories: [...group.categories, categoryToMove!] };
    }
    const targetIndex = group.categories.findIndex((category) => category.id === targetCategoryId);
    if (targetIndex < 0) return group;
    const categories = [...group.categories];
    categories.splice(targetIndex + (placement === "after" ? 1 : 0), 0, categoryToMove!);
    inserted = true;
    return { ...group, categories };
  });
  if (inserted) return moved;

  return groups.map((group) => ({ ...group, categories: [...group.categories] }));
}

function moveByDirection<T extends { readonly id: string }>(
  values: readonly T[], id: string, direction: string,
): T[] {
  const next = [...values];
  const index = next.findIndex((value) => value.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index >= 0 && target >= 0 && target < next.length) {
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

function moveToTarget<T extends { readonly id: string }>(
  values: readonly T[], id: string, targetId: string, placement: string,
): T[] {
  const item = values.find((value) => value.id === id);
  if (!item || id === targetId) return [...values];
  const next = values.filter((value) => value.id !== id);
  const target = next.findIndex((value) => value.id === targetId);
  if (target < 0) return [...values];
  next.splice(target + (placement === "after" ? 1 : 0), 0, item);
  return next;
}
