// src/app/(dashboard)/[orgSlug]/products/[productId]/edit/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import ProductFormClient from "../../new/product-form-client";

export default async function EditProductPage({
    params,
}: { params: Promise<{ orgSlug: string; productId: string }> }) {
    const { orgSlug, productId } = await params

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

    const product = await prisma.product.findFirst({
        where: { id: productId, organizationId: org.id },
        include: { category: true },
    })
    if (!product) redirect(`/${orgSlug}/products`)

    const categories = await prisma.productCategory.findMany({
        where: { organizationId: org.id },
        orderBy: { name: "asc" },
    }).catch(() => [])

    return (
        <ProductFormClient
            orgSlug={orgSlug}
            currency={org.defaultCurrency}
            categories={categories}
            mode="edit"
            product={{
                id: product.id,
                name: product.name,
                description: product.description,
                sku: product.sku,
                barcode: product.barcode,
                price: Number(product.price),
                costPrice: product.costPrice ? Number(product.costPrice) : null,
                isService: product.isService,
                unit: product.unit,
                currentStock: Number(product.currentStock),
                minStockAlert: product.minStockAlert ? Number(product.minStockAlert) : null,
                category: product.category ? {
                    id: product.category.id, name: product.category.name,
                    color: product.category.color, icon: product.category.icon,
                } : null,
            }}
        />
    )
}