// src/app/(dashboard)/[orgSlug]/pos/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import POSClient from "./pos-client"

export default async function POSPage({
    params,
}: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await params

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")

    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: {
            id: true, name: true,
            defaultCurrency: true,
        },
    })
    if (!org) redirect("/")

    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) redirect("/")

    const [productsRaw, categories, activeCashSession, clientsRaw] = await Promise.all([
        prisma.product.findMany({
            where: { organizationId: org.id, isActive: true },
            include: { category: { select: { id: true, name: true, color: true, icon: true } } },
            orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
        }),
        prisma.productCategory.findMany({
            where: { organizationId: org.id },
            orderBy: { name: "asc" },
        }),
        prisma.cashSession.findFirst({
            where: { organizationId: org.id, status: "OPEN" },
            orderBy: { openedAt: "desc" },
        }),
        prisma.client.findMany({
            where: { organizationId: org.id },
            select: { id: true, name: true, phone: true, loyaltyPoints: true },
            orderBy: { name: "asc" },
        }),
    ])

    const products = productsRaw.map(p => ({
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
    }))

    return (
        <POSClient
            orgSlug={orgSlug}
            org={{
                name: org.name,
                currency: org.defaultCurrency,
                receiptHeader: null,
                receiptFooter: null,
                receiptWidth: 80,
            }}
            products={products}
            categories={categories}
            activeCashSession={activeCashSession ? { id: activeCashSession.id } : null}
            clients={clientsRaw}
        />
    )
}