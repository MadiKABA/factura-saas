// src/server/actions/billing.action.ts
"use server"
import { revalidatePath, revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import {
    createPaydunyaCheckout,
    confirmPaydunyaCheckout,
    buildSubscriptionPayload,
} from "@/lib/paydunya"
import { cacheTags } from "@/lib/cache-tags"

type R<T = void> = { success: true; data: T } | { success: false; error: string }

// ─── Auth helpers ──────────────────────────────────────────────────────────────
async function getSession() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null
    return session
}

async function requireAdmin(orgSlug: string) {
    const session = await getSession()
    if (!session) return { error: "Non authentifié" } as const
    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } })
    if (!org) return { error: "Organisation introuvable" } as const
    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership || !["OWNER", "ADMIN"].includes(membership.role))
        return { error: "Accès réservé aux administrateurs" } as const
    return { session, org, membership } as const
}

async function requireSuperAdmin() {
    const session = await getSession()
    if (!session) return { error: "Non authentifié" } as const
    // Vérifier que l'utilisateur est superadmin Factura (champ custom sur User)
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, isSuperAdmin: true } as any,
    })
    if (!(user as any)?.isSuperAdmin)
        return { error: "Accès refusé — réservé aux administrateurs Factura" } as const
    return { session, user } as const
}

// ─── Plans disponibles ────────────────────────────────────────────────────────
export async function getPlansAction() {
    const plans = await prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
    })
    return {
        success: true,
        data: plans.map(p => ({
            id: p.id,
            name: p.name,
            priceMonthly: Number(p.priceMonthlyXof),
            priceYearly: Number(p.priceYearlyXof),
            maxProducts: p.maxProducts,
            maxSales: p.maxSalesPerMonth,
            maxInvoices: p.maxInvoicesPerMonth,
            maxUsers: p.maxUsers,
            hasStock: p.hasStockModule,
            hasReports: p.hasReportsModule,
            hasApi: p.hasApiAccess,
            description: p.description,
        })),
    }
}

