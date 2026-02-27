// src/server/actions/update-quote.action.ts
"use server"
import { revalidateTag, revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import {
    updateQuoteSchema,
    QUOTE_LOCKED_STATUSES,
    type UpdateQuoteInput,
} from "@/lib/validations/update.schema"
import type { QuoteActionResult } from "@/lib/validations/quote.schema"

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

// ═════════════════════════════════════════════════════════════════════════════
export async function updateQuoteAction(
    orgSlug: string,
    quoteId: string,
    input: UpdateQuoteInput
): Promise<QuoteActionResult<{ id: string; number: string }>> {

    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const existing = await prisma.quote.findFirst({
        where: { id: quoteId, organizationId: org.id },
        select: { id: true, number: true, status: true },
    })
    if (!existing) return { success: false, error: "Devis introuvable." }

    if ((QUOTE_LOCKED_STATUSES as readonly string[]).includes(existing.status)) {
        return {
            success: false,
            error: `Un devis avec le statut "${existing.status}" ne peut plus être modifié.`,
        }
    }

    const parsed = updateQuoteSchema.safeParse(input)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        return { success: false, error: issue?.message ?? "Données invalides", field: issue?.path.join(".") }
    }
    const data = parsed.data

    try {
        const updated = await prisma.$transaction(async (tx) => {

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

            const computed = data.items.map(item => {
                const ht = Number((item.quantity * item.unitPrice).toFixed(2))
                const tva = Number((ht * (item.taxRate / 100)).toFixed(2))
                const total = Number((ht + tva).toFixed(2))
                return { ...item, ht, tva, total }
            })
            const subtotal = Number(computed.reduce((s, i) => s + i.ht, 0).toFixed(2))
            const taxTotal = Number(computed.reduce((s, i) => s + i.tva, 0).toFixed(2))
            const total = Number(computed.reduce((s, i) => s + i.total, 0).toFixed(2))

            const quote = await tx.quote.update({
                where: { id: quoteId },
                data: {
                    clientId,
                    issueDate: new Date(data.issueDate),
                    expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
                    currencyCode: data.currencyCode,
                    exchangeRate: data.exchangeRate ?? null,
                    subtotal, taxTotal, total,
                    notes: data.notes || null,
                    terms: data.terms || null,
                    internalNotes: data.internalNotes || null,
                },
            })

            await tx.quoteItem.deleteMany({ where: { quoteId } })
            await tx.quoteItem.createMany({
                data: computed.map(item => ({
                    quoteId,
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

        revalidateTag(`quote-${quoteId}`, "default")
        revalidateTag(`quotes-${org.id}`, "default")
        revalidateTag(`dashboard-${org.id}`, "default")
        revalidatePath(`/${orgSlug}/quotes`, "page")
        revalidatePath(`/${orgSlug}/quotes/${quoteId}`, "page")
        revalidatePath(`/${orgSlug}/quotes/${quoteId}/edit`, "page")

        return { success: true, data: { id: updated.id, number: updated.number } }

    } catch (err) {
        console.error("updateQuoteAction:", err)
        return { success: false, error: "Erreur lors de la mise à jour du devis." }
    }
}