// src/app/api/billing/ipn/route.ts
// ─── Webhook IPN PayDunya ──────────────────────────────────────────────────────
// PayDunya envoie une requête POST application/x-www-form-urlencoded
// contenant les données de paiement dès confirmation côté opérateur.
// On vérifie le hash, on confirme via l'API, on active l'abonnement.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/server/db"
import { confirmPaydunyaCheckout, verifyPaydunyaIPN } from "@/lib/paydunya"
import { revalidateTag } from "next/cache"
import { cacheTags } from "@/lib/cache-tags"

export async function POST(req: NextRequest) {
    try {
        // PayDunya envoie en application/x-www-form-urlencoded
        const body = await req.text()
        const params = new URLSearchParams(body)

        const data: Record<string, string> = {}
        params.forEach((v, k) => { data[k] = v })

        const hash = data["hash"] ?? ""
        const token = data["token"] ?? ""

        console.log("[IPN PayDunya]", { token, hash: hash.substring(0, 20) + "..." })

        // 1. Vérifier la signature
        if (!verifyPaydunyaIPN(hash, token)) {
            console.warn("[IPN PayDunya] Hash invalide — requête ignorée")
            return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
        }

        // 2. Retrouver la SubscriptionInvoice par le token PayDunya
        const invoice = await prisma.subscriptionInvoice.findUnique({
            where: { paydunyaToken: token },
            include: { plan: true, subscription: true },
        })

        if (!invoice) {
            console.warn("[IPN PayDunya] Invoice introuvable pour token:", token)
            // Répondre 200 quand même pour éviter que PayDunya réessaie indéfiniment
            return NextResponse.json({ ok: true, skipped: true })
        }

        // Sauvegarder le payload IPN brut pour debug
        await prisma.subscriptionInvoice.update({
            where: { id: invoice.id },
            data: {
                ipnReceivedAt: new Date(),
                ipnPayload: data as any,
            },
        })

        // 3. Si déjà payée — idempotence
        if (invoice.status === "PAID") {
            return NextResponse.json({ ok: true, alreadyPaid: true })
        }

        // 4. Confirmer via l'API PayDunya (GET confirm)
        const confirm = await confirmPaydunyaCheckout(token)
        if (!confirm.success) {
            console.error("[IPN PayDunya] Échec confirmation:", confirm.error)
            await prisma.subscriptionInvoice.update({
                where: { id: invoice.id },
                data: { failureReason: confirm.error, lastAttemptAt: new Date() },
            })
            return NextResponse.json({ error: confirm.error }, { status: 200 }) // 200 pour pas retry
        }

        if (confirm.data.status !== "completed") {
            console.log("[IPN PayDunya] Paiement non complété:", confirm.data.status)
            return NextResponse.json({ ok: true, status: confirm.data.status })
        }

        // 5. Activer l'abonnement dans une transaction
        const now = new Date()
        await prisma.$transaction(async tx => {
            await tx.subscriptionInvoice.update({
                where: { id: invoice.id },
                data: {
                    status: "PAID",
                    paidAt: now,
                    paymentMethod: (confirm.data as any).payment_method?.toString() ?? null,
                    payerPhone: confirm.data.customer?.phone ?? null,
                    paydunyaReference: confirm.data.invoice?.token ?? null,
                    paydunyaReceiptUrl: confirm.data.receipt_url ?? null,
                },
            })

            await tx.subscription.update({
                where: { id: invoice.subscriptionId },
                data: {
                    planId: invoice.planId,
                    status: "ACTIVE",
                    billingCycle: invoice.billingCycle,
                    currentPeriodStart: invoice.periodStart,
                    currentPeriodEnd: invoice.periodEnd,
                    cancelAtPeriodEnd: false,
                    canceledAt: null,
                    activatedAt: now,
                    activatedByNote: `Paiement PayDunya — ${confirm.data.customer?.name ?? "Anonyme"}`,
                },
            })
        })

        // Invalider le cache de l'abonnement
        revalidateTag(cacheTags.subscription(invoice.organizationId), "default")

        console.log("[IPN PayDunya] ✅ Abonnement activé pour org:", invoice.organizationId)
        return NextResponse.json({ ok: true, activated: true })

    } catch (err: any) {
        console.error("[IPN PayDunya] Erreur:", err?.message)
        // Toujours 200 pour PayDunya — sinon il réessaie
        return NextResponse.json({ error: "Internal error" }, { status: 200 })
    }
}

// GET — pour que PayDunya puisse vérifier l'URL IPN
export async function GET() {
    return NextResponse.json({ status: "PayDunya IPN endpoint active" })
}