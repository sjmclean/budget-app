export enum OverspendingDecisionType {
  Cover = "Cover",
  LeaveOverspent = "LeaveOverspent",
}

export interface OverspendingDecision {
  type: OverspendingDecisionType;
  categoryMonthId: string;
  amount: number;
  coveringCategoryMonthId?: string;
}
