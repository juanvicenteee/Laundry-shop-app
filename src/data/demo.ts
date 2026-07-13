import type { DeliveryOption, LaundryType, PaymentMethod } from "../types";

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
  { id: "mplace", label: "Delivery - MPlace Towers", fee: 30 },
  { id: "portovita", label: "Delivery - Portovita Towers", fee: 30 },
  { id: "manhattan", label: "Delivery - Manhattan Residence", fee: 60 },
  { id: "cubao", label: "Delivery - Other Cubao area", fee: 60 },
  { id: "outsideCubao", label: "Delivery - Outside Cubao", fee: 120 }
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
