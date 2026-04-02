// src/lib/plan-limits.ts
// ─── Accès aux plans, quotas et modules ───────────────────────────────────────
// Source unique de vérité pour toutes les règles d'accès liées au plan.
// Importé dans les Server Actions, les pages et les composants UI.
//
// Fonctions exportées :
//   getOrgPlan(orgId)                    → PlanName ("FREE" | "STARTER" | ...)
//   getOrgPlanLimits(orgId)              → PlanLimits (limites complètes)
//   checkPlanLimit(orgId, resource)      → LimitCheckResult
//   checkModuleAccess(orgId, module)     → LimitCheckResult
//   getPlanUsage(orgId)                  → usage complet du mois en cours
//   getUpgradeMessage(planName)          → texte d'invitation à upgrader
//   canAccessRoute(orgId, route)         → boolean (garde navigation)
//   PLAN_LIMITS                          → constante statique complète

import { prisma } from "@/server/db"

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export type PlanName = "FREE" | "STARTER" | "PRO" | "BUSINESS"

export type PlanLimits = {
    // Quotas mensuels (null = illimité)
    maxProducts: number | null   // produits actifs simultanés
    maxSales: number | null   // ventes par mois
    maxInvoices: number | null   // factures par mois
    maxUsers: number | null   // membres de l'organisation
    maxStockBatches: number | null   // bons de mouvement par mois

    // Modules disponibles
    hasStockModule: boolean   // gestion stock + inventaires
    hasReportsModule: boolean   // rapports avancés + analytics
    hasDebtModule: boolean   // carnet de dettes
    hasPOSModule: boolean   // caisse point de vente
    hasApiAccess: boolean   // accès API REST
    hasPrioritySupport: boolean  // support prioritaire
}

// Résultat d'une vérification de limite ou d'accès module
export type LimitCheckResult =
    | { allowed: true }
    | { allowed: false; reason: string; planName: PlanName; upgradeMessage: string }

// Snapshot de l'utilisation mensuelle
export type PlanUsage = {
    planName: PlanName
    limits: PlanLimits
    month: number
    year: number
    sales: { count: number; limit: number | null; percentage: number | null }
    invoices: { count: number; limit: number | null; percentage: number | null }
    products: { count: number; limit: number | null; percentage: number | null }
    users: { count: number; limit: number | null; percentage: number | null }
    stockBatches: { count: number; limit: number | null; percentage: number | null }
}

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTE — limites statiques par plan
// Cohérent avec le modèle Prisma Plan (schema v5)
// ════════════════════════════════════════════════════════════════════════════

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
    FREE: {
        maxProducts: 20,
        maxSales: 50,
        maxInvoices: 10,
        maxUsers: 2,
        maxStockBatches: 0,      // stock désactivé sur FREE
        hasStockModule: false,
        hasReportsModule: false,
        hasDebtModule: true,
        hasPOSModule: true,
        hasApiAccess: false,
        hasPrioritySupport: false,
    },
    STARTER: {
        maxProducts: 100,
        maxSales: 200,
        maxInvoices: 50,
        maxUsers: 5,
        maxStockBatches: 50,
        hasStockModule: true,
        hasReportsModule: false,
        hasDebtModule: true,
        hasPOSModule: true,
        hasApiAccess: false,
        hasPrioritySupport: false,
    },
    PRO: {
        maxProducts: null,   // illimité
        maxSales: null,
        maxInvoices: null,
        maxUsers: 20,
        maxStockBatches: null,
        hasStockModule: true,
        hasReportsModule: true,
        hasDebtModule: true,
        hasPOSModule: true,
        hasApiAccess: false,
        hasPrioritySupport: true,
    },
    BUSINESS: {
        maxProducts: null,
        maxSales: null,
        maxInvoices: null,
        maxUsers: null,   // illimité
        maxStockBatches: null,
        hasStockModule: true,
        hasReportsModule: true,
        hasDebtModule: true,
        hasPOSModule: true,
        hasApiAccess: true,
        hasPrioritySupport: true,
    },
}

// Prix de référence pour les messages d'upgrade (en XOF)
export const PLAN_PRICES: Record<PlanName, { monthly: number; yearly: number }> = {
    FREE: { monthly: 0, yearly: 0 },
    STARTER: { monthly: 9_900, yearly: 95_040 },
    PRO: { monthly: 24_900, yearly: 239_040 },
    BUSINESS: { monthly: 49_900, yearly: 479_040 },
}

// Ordre de progression des plans
const PLAN_ORDER: PlanName[] = ["FREE", "STARTER", "PRO", "BUSINESS"]

function nextPlan(current: PlanName): PlanName | null {
    const idx = PLAN_ORDER.indexOf(current)
    return idx < PLAN_ORDER.length - 1 ? PLAN_ORDER[idx + 1]! : null
}

// ════════════════════════════════════════════════════════════════════════════
// getOrgPlan — plan actif d'une organisation
// Retourne FREE si pas d'abonnement ou abonnement non actif
// ════════════════════════════════════════════════════════════════════════════

