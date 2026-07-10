import type { Order, Shop } from "../types";

export const shops: Shop[] = [
  {
    id: "washmate-bgc",
    name: "WashMate Express",
    distanceKm: 1.2,
    etaMinutes: 14,
    rating: 4.8,
    basePrice: 165,
    open: true,
    tags: ["Same day", "Eco wash", "Ironing"],
    address: "High Street, BGC"
  },
  {
    id: "freshfold-makati",
    name: "FreshFold Laundry",
    distanceKm: 2.4,
    etaMinutes: 21,
    rating: 4.7,
    basePrice: 140,
    open: true,
    tags: ["Budget", "Pickup now", "Dry clean"],
    address: "Legazpi Village, Makati"
  },
  {
    id: "linenlab-ortigas",
    name: "LinenLab Care",
    distanceKm: 4.1,
    etaMinutes: 33,
    rating: 4.9,
    basePrice: 220,
    open: false,
    tags: ["Premium", "Bedding", "Delicates"],
    address: "ADB Avenue, Ortigas"
  }
];

export const activeOrders: Order[] = [
  {
    id: "LG-1048",
    shopName: "WashMate Express",
    status: "Rider pickup",
    eta: "11 min",
    price: 318,
    items: "6 kg wash and fold",
    rider: "Mika",
    progress: 0.28
  },
  {
    id: "LG-1039",
    shopName: "FreshFold Laundry",
    status: "Quality check",
    eta: "Today, 6:40 PM",
    price: 242,
    items: "4 kg wash, 3 shirts ironed",
    rider: "Assigned after packing",
    progress: 0.74
  }
];

export const serviceOptions = [
  "Wash and fold",
  "Wash, dry, iron",
  "Dry cleaning",
  "Bedding and towels",
  "Sneaker cleaning"
];

export const timeWindows = [
  "Pickup now",
  "Today, 2 PM - 4 PM",
  "Today, 6 PM - 8 PM",
  "Tomorrow, 8 AM - 10 AM"
];
