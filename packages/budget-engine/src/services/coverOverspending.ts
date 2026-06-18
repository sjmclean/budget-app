import { CategoryMonth } from "../../../types/src/CategoryMonth.js";
import { calculateAvailable } from "../calculations/calculateAvailable.js";

export interface CoverOverspendingResult {
  overspentCategoryMonth: CategoryMonth;
  coveringCategoryMonth: CategoryMonth;
}

export function coverOverspending(
  overspentCategoryMonth: CategoryMonth,
  coveringCategoryMonth: CategoryMonth,
  amount: number,
): CoverOverspendingResult {
  if (amount <= 0) throw new Error("Cover amount must be positive");
  if (overspentCategoryMonth.available >= 0)
    throw new Error("Category is not overspent");
  if (coveringCategoryMonth.available < amount)
    throw new Error("Covering category has insufficient available funds");

  const updatedOverspentAssigned = overspentCategoryMonth.assigned + amount;
  const updatedCoveringAssigned = coveringCategoryMonth.assigned - amount;

  return {
    overspentCategoryMonth: {
      ...overspentCategoryMonth,
      assigned: updatedOverspentAssigned,
      available: calculateAvailable(
        overspentCategoryMonth.previousAvailable,
        updatedOverspentAssigned,
        overspentCategoryMonth.activity,
      ),
      updatedAt: new Date(),
    },
    coveringCategoryMonth: {
      ...coveringCategoryMonth,
      assigned: updatedCoveringAssigned,
      available: calculateAvailable(
        coveringCategoryMonth.previousAvailable,
        updatedCoveringAssigned,
        coveringCategoryMonth.activity,
      ),
      updatedAt: new Date(),
    },
  };
}
