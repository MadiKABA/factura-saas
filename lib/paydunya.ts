// src/lib/paydunya.ts
// ─── Client PayDunya pour Next.js ─────────────────────────────────────────────
// Utilise l'API HTTP/JSON directement (pas de SDK officiel Node.js à jour)
// Flux : createCheckout → redirect → IPN webhook → confirm → activate

// ─── Types ────────────────────────────────────────────────────────────────────
export type PaydunyaMode = "test" | "live"

export type PaydunyaCheckoutPayload = {
    invoice: {
        total_amount: number
        description: string
        return_url?: string
        cancel_url?: string
        callback_url?: string // IPN URL
        items?: Array<{
            name: string
            quantity: number
            unit_price: number
            total_price: number
            description?: string
        }>
    }
    store: {
        name: string
        tagline?: string
        phone?: string
        postal_address?: string
        website?: string
        logo_url?: string
    }
    custom_data?: Record<string, string | number>
}

export type PaydunyaCheckoutResponse = {
    response_code: string   // "00" = succès
    response_text: string   // URL checkout si succès
    description: string
    token: string
}

export type PaydunyaConfirmResponse = {
    response_code: string
    status: "completed" | "pending" | "canceled" | "fail"
    hash: string
    invoice: {
        token: string
        total_amount: number
        description: string
        items: Record<string, any>
    }
    customer: {
        name: string
        phone: string
        email: string
    }
    custom_data: Record<string, any>
    receipt_url: string
}

// ─── Config ───────────────────────────────────────────────────────────────────
function getPaydunyaConfig() {
    const mode = (process.env.PAYDUNYA_MODE ?? "test") as PaydunyaMode
    const isSandbox = mode === "test"

    return {
        mode,
        isSandbox,
        masterKey: process.env.PAYDUNYA_MASTER_KEY!,
        privateKey: isSandbox
            ? process.env.PAYDUNYA_SANDBOX_PRIVATE_KEY!
            : process.env.PAYDUNYA_LIVE_PRIVATE_KEY!,
        token: process.env.PAYDUNYA_TOKEN!,
        baseUrl: isSandbox
            ? "https://app.paydunya.com/sandbox-api/v1"
            : "https://app.paydunya.com/api/v1",
    }
}

// ─── Headers communs ──────────────────────────────────────────────────────────
function paydunyaHeaders(config: ReturnType<typeof getPaydunyaConfig>) {
    return {
        "Content-Type": "application/json",
        "PAYDUNYA-MASTER-KEY": config.masterKey,
        "PAYDUNYA-PRIVATE-KEY": config.privateKey,
        "PAYDUNYA-TOKEN": config.token,
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CRÉER UNE INVOICE CHECKOUT — redirige l'utilisateur vers PayDunya
// ═══════════════════════════════════════════════════════════════════════════
export async function createPaydunyaCheckout(
    payload: PaydunyaCheckoutPayload
): Promise<{ success: true; token: string; checkoutUrl: string } | { success: false; error: string }> {
    const config = getPaydunyaConfig()

    try {
        const response = await fetch(`${config.baseUrl}/checkout-invoice/create`, {
            method: "POST",
            headers: paydunyaHeaders(config),
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            const text = await response.text()
            return { success: false, error: `PayDunya HTTP ${response.status}: ${text}` }
        }

        const data: PaydunyaCheckoutResponse = await response.json()

        if (data.response_code !== "00") {
            return { success: false, error: `PayDunya: ${data.response_text}` }
        }

        return {
            success: true,
            token: data.token,
            checkoutUrl: data.response_text, // C'est l'URL de paiement quand response_code=00
        }
    } catch (err: any) {
        return { success: false, error: err?.message ?? "Erreur réseau PayDunya" }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIRMER UNE INVOICE — appelé après IPN ou retour utilisateur
// ═══════════════════════════════════════════════════════════════════════════
export async function confirmPaydunyaCheckout(
    token: string
): Promise<{ success: true; data: PaydunyaConfirmResponse } | { success: false; error: string }> {
    const config = getPaydunyaConfig()

    try {
        const response = await fetch(
            `${config.baseUrl}/checkout-invoice/confirm/${token}`,
            {
                method: "GET",
                headers: paydunyaHeaders(config),
            }
        )

        if (!response.ok) {
            return { success: false, error: `PayDunya HTTP ${response.status}` }
        }

        const data: PaydunyaConfirmResponse = await response.json()

        if (data.response_code !== "00") {
            return { success: false, error: `PayDunya: ${data.status}` }
        }

        return { success: true, data }
    } catch (err: any) {
        return { success: false, error: err?.message ?? "Erreur réseau PayDunya" }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// VÉRIFIER SIGNATURE IPN — sécuriser le webhook
// L'IPN PayDunya envoie un hash SHA-512 à vérifier
// ═══════════════════════════════════════════════════════════════════════════
export function verifyPaydunyaIPN(
    receivedHash: string,
    token: string
): boolean {
    // PayDunya hash = SHA-512(MASTER_KEY + token)
    // On vérifie côté serveur avec crypto
    const config = getPaydunyaConfig()
    const crypto = require("crypto")
    const expected = crypto
        .createHash("sha512")
        .update(config.masterKey + token)
        .digest("hex")
    return expected === receivedHash
}

// ─── Helper : construire le payload abonnement ────────────────────────────────
export function buildSubscriptionPayload(params: {
    orgName: string
    planName: string
    amountXof: number
    billingCycle: "MONTHLY" | "YEARLY"
    orgId: string
    invoiceId: string
    planId: string
    appUrl: string
}): PaydunyaCheckoutPayload {
    const { orgName, planName, amountXof, billingCycle, orgId, invoiceId, planId, appUrl } = params
    const cycleLabel = billingCycle === "MONTHLY" ? "mensuel" : "annuel"

    return {
        invoice: {
            total_amount: amountXof,
            description: `Abonnement ${planName} — ${cycleLabel} pour ${orgName}`,
            return_url: `${appUrl}/api/billing/return?invoiceId=${invoiceId}`,
            cancel_url: `${appUrl}/billing?canceled=1`,
            callback_url: `${appUrl}/api/billing/ipn`, // IPN webhook
            items: [
                {
                    name: `Plan ${planName} — ${cycleLabel}`,
                    quantity: 1,
                    unit_price: amountXof,
                    total_price: amountXof,
                    description: billingCycle === "YEARLY" ? "Économisez 20% avec l'annuel" : "",
                },
            ],
        },
        store: {
            name: "Factura SaaS",
            tagline: "Logiciel de gestion pour commerces africains",
            website: appUrl,
        },
        custom_data: {
            orgId,
            invoiceId,
            planId,
            billingCycle,
        },
    }
}