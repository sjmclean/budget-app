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
import type { BudgetCategoryView } from "./budgetViewTypes";

export const BUDGET_CATEGORY_VIRTUALIZATION_ROW_THRESHOLD = 120;
export const BUDGET_CATEGORY_VIRTUALIZATION_OVERSCAN_PX = 700;

export interface BudgetVirtualCategoryLayoutEntry {
  readonly id: string;
  readonly index: number;
  readonly offsetTop: number;
  readonly height: number;
  readonly offsetBottom: number;
}

export function estimateBudgetCategoryRowHeight(category: BudgetCategoryView): number {
  return 52 + (category.goal ? 24 : 0) + (category.isArchived ? 18 : 0);
}

export function buildBudgetVirtualCategoryLayout(
  categories: readonly BudgetCategoryView[],
  measuredHeights: ReadonlyMap<string, number>,
): readonly BudgetVirtualCategoryLayoutEntry[] {
  let offsetTop = 0;
  return categories.map((category, index) => {
    const measured = measuredHeights.get(category.id);
    const height = measured && measured > 0
      ? measured
      : estimateBudgetCategoryRowHeight(category);
    const entry = {
      id: category.id,
      index,
      offsetTop,
      height,
      offsetBottom: offsetTop + height,
    };
    offsetTop += height;
    return entry;
  });
}

export function getVisibleBudgetCategoryIndexes(
  layout: readonly BudgetVirtualCategoryLayoutEntry[],
  viewportStart: number,
  viewportEnd: number,
  overscanPx = BUDGET_CATEGORY_VIRTUALIZATION_OVERSCAN_PX,
): Set<number> {
  const start = viewportStart - overscanPx;
  const end = viewportEnd + overscanPx;
  return new Set(
    layout
      .filter((entry) => entry.offsetBottom >= start && entry.offsetTop <= end)
      .map((entry) => entry.index),
  );
}

function MeasuredBudgetCategory({
  categoryId,
  onHeight,
  onFocusChange,
  children,
}: {
  categoryId: string;
  onHeight: (categoryId: string, height: number) => void;
  onFocusChange: (categoryId: string | null) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const publish = () => {
      const height = element.getBoundingClientRect().height;
      if (height > 0) onHeight(categoryId, height);
    };

    publish();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  }, [categoryId, onHeight]);

  return (
    <div
      ref={ref}
      className="budget-virtual-category-slot"
      onFocusCapture={() => onFocusChange(categoryId)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onFocusChange(null);
        }
      }}
    >
      {children}
    </div>
  );
}

export function BudgetVirtualizedCategoryList({
  categories,
  pinnedCategoryId,
  renderCategory,
}: {
  categories: readonly BudgetCategoryView[];
  pinnedCategoryId?: string | null;
  renderCategory: (category: BudgetCategoryView) => ReactNode;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const measuredHeightsRef = useRef(new Map<string, number>());
  const [measurementRevision, setMeasurementRevision] = useState(0);
  const [viewport, setViewport] = useState({ start: 0, end: 0 });
  const [focusedCategoryId, setFocusedCategoryId] = useState<string | null>(null);
  const shouldVirtualize =
    categories.length > BUDGET_CATEGORY_VIRTUALIZATION_ROW_THRESHOLD;

  const layout = useMemo(
    () => buildBudgetVirtualCategoryLayout(categories, measuredHeightsRef.current),
    [categories, measurementRevision],
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
  }, [updateViewport, categories, measurementRevision]);

  useEffect(() => {
    if (!shouldVirtualize || typeof window === "undefined") return;
    window.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [shouldVirtualize, updateViewport]);

  const onHeight = useCallback((categoryId: string, height: number) => {
    const previous = measuredHeightsRef.current.get(categoryId);
    if (previous !== undefined && Math.abs(previous - height) < 1) return;
    measuredHeightsRef.current.set(categoryId, height);
    setMeasurementRevision((current) => current + 1);
  }, []);

  if (!shouldVirtualize) {
    return (
      <>
        {categories.map((category) => (
          <Fragment key={category.id}>{renderCategory(category)}</Fragment>
        ))}
      </>
    );
  }

  const visibleIndexes = getVisibleBudgetCategoryIndexes(
    layout,
    viewport.start,
    viewport.end,
  );
  if (pinnedCategoryId) {
    const index = categories.findIndex((category) => category.id === pinnedCategoryId);
    if (index >= 0) visibleIndexes.add(index);
  }
  if (focusedCategoryId) {
    const index = categories.findIndex((category) => category.id === focusedCategoryId);
    if (index >= 0) visibleIndexes.add(index);
  }

  return (
    <div
      ref={listRef}
      className="budget-virtual-category-list"
      data-virtualized="true"
      data-total-categories={categories.length}
    >
      {categories.map((category, index) => {
        const entry = layout[index]!;
        if (!visibleIndexes.has(index)) {
          return (
            <div
              key={category.id}
              className="budget-virtual-category-placeholder"
              style={{ height: entry.height }}
              aria-hidden="true"
            />
          );
        }

        return (
          <MeasuredBudgetCategory
            key={category.id}
            categoryId={category.id}
            onHeight={onHeight}
            onFocusChange={setFocusedCategoryId}
          >
            {renderCategory(category)}
          </MeasuredBudgetCategory>
        );
      })}
    </div>
  );
}
