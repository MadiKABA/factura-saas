// src/server/actions/sales-list.action.ts
"use server"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"

type R<T = void> = { success: true; data: T } | { success: false; error: string }

async function getCtx(orgSlug: string) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { error: "Non authentifié" } as const
    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true, name: true, defaultCurrency: true, phone: true, address: true, email: true, logoUrl: true, receiptHeader: true, receiptFooter: true, receiptWidth: true },
    })
    if (!org) return { error: "Organisation introuvable" } as const
    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) return { error: "Accès refusé" } as const
    return { session, org } as const
}

// ══════════════════════════════════════════════════════════════════════════════
// GET SALES LIST
// ══════════════════════════════════════════════════════════════════════════════
export async function getSalesAction(
    orgSlug: string,
    filters?: {
        status?: string
        dateFrom?: string
        dateTo?: string
        search?: string
        page?: number
        pageSize?: number
    }
) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur" }

    const page = filters?.page ?? 1
    const pageSize = filters?.pageSize ?? 25
    const skip = (page - 1) * pageSize

    const where: any = { organizationId: ctx.org.id }
    if (filters?.status) where.status = filters.status
    if (filters?.dateFrom || filters?.dateTo) {
        where.saleDate = {}
        if (filters.dateFrom) where.saleDate.gte = new Date(filters.dateFrom)
        if (filters.dateTo) where.saleDate.lte = new Date(filters.dateTo + "T23:59:59")
    }
    if (filters?.search) {
        where.OR = [
            { number: { contains: filters.search, mode: "insensitive" } },
            { client: { name: { contains: filters.search, mode: "insensitive" } } },
        ]
    }

    const [sales, total] = await Promise.all([
        prisma.sale.findMany({
            where,
            include: {
                client: { select: { id: true, name: true, phone: true } },
                payments: { select: { method: true, amount: true } },
                items: { select: { id: true } },
            },
            orderBy: { saleDate: "desc" },
            skip, take: pageSize,
        }),
        prisma.sale.count({ where }),
    ])

    return {
        success: true,
        data: {
            sales: sales.map(s => ({
                id: s.id,
                number: s.number,
                status: s.status,
                saleDate: s.saleDate,
                total: Number(s.total),
                amountPaid: Number(s.amountPaid),
                change: Number(s.change),
                discount: Number(s.discount),
                currencyCode: s.currencyCode,
                itemCount: s.items.length,
                note: s.note,
                client: s.client,
                payments: s.payments.map(p => ({ method: p.method, amount: Number(p.amount) })),
            })),
            total, page, pageSize,
        },
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET SALE DETAIL (avec infos org pour ticket/facture)
// ══════════════════════════════════════════════════════════════════════════════
export async function getSaleDetailAction(orgSlug: string, saleId: string) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur" }

    const sale = await prisma.sale.findFirst({
        where: { id: saleId, organizationId: ctx.org.id },
        include: {
            client: { select: { id: true, name: true, phone: true, email: true, address: true } },
            items: true,
            payments: true,
            debt: { select: { id: true, amount: true, amountPaid: true, status: true, dueDate: true } },
        },
    })
    if (!sale) return { success: false, error: "Vente introuvable" }

    return {
        success: true,
        data: {
            sale: {
                id: sale.id,
                number: sale.number,
                status: sale.status,
                saleDate: sale.saleDate,
                subtotal: Number(sale.subtotal),
                taxTotal: Number(sale.taxTotal),
                total: Number(sale.total),
                amountPaid: Number(sale.amountPaid),
                change: Number(sale.change),
                discount: Number(sale.discount),
                currencyCode: sale.currencyCode,
                note: sale.note,
                tableNumber: sale.tableNumber,
                client: sale.client,
                items: sale.items.map(i => ({
                    id: i.id,
                    name: i.name,
                    quantity: Number(i.quantity),
                    unitPrice: Number(i.unitPrice),
                    discount: Number(i.discount),
                    taxRate: Number(i.taxRate),
                    total: Number(i.total),
                })),
                payments: sale.payments.map(p => ({
                    method: p.method,
                    amount: Number(p.amount),
                })),
                debt: sale.debt ? {
                    id: sale.debt.id,
                    amount: Number(sale.debt.amount),
                    amountPaid: Number(sale.debt.amountPaid),
                    status: sale.debt.status,
                    dueDate: sale.debt.dueDate,
                } : null,
            },
            org: {
                name: ctx.org.name,
                currency: ctx.org.defaultCurrency,
                phone: ctx.org.phone,
                address: ctx.org.address,
                email: ctx.org.email,
                logoUrl: ctx.org.logoUrl,
                receiptHeader: ctx.org.receiptHeader,
                receiptFooter: ctx.org.receiptFooter,
                receiptWidth: ctx.org.receiptWidth,
            },
        },
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// CANCEL SALE
// ══════════════════════════════════════════════════════════════════════════════
export async function cancelSaleAction(
    orgSlug: string,
    saleId: string
): Promise<R> {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur" }

    const sale = await prisma.sale.findFirst({
        where: { id: saleId, organizationId: ctx.org.id },
        include: { items: { include: { product: true } } },
    })
    if (!sale) return { success: false, error: "Vente introuvable" }
    if (sale.status === "CANCELLED") return { success: false, error: "Vente déjà annulée" }
    if (sale.status === "REFUNDED") return { success: false, error: "Vente déjà remboursée" }

    await prisma.$transaction(async tx => {
        // Remettre le stock
        for (const item of sale.items) {
            if (item.productId && item.product && !item.product.isService) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { currentStock: { increment: Number(item.quantity) } },
                })
                await tx.stockMovement.create({
                    data: {
                        organizationId: ctx.org.id,
                        productId: item.productId,
                        type: "IN",
                        direction: 1,
                        quantity: item.quantity,
                        referenceType: "SALE_CANCEL",
                        referenceId: saleId,
                        note: `Annulation vente ${sale.number}`,
                    },
                })
            }
        }
        await tx.sale.update({
            where: { id: saleId },
            data: { status: "CANCELLED" },
        })
        // Annuler la dette liée si existe
        if (sale.id) {
            await tx.debt.updateMany({
                where: { saleId: sale.id, status: { in: ["OPEN", "PARTIAL"] } },
                data: { status: "CANCELLED" },
            })
        }
    })

    revalidatePath(`/${orgSlug}/sales`)
    return { success: true, data: undefined }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONVERT SALE TO INVOICE
