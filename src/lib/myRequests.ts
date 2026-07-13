import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "./supabase";

const LAST_PHONE_KEY = "bubblyfi.lastPhone";

export type MyRequest = {
  id: string;
  request_no: string;
  item_type: string;
  quantity: number;
  unit: string;
  loads: number;
  place: string;
  total: number;
  status: string;
  delivery_requested: boolean;
  full_address: string;
  pickup_at: string | null;
  created_at: string;
  order_status: string | null;
  receipt_no: string | null;
};

export async function rememberPhone(phone: string) {
  await AsyncStorage.setItem(LAST_PHONE_KEY, phone);
}

export async function getRememberedPhone(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_PHONE_KEY);
}

export async function fetchMyRequests(phone: string): Promise<MyRequest[]> {
  const { data, error } = await supabase.rpc("get_my_requests", { p_phone: phone });
  if (error) throw error;
  return (data ?? []) as MyRequest[];
}
