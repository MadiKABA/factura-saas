// src/app/(dashboard)/[orgSlug]/quotes/[quoteId]/edit/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import { getInvoiceFormData } from "@/server/queries/invoice.query"
import { QUOTE_LOCKED_STATUSES } from "@/lib/validations/update.schema"
import EditQuoteClient from "./edit-quote-client"

export default async function EditQuotePage({
    params,
}: {
    params: Promise<{ orgSlug: string; quoteId: string }>
}) {
    const { orgSlug, quoteId } = await params

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

    const quote = await prisma.quote.findFirst({
        where: { id: quoteId, organizationId: org.id },
        include: {
            client: true,
            items: {
                include: { taxRate: true },
                orderBy: { id: "asc" },
            },
        },
    })

    if (!quote) redirect(`/${orgSlug}/quotes`)

    // Rediriger si statut verrouillé
    if ((QUOTE_LOCKED_STATUSES as readonly string[]).includes(quote.status)) {
        redirect(`/${orgSlug}/quotes/${quoteId}`)
    }

    const formData = await getInvoiceFormData(org.id)

    return (
        <EditQuoteClient
            orgSlug={orgSlug}
            orgName={org.name}
            defaultCurrency={org.defaultCurrency ?? quote.currencyCode}
            quote={quote as any}
            clients={formData.clients}
            products={formData.products}
            taxRates={formData.taxRates}
        />
    )
}