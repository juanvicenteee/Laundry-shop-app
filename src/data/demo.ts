import type { DeliveryOption, LaundryType, Order, PaymentMethod } from "../types";

export const shopInfo = {
  name: "Bubbly-fi Laundry Shop",
  address: "92 14th Ave, Cubao, Quezon City, 1109 Metro Manila",
  phone: "+63 998 885 5650",
  hours: "7:30 AM - 9:00 PM",
  facebook: "https://www.facebook.com/bubblyfi"
};

export const pricePerLoad = 240;

export const laundryTypes: LaundryType[] = [
  { id: "regular", label: "Regular laundry", unit: "kg", capacity: 8, category: "Regular load" },
  { id: "blanket", label: "Thick blankets", unit: "kg", capacity: 2, category: "Thick blanket" },
  { id: "comforter", label: "Comforter", unit: "pc", capacity: 1, category: "Comforter" },
  { id: "sheets", label: "Bedsheets or towels", unit: "kg", capacity: 5, category: "Bedsheets / towels" }
];

export const defaultLaundryType: LaundryType = laundryTypes[0]!;

export const deliveryOptions: DeliveryOption[] = [
  { id: "none", label: "Drop off at counter", fee: 0 },
  { id: "oneWay", label: "One-way delivery", fee: 80 },
  { id: "roundTrip", label: "Round trip pickup & delivery (Cubao area)", fee: 60 }
];

export const defaultDeliveryOption: DeliveryOption = deliveryOptions[0]!;

export const paymentMethods: PaymentMethod[] = ["Cash", "GCash", "Maya", "Bank Transfer"];

export const defaultPaymentMethod: PaymentMethod = paymentMethods[0]!;

export const timeWindows = [
  "Drop off now",
  "Today, 2 PM - 4 PM",
  "Today, 6 PM - 8 PM",
  "Tomorrow, 8 AM - 10 AM"
];

export const activeOrders: Order[] = [
  {
    id: "BF-2031",
    laundryType: "regular",
    quantity: 8,
    loads: 1,
    status: "Washing",
    paymentStatus: "Unpaid",
    paymentMethod: "Cash",
    delivery: 0,
    amount: 240
  },
  {
    id: "BF-2028",
    laundryType: "sheets",
    quantity: 6,
    loads: 2,
    status: "Ready",
    paymentStatus: "Paid",
    paymentMethod: "GCash",
    delivery: 80,
    amount: 560
  }
];
