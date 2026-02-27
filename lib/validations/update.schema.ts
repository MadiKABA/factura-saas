// src/lib/validations/update.schema.ts
// Schémas de mise à jour — étend les schémas de création
// avec des règles de verrouillage selon le statut
import { z } from "zod"
import { invoiceItemSchema, newClientSchema } from "./invoice.schema"
import { quoteItemSchema, quoteNewClientSchema } from "./quote.schema"

// ─── Statuts verrouillés ──────────────────────────────────────────────────────
export const INVOICE_LOCKED_STATUSES = ["PAID", "CANCELLED"] as const
export const QUOTE_LOCKED_STATUSES = ["ACCEPTED", "REJECTED", "EXPIRED"] as const

// ─── Update facture ───────────────────────────────────────────────────────────
export const updateInvoiceSchema = z.object({
    // Client
    clientId: z.string().uuid().optional(),
    newClient: newClientSchema.optional(),

    // Dates
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),

    // Devise
    currencyCode: z.string().length(3),
    exchangeRate: z.number().positive().optional(),

    // Lignes — l'intégralité des lignes est remplacée (delete + recreate)
    items: z.array(invoiceItemSchema).min(1, "Ajoute au moins un article"),

    // Notes
    notes: z.string().max(2000).optional(),
    terms: z.string().max(2000).optional(),
    internalNotes: z.string().max(2000).optional(),
})
    .refine(
        data => data.clientId || data.newClient,
        { message: "Sélectionne un client ou crée-en un nouveau", path: ["clientId"] }
    )

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>

// ─── Update devis ─────────────────────────────────────────────────────────────
export const updateQuoteSchema = z.object({
    clientId: z.string().uuid().optional(),
    newClient: quoteNewClientSchema.optional(),

    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide"),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),

    currencyCode: z.string().length(3),
    exchangeRate: z.number().positive().optional(),

    items: z.array(quoteItemSchema).min(1, "Ajoute au moins un article"),

    notes: z.string().max(2000).optional(),
    terms: z.string().max(2000).optional(),
    internalNotes: z.string().max(2000).optional(),
})
    .refine(
        data => data.clientId || data.newClient,
        { message: "Sélectionne un client ou crée-en un nouveau", path: ["clientId"] }
    )

export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>