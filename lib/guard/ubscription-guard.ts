// src/lib/subscription-guard.ts
// ─── Guard abonnement — mode lecture seule ────────────────────────────────────
// Appelé dans toutes les Server Actions qui créent/modifient des données.
// Les orgs EXPIRED ou SUSPENDED ne peuvent que lire.

import { prisma } from "@/server/db"

export type GuardResult =
    | { allowed: true }
    | { allowed: false; reason: string; isReadOnly: boolean }

// Statuts qui bloquent toute écriture
const READ_ONLY_STATUSES = ["EXPIRED", "SUSPENDED", "CANCELED"]

// ─── Vérifier si une org peut écrire ─────────────────────────────────────────
export async function checkWriteAccess(organizationId: string): Promise<GuardResult> {
    const sub = await prisma.subscription.findUnique({
        where: { organizationId },
        select: { status: true, currentPeriodEnd: true, plan: { select: { name: true } } },
    })

    // Pas d'abonnement du tout → plan FREE toujours actif en écriture
    if (!sub) return { allowed: true }

    if (READ_ONLY_STATUSES.includes(sub.status)) {
        const messages: Record<string, string> = {
            EXPIRED: "Votre abonnement a expiré. Renouvelez pour reprendre les créations et modifications.",
            SUSPENDED: "Votre organisation est suspendue. Contactez le support ou renouvelez votre abonnement.",
            CANCELED: "Votre abonnement a été annulé. Vos données sont en lecture seule.",
        }
        return {
            allowed: false,
            isReadOnly: true,
            reason: messages[sub.status] ?? "Accès restreint.",
        }
    }

    // PAST_DUE : autoriser en écriture avec avertissement (grace period)
    // On laisse passer mais l'UI affiche un warning
    return { allowed: true }
}

// ─── Helper pour les Server Actions — throw si lecture seule ─────────────────
// Usage :
//   const guard = await requireWriteAccess(orgId)
//   if (!guard.allowed) return { success: false, error: guard.reason }
export async function requireWriteAccess(
    organizationId: string
): Promise<{ success: false; error: string } | null> {
    const result = await checkWriteAccess(organizationId)
    if (!result.allowed) {
        return { success: false, error: result.reason }
    }
    return null
}

// ─── Hook côté client — vérifier si l'org est en lecture seule ───────────────
// À appeler dans les pages pour afficher le banner et désactiver les boutons
export function isOrgReadOnly(subStatus: string | null | undefined): boolean {
    if (!subStatus) return false
    return READ_ONLY_STATUSES.includes(subStatus)
}

// ─── Banner component data ────────────────────────────────────────────────────
export function getReadOnlyBannerData(subStatus: string): {
    message: string
    cta: string
    color: "amber" | "red"
} | null {
    switch (subStatus) {
        case "EXPIRED":
            return {
                message: "Votre abonnement a expiré — mode lecture seule activé. Vos données sont intactes.",
                cta: "Renouveler maintenant →",
                color: "amber",
            }
        case "SUSPENDED":
            return {
                message: "Organisation suspendue — accès limité à la lecture. Contactez le support.",
                cta: "Réactiver l'abonnement →",
                color: "red",
            }
        case "CANCELED":
            return {
                message: "Abonnement annulé — accès en lecture seule jusqu'à la fin de la période.",
                cta: "Renouveler →",
                color: "amber",
            }
        case "PAST_DUE":
            return {
                message: "Paiement en retard — renouvelez pour éviter la suspension.",
                cta: "Payer maintenant →",
                color: "amber",
            }
        default:
            return null
    }
}