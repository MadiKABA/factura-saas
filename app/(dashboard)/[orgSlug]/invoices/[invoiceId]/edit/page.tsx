// src/app/(dashboard)/[orgSlug]/invoices/[invoiceId]/edit/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import { getInvoiceFormData } from "@/server/queries/invoice.query"
import { INVOICE_LOCKED_STATUSES } from "@/lib/validations/update.schema"
import EditInvoiceClient from "./edit-invoice-client"

export default async function EditInvoicePage({
    params,
}: {
    params: Promise<{ orgSlug: string; invoiceId: string }>
}) {
    const { orgSlug, invoiceId } = await params

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")

    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true, name: true, slug: true, defaultCurrency: true },
    })
    if (!org) redirect("/")

    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) redirect("/")

    const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: org.id },
        include: {
            client: true,
            items: {
                include: { taxRate: true },
                orderBy: { id: "asc" },
            },
        },
    })

    if (!invoice) redirect(`/${orgSlug}/invoices`)

    // Vérifier que le statut permet la modification
    if ((INVOICE_LOCKED_STATUSES as readonly string[]).includes(invoice.status)) {
        redirect(`/${orgSlug}/invoices/${invoiceId}`)
    }

    const formData = await getInvoiceFormData(org.id)

    return (
        <EditInvoiceClient
            orgSlug={orgSlug}
            orgName={org.name}
            defaultCurrency={org.defaultCurrency ?? invoice.currencyCode}
            invoice={invoice as any}
            clients={formData.clients}
            products={formData.products}
            taxRates={formData.taxRates}
        />
    )
}