// src/server/actions/quote.action.ts
"use server"
import { revalidateTag, revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import { createQuoteSchema, type CreateQuoteInput, type QuoteActionResult } from "@/lib/validations/quote.schema"

// ─── Helper auth + org ────────────────────────────────────────────────────────
async function getSessionAndOrg(orgSlug: string) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { error: "Non authentifié" } as const

    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } })
    if (!org) return { error: "Organisation introuvable" } as const

    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership) return { error: "Accès refusé" } as const

    return { session, org } as const
}

// ─── Numérotation automatique ─────────────────────────────────────────────────
async function generateQuoteNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear()
    const prefix = `DEV-${year}-`
    const count = await prisma.quote.count({
        where: { organizationId, number: { startsWith: prefix } },
    })
    return `${prefix}${String(count + 1).padStart(4, "0")}`
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATE
// ═════════════════════════════════════════════════════════════════════════════
export async function createQuoteAction(
    orgSlug: string,
    input: CreateQuoteInput
): Promise<QuoteActionResult<{ id: string; number: string }>> {

    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const parsed = createQuoteSchema.safeParse(input)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        return { success: false, error: issue?.message ?? "Données invalides", field: issue?.path.join(".") || undefined }
    }
    const data = parsed.data

    const number = await generateQuoteNumber(org.id)

    try {
        const quote = await prisma.$transaction(async (tx) => {
            // Client inline
            let clientId = data.clientId ?? null
            if (!clientId && data.newClient) {
                const nc = data.newClient
                const client = await tx.client.create({
                    data: {
                        organizationId: org.id,
                        type: nc.type,
                        name: nc.name,
                        email: nc.email || null,
                        phone: nc.phone || null,
                        address: nc.address || null,
                        city: nc.city || null,
                        country: nc.country || null,
                        taxId: nc.taxId || null,
                    },
                })
                clientId = client.id
            }

            // Calculs serveur
            const computed = data.items.map(item => {
                const ht = Number((item.quantity * item.unitPrice).toFixed(2))
                const tva = Number((ht * (item.taxRate / 100)).toFixed(2))
                const total = Number((ht + tva).toFixed(2))
                return { ...item, ht, tva, total }
            })
            const subtotal = Number(computed.reduce((s, i) => s + i.ht, 0).toFixed(2))
            const taxTotal = Number(computed.reduce((s, i) => s + i.tva, 0).toFixed(2))
            const total = Number(computed.reduce((s, i) => s + i.total, 0).toFixed(2))

            const quote = await tx.quote.create({
                data: {
                    organizationId: org.id,
                    clientId,
                    number,
                    status: data.status,
                    issueDate: new Date(data.issueDate),
                    expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
                    subtotal, taxTotal, total,
                    currencyCode: data.currencyCode,
                    exchangeRate: data.exchangeRate ?? null,
                    notes: data.notes || null,
                    terms: data.terms || null,
                    internalNotes: data.internalNotes || null,
                },
            })

            await tx.quoteItem.createMany({
                data: computed.map(item => ({
                    quoteId: quote.id,
                    productId: item.productId ?? null,
                    taxRateId: item.taxRateId ?? null,
                    name: item.name,
                    description: item.description || null,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    total: item.total,
                    isService: item.isService,
                })),
            })

            return quote
        })

        revalidateTag(`quotes-${org.id}`, "default")
        revalidateTag(`dashboard-${org.id}`, "default")
        revalidatePath(`/${orgSlug}/quotes`, "page")

        return { success: true, data: { id: quote.id, number: quote.number } }

    } catch (err) {
        console.error("createQuoteAction:", err)
        if (err instanceof Error && err.message.includes("Unique constraint"))
            return { success: false, error: "Erreur de numérotation, réessaie." }
        return { success: false, error: "Erreur lors de la création du devis." }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// UPDATE STATUS
// ═════════════════════════════════════════════════════════════════════════════
export async function updateQuoteStatusAction(
    orgSlug: string,
    quoteId: string,
    status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED"
): Promise<QuoteActionResult<{ status: string }>> {
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const existing = await prisma.quote.findFirst({ where: { id: quoteId, organizationId: org.id } })
    if (!existing) return { success: false, error: "Devis introuvable" }

    if (existing.status === "ACCEPTED" && status !== "ACCEPTED") {
        return { success: false, error: "Un devis accepté ne peut plus changer de statut." }
    }

    const updated = await prisma.quote.update({ where: { id: quoteId }, data: { status } })

    revalidateTag(`quotes-${org.id}`, "default")
    revalidateTag(`quote-${quoteId}`, "default")
    revalidateTag(`dashboard-${org.id}`, "default")
    revalidatePath(`/${orgSlug}/quotes`, "page")
    revalidatePath(`/${orgSlug}/quotes/${quoteId}`, "page")

    return { success: true, data: { status: updated.status } }
}

// ═════════════════════════════════════════════════════════════════════════════
// DELETE (DRAFT uniquement)
// ═════════════════════════════════════════════════════════════════════════════
export async function deleteQuoteAction(
    orgSlug: string,
    quoteId: string
): Promise<QuoteActionResult> {
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const quote = await prisma.quote.findFirst({ where: { id: quoteId, organizationId: org.id } })
    if (!quote) return { success: false, error: "Devis introuvable" }

    if (quote.status !== "DRAFT")
        return { success: false, error: "Seuls les brouillons peuvent être supprimés." }

    await prisma.quote.delete({ where: { id: quoteId } })

    revalidateTag(`quotes-${org.id}`, "default")
    revalidateTag(`dashboard-${org.id}`, "default")
    revalidatePath(`/${orgSlug}/quotes`, "page")

    return { success: true, data: undefined }
}

// ═════════════════════════════════════════════════════════════════════════════
// LISTE
// ═════════════════════════════════════════════════════════════════════════════
export async function getQuotesAction(
    orgSlug: string,
    filters?: {
        status?: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED"
        search?: string
        page?: number
        pageSize?: number
    }
): Promise<QuoteActionResult<{
    quotes: {
        id: string; number: string; status: string
        clientName: string | null; total: number
        issueDate: Date; expiryDate: Date | null; currencyCode: string
    }[]
    total: number; page: number; pageSize: number
}>> {
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const page = filters?.page ?? 1
    const pageSize = filters?.pageSize ?? 20
    const skip = (page - 1) * pageSize

    const where = {
        organizationId: org.id,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.search && {
            OR: [
                { number: { contains: filters.search, mode: "insensitive" as const } },
                { client: { name: { contains: filters.search, mode: "insensitive" as const } } },
            ],
        }),
    }

    const [quotes, total] = await Promise.all([
        prisma.quote.findMany({
            where,
            select: {
                id: true, number: true, status: true,
                total: true, issueDate: true, expiryDate: true, currencyCode: true,
                client: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
            skip, take: pageSize,
        }),
        prisma.quote.count({ where }),
    ])

    return {
        success: true,
        data: {
            quotes: quotes.map(q => ({
                id: q.id,
                number: q.number,
                status: q.status,
                clientName: q.client?.name ?? null,
                total: Number(q.total),
                issueDate: q.issueDate,
                expiryDate: q.expiryDate,
                currencyCode: q.currencyCode,
            })),
            total, page, pageSize,
        },
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// DÉTAIL
// ═════════════════════════════════════════════════════════════════════════════
export async function getQuoteAction(
    orgSlug: string,
    quoteId: string
): Promise<QuoteActionResult<any>> {
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const quote = await prisma.quote.findFirst({
        where: { id: quoteId, organizationId: org.id },
        include: {
            client: true,
            items: {
                include: { taxRate: true, product: { select: { id: true, name: true } } },
                orderBy: { id: "asc" },
            },
            invoices: { select: { id: true, number: true, status: true } },
        },
    })

    if (!quote) return { success: false, error: "Devis introuvable" }
    return { success: true, data: quote }
}

// ═════════════════════════════════════════════════════════════════════════════
// CONVERTIR EN FACTURE
// ═════════════════════════════════════════════════════════════════════════════
export async function convertQuoteToInvoiceAction(
    orgSlug: string,
    quoteId: string
): Promise<QuoteActionResult<{ invoiceId: string; invoiceNumber: string }>> {
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const quote = await prisma.quote.findFirst({
        where: { id: quoteId, organizationId: org.id },
        include: { items: true },
    })
    if (!quote) return { success: false, error: "Devis introuvable" }

    if (!["SENT", "ACCEPTED"].includes(quote.status)) {
        return { success: false, error: "Seuls les devis envoyés ou acceptés peuvent être convertis." }
    }

    // Générer le numéro de facture
    const year = new Date().getFullYear()
    const invoicePrefix = `FAC-${year}-`
    const invoiceCount = await prisma.invoice.count({
        where: { organizationId: org.id, number: { startsWith: invoicePrefix } },
    })
    const invoiceNumber = `${invoicePrefix}${String(invoiceCount + 1).padStart(4, "0")}`

    try {
        const invoice = await prisma.$transaction(async (tx) => {
            const invoice = await tx.invoice.create({
                data: {
                    organizationId: org.id,
                    clientId: quote.clientId,
                    originQuoteId: quote.id,
                    number: invoiceNumber,
                    status: "DRAFT",
                    issueDate: new Date(),
                    dueDate: null,
                    subtotal: quote.subtotal,
                    taxTotal: quote.taxTotal,
                    total: quote.total,
                    currencyCode: quote.currencyCode,
                    exchangeRate: quote.exchangeRate,
                    notes: quote.notes,
                    terms: quote.terms,
                    internalNotes: quote.internalNotes,
                },
            })

            await tx.invoiceItem.createMany({
                data: quote.items.map(item => ({
                    invoiceId: invoice.id,
                    productId: item.productId ?? null,
                    taxRateId: item.taxRateId ?? null,
                    name: item.name,
                    description: item.description || null,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    total: item.total,
                    isService: item.isService,
                })),
            })

            // Marquer le devis comme ACCEPTED
            await tx.quote.update({ where: { id: quoteId }, data: { status: "ACCEPTED" } })

            return invoice
        })

        revalidateTag(`quotes-${org.id}`, "default")
        revalidateTag(`quote-${quoteId}`, "default")
        revalidateTag(`invoices-${org.id}`, "default")
        revalidateTag(`dashboard-${org.id}`, "default")
        revalidatePath(`/${orgSlug}/quotes`, "page")
        revalidatePath(`/${orgSlug}/quotes/${quoteId}`, "page")
        revalidatePath(`/${orgSlug}/invoices`, "page")

        return { success: true, data: { invoiceId: invoice.id, invoiceNumber: invoice.number } }

    } catch (err) {
        console.error("convertQuoteToInvoiceAction:", err)
        return { success: false, error: "Erreur lors de la conversion." }
    }
}