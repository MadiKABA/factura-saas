// src/server/actions/stock.action.ts
"use server"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import { z } from "zod"

import { cacheTags, stockBatchValidatedTags } from "@/lib/cache-tags"
import { requireWriteAccess } from "@/lib/guard/ubscription-guard"
import { checkModuleAccess, checkPlanLimit, getOrgPlan, PLAN_LIMITS } from "@/lib/plan-limits"

type R<T = void> = { success: true; data: T } | { success: false; error: string }

// ─── Constantes ───────────────────────────────────────────────────────────────
export const OUTPUT_REASONS = ["EXPIRED", "DAMAGED", "LOSS", "THEFT", "DONATION", "OTHER"] as const
export type OutputReason = typeof OUTPUT_REASONS[number]

export const OUTPUT_REASON_LABELS: Record<OutputReason, string> = {
    EXPIRED: "Produits périmés", DAMAGED: "Produits abîmés / cassés",
    LOSS: "Perte générale", THEFT: "Vol",
    DONATION: "Don / cadeau", OTHER: "Autre motif",
}
export const OUTPUT_REASON_ICONS: Record<OutputReason, string> = {
    EXPIRED: "⏰", DAMAGED: "💔", LOSS: "📉", THEFT: "🚨", DONATION: "🎁", OTHER: "📝",
}

// ─── Schémas Zod ──────────────────────────────────────────────────────────────
const itemSchema = z.object({
    productId: z.string().uuid("Produit invalide"),
    quantity: z.number().positive("La quantité doit être > 0"),
    unitCost: z.number().min(0).optional(),
    batchNumber: z.string().max(100).optional(),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    note: z.string().max(500).optional(),
})

const createBatchSchema = z.object({
    type: z.enum(["RECEPTION", "OUTPUT"]),
    vendorId: z.string().uuid().optional(),
    externalRef: z.string().max(100).optional(),
    outputReason: z.enum(OUTPUT_REASONS).optional(),
    note: z.string().max(1000).optional(),
    batchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    items: z.array(itemSchema).min(1, "Ajoutez au moins un produit"),
}).refine(
    d => d.type === "RECEPTION" || !!d.outputReason,
    { message: "Le motif de sortie est requis", path: ["outputReason"] }
)

const updateBatchSchema = z.object({
    vendorId: z.string().uuid().optional(),
    externalRef: z.string().max(100).optional(),
    outputReason: z.enum(OUTPUT_REASONS).optional(),
    note: z.string().max(1000).optional(),
    batchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    items: z.array(itemSchema).min(1, "Ajoutez au moins un produit"),
})

export type CreateBatchInput = z.infer<typeof createBatchSchema>
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>

// ─── Auth ──────────────────────────────────────────────────────────────────────
async function getCtx(orgSlug: string, requiredRoles = ["OWNER", "ADMIN", "MEMBER", "ACCOUNTANT", "CASHIER"]) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { error: "Non authentifié" } as const
    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } })
    if (!org) return { error: "Organisation introuvable" } as const
    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) return { error: "Accès refusé" } as const
    if (!requiredRoles.includes(membership.role)) return { error: "Droits insuffisants" } as const
    return { session, org, membership } as const
}

// ─── Numérotation auto ────────────────────────────────────────────────────────
async function nextBatchNumber(organizationId: string, type: "RECEPTION" | "OUTPUT") {
    const year = new Date().getFullYear()
    const prefix = type === "RECEPTION" ? `REC-${year}-` : `OUT-${year}-`
    const count = await prisma.stockBatch.count({ where: { organizationId, number: { startsWith: prefix } } })
    return `${prefix}${String(count + 1).padStart(4, "0")}`
}

// ─── Invalider le cache stock ─────────────────────────────────────────────────
function invalidateStock(orgId: string, batchId?: string) {
    revalidateTag("stockBatches", "default")
    revalidateTag("stockMovements", "default")
    revalidateTag("stockAlerts", "default")
    revalidateTag("products", "default")
    if (batchId) revalidateTag("stockBatch", "default")
}

