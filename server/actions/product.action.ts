// src/server/actions/product.action.ts
"use server"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import { z } from "zod"

// ─── Schemas ──────────────────────────────────────────────────────────────────
const productCategorySchema = z.object({
    name: z.string().min(1).max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    icon: z.string().max(10).optional(),
})

const createProductSchema = z.object({
    name: z.string().min(1, "Nom requis").max(255),
    description: z.string().max(1000).optional(),
    sku: z.string().max(100).optional(),
    barcode: z.string().max(100).optional(),
    categoryId: z.string().uuid().optional(),
    price: z.number().min(0),
    costPrice: z.number().min(0).optional(),
    isService: z.boolean().default(false),
    unit: z.string().max(20).default("pcs"),
    initialStock: z.number().min(0).default(0),
    minStockAlert: z.number().min(0).optional(),
    isFavorite: z.boolean().default(false),
})

const updateProductSchema = createProductSchema.omit({ initialStock: true }).partial().extend({
    name: z.string().min(1).max(255),
    price: z.number().min(0),
})

type R<T = void> = { success: true; data: T } | { success: false; error: string }

// ─── Auth helper ──────────────────────────────────────────────────────────────
async function getCtx(orgSlug: string) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { error: "Non authentifié" } as const
    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } })
    if (!org) return { error: "Organisation introuvable" } as const
    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) return { error: "Accès refusé" } as const
    return { session, org } as const
}

// ══════════════════════════════════════════════════════════════════════════════
// CATÉGORIES
// ══════════════════════════════════════════════════════════════════════════════

export async function upsertProductCategoryAction(
    orgSlug: string,
    input: { name: string; color?: string; icon?: string },
    categoryId?: string
): Promise<R<{ id: string; name: string; color: string | null; icon: string | null }>> {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur lors de la création de la catégorie" }
    const parsed = productCategorySchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalide" }

    // Vérifier unicité nom par org
    const existing = await prisma.productCategory.findFirst({
        where: { organizationId: ctx.org.id, name: parsed.data.name, id: { not: categoryId } },
    })
    if (existing) return { success: false, error: `La catégorie "${parsed.data.name}" existe déjà.` }

    const cat = categoryId
        ? await prisma.productCategory.update({ where: { id: categoryId }, data: parsed.data })
        : await prisma.productCategory.create({ data: { organizationId: ctx.org.id, ...parsed.data } })

    return { success: true, data: { id: cat.id, name: cat.name, color: cat.color, icon: cat.icon } }
}

export async function deleteProductCategoryAction(orgSlug: string, categoryId: string): Promise<R> {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur lors de la suppression de la catégorie" }
    const cat = await prisma.productCategory.findFirst({
        where: { id: categoryId, organizationId: ctx.org.id },
        include: { _count: { select: { products: true } } },
    })
    if (!cat) return { success: false, error: "Catégorie introuvable" }
    if (cat._count.products > 0)
        return { success: false, error: `${cat._count.products} produit(s) utilisent cette catégorie.` }
    await prisma.productCategory.delete({ where: { id: categoryId } })
    return { success: true, data: undefined }
}

export async function getProductCategoriesAction(orgSlug: string) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error }
    const cats = await prisma.productCategory.findMany({
        where: { organizationId: ctx.org.id },
        orderBy: { name: "asc" },
    })
    return { success: true, data: cats }
}

// ══════════════════════════════════════════════════════════════════════════════
// PRODUITS
// ══════════════════════════════════════════════════════════════════════════════

export async function createProductAction(
    orgSlug: string,
    input: z.infer<typeof createProductSchema>
): Promise<R<{ id: string; name: string }>> {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur lors de la création du produit" }
    const parsed = createProductSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalide" }
    const data = parsed.data

    if (data.sku) {
        const dup = await prisma.product.findFirst({ where: { organizationId: ctx.org.id, sku: data.sku } })
        if (dup) return { success: false, error: `SKU "${data.sku}" déjà utilisé.` }
    }
    if (data.barcode) {
        const dup = await prisma.product.findFirst({ where: { organizationId: ctx.org.id, barcode: data.barcode } })
        if (dup) return { success: false, error: `Code-barres "${data.barcode}" déjà utilisé.` }
    }

    const product = await prisma.$transaction(async (tx) => {
        const p = await tx.product.create({
            data: {
                organizationId: ctx.org.id,
                name: data.name,
                description: data.description || null,
                sku: data.sku || null,
                barcode: data.barcode || null,
                categoryId: data.categoryId || null,
                price: data.price,
                costPrice: data.costPrice ?? null,
                isService: data.isService,
                unit: data.unit,
                currentStock: data.isService ? 0 : data.initialStock,
                minStockAlert: data.minStockAlert ?? null,
                isFavorite: data.isFavorite,
                isActive: true,
            },
        })
        if (!data.isService && data.initialStock > 0) {
            await tx.stockMovement.create({
                data: {
                    organizationId: ctx.org.id,
                    productId: p.id,
                    type: "IN",
                    direction: 1,
                    quantity: data.initialStock,
                    unitCost: data.costPrice ?? null,
                    totalCost: data.costPrice ? data.costPrice * data.initialStock : null,
                    referenceType: "MANUAL",
                    note: "Stock initial",
                },
            })
        }
        return p
    })

    revalidatePath(`/${orgSlug}/products`)
    return { success: true, data: { id: product.id, name: product.name } }
}

