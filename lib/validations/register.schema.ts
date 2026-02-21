// src/lib/validations/register.schema.ts
import { z } from "zod"

export const registerSchema = z.object({
    name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
    email: z.string().email("Email invalide"),
    password: z
        .string()
        .min(8, "Minimum 8 caractères")
        .regex(/[A-Z]/, "Au moins une majuscule")
        .regex(/[0-9]/, "Au moins un chiffre"),
    phoneNumber: z.string().optional(),
    orgName: z.string().min(2, "Minimum 2 caractères"),
    orgSlug: z
        .string()
        .min(2, "Minimum 2 caractères")
        .max(50, "Maximum 50 caractères")
        .regex(/^[a-z0-9-]+$/, "Uniquement des lettres minuscules, chiffres et tirets"),
    orgAddress: z.string().optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type FieldErrors = Partial<Record<keyof RegisterInput, string>>