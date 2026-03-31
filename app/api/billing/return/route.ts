// src/app/api/billing/return/route.ts
// ─── Route retour après paiement PayDunya ─────────────────────────────────────
// PayDunya redirige ici après que l'utilisateur a payé (ou annulé)
// On confirme le paiement et on redirige vers le dashboard

import { NextRequest, NextResponse } from "next/server"
import { confirmSubscriptionPaymentAction } from "@/server/actions/billing.action"

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const invoiceId = searchParams.get("invoiceId")
    const token = searchParams.get("token") // token PayDunya passé en query

    if (!invoiceId) {
        return NextResponse.redirect(new URL("/billing?error=missing_invoice", req.url))
    }

    try {
        const result = await confirmSubscriptionPaymentAction(invoiceId)

        if (result.success && result.data.activated) {
            return NextResponse.redirect(
                new URL(`/billing?success=1&plan=${encodeURIComponent(result.data.planName)}`, req.url)
            )
        } else {
            const err = encodeURIComponent(!result.success ? result.error : "Paiement non confirmé")
            return NextResponse.redirect(new URL(`/billing?error=${err}`, req.url))
        }
    } catch {
        return NextResponse.redirect(new URL("/billing?error=server_error", req.url))
    }
}