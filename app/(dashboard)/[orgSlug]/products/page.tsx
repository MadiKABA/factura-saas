// src/app/(dashboard)/[orgSlug]/products/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import ProductsWrapper from "./products-wrapper"

export default async function ProductsPage({
    params,
}: {
    params: Promise<{ orgSlug: string }>
}) {
    const { orgSlug } = await params

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")

    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true, name: true, slug: true, type: true, defaultCurrency: true },
    })
    if (!org) redirect("/")

    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) redirect("/")

    const [categories, productsRaw] = await Promise.all([
        prisma.productCategory.findMany({
            where: { organizationId: org.id },
            orderBy: { name: "asc" },
        }),
        prisma.product.findMany({
            where: { organizationId: org.id },
            include: { category: true },
            orderBy: { name: "asc" },
        }),
    ])

    const products = productsRaw.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        sku: p.sku,
        barcode: p.barcode,
        price: Number(p.price),
        costPrice: p.costPrice ? Number(p.costPrice) : null,
        isService: p.isService,
        currentStock: Number(p.currentStock),
        minStockAlert: p.minStockAlert ? Number(p.minStockAlert) : null,
        unit: p.unit,
        category: p.category ? {
            id: p.category.id, name: p.category.name,
            color: p.category.color, icon: p.category.icon,
        } : null,
    }))

    return (
        <ProductsWrapper
            orgSlug={orgSlug}
            currency={org.defaultCurrency}
            initialProducts={products}
            categories={categories}
        />
    )
}