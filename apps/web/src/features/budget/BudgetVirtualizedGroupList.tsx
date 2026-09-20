import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BudgetCategoryGroupView } from "./budgetViewTypes";

export const BUDGET_GROUP_VIRTUALIZATION_CATEGORY_THRESHOLD = 250;
export const BUDGET_GROUP_VIRTUALIZATION_OVERSCAN_PX = 800;

export interface BudgetVirtualGroupLayoutEntry {
  readonly id: string;
  readonly index: number;
  readonly offsetTop: number;
  readonly height: number;
  readonly offsetBottom: number;
}

export function estimateBudgetGroupHeight(
  group: BudgetCategoryGroupView,
  isCollapsed: boolean,
): number {
  if (isCollapsed) return 48;
  return 48 + group.categories.reduce((height, category) => {
    const goalHeight = category.goal ? 24 : 0;
    const archivedContextHeight = category.isArchived ? 18 : 0;
    return height + 52 + goalHeight + archivedContextHeight;
  }, 0);
}

export function buildBudgetVirtualGroupLayout(
  groups: readonly BudgetCategoryGroupView[],
  isGroupCollapsed: (group: BudgetCategoryGroupView) => boolean,
  measuredHeights: ReadonlyMap<string, number>,
): readonly BudgetVirtualGroupLayoutEntry[] {
  let offsetTop = 0;
  return groups.map((group, index) => {
    const measured = measuredHeights.get(group.id);
    const height = measured && measured > 0
      ? measured
      : estimateBudgetGroupHeight(group, isGroupCollapsed(group));
    const entry = {
      id: group.id,
      index,
      offsetTop,
      height,
      offsetBottom: offsetTop + height,
    };
    offsetTop += height;
    return entry;
  });
}

export function getVisibleBudgetGroupIndexes(
  layout: readonly BudgetVirtualGroupLayoutEntry[],
  viewportStart: number,
  viewportEnd: number,
  overscanPx = BUDGET_GROUP_VIRTUALIZATION_OVERSCAN_PX,
): ReadonlySet<number> {
  const start = viewportStart - overscanPx;
  const end = viewportEnd + overscanPx;
  return new Set(
    layout
      .filter((entry) => entry.offsetBottom >= start && entry.offsetTop <= end)
      .map((entry) => entry.index),
  );
}

function MeasuredBudgetGroup({
  groupId,
  onHeight,
  children,
}: {
  groupId: string;
  onHeight: (groupId: string, height: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const publish = () => {
      const height = element.getBoundingClientRect().height;
      if (height > 0) onHeight(groupId, height);
    };

    publish();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  }, [groupId, onHeight]);

  return (
    <div ref={ref} className="budget-virtual-group-slot">
      {children}
    </div>
  );
}

export function BudgetVirtualizedGroupList({
  groups,
  isGroupCollapsed,
  pinnedGroupIds,
  renderGroup,
}: {
  groups: readonly BudgetCategoryGroupView[];
  isGroupCollapsed: (group: BudgetCategoryGroupView) => boolean;
  pinnedGroupIds?: ReadonlySet<string>;
  renderGroup: (group: BudgetCategoryGroupView) => ReactNode;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const measuredHeightsRef = useRef(new Map<string, number>());
  const [measurementRevision, setMeasurementRevision] = useState(0);
  const [viewport, setViewport] = useState({ start: 0, end: 0 });

  const expandedCategoryCount = useMemo(
    () => groups.reduce(
      (count, group) => count + (isGroupCollapsed(group) ? 0 : group.categories.length),
      0,
    ),
    [groups, isGroupCollapsed],
  );
  const shouldVirtualize =
    expandedCategoryCount > BUDGET_GROUP_VIRTUALIZATION_CATEGORY_THRESHOLD &&
    groups.length > 3;

  const layout = useMemo(
    () => buildBudgetVirtualGroupLayout(
      groups,
      isGroupCollapsed,
      measuredHeightsRef.current,
    ),
    [groups, isGroupCollapsed, measurementRevision],
  );

  const updateViewport = useCallback(() => {
    if (!shouldVirtualize || typeof window === "undefined") return;
    const element = listRef.current;
    if (!element) return;
    const listTop = element.getBoundingClientRect().top + window.scrollY;
    setViewport({
      start: Math.max(0, window.scrollY - listTop),
      end: Math.max(0, window.scrollY - listTop) + window.innerHeight,
    });
  }, [shouldVirtualize]);

  useLayoutEffect(() => {
    updateViewport();
  }, [updateViewport, groups, measurementRevision]);

  useEffect(() => {
    if (!shouldVirtualize || typeof window === "undefined") return;
    window.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [shouldVirtualize, updateViewport]);

  const onHeight = useCallback((groupId: string, height: number) => {
    const previous = measuredHeightsRef.current.get(groupId);
    if (previous !== undefined && Math.abs(previous - height) < 1) return;
    measuredHeightsRef.current.set(groupId, height);
    setMeasurementRevision((current) => current + 1);
  }, []);

  if (!shouldVirtualize) {
    return <>{groups.map((group) => <Fragment key={group.id}>{renderGroup(group)}</Fragment>)}</>;
  }

  const visibleIndexes = getVisibleBudgetGroupIndexes(
    layout,
    viewport.start,
    viewport.end,
  );
  for (const groupId of pinnedGroupIds ?? []) {
    const index = groups.findIndex((group) => group.id === groupId);
    if (index >= 0) visibleIndexes.add(index);
  }

  return (
    <div
      ref={listRef}
      className="budget-virtual-group-list"
      data-virtualized="true"
      data-total-groups={groups.length}
      data-expanded-categories={expandedCategoryCount}
    >
      {groups.map((group, index) => {
        const entry = layout[index]!;
        if (!visibleIndexes.has(index)) {
          return (
            <div
              key={group.id}
              className="budget-virtual-group-placeholder"
              style={{ height: entry.height }}
              aria-hidden="true"
            />
          );
        }
        return (
          <MeasuredBudgetGroup
            key={group.id}
            groupId={group.id}
            onHeight={onHeight}
          >
            {renderGroup(group)}
          </MeasuredBudgetGroup>
        );
      })}
    </div>
  );
}