export async function updateProductAction(
    orgSlug: string,
    productId: string,
    input: z.infer<typeof updateProductSchema>
): Promise<R<{ id: string }>> {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur lors de la mise à jour du produit" }
    const existing = await prisma.product.findFirst({ where: { id: productId, organizationId: ctx.org.id } })
    if (!existing) return { success: false, error: "Produit introuvable" }
    const parsed = updateProductSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalide" }
    const data = parsed.data

    if (data.sku && data.sku !== existing.sku) {
        const dup = await prisma.product.findFirst({ where: { organizationId: ctx.org.id, sku: data.sku, id: { not: productId } } })
        if (dup) return { success: false, error: `SKU "${data.sku}" déjà utilisé.` }
    }

    await prisma.product.update({
        where: { id: productId },
        data: {
            name: data.name,
            description: data.description ?? null,
            sku: data.sku ?? null,
            barcode: data.barcode ?? null,
            categoryId: data.categoryId ?? null,
            price: data.price,
            costPrice: data.costPrice ?? null,
            isService: data.isService,
            unit: data.unit,
            minStockAlert: data.minStockAlert ?? null,
            isFavorite: data.isFavorite ?? existing.isFavorite,
        },
    })

    revalidatePath(`/${orgSlug}/products`)
    return { success: true, data: { id: productId } }
}

export async function toggleFavoriteAction(orgSlug: string, productId: string): Promise<R<{ isFavorite: boolean }>> {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur lors de la mise à jour du produit" }
    const p = await prisma.product.findFirst({ where: { id: productId, organizationId: ctx.org.id } })
    if (!p) return { success: false, error: "Produit introuvable" }
    const updated = await prisma.product.update({ where: { id: productId }, data: { isFavorite: !p.isFavorite } })
    return { success: true, data: { isFavorite: updated.isFavorite } }
}

export async function archiveProductAction(orgSlug: string, productId: string): Promise<R> {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur lors de la mise à jour du produit" }
    const p = await prisma.product.findFirst({ where: { id: productId, organizationId: ctx.org.id } })
    if (!p) return { success: false, error: "Produit introuvable" }
    await prisma.product.update({ where: { id: productId }, data: { isActive: !p.isActive } })
    return { success: true, data: undefined }
}

export async function getProductsForPOSAction(orgSlug: string) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error }

    const products = await prisma.product.findMany({
        where: { organizationId: ctx.org.id, isActive: true },
        include: { category: { select: { id: true, name: true, color: true, icon: true } } },
        orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
    })

    return {
        success: true,
        data: products.map(p => ({
            id: p.id,
            name: p.name,
            price: Number(p.price),
            costPrice: p.costPrice ? Number(p.costPrice) : null,
            currentStock: Number(p.currentStock),
            minStockAlert: p.minStockAlert ? Number(p.minStockAlert) : null,
            isService: p.isService,
            isFavorite: p.isFavorite,
            unit: p.unit,
            barcode: p.barcode,
            sku: p.sku,
            category: p.category,
        })),
    }
}

export async function getProductByBarcodeAction(orgSlug: string, barcode: string) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error }
    const p = await prisma.product.findFirst({
        where: { organizationId: ctx.org.id, barcode, isActive: true },
        include: { category: true },
    })
    if (!p) return { success: false, error: "Produit introuvable" }
    return {
        success: true,
        data: {
            id: p.id, name: p.name, price: Number(p.price),
            costPrice: p.costPrice ? Number(p.costPrice) : null,
            currentStock: Number(p.currentStock), isService: p.isService,
            isFavorite: p.isFavorite, unit: p.unit, barcode: p.barcode,
            category: p.category,
        },
    }
}