export async function getOrgPlan(organizationId: string): Promise<PlanName> {
    const sub = await prisma.subscription.findUnique({
        where: { organizationId },
        include: { plan: { select: { name: true } } },
    })

    if (!sub) return "FREE"

    // Statuts bloquants → FREE
    if (["EXPIRED", "SUSPENDED", "CANCELED"].includes(sub.status)) return "FREE"
    if (sub.status === "PAST_DUE") return "FREE"

    // Période expirée → FREE
    if (new Date(sub.currentPeriodEnd) < new Date()) return "FREE"

    return sub.plan.name as PlanName
}

// ════════════════════════════════════════════════════════════════════════════
// getOrgPlanLimits — limites complètes d'une organisation
// ════════════════════════════════════════════════════════════════════════════

export async function getOrgPlanLimits(organizationId: string): Promise<PlanLimits & { planName: PlanName }> {
    const planName = await getOrgPlan(organizationId)
    return { planName, ...PLAN_LIMITS[planName] }
}

// ════════════════════════════════════════════════════════════════════════════
// checkPlanLimit — vérifier un quota mensuel / total
// ════════════════════════════════════════════════════════════════════════════

export async function checkPlanLimit(
    organizationId: string,
    resource: "products" | "sales" | "invoices" | "users" | "stockBatches"
): Promise<LimitCheckResult> {
    const planName = await getOrgPlan(organizationId)
    const limits = PLAN_LIMITS[planName]
    const upgrade = getUpgradeMessage(planName)

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const deny = (reason: string): LimitCheckResult => ({
        allowed: false, reason, planName, upgradeMessage: upgrade,
    })

    switch (resource) {

        case "products": {
            const limit = limits.maxProducts
            if (limit === null) return { allowed: true }
            const count = await prisma.product.count({
                where: { organizationId, isActive: true },
            })
            if (count >= limit) return deny(
                `Limite atteinte : votre plan ${planName} autorise ${limit} produits actifs (${count} actuellement). Supprimez un produit ou passez au plan supérieur.`
            )
            return { allowed: true }
        }

        case "sales": {
            const limit = limits.maxSales
            if (limit === null) return { allowed: true }
            const count = await prisma.sale.count({
                where: {
                    organizationId,
                    saleDate: { gte: monthStart, lte: monthEnd },
                    status: { not: "CANCELLED" },
                },
            })
            if (count >= limit) return deny(
                `Limite atteinte : ${count}/${limit} ventes ce mois sur le plan ${planName}. Passez au plan supérieur pour des ventes illimitées.`
            )
            return { allowed: true }
        }

        case "invoices": {
            const limit = limits.maxInvoices
            if (limit === null) return { allowed: true }
            const count = await prisma.invoice.count({
                where: {
                    organizationId,
                    createdAt: { gte: monthStart, lte: monthEnd },
                    status: { not: "CANCELLED" },
                },
            })
            if (count >= limit) return deny(
                `Limite atteinte : ${count}/${limit} factures ce mois sur le plan ${planName}.`
            )
            return { allowed: true }
        }

        case "users": {
            const limit = limits.maxUsers
            if (limit === null) return { allowed: true }
            const count = await prisma.membership.count({ where: { organizationId } })
            if (count >= limit) return deny(
                `Limite atteinte : ${count}/${limit} membres sur le plan ${planName}. Passez au plan supérieur pour inviter davantage.`
            )
            return { allowed: true }
        }

        case "stockBatches": {
            // Vérifier d'abord l'accès au module stock
            if (!limits.hasStockModule) return deny(
                `Le module Stock n'est pas inclus dans le plan ${planName}. Passez au plan STARTER ou supérieur pour gérer votre stock.`
            )
            const limit = limits.maxStockBatches
            if (limit === null) return { allowed: true }
            const count = await prisma.stockBatch.count({
                where: { organizationId, createdAt: { gte: monthStart, lte: monthEnd } },
            })
            if (count >= limit) return deny(
                `Limite atteinte : ${count}/${limit} bons de mouvement ce mois sur le plan ${planName}.`
            )
            return { allowed: true }
        }

        default:
            return { allowed: true }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// checkModuleAccess — vérifier l'accès à un module fonctionnel
// ════════════════════════════════════════════════════════════════════════════

export type ModuleKey = "stock" | "reports" | "debt" | "pos" | "api"

export async function checkModuleAccess(
    organizationId: string,
    module: ModuleKey
): Promise<LimitCheckResult> {
    const planName = await getOrgPlan(organizationId)
    const limits = PLAN_LIMITS[planName]
    const upgrade = getUpgradeMessage(planName)

    const moduleMap: Record<ModuleKey, boolean> = {
        stock: limits.hasStockModule,
        reports: limits.hasReportsModule,
        debt: limits.hasDebtModule,
        pos: limits.hasPOSModule,
        api: limits.hasApiAccess,
    }

    const moduleNames: Record<ModuleKey, string> = {
        stock: "Gestion du Stock",
        reports: "Rapports & Analytics",
        debt: "Carnet de Dettes",
        pos: "Caisse (POS)",
        api: "Accès API",
    }

    if (!moduleMap[module]) {
        return {
            allowed: false,
            planName,
            upgradeMessage: upgrade,
            reason: `Le module "${moduleNames[module]}" n'est pas disponible sur le plan ${planName}. ${upgrade}`,
        }
    }

    return { allowed: true }
}

// ════════════════════════════════════════════════════════════════════════════
// getPlanUsage — snapshot complet de l'utilisation mensuelle
// Usage : afficher les jauges dans la page billing ou les settings
// ════════════════════════════════════════════════════════════════════════════

export async function getPlanUsage(organizationId: string): Promise<PlanUsage> {
    const planName = await getOrgPlan(organizationId)
    const limits = PLAN_LIMITS[planName]

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const [salesCount, invoicesCount, productsCount, usersCount, stockBatchCount] = await Promise.all([
        prisma.sale.count({
            where: { organizationId, saleDate: { gte: monthStart, lte: monthEnd }, status: { not: "CANCELLED" } },
        }),
        prisma.invoice.count({
            where: { organizationId, createdAt: { gte: monthStart, lte: monthEnd }, status: { not: "CANCELLED" } },
        }),
        prisma.product.count({ where: { organizationId, isActive: true } }),
        prisma.membership.count({ where: { organizationId } }),
        prisma.stockBatch.count({
            where: { organizationId, createdAt: { gte: monthStart, lte: monthEnd } },
        }),
    ])

    const pct = (count: number, limit: number | null) =>
        limit === null ? null : Math.min(100, Math.round((count / limit) * 100))

    return {
        planName,
        limits,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        sales: { count: salesCount, limit: limits.maxSales, percentage: pct(salesCount, limits.maxSales) },
        invoices: { count: invoicesCount, limit: limits.maxInvoices, percentage: pct(invoicesCount, limits.maxInvoices) },
        products: { count: productsCount, limit: limits.maxProducts, percentage: pct(productsCount, limits.maxProducts) },
        users: { count: usersCount, limit: limits.maxUsers, percentage: pct(usersCount, limits.maxUsers) },
        stockBatches: { count: stockBatchCount, limit: limits.maxStockBatches, percentage: pct(stockBatchCount, limits.maxStockBatches) },
    }
}

// ════════════════════════════════════════════════════════════════════════════
// canAccessRoute — garde de navigation (client-side safe)
// Usage : masquer des liens dans la sidebar selon le plan
// Fonctionne avec les données déjà chargées (pas de DB call)
// ════════════════════════════════════════════════════════════════════════════

export function canAccessRoute(planName: PlanName, route: string): boolean {
    const limits = PLAN_LIMITS[planName]

    const routeMap: Record<string, boolean> = {
        "/stock": limits.hasStockModule,
        "/inventory": limits.hasStockModule,
        "/reports": limits.hasReportsModule,
        "/analytics": limits.hasReportsModule,
        "/debts": limits.hasDebtModule,
        "/pos": limits.hasPOSModule,
    }

    // Chercher le match le plus long en premier
    const match = Object.keys(routeMap)
        .filter(k => route.includes(k))
        .sort((a, b) => b.length - a.length)[0]

    return match ? routeMap[match]! : true   // toutes les autres routes sont accessibles
}

// ════════════════════════════════════════════════════════════════════════════
// getUpgradeMessage — message d'invitation à upgrader
// ════════════════════════════════════════════════════════════════════════════

export function getUpgradeMessage(planName: PlanName): string {
    const next = nextPlan(planName)
    if (!next) return "Vous êtes sur le plan le plus complet de Factura."

    const price = PLAN_PRICES[next]
    return `Passez au plan ${next} à partir de ${new Intl.NumberFormat("fr-FR").format(price.monthly)} XOF/mois pour débloquer cette fonctionnalité.`
}

// ════════════════════════════════════════════════════════════════════════════
// isPlanSufficient — vérification statique (sans DB)
// Usage : côté client pour désactiver les boutons
// ════════════════════════════════════════════════════════════════════════════

export function isPlanSufficient(planName: PlanName, module: ModuleKey): boolean {
    const limits = PLAN_LIMITS[planName]
    const map: Record<ModuleKey, boolean> = {
        stock: limits.hasStockModule,
        reports: limits.hasReportsModule,
        debt: limits.hasDebtModule,
        pos: limits.hasPOSModule,
        api: limits.hasApiAccess,
    }
    return map[module]
}

// ════════════════════════════════════════════════════════════════════════════
// formatLimit — affichage lisible d'une limite
// Usage : UI plan cards, tooltips
// ════════════════════════════════════════════════════════════════════════════

export function formatLimit(value: number | null, unit = ""): string {
    if (value === null) return "Illimité"
    if (value === 0) return "Non disponible"
    return `${new Intl.NumberFormat("fr-FR").format(value)}${unit ? ` ${unit}` : ""}`
}