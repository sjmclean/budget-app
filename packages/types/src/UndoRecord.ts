export interface UndoRecord {
  id: string;
  budgetId: string;
  eventId: string;
  reverseEventPayloadJson: string;
  createdAt: Date;
}
