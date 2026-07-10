export type LaundryTypeId = "regular" | "blanket" | "comforter" | "sheets";

export type LaundryType = {
  id: LaundryTypeId;
  label: string;
  unit: "kg" | "pc";
  capacity: number;
  category: string;
};

export type DeliveryOptionId = "none" | "mplace" | "portovita" | "manhattan" | "cubao" | "outsideCubao";

export type DeliveryOption = {
  id: DeliveryOptionId;
  label: string;
  fee: number;
};

export type PaymentMethod = "Cash" | "GCash" | "Maya" | "Bank Transfer";

export type OrderStatus = "Received" | "Washing" | "Drying" | "Ready" | "Claimed";

export type Order = {
  id: string;
  laundryType: LaundryTypeId;
  quantity: number;
  loads: number;
  status: OrderStatus;
  paymentStatus: "Paid" | "Unpaid";
  paymentMethod: PaymentMethod;
  delivery: number;
  amount: number;
  notes?: string;
};

export type BookingDraft = {
  laundryType: LaundryTypeId;
  quantity: number;
  delivery: DeliveryOptionId;
  address: string;
  pickupWindow: string;
  paymentMethod: PaymentMethod;
  notes: string;
};
