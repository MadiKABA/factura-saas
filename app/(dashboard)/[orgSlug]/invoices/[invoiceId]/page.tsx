// src/app/(dashboard)/[orgSlug]/invoices/[invoiceId]/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import { getInvoiceById } from "@/server/queries/invoice.query"
import InvoiceDetailClient from "./invoice-detail-client"

export default async function InvoiceDetailPage({
    params,
}: {
    params: Promise<{ orgSlug: string; invoiceId: string }>
}) {
    const { orgSlug, invoiceId } = await params

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")

    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true, name: true, slug: true, address: true, email: true, phone: true, logoUrl: true },
    })
    if (!org) redirect("/")

    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) redirect("/")

    const invoice = await getInvoiceById(invoiceId, org.id)
    const rawPayments = await prisma.payment.findMany({
        where: { invoiceId: invoiceId },
        orderBy: { createdAt: 'desc' }
    })
    if (!invoice) redirect(`/${orgSlug}/invoices`)

    // Sérialiser Decimal → number et PaymentMethod enum → string
    const payments = rawPayments.map(p => ({
        id: p.id,
        amount: Number(p.amount),   // Decimal → number
        paidAt: p.paidAt,
        method: p.method as string, // PaymentMethod enum → string
        note: p.note,
    }))

    return (
        <InvoiceDetailClient
            orgSlug={orgSlug}
            org={org}
            invoice={invoice as any}
            payments={payments || []}
        />
    )
}