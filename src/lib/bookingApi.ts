import { supabase } from "./supabase";
import type { DeliveryOptionId, LaundryTypeId, PaymentMethod } from "../types";

const itemTypeByLaundryType: Record<LaundryTypeId, string> = {
  regular: "assorted_clothes",
  blanket: "thick_blankets",
  comforter: "comforter",
  sheets: "sheets_towels"
};

const placeByDelivery: Record<DeliveryOptionId, "cubao" | "mplace" | "outside"> = {
  none: "cubao",
  mplace: "mplace",
  portovita: "cubao",
  manhattan: "cubao",
  cubao: "cubao",
  outsideCubao: "outside"
};

export function normalizePhilippineMobile(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("639") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("09") && digits.length === 11) return `+63${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 10) return `+63${digits}`;
  return raw.trim();
}

function resolvePickupAt(window: string): Date {
  const now = new Date();
  const target = new Date(now);
  if (window.startsWith("Tomorrow")) {
    target.setDate(target.getDate() + 1);
  }

  const match = window.match(/(\d+)\s*(AM|PM)/);
  if (match) {
    let hour = Number(match[1]);
    const period = match[2];
    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    target.setHours(hour, 0, 0, 0);
  }

  return target;
}

export type BookingSubmission = {
  customerName: string;
  phone: string;
  email?: string;
  laundryType: LaundryTypeId;
  quantity: number;
  delivery: DeliveryOptionId;
  address: string;
  pickupWindow: string;
  paymentMethod: PaymentMethod;
  notes: string;
  coords: { latitude: number; longitude: number } | null;
  quotedTotal: number;
};

export async function submitBookingRequest(input: BookingSubmission) {
  const payload = {
    customer_name: input.customerName.trim(),
    phone: normalizePhilippineMobile(input.phone),
    email: input.email?.trim() || "",
    service_type: "wash_dry_fold",
    item_type: itemTypeByLaundryType[input.laundryType],
    full_service: true,
    quantity: String(input.quantity),
    unit: input.laundryType === "comforter" ? "pc" : "kg",
    place: placeByDelivery[input.delivery],
    detergent_source: "included",
    detergent_item_id: "",
    conditioner_source: "included",
    conditioner_item_id: "",
    extra_dry: false,
    extra_wash: false,
    warm_hot_wash: false,
    zonrox_colorsafe: true,
    extra_detergent: false,
    extra_conditioner: false,
    delivery_requested: input.delivery !== "none",
    address_line: input.address,
    building_unit: "",
    barangay: "",
    city: "",
    landmark: "",
    full_address: input.address,
    gps_lat: input.coords?.latitude ?? null,
    gps_lng: input.coords?.longitude ?? null,
    maps_url: input.coords
      ? `https://www.google.com/maps/search/?api=1&query=${input.coords.latitude},${input.coords.longitude}`
      : null,
    pickup_at: resolvePickupAt(input.pickupWindow).toISOString(),
    item_description: input.notes || "Laundry booking from mobile app",
    item_count: "",
    bags_count: "",
    pickup_photo_path: "",
    item_photo_paths: [],
    payment_reference: "",
    payment_proof_path: "",
    customer_notes: input.notes,
    quoted_total: input.quotedTotal
  };

  const { data, error } = await supabase.rpc("submit_customer_order", { p_payload: payload });
  if (error) throw error;

  const requestNo = (data as { request_no?: string } | null)?.request_no;
  if (requestNo) {
    supabase.functions.invoke("send-booking-sms", { body: { request_no: requestNo } }).catch(() => {
      // Booking already succeeded; notification failures are non-fatal, matching the web app's behavior.
    });
  }

  return data as { request_no: string; total: number };
}
