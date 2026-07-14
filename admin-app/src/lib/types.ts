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
  customer_id: string;
  service_type: string;
  place: string;
  quantity: number;
  unit: string;
  loads: number;
  total: number;
  status: OrderStatus;
  payment_status: "Paid" | "Unpaid";
  payment_method: string | null;
  is_void: boolean;
  void_reason: string | null;
  created_at: string;
  customers: { name: string; phone: string | null } | null;
};

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  default_place: "cubao" | "mplace" | "outside";
  notes: string | null;
  is_archived: boolean;
};

export type CustomerWithStats = CustomerRow & {
  orderCount: number;
  totalSpent: number;
};

export type InventoryCategory = "Detergent" | "Fabric conditioner" | "Packaging" | "Maintenance" | "Other";

export type InventoryRow = {
  id: string;
  name: string;
  category: InventoryCategory;
  stock: number;
  reorder_level: number;
  unit_cost: number;
  customer_price_per_load: number;
  consumption_per_load: number;
  is_active: boolean;
};
