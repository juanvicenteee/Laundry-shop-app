import { supabase } from "./supabase";
import type { InventoryCategory, InventoryRow } from "./types";

const INVENTORY_FIELDS = "id,name,category,stock,reorder_level,unit_cost,customer_price_per_load,consumption_per_load,is_active";

export async function fetchInventory(): Promise<InventoryRow[]> {
  const { data, error } = await supabase.from("inventory").select(INVENTORY_FIELDS).order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InventoryRow[];
}

export type InventoryInput = {
  name: string;
  category: InventoryCategory;
  stock: number;
  reorder_level: number;
  unit_cost: number;
  customer_price_per_load: number;
  consumption_per_load: number;
};

export async function saveInventoryItem(input: InventoryInput, profileId: string, existingId?: string) {
  if (existingId) {
    const { error } = await supabase
      .from("inventory")
      .update({ ...input, updated_by: profileId })
      .eq("id", existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("inventory").insert({ ...input, created_by: profileId });
    if (error) throw error;
  }
}

export async function setInventoryActive(itemId: string, active: boolean, profileId: string) {
  const { error } = await supabase
    .from("inventory")
    .update({ is_active: active, updated_by: profileId })
    .eq("id", itemId);
  if (error) throw error;
}
