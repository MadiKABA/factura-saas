// src/server/actions/payment.action.ts
"use server"
import { revalidateTag, revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import { createPaymentSchema, type CreatePaymentInput } from "@/lib/validations/payment.schema"
import type { ActionResult } from "@/lib/validations/invoice.schema"

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

// ═════════════════════════════════════════════════════════════════════════════
// ACTION — Enregistrer un paiement
// ═════════════════════════════════════════════════════════════════════════════
export async function createPaymentAction(
    orgSlug: string,
    input: CreatePaymentInput
): Promise<ActionResult<{
    paymentId: string
    newStatus: string
    paidTotal: number
}>> {

    // 1. Auth
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    // 2. Validation Zod
    const parsed = createPaymentSchema.safeParse(input)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        return { success: false, error: issue?.message ?? "Données invalides" }
    }
    const data = parsed.data

    // 3. Récupérer la facture + vérifier qu'elle appartient à l'org
    const invoice = await prisma.invoice.findFirst({
        where: { id: data.invoiceId, organizationId: org.id },
        include: { payments: { select: { amount: true } } },
    })

    if (!invoice) return { success: false, error: "Facture introuvable" }

    if (invoice.status === "CANCELLED") {
        return { success: false, error: "Impossible d'enregistrer un paiement sur une facture annulée." }
    }
    if (invoice.status === "PAID") {
        return { success: false, error: "Cette facture est déjà entièrement payée." }
    }

    // 4. Vérifier que le montant ne dépasse pas le reste à payer
    const alreadyPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)
    const remaining = Number(invoice.total) - alreadyPaid

    if (data.amount > remaining + 0.01) {  // +0.01 pour tolérance float
        return {
            success: false,
            error: `Le montant saisi (${data.amount}) dépasse le reste à payer (${remaining.toFixed(2)}).`,
        }
    }

    // 5. Transaction : créer paiement + mettre à jour statut facture automatiquement
    try {
        const result = await prisma.$transaction(async (tx) => {

            // Créer le paiement
            const payment = await tx.payment.create({
                data: {
                    invoiceId: data.invoiceId,
                    amount: data.amount,
                    method: data.method as any,  // type PaymentMethod Prisma
                    paidAt: new Date(data.paidAt),
                    note: data.note || null,
                },
            })

            // Calculer le nouveau total payé
            const newPaidTotal = alreadyPaid + data.amount
            const tolerance = 0.01

            // Mettre à jour le statut automatiquement
            let newStatus = invoice.status
            if (newPaidTotal >= Number(invoice.total) - tolerance) {
                newStatus = "PAID"    // Paiement complet
            } else if (newPaidTotal > 0) {
                newStatus = "PARTIAL" // Paiement partiel
            }

            if (newStatus !== invoice.status) {
                await tx.invoice.update({
                    where: { id: data.invoiceId },
                    data: { status: newStatus },
                })
            }

            return { payment, newStatus, newPaidTotal }
        })

        // 6. Invalider le cache
        revalidateTag(`invoice-${data.invoiceId}`, "default")
        revalidateTag(`invoices-${org.id}`, "default")
        revalidateTag(`dashboard-${org.id}`, "default")
        revalidatePath(`/${orgSlug}/invoices/${data.invoiceId}`, "page")

        return {
            success: true,
            data: {
                paymentId: result.payment.id,
                newStatus: result.newStatus,
                paidTotal: result.newPaidTotal,
            },
        }

    } catch (err) {
        console.error("createPaymentAction error:", err)
        return { success: false, error: "Erreur lors de l'enregistrement du paiement." }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTION — Supprimer un paiement
// ═════════════════════════════════════════════════════════════════════════════
export async function deletePaymentAction(
    orgSlug: string,
    paymentId: string
): Promise<ActionResult> {
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const payment = await prisma.payment.findFirst({
        where: { id: paymentId, invoice: { organizationId: org.id } },
        include: { invoice: { include: { payments: { select: { amount: true } } } } },
    })

    if (!payment) return { success: false, error: "Paiement introuvable" }

    await prisma.$transaction(async (tx) => {
        await tx.payment.delete({ where: { id: paymentId } })

        // Recalculer le statut après suppression
        const remainingPayments = payment.invoice.payments
            .filter(p => p !== payment)
            .reduce((s, p) => s + Number(p.amount), 0)

        const total = Number(payment.invoice.total)
        const tolerance = 0.01
        let newStatus = payment.invoice.status

        if (remainingPayments <= 0) {
            newStatus = payment.invoice.status === "PAID" || payment.invoice.status === "PARTIAL"
                ? "SENT" : payment.invoice.status
        } else if (remainingPayments < total - tolerance) {
            newStatus = "PARTIAL"
        }

        if (newStatus !== payment.invoice.status) {
            await tx.invoice.update({
                where: { id: payment.invoiceId },
                data: { status: newStatus },
            })
        }
    })

    revalidateTag(`invoice-${payment.invoiceId}`, "default")
    revalidateTag(`invoices-${org.id}`, "default")
    revalidatePath(`/${orgSlug}/invoices/${payment.invoiceId}`, "page")

    return { success: true, data: undefined }
}