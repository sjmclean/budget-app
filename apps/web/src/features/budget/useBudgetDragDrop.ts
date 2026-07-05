import {
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { BudgetCategoryGroupView } from "./budgetViewTypes";
import {
  isCreditCardPaymentCategory,
  isCreditCardPaymentGroup,
} from "./creditCardPaymentCategories";
import { findCategoryLocation } from "./budgetWorkspaceSelectors";
import { getSortableEntityId, getSortableKind } from "./BudgetWorkspaceGroup";

export type BudgetDragPlacement = "before" | "after";

export interface BudgetCategoryDragMove {
  type: "category";
  activeCategoryId: string;
  targetCategoryId: string;
  placement: BudgetDragPlacement;
}

export interface BudgetGroupDragMove {
  type: "group";
  activeGroupId: string;
  targetGroupId: string;
  placement: BudgetDragPlacement;
}

export type BudgetDragMove = BudgetCategoryDragMove | BudgetGroupDragMove;

export function buildBudgetDragMove({
  activeId,
  overId,
  visibleCategoryGroups,
}: {
  activeId: string;
  overId: string | null;
  visibleCategoryGroups: BudgetCategoryGroupView[];
}): BudgetDragMove | null {
  if (!overId || activeId === overId) {
    return null;
  }

  const activeKind = getSortableKind(activeId);
  const overKind = getSortableKind(overId);

  if (activeKind === "category" && overKind === "category") {
    const activeCategoryId = getSortableEntityId(activeId);
    const targetCategoryId = getSortableEntityId(overId);

    if (
      isCreditCardPaymentCategory(activeCategoryId) ||
      isCreditCardPaymentCategory(targetCategoryId)
    ) {
      return null;
    }

    const activeLocation = findCategoryLocation(visibleCategoryGroups, activeCategoryId);
    const targetLocation = findCategoryLocation(visibleCategoryGroups, targetCategoryId);

    if (!activeLocation || !targetLocation) {
      return null;
    }

    const placement = activeLocation.groupId === targetLocation.groupId &&
      activeLocation.index < targetLocation.index
      ? "after"
      : "before";

    return {
      type: "category",
      activeCategoryId,
      targetCategoryId,
      placement,
    };
  }

  if (activeKind === "group" && overKind === "group") {
    const activeGroupId = getSortableEntityId(activeId);
    const targetGroupId = getSortableEntityId(overId);

    if (
      isCreditCardPaymentGroup(activeGroupId) ||
      isCreditCardPaymentGroup(targetGroupId)
    ) {
      return null;
    }

    const activeIndex = visibleCategoryGroups.findIndex((group) => group.id === activeGroupId);
    const targetIndex = visibleCategoryGroups.findIndex((group) => group.id === targetGroupId);

    if (activeIndex === -1 || targetIndex === -1) {
      return null;
    }

    return {
      type: "group",
      activeGroupId,
      targetGroupId,
      placement: activeIndex < targetIndex ? "after" : "before",
    };
  }

  return null;
}

export function useBudgetDragDrop({
  visibleCategoryGroups,
  moveCategoryToPosition,
  moveCategoryGroupToPosition,
}: {
  visibleCategoryGroups: BudgetCategoryGroupView[];
  moveCategoryToPosition: (
    activeCategoryId: string,
    targetCategoryId: string,
    placement: BudgetDragPlacement,
  ) => void;
  moveCategoryGroupToPosition: (
    activeGroupId: string,
    targetGroupId: string,
    placement: BudgetDragPlacement,
  ) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const move = buildBudgetDragMove({
      activeId: String(event.active.id),
      overId: event.over ? String(event.over.id) : null,
      visibleCategoryGroups,
    });

    if (!move) {
      return;
    }

    if (move.type === "category") {
      moveCategoryToPosition(move.activeCategoryId, move.targetCategoryId, move.placement);
      return;
    }

    moveCategoryGroupToPosition(move.activeGroupId, move.targetGroupId, move.placement);
  }

  return {
    sensors,
    collisionDetection: closestCenter,
    onDragEnd: handleDragEnd,
  };
}
