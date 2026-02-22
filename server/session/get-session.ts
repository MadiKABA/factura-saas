// src/server/session/get-session.ts
import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import { AppSession, SessionPlan, SessionSubscription, SessionUser, UserRole } from "@/types/session"


// ─── Hiérarchie des rôles ────────────────────────────────────────────────────

const ROLE_WEIGHT: Record<UserRole, number> = {
    OWNER: 4,
    ADMIN: 3,
    ACCOUNTANT: 2,
    MEMBER: 1,
}

export function hasMinRole(userRole: UserRole, required: UserRole): boolean {
    return ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[required]
}

// ─── Chargement session + org (mis en cache par requête via react.cache) ──────
// react.cache() déduplication : si plusieurs composants dans le même
// arbre RSC appellent getSession(), un seul appel DB est fait

export const getSession = cache(async (): Promise<{
    user: SessionUser
} | null> => {
    const session = await auth.api.getSession({
        headers: await headers(),
    })

    if (!session?.user) return null

    return {
        user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            image: session.user.image ?? null,
            phoneNumber: (session.user as any).phoneNumber ?? null,
            emailVerified: session.user.emailVerified,
        },
    }
})

// ─── Session complète avec org, plan, subscription ───────────────────────────

export const getOrgSession = cache(async (orgSlug: string): Promise<AppSession | null> => {
    const sessionData = await getSession()
    if (!sessionData) return null

    const { user } = sessionData

    // Charge org + membership + subscription + plan en une seule requête
    const membership = await prisma.membership.findFirst({
        where: {
            userId: user.id,
            organization: { slug: orgSlug },
        },
        include: {
            organization: {
                include: {
                    subscription: {
                        include: { plan: true },
                    },
                },
            },
        },
    })

    if (!membership) return null

    const { organization } = membership

    // Subscription et plan avec fallback FREE si manquant
    const subscription = organization.subscription
    const plan = subscription?.plan

    return {
        user,
        org: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            logoUrl: organization.logoUrl,
            address: organization.address,
            phone: organization.phone,
            email: organization.email,
            taxId: organization.taxId,
            defaultCurrency: organization.defaultCurrency,
        },
        role: membership.role as UserRole,
        plan: {
            name: (plan?.name ?? "FREE") as SessionPlan["name"],
            maxInvoices: plan?.maxInvoices ?? 5,
            maxExpenses: plan?.maxExpenses ?? 10,
            maxUsers: plan?.maxUsers ?? 1,
            maxProducts: plan?.maxProducts ?? 10,
        },
        subscription: {
            status: (subscription?.status ?? "ACTIVE") as SessionSubscription["status"],
            currentPeriodEnd: subscription?.currentPeriodEnd ?? new Date(),
            cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
        },
        // Helpers dérivés
        isOwner: membership.role === "OWNER",
        isAdmin: hasMinRole(membership.role as UserRole, "ADMIN"),
        canWrite: hasMinRole(membership.role as UserRole, "ACCOUNTANT"),
        isActive: ["ACTIVE", "TRIALING"].includes(subscription?.status ?? "ACTIVE"),
    }
})

// ─── Guards avec redirection ──────────────────────────────────────────────────

/** Redirige vers /login si pas de session */
export async function requireSession() {
    const session = await getSession()
    if (!session) redirect("/login")
    return session
}

/** Redirige vers /login ou /unauthorized si pas accès à l'org */
export async function requireOrgSession(orgSlug: string): Promise<AppSession> {
    const session = await getSession()
    if (!session) redirect(`/login?callbackUrl=/${orgSlug}`)

    const orgSession = await getOrgSession(orgSlug)
    if (!orgSession) redirect("/unauthorized")

    return orgSession
}

/** Redirige si le rôle est insuffisant */
export async function requireOrgRole(
    orgSlug: string,
    minRole: UserRole
): Promise<AppSession> {
    const session = await requireOrgSession(orgSlug)

    if (!hasMinRole(session.role, minRole)) {
        redirect("/unauthorized")
    }

    return session
}