import { z } from "zod";

export const bookingSchema = z.object({
  service: z.string().min(1, "Choose a laundry service."),
  pickupWindow: z.string().min(1, "Choose a pickup time."),
  address: z
    .string()
    .trim()
    .min(8, "Enter a complete pickup address.")
    .max(180, "Address is too long."),
  notes: z.string().trim().max(240, "Notes must stay under 240 characters."),
  estimatedKg: z.number().min(1).max(30)
});

export type BookingForm = z.infer<typeof bookingSchema>;
