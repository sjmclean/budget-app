export interface UserSettings {
  id: string;
  userId: string;
  defaultBudgetId: string | null;
  theme: string;
  language: string;
  dateFormat: string;
  numberFormat: string;
  currency: string;
  firstDayOfWeek: number;
  privacyMode: boolean;
  sidebarCollapsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}
