// src/lib/validations/invoice.schema.ts
import { z } from "zod"

// ─── Ligne article ────────────────────────────────────────────────────────────
export const invoiceItemSchema = z.object({
    // Si sélectionné depuis le catalogue (optionnel)
    productId: z.string().uuid().optional(),
    taxRateId: z.string().uuid().optional(),

    name: z.string().min(1, "La désignation est requise").max(255),
    description: z.string().max(1000).optional(),
    quantity: z.number().positive("La quantité doit être positive"),
    unitPrice: z.number().min(0, "Le prix ne peut pas être négatif"),
    taxRate: z.number().min(0).max(100).default(0),  // % ex: 18
    isService: z.boolean().default(false),
})

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>

// ─── Nouveau client inline ────────────────────────────────────────────────────
export const newClientSchema = z.object({
    type: z.enum(["INDIVIDUAL", "COMPANY"]).default("INDIVIDUAL"),
    name: z.string().min(1, "Le nom est requis").max(255),
    email: z.string().email("Email invalide").optional().or(z.literal("")),
    phone: z.string().max(30).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    taxId: z.string().max(100).optional(),
})

export type NewClientInput = z.infer<typeof newClientSchema>

// ─── Création facture ─────────────────────────────────────────────────────────
export const createInvoiceSchema = z.object({
    // Client : soit existant soit nouveau
    clientId: z.string().uuid().optional(),
    newClient: newClientSchema.optional(),

    // Devis d'origine (optionnel)
    originQuoteId: z.string().uuid().optional(),

    // Dates
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide").optional().or(z.literal("")),

    // Devise
    currencyCode: z.string().length(3).default("XOF"),
    exchangeRate: z.number().positive().optional(),

    // Lignes
    items: z.array(invoiceItemSchema).min(1, "Ajoute au moins un article"),

    // Notes
    notes: z.string().max(2000).optional(),
    terms: z.string().max(2000).optional(),
    internalNotes: z.string().max(2000).optional(),

    // Statut initial : DRAFT ou SENT
    status: z.enum(["DRAFT", "SENT"]).default("DRAFT"),
})
    .refine(
        data => data.clientId || data.newClient,
        { message: "Sélectionne un client ou crée-en un nouveau", path: ["clientId"] }
    )
    .refine(
        data => data.items.every(i => i.name.trim().length > 0),
        { message: "Chaque article doit avoir une désignation", path: ["items"] }
    )

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

// ─── Types retour actions ─────────────────────────────────────────────────────
export type ActionSuccess<T = void> = { success: true; data: T }
export type ActionError = { success: false; error: string; field?: string }
export type ActionResult<T = void> = ActionSuccess<T> | ActionError