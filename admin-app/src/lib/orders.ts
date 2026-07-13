import { supabase } from "./supabase";
import type { OrderRow, OrderStatus, RequestRow } from "./types";

const REQUEST_FIELDS =
  "id,request_no,customer_name,phone,item_type,quantity,unit,loads,place,total,status,delivery_requested,full_address,created_at";

const ORDER_FIELDS =
  "id,receipt_no,service_type,quantity,unit,loads,place,total,status,payment_status,payment_method,created_at,customers(name,phone)";

export async function fetchPendingRequests(): Promise<RequestRow[]> {
  const { data, error } = await supabase
    .from("customer_order_requests")
    .select(REQUEST_FIELDS)
    .eq("status", "Pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as RequestRow[];
}

export async function fetchActiveOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_FIELDS)
    .neq("status", "Claimed")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as OrderRow[];
}

export async function confirmRequest(requestId: string) {
  const { error } = await supabase.rpc("confirm_customer_request", { p_request_id: requestId });
  if (error) throw error;
}

export async function rejectRequest(requestId: string) {
  const { error } = await supabase.from("customer_order_requests").update({ status: "Rejected" }).eq("id", requestId);
  if (error) throw error;
}

export async function advanceOrderStatus(orderId: string, status: OrderStatus) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw error;
}
