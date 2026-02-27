// src/server/actions/update-invoice.action.ts
"use server"
import { revalidateTag, revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import {
    updateInvoiceSchema,
    INVOICE_LOCKED_STATUSES,
    type UpdateInvoiceInput,
} from "@/lib/validations/update.schema"
import type { ActionResult } from "@/lib/validations/invoice.schema"

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
export async function updateInvoiceAction(
    orgSlug: string,
    invoiceId: string,
    input: UpdateInvoiceInput
): Promise<ActionResult<{ id: string; number: string }>> {

    // 1. Auth
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    // 2. Vérifier que la facture existe et appartient à l'org
    const existing = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: org.id },
        select: { id: true, number: true, status: true },
    })
    if (!existing) return { success: false, error: "Facture introuvable." }

    // 3. Vérifier que le statut permet la modification
    if ((INVOICE_LOCKED_STATUSES as readonly string[]).includes(existing.status)) {
        return {
            success: false,
            error: `Une facture avec le statut "${existing.status}" ne peut plus être modifiée.`,
        }
    }

    // 4. Validation Zod
    const parsed = updateInvoiceSchema.safeParse(input)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        return { success: false, error: issue?.message ?? "Données invalides", field: issue?.path.join(".") }
    }
    const data = parsed.data

    try {
        const updated = await prisma.$transaction(async (tx) => {

            // Client inline si nouveau
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

            // Recalcul des totaux côté serveur
            const computed = data.items.map(item => {
                const ht = Number((item.quantity * item.unitPrice).toFixed(2))
                const tva = Number((ht * (item.taxRate / 100)).toFixed(2))
                const total = Number((ht + tva).toFixed(2))
                return { ...item, ht, tva, total }
            })
            const subtotal = Number(computed.reduce((s, i) => s + i.ht, 0).toFixed(2))
            const taxTotal = Number(computed.reduce((s, i) => s + i.tva, 0).toFixed(2))
            const total = Number(computed.reduce((s, i) => s + i.total, 0).toFixed(2))

            // Mettre à jour la facture
            const invoice = await tx.invoice.update({
                where: { id: invoiceId },
                data: {
                    clientId,
                    issueDate: new Date(data.issueDate),
                    dueDate: data.dueDate ? new Date(data.dueDate) : null,
                    currencyCode: data.currencyCode,
                    exchangeRate: data.exchangeRate ?? null,
                    subtotal, taxTotal, total,
                    notes: data.notes || null,
                    terms: data.terms || null,
                    internalNotes: data.internalNotes || null,
                },
            })

            // Remplacer toutes les lignes (delete + recreate)
            await tx.invoiceItem.deleteMany({ where: { invoiceId } })
            await tx.invoiceItem.createMany({
                data: computed.map(item => ({
                    invoiceId,
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

            return invoice
        })

        revalidateTag(`invoice-${invoiceId}`, "default")
        revalidateTag(`invoices-${org.id}`, "default")
        revalidateTag(`dashboard-${org.id}`, "default")
        revalidatePath(`/${orgSlug}/invoices`, "page")
        revalidatePath(`/${orgSlug}/invoices/${invoiceId}`, "page")
        revalidatePath(`/${orgSlug}/invoices/${invoiceId}/edit`, "page")

        return { success: true, data: { id: updated.id, number: updated.number } }

    } catch (err) {
        console.error("updateInvoiceAction:", err)
        return { success: false, error: "Erreur lors de la mise à jour de la facture." }
    }
}