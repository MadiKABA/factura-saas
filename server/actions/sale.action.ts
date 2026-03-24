// src/server/actions/sale.action.ts
"use server"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import { z } from "zod"

// ─── Schemas ──────────────────────────────────────────────────────────────────
const saleItemSchema = z.object({
    productId: z.string().uuid().optional(),
    name: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
    costPrice: z.number().min(0).optional(),
    discount: z.number().min(0).default(0),
    taxRate: z.number().min(0).max(100).default(0),
    total: z.number().min(0),
})

const salePaymentSchema = z.object({
    method: z.enum(["CASH", "MOBILE_MONEY", "CARD", "BANK_TRANSFER", "CHECK", "CREDIT", "OTHER"]),
    amount: z.number().positive(),
})

const createSaleSchema = z.object({
    clientId: z.string().uuid().optional(),
    cashSessionId: z.string().uuid().optional(),
    items: z.array(saleItemSchema).min(1, "Panier vide"),
    payments: z.array(salePaymentSchema).min(1, "Paiement requis"),
    discount: z.number().min(0).default(0),
    amountPaid: z.number().min(0),
    change: z.number().min(0).default(0),
    note: z.string().max(500).optional(),
    tableNumber: z.string().max(20).optional(),
    isOffline: z.boolean().default(false),
    offlineId: z.string().optional(),

    // Crédit — si paiement partiel par crédit
    debtContactName: z.string().optional(),
    debtContactPhone: z.string().optional(),
    debtNote: z.string().optional(),
    debtDueDate: z.string().optional(), // YYYY-MM-DD
})

type R<T = void> = { success: true; data: T } | { success: false; error: string }

// ─── Auth helper ──────────────────────────────────────────────────────────────
async function getCtx(orgSlug: string) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { error: "Non authentifié" } as const
    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true, name: true, defaultCurrency: true },
    })
    if (!org) return { error: "Organisation introuvable" } as const
    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) return { error: "Accès refusé" } as const
    return { session, org } as const
}