// ─── Vérifier produits (appartiennent à l'org, actifs, non-service) ──────────
async function validateProducts(organizationId: string, productIds: string[]) {
    const unique = [...new Set(productIds)]
    const prods = await prisma.product.findMany({
        where: { id: { in: unique }, organizationId, isActive: true },
        select: { id: true, name: true, isService: true, currentStock: true },
    })
    if (prods.length !== unique.length) return { ok: false, error: "Un ou plusieurs produits sont introuvables ou archivés." }
    const services = prods.filter(p => p.isService)
    if (services.length > 0) return { ok: false, error: `Services non autorisés en stock : ${services.map(s => s.name).join(", ")}` }
    return { ok: true as const, products: prods }
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE BON — DRAFT multi-produits
// ═══════════════════════════════════════════════════════════════════════════
export async function createStockBatchAction(
    orgSlug: string,
    input: CreateBatchInput
): Promise<R<{ id: string; number: string }>> {
    const ctx = await getCtx(orgSlug, ["OWNER", "ADMIN", "MEMBER"])
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }

    const guard = await requireWriteAccess(ctx.org.id)
    if (guard) return guard

    const modChk = await checkModuleAccess(ctx.org.id, "stock")
    if (!modChk.allowed) return { success: false, error: modChk.reason }

    const limChk = await checkPlanLimit(ctx.org.id, "stockBatches")
    if (!limChk.allowed) return { success: false, error: limChk.reason }

    const parsed = createBatchSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Données invalides" }
    const data = parsed.data

    const prodCheck = await validateProducts(ctx.org.id, data.items.map(i => i.productId))
    if (!prodCheck.ok) return { success: false, error: prodCheck.error }

    const number = await nextBatchNumber(ctx.org.id, data.type)

    const batch = await prisma.stockBatch.create({
        data: {
            organizationId: ctx.org.id,
            type: data.type,
            status: "DRAFT",
            number,
            vendorId: data.vendorId || null,
            externalRef: data.externalRef || null,
            outputReason: data.outputReason as any ?? null,
            note: data.note || null,
            batchDate: data.batchDate ? new Date(data.batchDate) : new Date(),
            items: {
                create: data.items.map(i => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    unitCost: i.unitCost ?? null,
                    totalCost: i.unitCost ? i.unitCost * i.quantity : null,
                    batchNumber: i.batchNumber || null,
                    expiryDate: i.expiryDate ? new Date(i.expiryDate) : null,
                    note: i.note || null,
                })),
            },
        },
    })

    invalidateStock(ctx.org.id)
    revalidatePath(`/${orgSlug}/stock`)
    return { success: true, data: { id: batch.id, number: batch.number } }
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE BON — DRAFT uniquement (remplace les lignes)
// ═══════════════════════════════════════════════════════════════════════════
export async function updateStockBatchAction(
    orgSlug: string,
    batchId: string,
    input: UpdateBatchInput
): Promise<R<{ id: string }>> {
    const ctx = await getCtx(orgSlug, ["OWNER", "ADMIN", "MEMBER"])
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }

    const guard = await requireWriteAccess(ctx.org.id)
    if (guard) return guard

    const batch = await prisma.stockBatch.findFirst({ where: { id: batchId, organizationId: ctx.org.id } })
    if (!batch) return { success: false, error: "Bon introuvable" }
    if (batch.status !== "DRAFT") return { success: false, error: "Seuls les bons DRAFT sont modifiables." }

    const parsed = updateBatchSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalide" }
    const data = parsed.data

    const prodCheck = await validateProducts(ctx.org.id, data.items.map(i => i.productId))
    if (!prodCheck.ok) return { success: false, error: prodCheck.error }

    await prisma.$transaction(async tx => {
        await tx.stockBatchItem.deleteMany({ where: { stockBatchId: batchId } })
        await tx.stockBatch.update({
            where: { id: batchId },
            data: {
                vendorId: data.vendorId || null,
                externalRef: data.externalRef || null,
                outputReason: data.outputReason as any ?? null,
                note: data.note || null,
                batchDate: data.batchDate ? new Date(data.batchDate) : undefined,
                items: {
                    create: data.items.map(i => ({
                        productId: i.productId,
                        quantity: i.quantity,
                        unitCost: i.unitCost ?? null,
                        totalCost: i.unitCost ? i.unitCost * i.quantity : null,
                        batchNumber: i.batchNumber || null,
                        expiryDate: i.expiryDate ? new Date(i.expiryDate) : null,
                        note: i.note || null,
                    })),
                },
            },
        })
    })

    invalidateStock(ctx.org.id, batchId)
    return { success: true, data: { id: batchId } }
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATE BON — Transaction atomique
// Pour chaque ligne du bon :
//   1. Créer 1 StockMovement (lié au batch via stockBatchId)
//   2. Incrémenter ou décrémenter currentStock du produit
//   3. Marquer le bon VALIDATED
// ═══════════════════════════════════════════════════════════════════════════
export async function validateStockBatchAction(
    orgSlug: string,
    batchId: string
): Promise<R<{ movementsCreated: number; totalCostXof: number }>> {
    const ctx = await getCtx(orgSlug, ["OWNER", "ADMIN", "MEMBER"])
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }

    const guard = await requireWriteAccess(ctx.org.id)
    if (guard) return guard

    const batch = await prisma.stockBatch.findFirst({
        where: { id: batchId, organizationId: ctx.org.id },
        include: {
            items: {
                include: {
                    product: { select: { id: true, name: true, unit: true, currentStock: true } },
                },
            },
        },
    })
    if (!batch) return { success: false, error: "Bon introuvable" }
    if (batch.status !== "DRAFT") return { success: false, error: "Ce bon est déjà validé ou annulé." }
    if (batch.items.length === 0) return { success: false, error: "Ajoutez au moins un produit avant de valider." }

    const isReception = batch.type === "RECEPTION"

    // Pour OUTPUT — vérifier stock suffisant ligne par ligne
    if (!isReception) {
        const insufficient = batch.items.filter(i => Number(i.product.currentStock) < Number(i.quantity))
        if (insufficient.length > 0) {
            const detail = insufficient.map(i =>
                `• ${i.product.name} : ${Number(i.product.currentStock)} ${i.product.unit ?? "pcs"} dispo, sortie demandée : ${Number(i.quantity)}`
            ).join("\n")
            return { success: false, error: `Stock insuffisant :\n${detail}` }
        }
    }

    // Déterminer le type de mouvement
    const movType: string = isReception ? "IN" : (
        ["LOSS", "THEFT", "EXPIRED", "DAMAGED"].includes(batch.outputReason ?? "") ? "LOSS" : "ADJUSTMENT"
    )
    const direction = isReception ? 1 : -1

    const totalCost = batch.items.reduce(
        (s, i) => s + (i.unitCost ? Number(i.unitCost) * Number(i.quantity) : 0), 0
    )

    try {
        await prisma.$transaction(async tx => {
            for (const item of batch.items) {
                const unitCost = item.unitCost ? Number(item.unitCost) : null
                const totalCostItem = unitCost ? unitCost * Number(item.quantity) : null

                // 1 StockMovement par ligne — lié au bon via stockBatchId
                await tx.stockMovement.create({
                    data: {
                        organizationId: ctx.org.id,
                        productId: item.productId,
                        stockBatchId: batch.id,
                        vendorId: batch.vendorId || null,
                        type: movType as any,
                        direction,
                        quantity: item.quantity,
                        unitCost,
                        totalCost: totalCostItem,
                        batchNumber: item.batchNumber || null,
                        expiryDate: item.expiryDate || null,
                        referenceType: "BATCH",
                        referenceId: batch.id,
                        note: item.note || `${isReception ? "Réception" : "Sortie"} ${batch.number} — ${item.product.name}`,
                        movedAt: new Date(),
                    },
                })

                // Mise à jour currentStock + costPrice (si réception avec coût)
                await tx.product.update({
                    where: { id: item.productId },
                    data: {
                        currentStock: { [isReception ? "increment" : "decrement"]: Number(item.quantity) },
                        ...(isReception && unitCost ? { costPrice: unitCost } : {}),
                    },
                })
            }

            await tx.stockBatch.update({
                where: { id: batchId },
                data: {
                    status: "VALIDATED",
                    validatedAt: new Date(),
                    totalCost: totalCost > 0 ? totalCost : null,
                },
            })
        })

        stockBatchValidatedTags(ctx.org.id, batchId).forEach(t => revalidateTag(t, "default"))
        revalidatePath(`/${orgSlug}/stock`)
        revalidatePath(`/${orgSlug}/products`)

        return { success: true, data: { movementsCreated: batch.items.length, totalCostXof: totalCost } }
    } catch (err: any) {
        return { success: false, error: err?.message ?? "Erreur lors de la validation." }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CANCEL BON — DRAFT → CANCELLED (sans impact stock)
// ═══════════════════════════════════════════════════════════════════════════
export async function cancelStockBatchAction(orgSlug: string, batchId: string): Promise<R> {
    const ctx = await getCtx(orgSlug, ["OWNER", "ADMIN"])
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }
    const guard = await requireWriteAccess(ctx.org.id)
    if (guard) return guard

    const batch = await prisma.stockBatch.findFirst({ where: { id: batchId, organizationId: ctx.org.id } })
    if (!batch) return { success: false, error: "Bon introuvable" }
    if (batch.status !== "DRAFT") return { success: false, error: "Seuls les bons DRAFT peuvent être annulés." }

    await prisma.stockBatch.update({ where: { id: batchId }, data: { status: "CANCELLED" } })
    invalidateStock(ctx.org.id, batchId)
    return { success: true, data: undefined }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE BON — DRAFT uniquement (suppression physique)
// ═══════════════════════════════════════════════════════════════════════════
export async function deleteStockBatchAction(orgSlug: string, batchId: string): Promise<R> {
    const ctx = await getCtx(orgSlug, ["OWNER", "ADMIN"])
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }
    const guard = await requireWriteAccess(ctx.org.id)
    if (guard) return guard

    const batch = await prisma.stockBatch.findFirst({ where: { id: batchId, organizationId: ctx.org.id } })
    if (!batch) return { success: false, error: "Bon introuvable" }
    if (batch.status !== "DRAFT") return { success: false, error: "Seuls les bons DRAFT peuvent être supprimés." }

    await prisma.stockBatch.delete({ where: { id: batchId } })
    invalidateStock(ctx.org.id)
    return { success: true, data: undefined }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET LIST BONS — paginé + filtres + cache 60s
// ═══════════════════════════════════════════════════════════════════════════
export async function getStockBatchesAction(
    orgSlug: string,
    filters?: {
        type?: "RECEPTION" | "OUTPUT"
        status?: "DRAFT" | "VALIDATED" | "CANCELLED"
        vendorId?: string
        page?: number
        pageSize?: number
    }
) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }

    const page = filters?.page ?? 1
    const pageSize = filters?.pageSize ?? 20
    const skip = (page - 1) * pageSize

    const where: any = { organizationId: ctx.org.id }
    if (filters?.type) where.type = filters.type
    if (filters?.status) where.status = filters.status
    if (filters?.vendorId) where.vendorId = filters.vendorId

    const getCached = unstable_cache(
        async () => {
            const [batches, total] = await Promise.all([
                prisma.stockBatch.findMany({
                    where,
                    include: {
                        vendor: { select: { id: true, name: true } },
                        items: {
                            select: {
                                id: true, quantity: true, unitCost: true,
                                product: { select: { id: true, name: true, unit: true } },
                            },
                        },
                    },
                    orderBy: { batchDate: "desc" },
                    skip, take: pageSize,
                }),
                prisma.stockBatch.count({ where }),
            ])
            return { batches, total }
        },
        [`sb-list-${ctx.org.id}-${filters?.type ?? "all"}-${filters?.status ?? "all"}-${filters?.vendorId ?? "all"}-p${page}`],
        { tags: [cacheTags.stockBatches(ctx.org.id)], revalidate: 60 }
    )

    const { batches, total } = await getCached()

    return {
        success: true,
        data: {
            batches: batches.map(b => ({
                id: b.id,
                number: b.number,
                type: b.type,
                status: b.status,
                outputReason: b.outputReason,
                externalRef: b.externalRef,
                note: b.note,
                batchDate: b.batchDate,
                validatedAt: b.validatedAt,
                totalCost: b.totalCost ? Number(b.totalCost) : null,
                vendor: b.vendor,
                itemCount: b.items.length,
                totalQty: b.items.reduce((s, i) => s + Number(i.quantity), 0),
                items: b.items.map(i => ({
                    id: i.id, quantity: Number(i.quantity),
                    unitCost: i.unitCost ? Number(i.unitCost) : null,
                    product: i.product,
                })),
            })),
            total, page, pageSize,
        },
    }
}

