// src/lib/validations/product.schema.ts
import { z } from "zod"

// ─── Catégorie ────────────────────────────────────────────────────────────────
export const createProductCategorySchema = z.object({
    name: z.string().min(1, "Le nom est requis").max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hex invalide").optional(),
    icon: z.string().max(10).optional(),
})

export type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>

// ─── Création produit ─────────────────────────────────────────────────────────
export const createProductSchema = z.object({
    name: z.string().min(1, "Le nom est requis").max(255),
    description: z.string().max(1000).optional(),
    sku: z.string().max(100).optional(),
    barcode: z.string().max(100).optional(),
    categoryId: z.string().uuid().optional(),
    price: z.number().min(0, "Le prix ne peut pas être négatif"),
    costPrice: z.number().min(0).optional(),
    isService: z.boolean().default(false),
    unit: z.string().max(20).default("pcs"),
    initialStock: z.number().min(0).default(0),
    minStockAlert: z.number().min(0).optional(),
    isFavorite: z.boolean().default(false),
})

export type CreateProductInput = z.infer<typeof createProductSchema>

// ─── Mise à jour produit ──────────────────────────────────────────────────────
// Tous les champs optionnels sauf name + price
// initialStock non modifiable (passe par StockMovement)
// isActive ajouté pour l'archivage
export const updateProductSchema = z.object({
    name: z.string().min(1, "Le nom est requis").max(255),
    description: z.string().max(1000).optional(),
    sku: z.string().max(100).optional(),
    barcode: z.string().max(100).optional(),
    categoryId: z.string().uuid().optional(),
    price: z.number().min(0, "Le prix ne peut pas être négatif"),
    costPrice: z.number().min(0).optional(),
    isService: z.boolean().optional(),
    unit: z.string().max(20).optional(),
    minStockAlert: z.number().min(0).optional(),
    isFavorite: z.boolean().optional(),
    isActive: z.boolean().optional(),
})

export type UpdateProductInput = z.infer<typeof updateProductSchema>

// ─── Types retour ─────────────────────────────────────────────────────────────
export type ProductActionResult<T = void> =
    | { success: true; data: T }
    | { success: false; error: string }