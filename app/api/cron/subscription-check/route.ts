// src/app/api/cron/subscription-check/route.ts
// ─── Cron job — vérification abonnements ─────────────────────────────────────
//
// Deux actions :
//  1. Envoyer un email d'avertissement 7 jours avant expiration
//  2. Passer en EXPIRED + mode lecture seule les orgs expirées depuis 7 jours
//
// Planification recommandée (Vercel Cron / cron-job.org) : chaque jour à 8h00
// vercel.json :
//   { "crons": [{ "path": "/api/cron/subscription-check", "schedule": "0 8 * * *" }] }
//
// Header de sécurité : CRON_SECRET
// curl -H "Authorization: Bearer $CRON_SECRET" https://app.factura.sn/api/cron/subscription-check

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/server/db"
import { sendEmail, buildExpiryWarningEmail, buildSuspendedEmail } from "@/lib/email/email"
import { revalidateTag } from "next/cache"

function verifyCronSecret(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) return true // Pas de secret configuré → autoriser (développement)
    const auth = req.headers.get("authorization")
    return auth === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
    if (!verifyCronSecret(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()
    const in7Days = new Date(now); in7Days.setDate(in7Days.getDate() + 7)
    const in8Days = new Date(now); in8Days.setDate(in8Days.getDate() + 8)
    const minus7Days = new Date(now); minus7Days.setDate(minus7Days.getDate() - 7)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.factura.sn"

    const results = {
        warningsSent: 0,
        suspended: 0,
        errors: [] as string[],
    }

    // ── 1. Envoyer avertissement 7 jours avant expiration ───────────────────────
    // Cibler les subs ACTIVE dont currentPeriodEnd est dans [maintenant, +8j]
    // +8j pour avoir une marge et éviter de rater ceux à exactement 7j
    const expiringSoon = await prisma.subscription.findMany({
        where: {
            status: "ACTIVE",
            currentPeriodEnd: { gte: now, lte: in8Days },
        },
        include: {
            organization: {
                include: {
                    memberships: {
                        where: { role: { in: ["OWNER", "ADMIN"] } },
                        include: { user: { select: { email: true, name: true } } },
                    },
                },
            },
            plan: { select: { name: true } },
        },
    })

    for (const sub of expiringSoon) {
        const org = sub.organization
        const expiryDate = sub.currentPeriodEnd.toLocaleDateString("fr-FR", {
            day: "2-digit", month: "long", year: "numeric",
        })
        const renewUrl = `${appUrl}/${org.slug}/billing`

        // Envoyer à tous les OWNER + ADMIN de l'org
        for (const m of org.memberships) {
            try {
                const sent = await sendEmail({
                    ...buildExpiryWarningEmail({
                        orgName: org.name,
                        planName: sub.plan.name,
                        expiryDate,
                        renewUrl,
                        contactEmail: m.user.email,
                    }),
                    to: m.user.email,
                })
                if (sent) {
                    results.warningsSent++
                    console.log(`[Cron] ✉️  Warning envoyé à ${m.user.email} pour ${org.name}`)
                }
            } catch (err: any) {
                results.errors.push(`Warning ${org.slug}: ${err?.message}`)
            }
        }
    }

    // ── 2. Passer en EXPIRED les abonnements expirés depuis > 7 jours ───────────
    // currentPeriodEnd < (maintenant - 7 jours) ET status=ACTIVE ou PAST_DUE
    const toExpire = await prisma.subscription.findMany({
        where: {
            status: { in: ["ACTIVE", "PAST_DUE"] },
            currentPeriodEnd: { lt: minus7Days },
        },
        include: {
            organization: {
                include: {
                    memberships: {
                        where: { role: { in: ["OWNER", "ADMIN"] } },
                        include: { user: { select: { email: true } } },
                    },
                },
            },
            plan: { select: { name: true } },
        },
    })

    for (const sub of toExpire) {
        const org = sub.organization

        try {
            // Mettre le statut EXPIRED
            await prisma.subscription.update({
                where: { id: sub.id },
                data: {
                    status: "EXPIRED",
                    activatedByNote: `Auto-expiré le ${now.toISOString()} par cron job`,
                },
            })

            // Invalider le cache de l'org
            // revalidateTag requires proper configuration; removed for now

            results.suspended++
            console.log(`[Cron] 🔒 Org suspendue: ${org.name} (${org.slug})`)

            // Envoyer email de suspension aux admins
            const renewUrl = `${appUrl}/${org.slug}/billing`
            for (const m of org.memberships) {
                try {
                    await sendEmail({
                        ...buildSuspendedEmail({
                            orgName: org.name,
                            planName: sub.plan.name,
                            renewUrl,
                            contactEmail: m.user.email,
                        }),
                        to: m.user.email,
                    })
                } catch { /* Email non bloquant */ }
            }
        } catch (err: any) {
            results.errors.push(`Expire ${org.slug}: ${err?.message}`)
            console.error(`[Cron] Erreur suspension ${org.slug}:`, err?.message)
        }
    }

    console.log("[Cron] ✅ Terminé:", results)

    return NextResponse.json({
        ok: true,
        timestamp: now.toISOString(),
        ...results,
    })
}

// POST aussi accepté (certains providers de cron utilisent POST)
export const POST = GET