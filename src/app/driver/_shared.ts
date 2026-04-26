export interface TripRecord {
  id: string;
  pickup: string;
  destination: string;
  price: number;
  status: string;
  createdAt: { seconds: number } | Date | null;
}