// ─── Abonnement courant d'une org ─────────────────────────────────────────────
export async function getSubscriptionAction(orgSlug: string) {
    const ctx = await requireAdmin(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error }

    const sub = await prisma.subscription.findUnique({
        where: { organizationId: ctx.org.id },
        include: {
            plan: true,
            invoices: {
                orderBy: { createdAt: "desc" },
                take: 5,
                select: {
                    id: true, status: true, amountXof: true, billingCycle: true,
                    periodStart: true, periodEnd: true, paidAt: true,
                    paydunyaCheckoutUrl: true, paymentMethod: true, createdAt: true,
                },
            },
        },
    })

    if (!sub) return { success: true, data: null }

    return {
        success: true,
        data: {
            id: sub.id,
            status: sub.status,
            billingCycle: sub.billingCycle,
            trialEndsAt: sub.trialEndsAt,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            canceledAt: sub.canceledAt,
            plan: {
                id: sub.plan.id,
                name: sub.plan.name,
                priceMonthly: Number(sub.plan.priceMonthlyXof),
                priceYearly: Number(sub.plan.priceYearlyXof),
                hasStock: sub.plan.hasStockModule,
                hasReports: sub.plan.hasReportsModule,
            },
            recentInvoices: sub.invoices.map(i => ({
                ...i,
                amountXof: Number(i.amountXof),
            })),
        },
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIER UN PAIEMENT — crée une invoice PayDunya + redirige
// ═══════════════════════════════════════════════════════════════════════════
export async function initiateSubscriptionPaymentAction(
    orgSlug: string,
    planId: string,
    billingCycle: "MONTHLY" | "YEARLY"
): Promise<R<{ checkoutUrl: string }>> {
    const ctx = await requireAdmin(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }

    const plan = await prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) return { success: false, error: "Plan introuvable" }
    if (plan.name === "FREE") return { success: false, error: "Le plan FREE est gratuit — aucun paiement requis." }

    const amount = billingCycle === "YEARLY"
        ? Number(plan.priceYearlyXof)
        : Number(plan.priceMonthlyXof)

    // Calculer les dates de période
    const now = new Date()
    const start = now
    const end = new Date(now)
    if (billingCycle === "YEARLY") {
        end.setFullYear(end.getFullYear() + 1)
    } else {
        end.setMonth(end.getMonth() + 1)
    }

    // Créer la SubscriptionInvoice en PENDING
    const subInvoice = await prisma.subscriptionInvoice.create({
        data: {
            organizationId: ctx.org.id,
            planId,
            subscriptionId: (await prisma.subscription.findUnique({ where: { organizationId: ctx.org.id } }))?.id
                ?? (await createFreeSub(ctx.org.id)).id,
            amountXof: amount,
            billingCycle: billingCycle as any,
            periodStart: start,
            periodEnd: end,
            status: "PENDING",
        },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.factura.sn"

    // Créer le checkout PayDunya
    const payload = buildSubscriptionPayload({
        orgName: ctx.org.name,
        planName: plan.name,
        amountXof: amount,
        billingCycle,
        orgId: ctx.org.id,
        invoiceId: subInvoice.id,
        planId,
        appUrl,
    })

    const result = await createPaydunyaCheckout(payload)
    if (!result.success) {
        await prisma.subscriptionInvoice.update({
            where: { id: subInvoice.id },
            data: { status: "FAILED", failureReason: result.error, attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
        })
        return { success: false, error: result.error }
    }

    // Mettre à jour l'invoice avec le token PayDunya
    await prisma.subscriptionInvoice.update({
        where: { id: subInvoice.id },
        data: {
            status: "PROCESSING",
            paydunyaToken: result.token,
            paydunyaCheckoutUrl: result.checkoutUrl,
            attemptCount: { increment: 1 },
            lastAttemptAt: new Date(),
        },
    })

    revalidateTag(cacheTags.subscription(ctx.org.id), "default")
    return { success: true, data: { checkoutUrl: result.checkoutUrl } }
}

// Helper : créer une sub FREE si inexistante
async function createFreeSub(organizationId: string) {
    const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } })
    const now = new Date()
    const end = new Date(now); end.setFullYear(end.getFullYear() + 10) // FREE = 10 ans

    return prisma.subscription.create({
        data: {
            organizationId,
            planId: freePlan!.id,
            status: "ACTIVE",
            billingCycle: "MONTHLY",
            currentPeriodStart: now,
            currentPeriodEnd: end,
        },
    })
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIRMER PAIEMENT — appelé depuis la return_url après redirection
// ═══════════════════════════════════════════════════════════════════════════
export async function confirmSubscriptionPaymentAction(
    invoiceId: string
): Promise<R<{ activated: boolean; planName: string }>> {
    const invoice = await prisma.subscriptionInvoice.findUnique({
        where: { id: invoiceId },
        include: { plan: true, subscription: true },
    })
    if (!invoice) return { success: false, error: "Invoice introuvable" }
    if (invoice.status === "PAID") return { success: true, data: { activated: true, planName: invoice.plan.name } }
    if (!invoice.paydunyaToken) return { success: false, error: "Token PayDunya manquant" }

    const result = await confirmPaydunyaCheckout(invoice.paydunyaToken)
    if (!result.success) return { success: false, error: result.error }

    if (result.data.status !== "completed") {
        return { success: false, error: `Paiement non confirmé (statut: ${result.data.status})` }
    }

    await activateSubscriptionAfterPayment(invoice, result.data)
    revalidateTag(cacheTags.subscription(invoice.organizationId), "default")

    return { success: true, data: { activated: true, planName: invoice.plan.name } }
}

// Activation interne après paiement confirmé
async function activateSubscriptionAfterPayment(
    invoice: any,
    paydunyaData: any
) {
    const now = new Date()
    await prisma.$transaction(async tx => {
        // Mettre à jour l'invoice
        await tx.subscriptionInvoice.update({
            where: { id: invoice.id },
            data: {
                status: "PAID",
                paidAt: now,
                paymentMethod: paydunyaData.payment_method?.toString() ?? null,
                payerPhone: paydunyaData.customer?.phone ?? null,
                paydunyaReference: paydunyaData.invoice?.token ?? null,
                paydunyaReceiptUrl: paydunyaData.receipt_url ?? null,
            },
        })
        // Activer / mettre à jour l'abonnement
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
            },
        })
    })
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — Activer manuellement (sans paiement)
// Utile pour : tests, partenaires, paiements cash/mobile directs
// ═══════════════════════════════════════════════════════════════════════════
export async function adminActivateSubscriptionAction(params: {
    orgSlug: string
    planId: string
    billingCycle: "MONTHLY" | "YEARLY"
    durationMonths: number // durée en mois
    note?: string
}): Promise<R<{ subscriptionId: string }>> {
    const ctx = await requireSuperAdmin()
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }

    const { orgSlug, planId, billingCycle, durationMonths, note } = params

    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } })
    if (!org) return { success: false, error: "Organisation introuvable" }

    const plan = await prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) return { success: false, error: "Plan introuvable" }

    const now = new Date()
    const start = now
    const end = new Date(now)
    end.setMonth(end.getMonth() + durationMonths)

    const amount = billingCycle === "YEARLY"
        ? Number(plan.priceYearlyXof)
        : Number(plan.priceMonthlyXof)

    const result = await prisma.$transaction(async tx => {
        // Créer ou mettre à jour l'abonnement
        const sub = await tx.subscription.upsert({
            where: { organizationId: org.id },
            update: {
                planId,
                status: "ACTIVE",
                billingCycle: billingCycle as any,
                currentPeriodStart: start,
                currentPeriodEnd: end,
                cancelAtPeriodEnd: false,
                canceledAt: null,
                activatedAt: now,
                activatedByNote: note ?? "Activation manuelle admin",
            },
            create: {
                organizationId: org.id,
                planId,
                status: "ACTIVE",
                billingCycle: billingCycle as any,
                currentPeriodStart: start,
                currentPeriodEnd: end,
                activatedAt: now,
                activatedByNote: note ?? "Activation manuelle admin",
            },
        })

        // Créer une invoice PAID pour traçabilité
        await tx.subscriptionInvoice.create({
            data: {
                organizationId: org.id,
                planId,
                subscriptionId: sub.id,
                amountXof: amount,
                billingCycle: billingCycle as any,
                periodStart: start,
                periodEnd: end,
                status: "PAID",
                paidAt: now,
                manuallyActivatedAt: now,
                manuallyActivatedById: ctx.session.user.id,
                notes: note ?? "Activation manuelle",
            },
        })

        return sub
    })

    revalidateTag(cacheTags.subscription(org.id), "default")
    revalidatePath(`/admin/organizations/${orgSlug}`)

    return { success: true, data: { subscriptionId: result.id } }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — Suspendre un abonnement
