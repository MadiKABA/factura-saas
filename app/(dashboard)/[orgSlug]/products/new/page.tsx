// src/app/(dashboard)/[orgSlug]/products/new/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import ProductFormClient from "./product-form-client"

export default async function NewProductPage({
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

    const categories = await prisma.productCategory.findMany({
        where: { organizationId: org.id },
        orderBy: { name: "asc" },
    }).catch(() => []) // table peut ne pas exister avant migration v3

    return (
        <ProductFormClient
            orgSlug={orgSlug}
            currency={org.defaultCurrency}
            categories={categories}
            mode="create"
        />
    )
}