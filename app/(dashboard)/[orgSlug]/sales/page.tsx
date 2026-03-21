// src/app/(dashboard)/[orgSlug]/sales/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import SalesWrapper from "./sales-wrapper"

export default async function SalesPage({
    params,
}: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await params

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

    const salesRaw = await prisma.sale.findMany({
        where: { organizationId: org.id },
        include: {
            client: { select: { id: true, name: true, phone: true } },
            payments: { select: { method: true, amount: true } },
            items: { select: { id: true } },
        },
        orderBy: { saleDate: "desc" },
        take: 50,
    })

    // Stats du jour
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)

    const [todayStats, totalStats] = await Promise.all([
        prisma.sale.aggregate({
            where: { organizationId: org.id, status: "COMPLETED", saleDate: { gte: todayStart, lte: todayEnd } },
            _sum: { total: true, amountPaid: true },
            _count: { id: true },
        }),
        prisma.sale.aggregate({
            where: { organizationId: org.id, status: "COMPLETED" },
            _sum: { total: true },
            _count: { id: true },
        }),
    ])

    const sales = salesRaw.map(s => ({
        id: s.id,
        number: s.number,
        status: s.status,
        saleDate: s.saleDate,
        total: Number(s.total),
        amountPaid: Number(s.amountPaid),
        discount: Number(s.discount),
        currencyCode: s.currencyCode,
        itemCount: s.items.length,
        note: s.note,
        client: s.client,
        payments: s.payments.map(p => ({ method: p.method, amount: Number(p.amount) })),
    }))

    return (
        <SalesWrapper
            orgSlug={orgSlug}
            currency={org.defaultCurrency}
            initialSales={sales}
            stats={{
                todayCount: todayStats._count.id,
                todayTotal: Number(todayStats._sum.total ?? 0),
                totalCount: totalStats._count.id,
                totalRevenue: Number(totalStats._sum.total ?? 0),
            }}
        />
    )
}