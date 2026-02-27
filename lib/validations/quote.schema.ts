// src/lib/validations/quote.schema.ts
import { z } from "zod"

// ─── Ligne article ────────────────────────────────────────────────────────────
export const quoteItemSchema = z.object({
    productId: z.string().uuid().optional(),
    taxRateId: z.string().uuid().optional(),
    name: z.string().min(1, "La désignation est requise").max(255),
    description: z.string().max(1000).optional(),
    quantity: z.number().positive("La quantité doit être positive"),
    unitPrice: z.number().min(0, "Le prix ne peut pas être négatif"),
    taxRate: z.number().min(0).max(100).default(0),
    isService: z.boolean().default(false),
})

export type QuoteItemInput = z.infer<typeof quoteItemSchema>

// ─── Nouveau client inline ────────────────────────────────────────────────────
export const quoteNewClientSchema = z.object({
    type: z.enum(["INDIVIDUAL", "COMPANY"]).default("INDIVIDUAL"),
    name: z.string().min(1, "Le nom est requis").max(255),
    email: z.string().email("Email invalide").optional().or(z.literal("")),
    phone: z.string().max(30).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    taxId: z.string().max(100).optional(),
})

// ─── Création / mise à jour devis ─────────────────────────────────────────────
export const createQuoteSchema = z.object({
    clientId: z.string().uuid().optional(),
    newClient: quoteNewClientSchema.optional(),

    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide"),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide").optional().or(z.literal("")),

    currencyCode: z.string().length(3).default("XOF"),
    exchangeRate: z.number().positive().optional(),

    items: z.array(quoteItemSchema).min(1, "Ajoute au moins un article"),

    notes: z.string().max(2000).optional(),
    terms: z.string().max(2000).optional(),
    internalNotes: z.string().max(2000).optional(),

    status: z.enum(["DRAFT", "SENT"]).default("DRAFT"),
})
    .refine(
        data => data.clientId || data.newClient,
        { message: "Sélectionne un client ou crée-en un nouveau", path: ["clientId"] }
    )

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>

// ─── Types retour ─────────────────────────────────────────────────────────────
export type QuoteActionSuccess<T = void> = { success: true; data: T }
export type QuoteActionError = { success: false; error: string; field?: string }
export type QuoteActionResult<T = void> = QuoteActionSuccess<T> | QuoteActionError