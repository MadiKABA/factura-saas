// src/app/(dashboard)/[orgSlug]/quotes/new/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import { getInvoiceFormData } from "@/server/queries/invoice.query"
import CreateQuoteClient from "./create-quote-client"

export default async function CreateQuotePage({
    params,
}: {
    params: Promise<{ orgSlug: string }>
}) {
    const { orgSlug } = await params

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")

    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true, slug: true, name: true, defaultCurrency: true },
    })
    if (!org) redirect("/")

    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) redirect("/")

    // Réutilise la même query que pour les factures (clients, produits, taux TVA)
    const formData = await getInvoiceFormData(org.id)

    return (
        <CreateQuoteClient
            orgSlug={orgSlug}
            orgName={org.name}
            defaultCurrency={org.defaultCurrency}
            clients={formData.clients}
            products={formData.products}
            taxRates={formData.taxRates}
        />
    )
}