import { z } from "zod";

export const registrationPhoneSchema = z
  .string()
  .trim()
  .min(7, "Bitte geben Sie eine gültige Telefonnummer ein.")
  .max(40, "Die Telefonnummer ist zu lang.")
  .refine((value) => {
    const digits = value.replace(/\D/g, "");
    const compact = value.replace(/[()\s.+/-]/g, "");
    return (
      /^\d+$/.test(compact) &&
      digits.length >= 7 &&
      digits.length <= 15 &&
      !/^0+$/.test(digits)
    );
  }, "Bitte geben Sie eine gültige Telefonnummer mit echten Ziffern ein.");

export const registrationLatitudeSchema = z
  .number()
  .finite()
  .min(-90)
  .max(90);

export const registrationLongitudeSchema = z
  .number()
  .finite()
  .min(-180)
  .max(180);

export const registrationCompletionSchema = z.object({
  role: z.enum(["restaurant", "supplier"]),
  companyName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  phone: registrationPhoneSchema,
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(3).max(20),
  profile: z.string().trim().max(1000).optional().default(""),
  latitude: registrationLatitudeSchema,
  longitude: registrationLongitudeSchema,
  locationConfirmed: z.literal(true),
});

export function isValidRegistrationPhone(value: string): boolean {
  return registrationPhoneSchema.safeParse(value).success;
}