// ─── Numérotation vente ───────────────────────────────────────────────────────
async function generateSaleNumber(organizationId: string): Promise<string> {
    const d = new Date()
    const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
    const count = await prisma.sale.count({
        where: { organizationId, number: { startsWith: `VNT-${day}` } },
    })
    return `VNT-${day}-${String(count + 1).padStart(3, "0")}`
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE SALE
// ══════════════════════════════════════════════════════════════════════════════

export async function createSaleAction(
    orgSlug: string,
    input: z.infer<typeof createSaleSchema>
): Promise<R<{
    saleId: string
    number: string
    debtId: string | null
    change: number
}>> {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur" }
    const { org } = ctx

    const parsed = createSaleSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalide" }
    const data = parsed.data

    // Calculs totaux serveur
    const subtotal = data.items.reduce((s, i) => s + (i.unitPrice * i.quantity) - i.discount, 0)
    const taxTotal = data.items.reduce((s, i) => {
        const base = (i.unitPrice * i.quantity) - i.discount
        return s + base * (i.taxRate / 100)
    }, 0)
    const total = Number((subtotal + taxTotal - data.discount).toFixed(2))

    const number = await generateSaleNumber(org.id)

    // Montant crédit (dette) = payments avec method CREDIT
    const creditAmount = data.payments
        .filter(p => p.method === "CREDIT")
        .reduce((s, p) => s + p.amount, 0)

    try {
        const result = await prisma.$transaction(async (tx) => {

            // 1. Vérifier et décrémenter le stock pour chaque produit physique
            for (const item of data.items) {
                if (!item.productId) continue

                const product = await tx.product.findUnique({
                    where: { id: item.productId },
                    select: { id: true, name: true, isService: true, currentStock: true },
                })
                if (!product) throw new Error(`Produit introuvable : ${item.name}`)
                if (product.isService) continue

                const newStock = Number(product.currentStock) - item.quantity
                // Avertissement stock négatif — on autorise mais on signale
                await tx.product.update({
                    where: { id: item.productId },
                    data: { currentStock: Math.max(0, newStock) },
                })
            }

            // 2. Créer la vente
            const sale = await tx.sale.create({
                data: {
                    organizationId: org.id,
                    clientId: data.clientId || null,
                    cashSessionId: data.cashSessionId || null,
                    number,
                    status: "COMPLETED",
                    subtotal,
                    taxTotal,
                    total,
                    amountPaid: data.amountPaid,
                    change: data.change,
                    discount: data.discount,
                    currencyCode: org.defaultCurrency,
                    note: data.note || null,
                    tableNumber: data.tableNumber || null,
                    isOffline: data.isOffline,
                    offlineId: data.offlineId || null,
                },
            })

            // 3. Créer les lignes de vente
            await tx.saleItem.createMany({
                data: data.items.map(item => ({
                    saleId: sale.id,
                    productId: item.productId || null,
                    name: item.name,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    costPrice: item.costPrice || null,
                    discount: item.discount,
                    taxRate: item.taxRate,
                    total: item.total,
                })),
            })

            // 4. Créer les paiements
            await tx.salePayment.createMany({
                data: data.payments.map(p => ({
                    saleId: sale.id,
                    method: p.method as any,
                    amount: p.amount,
                })),
            })

            // 5. Créer les mouvements de stock OUT (un mouvement par produit)
            for (const item of data.items) {
                if (!item.productId) continue
                const product = await tx.product.findUnique({
                    where: { id: item.productId },
                    select: { isService: true, name: true },
                })
                if (product?.isService) continue

                const unitCost = item.costPrice ?? null
                const totalCost = unitCost ? unitCost * item.quantity : null

                await tx.stockMovement.create({
                    data: {
                        organizationId: org.id,
                        productId: item.productId,
                        type: "OUT",
                        direction: -1,
                        quantity: item.quantity,
                        unitCost,
                        totalCost,
                        referenceType: "SALE",
                        referenceId: sale.id,
                        note: `Vente ${number} — ${product?.name ?? item.name}`,
                        movedAt: new Date(),
                    },
                })
            }

            // 6. Créer la dette si paiement partiel en crédit
            let debt = null
            if (creditAmount > 0) {
                debt = await tx.debt.create({
                    data: {
                        organizationId: org.id,
                        type: "CUSTOMER",
                        clientId: data.clientId || null,
                        contactName: data.debtContactName || null,
                        contactPhone: data.debtContactPhone || null,
                        description: `Vente ${number}`,
                        amount: creditAmount,
                        amountPaid: 0,
                        currencyCode: org.defaultCurrency,
                        status: "OPEN",
                        dueDate: data.debtDueDate ? new Date(data.debtDueDate) : null,
                        saleId: sale.id,
                        note: data.debtNote || null,
                    },
                })

                // Mettre à jour loyaltyPoints si client connu
                if (data.clientId) {
                    const pts = Math.floor(total / 1000) // 1 point par 1000 XOF
                    await tx.client.update({
                        where: { id: data.clientId },
                        data: { loyaltyPoints: { increment: pts } },
                    })
                }
            }

            // 7. Loyalty points pour vente normale
            if (data.clientId && creditAmount === 0) {
                const pts = Math.floor(total / 1000)
                if (pts > 0) {
                    await tx.client.update({
                        where: { id: data.clientId },
                        data: { loyaltyPoints: { increment: pts } },
                    })
                }
            }

            return { sale, debt }
        })

        revalidatePath(`/${orgSlug}/pos`)

        return {
            success: true,
            data: {
                saleId: result.sale.id,
                number: result.sale.number,
                debtId: result.debt?.id ?? null,
                change: data.change,
            },
        }

    } catch (err: any) {
        console.error("createSaleAction:", err)
        return { success: false, error: err.message ?? "Erreur lors de la vente." }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET SALE (pour ticket)
// ══════════════════════════════════════════════════════════════════════════════

export async function getSaleAction(orgSlug: string, saleId: string) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error }

    const sale = await prisma.sale.findFirst({
        where: { id: saleId, organizationId: ctx.org.id },
        include: {
            client: { select: { name: true, phone: true } },
            items: true,
            payments: true,
        },
    })
    if (!sale) return { success: false, error: "Vente introuvable" }

    return {
        success: true,
        data: {
            id: sale.id,
            number: sale.number,
            saleDate: sale.saleDate,
            status: sale.status,
            subtotal: Number(sale.subtotal),
            taxTotal: Number(sale.taxTotal),
            total: Number(sale.total),
            amountPaid: Number(sale.amountPaid),
            change: Number(sale.change),
            discount: Number(sale.discount),
            currencyCode: sale.currencyCode,
            note: sale.note,
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
        },
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// DEBT ACTIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function getDebtsAction(
    orgSlug: string,
    filters?: { type?: "CUSTOMER" | "SUPPLIER"; status?: string }
) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error }

    const debts = await prisma.debt.findMany({
        where: {
            organizationId: ctx.org.id,
            ...(filters?.type && { type: filters.type }),
            ...(filters?.status && { status: filters.status as any }),
        },
        include: {
            client: { select: { id: true, name: true, phone: true } },
            vendor: { select: { id: true, name: true, phone: true } },
            repayments: { orderBy: { paidAt: "desc" } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    })

    return {
        success: true,
        data: debts.map(d => ({
            id: d.id,
            type: d.type,
            status: d.status,
            amount: Number(d.amount),
            amountPaid: Number(d.amountPaid),
            remaining: Number(d.amount) - Number(d.amountPaid),
            currencyCode: d.currencyCode,
            description: d.description,
            dueDate: d.dueDate,
            contactName: d.contactName ?? d.client?.name ?? d.vendor?.name ?? "—",
            contactPhone: d.contactPhone ?? d.client?.phone ?? d.vendor?.phone ?? null,
            clientId: d.clientId,
            vendorId: d.vendorId,
            createdAt: d.createdAt,
            repayments: d.repayments.map(r => ({
                id: r.id,
                amount: Number(r.amount),
                method: r.method,
                paidAt: r.paidAt,
                note: r.note,
            })),
        })),
    }
}

export async function createDebtAction(
    orgSlug: string,
    input: {
        type: "CUSTOMER" | "SUPPLIER"
        clientId?: string
        vendorId?: string
        contactName?: string
        contactPhone?: string
        amount: number
        description?: string
        dueDate?: string
        note?: string
    }
) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error }

    const debt = await prisma.debt.create({
        data: {
            organizationId: ctx.org.id,
            type: input.type,
            clientId: input.clientId || null,
            vendorId: input.vendorId || null,
            contactName: input.contactName || null,
            contactPhone: input.contactPhone || null,
            amount: input.amount,
            amountPaid: 0,
            currencyCode: ctx.org.defaultCurrency,
            status: "OPEN",
            description: input.description || null,
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            note: input.note || null,
        },
    })

    return { success: true, data: { id: debt.id } }
}

