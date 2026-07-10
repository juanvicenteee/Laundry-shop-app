import type { DeliveryOption, LaundryType, PaymentMethod } from "../types";

export function generateOrderReference() {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `BF-${suffix}`;
}

export function generateClaimPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

type OrderMessageInput = {
  reference: string;
  claimPin: string;
  laundryType: LaundryType;
  quantity: number;
  loads: number;
  pickupWindow: string;
  delivery: DeliveryOption;
  address: string;
  paymentMethod: PaymentMethod;
  notes: string;
  total: number;
};

export function buildOrderMessage(input: OrderMessageInput) {
  const lines = [
    `Bubbly-fi order ${input.reference}`,
    `${input.laundryType.label} - ${input.quantity}${input.laundryType.unit} (${input.loads} load${input.loads === 1 ? "" : "s"})`,
    `Time: ${input.pickupWindow}`,
    input.delivery.fee > 0 ? `Delivery: ${input.delivery.label} - ${input.address}` : "Drop off at counter",
    `Payment: ${input.paymentMethod}`,
    input.notes ? `Notes: ${input.notes}` : null,
    `Total: PHP ${input.total}`,
    `Claim PIN: ${input.claimPin}`
  ];

  return lines.filter(Boolean).join("\n");
}
