import { supabase } from "./supabase";
import type { CustomerRow } from "./types";

const CUSTOMER_FIELDS = "id,name,phone,default_place,notes,is_archived";

export async function fetchCustomers(): Promise<CustomerRow[]> {
  const { data, error } = await supabase.from("customers").select(CUSTOMER_FIELDS).order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CustomerRow[];
}

export type CustomerInput = {
  name: string;
  phone: string;
  default_place: "cubao" | "mplace" | "outside";
  notes: string;
};

export async function saveCustomer(input: CustomerInput, profileId: string, existingId?: string) {
  if (existingId) {
    const { error } = await supabase
      .from("customers")
      .update({ ...input, updated_by: profileId })
      .eq("id", existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("customers").insert({ ...input, created_by: profileId });
    if (error) throw error;
  }
}

export async function setCustomerArchived(customerId: string, archived: boolean, profileId: string) {
  const { error } = await supabase
    .from("customers")
    .update({ is_archived: archived, updated_by: profileId })
    .eq("id", customerId);
  if (error) throw error;
}
