// src/app/(dashboard)/[orgSlug]/quotes/[quoteId]/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import QuoteDetailClient from "./quote-detail-client"

export default async function QuoteDetailPage({
    params,
}: {
    params: Promise<{ orgSlug: string; quoteId: string }>
}) {
    const { orgSlug, quoteId } = await params

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")

    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true, name: true, slug: true, address: true, email: true, phone: true },
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
            invoices: {
                select: { id: true, number: true, status: true },
            },
        },
    })

    if (!quote) redirect(`/${orgSlug}/quotes`)

    return (
        <QuoteDetailClient
            orgSlug={orgSlug}
            org={org}
            quote={quote as any}
        />
    )
}