// src/server/actions/stock-movements.action.ts
"use server"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"

type R<T = void> = { success: true; data: T } | { success: false; error: string }

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

// ── Labels lisibles par type de mouvement ────────────────────────────────────
export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
    IN: "Entrée stock",
    OUT: "Sortie vente",
    ADJUSTMENT: "Ajustement inventaire",
    LOSS: "Perte / Casse",
    TRANSFER: "Transfert",
}

export const MOVEMENT_REFERENCE_LABELS: Record<string, string> = {
    SALE: "Vente POS",
    SALE_CANCEL: "Annulation vente",
    BATCH: "Bon de mouvement",
    INVOICE: "Facture",
    INVENTORY: "Inventaire",
    MANUAL: "Saisie manuelle",
    RECEPTION: "Réception fournisseur",
}

// ══════════════════════════════════════════════════════════════════════════════
// MOUVEMENTS D'UNE VENTE — quels produits ont été sortis
// ══════════════════════════════════════════════════════════════════════════════
export async function getSaleMovementsAction(orgSlug: string, saleId: string) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur" }

    const movements = await prisma.stockMovement.findMany({
        where: {
            organizationId: ctx.org.id,
            referenceType: "SALE",
            referenceId: saleId,
        },
        include: {
            product: {
                select: { id: true, name: true, sku: true, unit: true, barcode: true },
            },
        },
        orderBy: { movedAt: "desc" },
    })

    return {
        success: true,
        data: movements.map(m => ({
            id: m.id,
            type: m.type,
            direction: m.direction,
            quantity: Number(m.quantity),
            unitCost: m.unitCost ? Number(m.unitCost) : null,
            totalCost: m.totalCost ? Number(m.totalCost) : null,
            referenceType: m.referenceType,
            referenceId: m.referenceId,
            note: m.note,
            movedAt: m.movedAt,
            product: m.product,
        })),
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// MOUVEMENTS D'UN PRODUIT — historique complet
// ══════════════════════════════════════════════════════════════════════════════
export async function getProductStockHistoryAction(
    orgSlug: string,
    productId: string,
    limit = 30
) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur" }

    const movements = await prisma.stockMovement.findMany({
        where: { organizationId: ctx.org.id, productId },
        include: {
            vendor: { select: { id: true, name: true } },
        },
        orderBy: { movedAt: "desc" },
        take: limit,
    })

    // Calculer le stock à chaque instant (running balance)
    let runningStock: number | null = null
    const withBalance = [...movements].reverse().map(m => {
        if (runningStock === null) runningStock = 0
        runningStock += m.direction * Number(m.quantity)
        return {
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
            vendor: m.vendor,
            stockAfter: runningStock,
        }
    }).reverse() // Re-inverser pour avoir du plus récent au plus ancien

    return { success: true, data: withBalance }
}

// ══════════════════════════════════════════════════════════════════════════════
// TOUS LES MOUVEMENTS DE L'ORG — avec filtres
// ══════════════════════════════════════════════════════════════════════════════
export async function getAllMovementsAction(
    orgSlug: string,
    filters?: {
        type?: string
        referenceType?: string
        productId?: string
        dateFrom?: string
        dateTo?: string
        page?: number
        pageSize?: number
    }
) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur" }

    const page = filters?.page ?? 1
    const pageSize = filters?.pageSize ?? 30
    const skip = (page - 1) * pageSize

    const where: any = { organizationId: ctx.org.id }
    if (filters?.type) where.type = filters.type
    if (filters?.referenceType) where.referenceType = filters.referenceType
    if (filters?.productId) where.productId = filters.productId
    if (filters?.dateFrom || filters?.dateTo) {
        where.movedAt = {}
        if (filters.dateFrom) where.movedAt.gte = new Date(filters.dateFrom)
        if (filters.dateTo) where.movedAt.lte = new Date(filters.dateTo + "T23:59:59")
    }

    const [movements, total] = await Promise.all([
        prisma.stockMovement.findMany({
            where,
            include: {
                product: { select: { id: true, name: true, sku: true, unit: true } },
                vendor: { select: { id: true, name: true } },
            },
            orderBy: { movedAt: "desc" },
            skip, take: pageSize,
        }),
        prisma.stockMovement.count({ where }),
    ])

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
            })),
            total, page, pageSize,
        },
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// MOUVEMENTS D'UN BON (StockBatch)
// ══════════════════════════════════════════════════════════════════════════════
export async function getBatchMovementsAction(orgSlug: string, batchId: string) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur" }

    const movements = await prisma.stockMovement.findMany({
        where: {
            organizationId: ctx.org.id,
            referenceType: "BATCH",
            referenceId: batchId,
        },
        include: {
            product: { select: { id: true, name: true, sku: true, unit: true, currentStock: true } },
        },
        orderBy: { movedAt: "asc" },
    })

    return {
        success: true,
        data: movements.map(m => ({
            id: m.id,
            type: m.type,
            direction: m.direction,
            quantity: Number(m.quantity),
            unitCost: m.unitCost ? Number(m.unitCost) : null,
            totalCost: m.totalCost ? Number(m.totalCost) : null,
            batchNumber: m.batchNumber,
            expiryDate: m.expiryDate,
            note: m.note,
            movedAt: m.movedAt,
            product: {
                ...m.product,
                currentStock: Number(m.product.currentStock),
            },
        })),
    }
}