export async function addDebtRepaymentAction(
    orgSlug: string,
    debtId: string,
    input: { amount: number; method: string; note?: string }
) {
    const ctx = await getCtx(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error }

    const debt = await prisma.debt.findFirst({ where: { id: debtId, organizationId: ctx.org.id } })
    if (!debt) return { success: false, error: "Dette introuvable" }
    if (debt.status === "SETTLED") return { success: false, error: "Cette dette est déjà soldée." }

    const remaining = Number(debt.amount) - Number(debt.amountPaid)
    if (input.amount > remaining + 0.01)
        return { success: false, error: `Montant dépasse le reste dû : ${remaining.toFixed(0)}` }

    const result = await prisma.$transaction(async (tx) => {
        const repayment = await tx.debtRepayment.create({
            data: {
                debtId,
                amount: input.amount,
                method: input.method as any,
                note: input.note || null,
            },
        })
        const newPaid = Number(debt.amountPaid) + input.amount
        const newStatus = newPaid >= Number(debt.amount) - 0.01 ? "SETTLED"
            : newPaid > 0 ? "PARTIAL" : "OPEN"

        await tx.debt.update({
            where: { id: debtId },
            data: { amountPaid: newPaid, status: newStatus },
        })
        return { repayment, newStatus }
    })

    return { success: true, data: { newStatus: result.newStatus } }
}