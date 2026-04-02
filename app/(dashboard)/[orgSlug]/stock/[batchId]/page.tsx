// src/app/(dashboard)/[orgSlug]/stock/[batchId]/page.tsx
import { redirect, notFound } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import dynamic from "next/dynamic"

const StockBatchDetailWrapper = dynamic(() => import("./stock-batch-detail-wrapper"), { ssr: false })

export default async function StockBatchDetailPage({
    params,
}: { params: Promise<{ orgSlug: string; batchId: string }> }) {
    const { orgSlug, batchId } = await params

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

    const [batch, products, vendors] = await Promise.all([
        prisma.stockBatch.findFirst({
            where: { id: batchId, organizationId: org.id },
            include: {
                vendor: true,
                items: {
                    include: {
                        product: {
                            select: {
                                id: true, name: true, sku: true, barcode: true,
                                unit: true, currentStock: true, costPrice: true, isActive: true,
                            },
                        },
                    },
                    orderBy: { id: "asc" },
                },
                movements: {
                    select: {
                        id: true, type: true, direction: true, quantity: true,
                        unitCost: true, totalCost: true, movedAt: true, note: true,
                        product: { select: { id: true, name: true, unit: true } },
                    },
                    orderBy: { movedAt: "asc" },
                },
            },
        }),
        prisma.product.findMany({
            where: { organizationId: org.id, isService: false, isActive: true },
            select: { id: true, name: true, sku: true, barcode: true, unit: true, currentStock: true, costPrice: true, category: { select: { name: true, icon: true } } },
            orderBy: { name: "asc" },
        }),
        prisma.vendor.findMany({
            where: { organizationId: org.id },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        }),
    ])

    if (!batch) notFound()

    return (
        <StockBatchDetailWrapper
            orgSlug={orgSlug}
            currency={org.defaultCurrency}
            userRole={membership.role}
            batch={{
                id: batch.id,
                number: batch.number,
                type: batch.type,
                status: batch.status,
                outputReason: batch.outputReason,
                externalRef: batch.externalRef,
                note: batch.note,
                batchDate: batch.batchDate,
                validatedAt: batch.validatedAt,
                totalCost: batch.totalCost ? Number(batch.totalCost) : null,
                vendor: batch.vendor ? { id: batch.vendor.id, name: batch.vendor.name } : null,
                items: batch.items.map(i => ({
                    id: i.id,
                    productId: i.productId,
                    quantity: Number(i.quantity),
                    unitCost: i.unitCost ? Number(i.unitCost) : null,
                    totalCost: i.totalCost ? Number(i.totalCost) : null,
                    batchNumber: i.batchNumber,
                    expiryDate: i.expiryDate,
                    note: i.note,
                    product: {
                        id: i.product.id,
                        name: i.product.name,
                        sku: i.product.sku,
                        unit: i.product.unit,
                        currentStock: Number(i.product.currentStock),
                        costPrice: i.product.costPrice ? Number(i.product.costPrice) : null,
                    },
                })),
                movements: batch.movements.map(m => ({
                    id: m.id,
                    type: m.type,
                    direction: m.direction,
                    quantity: Number(m.quantity),
                    unitCost: m.unitCost ? Number(m.unitCost) : null,
                    totalCost: m.totalCost ? Number(m.totalCost) : null,
                    movedAt: m.movedAt,
                    note: m.note,
                    product: m.product,
                })),
            }}
            products={products.map(p => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                barcode: p.barcode,
                unit: p.unit,
                currentStock: Number(p.currentStock),
                costPrice: p.costPrice ? Number(p.costPrice) : null,
                category: p.category,
            }))}
            vendors={vendors}
        />
    )
}