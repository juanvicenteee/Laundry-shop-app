import { supabase } from "./supabase";
import type { OrderRow, OrderStatus, RequestRow } from "./types";

const REQUEST_FIELDS =
  "id,request_no,customer_name,phone,item_type,quantity,unit,loads,place,total,status,delivery_requested,full_address,created_at";

const ORDER_FIELDS =
  "id,receipt_no,customer_id,service_type,place,quantity,unit,loads,total,status,payment_status,payment_method,is_void,void_reason,created_at,customers(name,phone)";

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

export async function fetchAllOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase.from("orders").select(ORDER_FIELDS).order("created_at", { ascending: false });

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

export async function advanceOrderStatus(orderId: string, status: OrderStatus, updatedBy: string) {
  const { error } = await supabase.from("orders").update({ status, updated_by: updatedBy }).eq("id", orderId);
  if (error) throw error;
}

export async function togglePaymentStatus(order: Pick<OrderRow, "id" | "payment_status">, updatedBy: string) {
  const next = order.payment_status === "Paid" ? "Unpaid" : "Paid";
  const { error } = await supabase.from("orders").update({ payment_status: next, updated_by: updatedBy }).eq("id", order.id);
  if (error) throw error;
}

export async function voidOrder(orderId: string, reason: string, voidedBy: string) {
  const { error } = await supabase
    .from("orders")
    .update({
      is_void: true,
      void_reason: reason,
      voided_at: new Date().toISOString(),
      voided_by: voidedBy,
      updated_by: voidedBy
    })
    .eq("id", orderId);
  if (error) throw error;
}
