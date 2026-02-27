// src/lib/validations/payment.schema.ts
import { z } from "zod"

export const PAYMENT_METHODS = [
    { value: "CASH", label: "Espèces", icon: "💵" },
    { value: "BANK_TRANSFER", label: "Virement", icon: "🏦" },
    { value: "MOBILE_MONEY", label: "Mobile Money", icon: "📱" },
    { value: "CARD", label: "Carte bancaire", icon: "💳" },
    { value: "CHECK", label: "Chèque", icon: "🧾" },
    { value: "OTHER", label: "Autre", icon: "🔄" },
] as const

export type PaymentMethod = typeof PAYMENT_METHODS[number]["value"]

export const createPaymentSchema = z.object({
    invoiceId: z.string().uuid(),
    amount: z.number()
        .positive("Le montant doit être positif")
        .multipleOf(0.01, "Maximum 2 décimales"),
    method: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CARD", "CHECK", "OTHER"]),
    paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
    note: z.string().max(500).optional(),
})

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>