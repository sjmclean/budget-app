export interface CategoryGroupSettings {
  id: string;
  categoryGroupId: string;
  notes: string | null;
  hidden: boolean;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}