// ─── GET ONE BON — détail complet avec lignes + mouvements ───────────────────
export async function getStockBatchAction(orgSlug: string, batchId: string) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }

    const getCached = unstable_cache(
        async () => prisma.stockBatch.findFirst({
            where: { id: batchId, organizationId: ctx.org.id },
            include: {
                vendor: true,
                items: {
                    include: {
                        product: {
                            select: { id: true, name: true, sku: true, barcode: true, unit: true, currentStock: true, costPrice: true, isActive: true },
                        },
                    },
                    orderBy: { id: "asc" },
                },
                movements: {
                    select: { id: true, type: true, direction: true, quantity: true, unitCost: true, totalCost: true, movedAt: true, note: true },
                    orderBy: { movedAt: "asc" },
                },
            },
        }),
        [`sb-${batchId}`],
        { tags: [cacheTags.stockBatch(batchId)], revalidate: 30 }
    )

    const batch = await getCached()
    if (!batch) return { success: false, error: "Bon introuvable" }

    return {
        success: true,
        data: {
            ...batch,
            totalCost: batch.totalCost ? Number(batch.totalCost) : null,
            items: batch.items.map(i => ({
                ...i,
                quantity: Number(i.quantity),
                unitCost: i.unitCost ? Number(i.unitCost) : null,
                totalCost: i.totalCost ? Number(i.totalCost) : null,
                product: {
                    ...i.product,
                    currentStock: Number(i.product.currentStock),
                    costPrice: i.product.costPrice ? Number(i.product.costPrice) : null,
                },
            })),
            movements: batch.movements.map(m => ({
                ...m,
                quantity: Number(m.quantity),
                unitCost: m.unitCost ? Number(m.unitCost) : null,
                totalCost: m.totalCost ? Number(m.totalCost) : null,
            })),
        },
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET MOVEMENTS — historique, filtrable par produit / type / source / dates
// ═══════════════════════════════════════════════════════════════════════════
export async function getStockMovementsAction(
    orgSlug: string,
    filters?: {
        productId?: string
        type?: string
        referenceType?: string  // "BATCH" | "SALE" | "INVENTORY"
        dateFrom?: string  // "YYYY-MM-DD"
        dateTo?: string
        page?: number
        pageSize?: number
    }
) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }

    const page = filters?.page ?? 1
    const pageSize = filters?.pageSize ?? 30
    const skip = (page - 1) * pageSize

    const where: any = { organizationId: ctx.org.id }
    if (filters?.productId) where.productId = filters.productId
    if (filters?.type) where.type = filters.type
    if (filters?.referenceType) where.referenceType = filters.referenceType
    if (filters?.dateFrom || filters?.dateTo) {
        where.movedAt = {}
        if (filters.dateFrom) where.movedAt.gte = new Date(filters.dateFrom)
        if (filters.dateTo) where.movedAt.lte = new Date(`${filters.dateTo}T23:59:59`)
    }

    const getCached = unstable_cache(
        async () => {
            const [movements, total] = await Promise.all([
                prisma.stockMovement.findMany({
                    where,
                    include: {
                        product: { select: { id: true, name: true, sku: true, unit: true } },
                        vendor: { select: { id: true, name: true } },
                        stockBatch: { select: { id: true, number: true, type: true } },
                    },
                    orderBy: { movedAt: "desc" },
                    skip, take: pageSize,
                }),
                prisma.stockMovement.count({ where }),
            ])
            return { movements, total }
        },
        [`sm-${ctx.org.id}-${filters?.productId ?? "all"}-${filters?.type ?? "all"}-${filters?.referenceType ?? "all"}-p${page}`],
        { tags: [cacheTags.stockMovements(ctx.org.id)], revalidate: 60 }
    )

    const { movements, total } = await getCached()

    return {
        success: true,
        data: {
            movements: movements.map(m => ({
                id: m.id,
                type: m.type,
                direction: m.direction,
                quantity: Number(m.quantity),
                unitCost: m.unitCost ? Number(m.unitCost) : null,
                totalCost: m.totalCost ? Number(m.totalCost) : null,
                referenceType: m.referenceType,
                referenceId: m.referenceId,
                batchNumber: m.batchNumber,
                expiryDate: m.expiryDate,
                note: m.note,
                movedAt: m.movedAt,
                product: m.product,
                vendor: m.vendor,
                stockBatch: m.stockBatch,
            })),
            total, page, pageSize,
        },
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET ALERTS — produits en rupture ou sous le seuil d'alerte (cache 120s)
// ═══════════════════════════════════════════════════════════════════════════
export async function getStockAlertsAction(orgSlug: string) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }

    const getCached = unstable_cache(
        async () => {
            // Récupérer tous les produits physiques actifs
            const products = await prisma.product.findMany({
                where: { organizationId: ctx.org.id, isService: false, isActive: true },
                select: {
                    id: true, name: true, sku: true, unit: true,
                    currentStock: true, minStockAlert: true,
                    category: { select: { name: true, color: true, icon: true } },
                },
                orderBy: { currentStock: "asc" },
            })
            return products
        },
        [`sa-${ctx.org.id}`],
        { tags: [cacheTags.stockAlerts(ctx.org.id)], revalidate: 120 }
    )

    const products = await getCached()

    const alerts = products.filter(p => {
        const stock = Number(p.currentStock)
        const alert = p.minStockAlert ? Number(p.minStockAlert) : null
        return stock <= 0 || (alert !== null && stock <= alert)
    })

    return {
        success: true,
        data: alerts.map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            unit: p.unit,
            currentStock: Number(p.currentStock),
            minStockAlert: p.minStockAlert ? Number(p.minStockAlert) : null,
            isOutOfStock: Number(p.currentStock) <= 0,
            category: p.category,
        })),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET PLAN INFO — usage du mois + limites plan (cache 5 min)
// ═══════════════════════════════════════════════════════════════════════════
export async function getStockPlanInfoAction(orgSlug: string) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }

    const getCached = unstable_cache(
        async () => {
            const planName = await getOrgPlan(ctx.org.id)
            const limits = PLAN_LIMITS[planName]
            const now = new Date()
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

            const [batchCount, productCount] = await Promise.all([
                prisma.stockBatch.count({
                    where: { organizationId: ctx.org.id, createdAt: { gte: monthStart, lte: monthEnd } },
                }),
                prisma.product.count({ where: { organizationId: ctx.org.id, isActive: true, isService: false } }),
            ])

            return {
                planName,
                hasStockModule: limits.hasStockModule,
                batchCount,
                batchLimit: limits.maxStockBatches,
                productCount,
                productLimit: limits.maxProducts,
            }
        },
        [`sp-${ctx.org.id}`],
        { tags: [cacheTags.subscription(ctx.org.id), cacheTags.stockBatches(ctx.org.id)], revalidate: 300 }
    )

    return { success: true, data: await getCached() }
}