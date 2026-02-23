// src/server/queries/invoice.query.ts
// Fonctions de lecture optimisées avec cache Next.js
// À utiliser dans les Server Components (pas dans les actions)
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { prisma } from "@/server/db"

// ─── Factures d'une organisation ─────────────────────────────────────────────
// cache() de React déduplique les appels dans le même render
export const getInvoicesByOrg = cache(async (
    organizationId: string,
    options?: {
        status?: string
        page?: number
        pageSize?: number
    }
) => {
    const page = options?.page ?? 1
    const pageSize = options?.pageSize ?? 20

    return unstable_cache(
        async () => prisma.invoice.findMany({
            where: {
                organizationId,
                ...(options?.status && { status: options.status as any }),
            },
            select: {
                id: true, number: true, status: true,
                total: true, issueDate: true, dueDate: true, currencyCode: true,
                createdAt: true,
                client: { select: { name: true } },
                _count: { select: { payments: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        [`invoices-${organizationId}-${options?.status ?? "all"}-p${page}`],
        {
            tags: [`invoices-${organizationId}`],
            revalidate: 60, // 60s de cache côté serveur
        }
    )()
})

// ─── Détail d'une facture ─────────────────────────────────────────────────────
export const getInvoiceById = cache(async (
    invoiceId: string,
    organizationId: string
) => {
    return unstable_cache(
        async () => prisma.invoice.findFirst({
            where: { id: invoiceId, organizationId },
            include: {
                client: true,
                items: {
                    include: {
                        taxRate: true,
                        product: { select: { id: true, name: true, sku: true } },
                    },
                    orderBy: { id: "asc" },
                },
                payments: {
                    orderBy: { createdAt: "desc" },
                },
                originQuote: {
                    select: { id: true, number: true },
                },
            },
        }),
        [`invoice-${invoiceId}`],
        {
            tags: [`invoice-${invoiceId}`, `invoices-${organizationId}`],
            revalidate: 30,
        }
    )()
})

// ─── Stats pour le dashboard ──────────────────────────────────────────────────
export const getInvoiceStats = cache(async (organizationId: string) => {
    return unstable_cache(
        async () => {
            const [total, byStatus, overdueTotal, monthTotal] = await Promise.all([
                // Nombre total de factures actives
                prisma.invoice.count({
                    where: { organizationId, status: { not: "CANCELLED" } },
                }),

                // Répartition par statut
                prisma.invoice.groupBy({
                    by: ["status"],
                    where: { organizationId },
                    _count: { status: true },
                    _sum: { total: true },
                }),

                // Montant total en retard
                prisma.invoice.aggregate({
                    where: {
                        organizationId,
                        status: "OVERDUE",
                    },
                    _sum: { total: true },
                }),

                // Factures du mois courant
                prisma.invoice.aggregate({
                    where: {
                        organizationId,
                        status: { not: "CANCELLED" },
                        issueDate: {
                            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                        },
                    },
                    _sum: { total: true },
                    _count: { id: true },
                }),
            ])

            return {
                total,
                byStatus: byStatus.map(s => ({
                    status: s.status,
                    count: s._count.status,
                    sum: Number(s._sum.total ?? 0),
                })),
                overdueTotal: Number(overdueTotal._sum.total ?? 0),
                monthTotal: Number(monthTotal._sum.total ?? 0),
                monthCount: monthTotal._count.id,
            }
        },
        [`invoice-stats-${organizationId}`],
        {
            tags: [`invoices-${organizationId}`, `dashboard-${organizationId}`],
            revalidate: 120, // 2 minutes — stats moins critiques
        }
    )()
})

// ─── Données formulaire (clients, produits, TVA, devis) ──────────────────────
export const getInvoiceFormData = cache(async (organizationId: string) => {
    return unstable_cache(
        async () => {
            const [clients, products, taxRates, availableQuotes] = await Promise.all([
                prisma.client.findMany({
                    where: { organizationId },
                    select: { id: true, name: true, email: true, phone: true, type: true },
                    orderBy: { name: "asc" },
                }),
                prisma.product.findMany({
                    where: { organizationId },
                    select: { id: true, name: true, price: true, isService: true, sku: true, description: true },
                    orderBy: { name: "asc" },
                }),
                prisma.taxRate.findMany({
                    where: { organizationId },
                    select: { id: true, name: true, rate: true, isDefault: true },
                    orderBy: [{ isDefault: "desc" }, { rate: "asc" }],
                }),
                // Devis convertibles (envoyés ou acceptés, sans facture liée)
                prisma.quote.findMany({
                    where: {
                        organizationId,
                        status: { in: ["SENT", "ACCEPTED"] },
                        invoices: { none: {} },
                    },
                    select: {
                        id: true, number: true, total: true,
                        client: { select: { name: true } },
                    },
                    orderBy: { createdAt: "desc" },
                    take: 20,
                }),
            ])

            return {
                clients,
                products: products.map(p => ({ ...p, price: Number(p.price) })),
                taxRates: taxRates.map(t => ({ ...t, rate: Number(t.rate) })),
                quotes: availableQuotes.map(q => ({
                    id: q.id,
                    number: q.number,
                    clientName: q.client?.name ?? "Client inconnu",
                    total: Number(q.total),
                })),
            }
        },
        [`invoice-form-data-${organizationId}`],
        {
            tags: [`invoices-${organizationId}`],
            revalidate: 300, // 5 minutes — données stables
        }
    )()
})

// ─── Vérification limite plan (non cachée — critique pour la cohérence) ───────
// Type de retour explicite pour éviter les incompatibilités
export type PlanLimitInfo = {
    canCreate: boolean
    reason?: string
    planLimit: number | null
    currentCount: number
    planName: string   // toujours défini — "FREE" par défaut si pas d'abonnement
}

export async function getPlanLimitInfo(organizationId: string): Promise<PlanLimitInfo> {
    const [subscription, invoiceCount] = await Promise.all([
        prisma.subscription.findUnique({
            where: { organizationId },
            include: { plan: true },
        }),
        prisma.invoice.count({
            where: { organizationId, status: { not: "CANCELLED" } },
        }),
    ])

    if (!subscription) {
        return {
            canCreate: false,
            reason: "Aucun abonnement actif",
            planLimit: null,
            currentCount: invoiceCount,
            planName: "FREE",   // ← valeur par défaut, évite undefined
        }
    }

    const planLimit = subscription.plan.maxInvoices
    const planName = String(subscription.plan.name)  // PlanType → string

    if (planLimit !== null && invoiceCount >= planLimit) {
        return {
            canCreate: false,
            reason: `Limite atteinte (${invoiceCount}/${planLimit}). Passe au plan supérieur.`,
            planLimit,
            currentCount: invoiceCount,
            planName,
        }
    }

    return {
        canCreate: true,
        planLimit,
        currentCount: invoiceCount,
        planName,
    }
}