export type Shop = {
  id: string;
  name: string;
  distanceKm: number;
  etaMinutes: number;
  rating: number;
  basePrice: number;
  open: boolean;
  tags: string[];
  address: string;
};

export type Order = {
  id: string;
  shopName: string;
  status: string;
  eta: string;
  price: number;
  items: string;
  rider: string;
  progress: number;
};

export type BookingDraft = {
  service: string;
  pickupWindow: string;
  address: string;
  notes: string;
  estimatedKg: number;
};
