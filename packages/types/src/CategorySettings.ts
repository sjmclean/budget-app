export interface CategorySettings {
  id: string;
  categoryId: string;
  colour: string | null;
  hidden: boolean;
  pinned: boolean;
  notes: string | null;
  goalDisplayMode: string;
  createdAt: Date;
  updatedAt: Date;
}
