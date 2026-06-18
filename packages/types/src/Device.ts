export interface Device {
  id: string;
  userId: string;
  name: string;
  fingerprint: string;
  trusted: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
}
