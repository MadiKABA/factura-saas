// src/app/(dashboard)/[orgSlug]/stock/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import dynamic from "next/dynamic"
import { getOrgPlan, PLAN_LIMITS } from "@/lib/plan-limits"

const StockWrapper = dynamic(() => import("./stock-wrapper"), { ssr: false })

export default async function StockPage({
    params,
    searchParams,
}: {
    params: Promise<{ orgSlug: string }>
    searchParams: Promise<{ type?: string; status?: string; page?: string; tab?: string }>
}) {
    const { orgSlug } = await params
    const sp = await searchParams

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")

    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true, name: true, defaultCurrency: true },
    })
    if (!org) redirect("/")

    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) redirect("/")

    const page = Number(sp.page ?? 1)
    const pageSize = 25
    const skip = (page - 1) * pageSize

    const batchWhere: any = { organizationId: org.id }
    if (sp.type && sp.type !== "ALL") batchWhere.type = sp.type
    if (sp.status && sp.status !== "ALL") batchWhere.status = sp.status

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
        planName,
        batches, totalBatches,
        alerts,
        inventories,
        vendors,
        products,
        batchCountThisMonth,
        totalProducts,
        stats,
    ] = await Promise.all([
        getOrgPlan(org.id),

        // Bons de mouvement paginés
        prisma.stockBatch.findMany({
            where: batchWhere,
            include: {
                vendor: { select: { id: true, name: true } },
                items: { select: { id: true, quantity: true } },
            },
            orderBy: { batchDate: "desc" },
            skip, take: pageSize,
        }),
        prisma.stockBatch.count({ where: batchWhere }),

        // Alertes rupture / sous-seuil
        prisma.product.findMany({
            where: {
                organizationId: org.id, isService: false, isActive: true,
                OR: [
                    { currentStock: { lte: 0 } },
                    { AND: [{ minStockAlert: { not: null } }, { minStockAlert: { gt: 0 } }] },
                ],
            },
            select: {
                id: true, name: true, unit: true, currentStock: true, minStockAlert: true,
                category: { select: { name: true, color: true, icon: true } },
            },
            orderBy: { currentStock: "asc" },
            take: 30,
        }),

        // Inventaires récents
        prisma.inventory.findMany({
            where: { organizationId: org.id },
            include: { items: { select: { id: true, variance: true } } },
            orderBy: { startedAt: "desc" },
            take: 10,
        }),

        // Fournisseurs
        prisma.vendor.findMany({
            where: { organizationId: org.id },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        }),

        // Produits physiques pour le formulaire
        prisma.product.findMany({
            where: { organizationId: org.id, isService: false, isActive: true },
            select: { id: true, name: true, sku: true, barcode: true, unit: true, currentStock: true, costPrice: true, category: { select: { name: true, icon: true } } },
            orderBy: { name: "asc" },
        }),

        // Usage mois courant
        prisma.stockBatch.count({ where: { organizationId: org.id, createdAt: { gte: monthStart } } }),
        prisma.product.count({ where: { organizationId: org.id, isService: false, isActive: true } }),

        // Stats globales
        prisma.stockMovement.groupBy({
            by: ["type"],
            where: { organizationId: org.id, movedAt: { gte: monthStart } },
            _sum: { quantity: true },
        }),
    ])

    const limits = PLAN_LIMITS[planName]

    // Filtrer alertes réelles (stock ≤ seuil)
    const realAlerts = alerts.filter(p => {
        const s = Number(p.currentStock)
        const a = p.minStockAlert ? Number(p.minStockAlert) : null
        return s <= 0 || (a !== null && s <= a)
    })

    // Stats mouvements mois
    const statsMap = Object.fromEntries(stats.map(s => [s.type, Number(s._sum.quantity ?? 0)]))

    return (
        <StockWrapper
            orgSlug={orgSlug}
            currency={org.defaultCurrency}
            plan={{
                name: planName,
                hasStockModule: limits.hasStockModule,
                batchLimit: limits.maxStockBatches,
                batchCount: batchCountThisMonth,
                productLimit: limits.maxProducts,
                productCount: totalProducts,
            }}
            initialBatches={batches.map(b => ({
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
                itemCount: b.items.length,
                totalQty: b.items.reduce((s, i) => s + Number(i.quantity), 0),
                vendor: b.vendor,
            }))}
            totalBatches={totalBatches}
            page={page}
            pageSize={pageSize}
            initialType={sp.type ?? "ALL"}
            initialStatus={sp.status ?? "ALL"}
            initialTab={sp.tab ?? "batches"}
            alerts={realAlerts.map(p => ({
                id: p.id,
                name: p.name,
                unit: p.unit,
                currentStock: Number(p.currentStock),
                minStockAlert: p.minStockAlert ? Number(p.minStockAlert) : null,
                isOutOfStock: Number(p.currentStock) <= 0,
                category: p.category,
            }))}
            inventories={inventories.map(inv => ({
                id: inv.id,
                name: inv.name,
                status: inv.status,
                startedAt: inv.startedAt,
                closedAt: inv.closedAt,
                note: inv.note,
                itemCount: inv.items.length,
                varianceCount: inv.items.filter(i => Number(i.variance) !== 0).length,
            }))}
            vendors={vendors}
            products={products.map(p => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                barcode: p.barcode,
                unit: p.unit,
                currentStock: Number(p.currentStock),
                costPrice: p.costPrice ? Number(p.costPrice) : null,
                category: p.category,
            }))}
            statsMonth={{
                in: statsMap["IN"] ?? 0,
                out: (statsMap["OUT"] ?? 0) + (statsMap["LOSS"] ?? 0),
                adjustment: statsMap["ADJUSTMENT"] ?? 0,
            }}
        />
    )
}