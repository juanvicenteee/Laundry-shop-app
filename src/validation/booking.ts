import { z } from "zod";

const PH_MOBILE = /^(\+639\d{9}|09\d{9}|9\d{9})$/;

export const bookingSchema = z
  .object({
    customerName: z.string().trim().min(2, "Enter your full name."),
    phone: z.string().trim().regex(PH_MOBILE, "Enter a valid PH mobile number (09XX XXX XXXX)."),
    laundryType: z.enum(["regular", "blanket", "comforter", "sheets"]),
    quantity: z.number().min(1).max(30),
    delivery: z.enum(["none", "mplace", "portovita", "manhattan", "cubao", "outsideCubao"]),
    address: z.string().trim().max(180, "Address is too long."),
    pickupWindow: z.string().min(1, "Choose a drop-off or pickup time."),
    paymentMethod: z.enum(["Cash", "GCash", "Maya", "Bank Transfer"]),
    notes: z.string().trim().max(240, "Notes must stay under 240 characters.")
  })
  .refine((data) => data.delivery === "none" || data.address.length >= 8, {
    message: "Enter a complete address for delivery.",
    path: ["address"]
  });

export type BookingForm = z.infer<typeof bookingSchema>;
