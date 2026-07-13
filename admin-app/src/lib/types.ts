export type RequestStatus = "Pending" | "Confirmed" | "Scheduled" | "Collected" | "Rejected" | "Converted";

export type RequestRow = {
  id: string;
  request_no: string;
  customer_name: string;
  phone: string;
  item_type: string;
  quantity: number;
  unit: string;
  loads: number;
  place: string;
  total: number;
  status: RequestStatus;
  delivery_requested: boolean;
  full_address: string;
  created_at: string;
};

export type OrderStatus = "Received" | "Washing" | "Drying" | "Ready" | "Claimed";

export type OrderRow = {
  id: string;
  receipt_no: string;
  service_type: string;
  quantity: number;
  unit: string;
  loads: number;
  place: string;
  total: number;
  status: OrderStatus;
  payment_status: "Paid" | "Unpaid";
  payment_method: string | null;
  created_at: string;
  customers: { name: string; phone: string | null } | null;
};