// ══════════════════════════════════════════════════════════════════════════════
export async function convertSaleToInvoiceAction(
    orgSlug: string,
    saleId: string
): Promise<R<{ invoiceId: string; invoiceNumber: string; alreadyExisted: boolean }>> {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur" }

    const sale = await prisma.sale.findFirst({
        where: { id: saleId, organizationId: ctx.org.id },
        include: { items: true, payments: true, client: true },
    })
    if (!sale) return { success: false, error: "Vente introuvable" }
    if (sale.status === "CANCELLED") return { success: false, error: "Impossible de facturer une vente annulée" }

    // ── Vérifier si une facture existe déjà pour cette vente ──────────────────
    // On utilise les notes comme référence (avant migration avec originSaleId)
    // Après migration v4b : utiliser originSaleId
    const existingInvoice = await prisma.invoice.findFirst({
        where: {
            organizationId: ctx.org.id,
            // Chercher via originSaleId si le champ existe (après migration)
            // ou via notes en fallback
            OR: [
                { notes: { contains: `VNT-` } },
            ],
        },
        // On filtre côté JS pour robustesse
    })

    // Vérification précise : chercher une facture liée à ce numéro de vente
    const linkedInvoice = await prisma.invoice.findFirst({
        where: {
            organizationId: ctx.org.id,
            notes: { contains: sale.number },
        },
    })

    if (linkedInvoice) {
        // Facture déjà existante — retourner sans recréer
        return {
            success: true,
            data: { invoiceId: linkedInvoice.id, invoiceNumber: linkedInvoice.number, alreadyExisted: true },
        }
    }

    // ── Générer numéro facture unique ─────────────────────────────────────────
    const year = new Date().getFullYear()
    const count = await prisma.invoice.count({ where: { organizationId: ctx.org.id } })
    const invoiceNumber = `FAC-${year}-${String(count + 1).padStart(4, "0")}`

    const invoice = await prisma.$transaction(async tx => {
        const inv = await tx.invoice.create({
            data: {
                organizationId: ctx.org.id,
                clientId: sale.clientId,
                number: invoiceNumber,
                status: Number(sale.amountPaid) >= Number(sale.total) ? "PAID" : "PARTIAL",
                issueDate: sale.saleDate,
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                subtotal: sale.subtotal,
                taxTotal: sale.taxTotal,
                total: sale.total,
                currencyCode: sale.currencyCode,
                // Notes encodent le lien vente — utilisé pour détection doublon
                notes: sale.note
                    ? `Vente POS ${sale.number} — ${sale.note}`
                    : `Vente POS ${sale.number}`,
                items: {
                    create: sale.items.map(i => ({
                        name: i.name,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                        total: i.total,
                        isService: false,
                        productId: i.productId,
                    })),
                },
                payments: {
                    create: sale.payments
                        .filter(p => p.method !== "CREDIT")
                        .map(p => ({
                            amount: p.amount,
                            method: p.method as any,
                            paidAt: sale.saleDate,
                            note: `Paiement POS ${sale.number}`,
                        })),
                },
            },
        })
        return inv
    })

    revalidatePath(`/${orgSlug}/invoices`)
    return { success: true, data: { invoiceId: invoice.id, invoiceNumber: invoice.number, alreadyExisted: false } }
}