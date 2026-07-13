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