// ═══════════════════════════════════════════════════════════════════════════
export async function adminSuspendSubscriptionAction(
    orgSlug: string,
    reason?: string
): Promise<R> {
    const ctx = await requireSuperAdmin()
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur inconnue" }

    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } })
    if (!org) return { success: false, error: "Organisation introuvable" }

    await prisma.subscription.update({
        where: { organizationId: org.id },
        data: {
            status: "SUSPENDED",
            activatedByNote: reason ?? "Suspendu par admin",
        },
    })

    revalidateTag(cacheTags.subscription(org.id), "default")
    return { success: true, data: undefined }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — Liste toutes les orgs avec leur abonnement (dashboard admin)
// ═══════════════════════════════════════════════════════════════════════════
export async function adminGetOrgsSubscriptionsAction(params?: {
    status?: string
    page?: number
}) {
    const ctx = await requireSuperAdmin()
    if ("error" in ctx) return { success: false, error: ctx.error }

    const page = params?.page ?? 1
    const pageSize = 25
    const where: any = {}
    if (params?.status) where.status = params.status

    const [subs, total] = await Promise.all([
        prisma.subscription.findMany({
            where,
            include: {
                organization: { select: { id: true, slug: true, name: true, type: true } },
                plan: { select: { name: true, priceMonthlyXof: true } },
            },
            orderBy: { updatedAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma.subscription.count({ where }),
    ])

    return {
        success: true,
        data: {
            subscriptions: subs.map(s => ({
                id: s.id,
                status: s.status,
                billingCycle: s.billingCycle,
                currentPeriodEnd: s.currentPeriodEnd,
                cancelAtPeriodEnd: s.cancelAtPeriodEnd,
                activatedAt: s.activatedAt,
                activatedByNote: s.activatedByNote,
                org: s.organization,
                plan: {
                    name: s.plan.name,
                    priceMonthly: Number(s.plan.priceMonthlyXof),
                },
            })),
            total, page, pageSize,
        },
    }
}

// ─── Annuler un abonnement (par l'org elle-même) ──────────────────────────────
export async function cancelSubscriptionAction(orgSlug: string): Promise<R> {
    const ctx = await requireAdmin(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }

    await prisma.subscription.update({
        where: { organizationId: ctx.org.id },
        data: {
            cancelAtPeriodEnd: true,
            canceledAt: new Date(),
        },
    })

    revalidateTag(cacheTags.subscription(ctx.org.id), "default")
    return { success: true, data: undefined }
}