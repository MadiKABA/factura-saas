// src/app/(dashboard)/[orgSlug]/products/categories/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import CategoriesClient from "./categories-client"

export default async function CategoriesPage({
    params,
}: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await params

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")

    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true, name: true },
    })
    if (!org) redirect("/")

    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) redirect("/")

    const categories = await prisma.productCategory.findMany({
        where: { organizationId: org.id },
        include: { _count: { select: { products: true } } },
        orderBy: { name: "asc" },
    }).catch(() => [])

    return (
        <CategoriesClient
            orgSlug={orgSlug}
            initialCategories={categories.map(c => ({
                id: c.id,
                name: c.name,
                color: c.color,
                icon: c.icon,
                productCount: c._count.products,
            }))}
        />
    )
}