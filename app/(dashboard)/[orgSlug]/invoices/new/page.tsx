// src/app/(dashboard)/[orgSlug]/invoices/new/page.tsx
import { redirect } from "next/navigation"
import { getInvoiceFormData, getPlanLimitInfo } from "@/server/queries/invoice.query"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import { headers } from "next/headers"
import CreateInvoiceClient from "./create-invoice-client"

export default async function CreateInvoicePage({
    params,
}: {
    params: Promise<{ orgSlug: string }>  // Next.js 15 : params est une Promise
}) {
    const { orgSlug } = await params       // ← await obligatoire

    // Auth
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")

    // Org
    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true, slug: true, name: true, defaultCurrency: true },
    })
    if (!org) redirect("/")

    // Vérifier accès
    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) redirect("/")

    // Données formulaire + limite plan en parallèle
    const [formData, planInfo] = await Promise.all([
        getInvoiceFormData(org.id),
        getPlanLimitInfo(org.id),
    ])

    // Si limite atteinte → rediriger vers page invoices avec message
    if (!planInfo.canCreate) {
        redirect(`/${orgSlug}/invoices?limit=true`)
    }

    return (
        <CreateInvoiceClient
            orgSlug={orgSlug}
            orgName={org.name}
            defaultCurrency={org.defaultCurrency}
            clients={formData.clients}
            products={formData.products}
            taxRates={formData.taxRates}
            quotes={formData.quotes}
            planInfo={planInfo}
        />
    )
}