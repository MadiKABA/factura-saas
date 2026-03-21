// src/app/(dashboard)/[orgSlug]/sales/[saleId]/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import SaleDetailWrapper from "./sale-detail-wrapper"

export default async function SaleDetailPage({
    params, searchParams,
}: {
    params: Promise<{ orgSlug: string; saleId: string }>
    searchParams: Promise<{ tab?: string }>
}) {
    const { orgSlug, saleId } = await params
    const { tab } = await searchParams

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")

    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: {
            id: true, name: true, defaultCurrency: true,
            phone: true, address: true, email: true,
            logoUrl: true, taxId: true,
            receiptHeader: true, receiptFooter: true, receiptWidth: true,
        },
    })
    if (!org) redirect("/")

    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) redirect("/")

    const sale = await prisma.sale.findFirst({
        where: { id: saleId, organizationId: org.id },
        include: {
            client: { select: { id: true, name: true, phone: true, email: true, address: true } },
            items: true,
            payments: true,
            debt: { select: { id: true, amount: true, amountPaid: true, status: true, dueDate: true } },
        },
    })
    if (!sale) redirect(`/${orgSlug}/sales`)

    return (
        <SaleDetailWrapper
            orgSlug={orgSlug}
            defaultTab={tab ?? "detail"}
            org={{
                name: org.name,
                currency: org.defaultCurrency,
                phone: org.phone,
                address: org.address,
                email: org.email,
                logoUrl: org.logoUrl,
                taxId: org.taxId,
                receiptHeader: org.receiptHeader,
                receiptFooter: org.receiptFooter,
                receiptWidth: org.receiptWidth ?? 80,
            }}
            sale={{
                id: sale.id,
                number: sale.number,
                status: sale.status,
                saleDate: sale.saleDate,
                subtotal: Number(sale.subtotal),
                taxTotal: Number(sale.taxTotal),
                total: Number(sale.total),
                amountPaid: Number(sale.amountPaid),
                change: Number(sale.change),
                discount: Number(sale.discount),
                currencyCode: sale.currencyCode,
                note: sale.note,
                tableNumber: sale.tableNumber,
                client: sale.client,
                items: sale.items.map(i => ({
                    id: i.id,
                    name: i.name,
                    quantity: Number(i.quantity),
                    unitPrice: Number(i.unitPrice),
                    discount: Number(i.discount),
                    taxRate: Number(i.taxRate),
                    total: Number(i.total),
                })),
                payments: sale.payments.map(p => ({
                    method: p.method,
                    amount: Number(p.amount),
                })),
                debt: sale.debt ? {
                    id: sale.debt.id,
                    amount: Number(sale.debt.amount),
                    amountPaid: Number(sale.debt.amountPaid),
                    status: sale.debt.status,
                    dueDate: sale.debt.dueDate,
                } : null,
            }}
        />
    )
}