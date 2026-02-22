// src/lib/auth-helpers.ts
import { auth } from "@/server/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/server/db"
import { UserRole } from "./generated/prisma/enums"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Trouve le premier orgSlug de l'utilisateur (trié par OWNER > ADMIN > ...)
 * Utilisé pour la redirection post-login
 */
async function getDefaultOrgSlug(userId: string): Promise<string | null> {
    const ROLE_WEIGHT: Record<string, number> = {
        OWNER: 4, ADMIN: 3, ACCOUNTANT: 2, MEMBER: 1,
    }

    const memberships = await prisma.membership.findMany({
        where: { userId },
        include: { organization: { select: { slug: true } } },
    })

    if (memberships.length === 0) return null

    // Trie pour mettre en premier l'org où l'user a le plus haut rôle
    const sorted = memberships.sort(
        (a, b) => (ROLE_WEIGHT[b.role] ?? 0) - (ROLE_WEIGHT[a.role] ?? 0)
    )

    return sorted[0]?.organization.slug ?? null
}

// ══════════════════════════════════════════════════════════════════════════════
// requireSession
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère la session ou redirige vers /login
 * À utiliser dans les layouts et pages serveur protégées
 */
export async function requireSession() {
    const session = await auth.api.getSession({
        headers: await headers(),
    })

    if (!session) {
        redirect("/login")
    }

    return session
}

// ══════════════════════════════════════════════════════════════════════════════
// requireOrgAccess
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère la session + vérifie l'appartenance à l'org
 * - Pas de session        → /login?callbackUrl=/[orgSlug]
 * - Pas membre de l'org  → redirige vers le premier org de l'user
 */
export async function requireOrgAccess(orgSlug: string) {
    // 1. Vérifier la session
    const session = await auth.api.getSession({
        headers: await headers(),
    })

    if (!session) {
        redirect(`/login?callbackUrl=/${orgSlug}`)
    }

    // 2. Vérifier membership dans l'org demandée
    const membership = await prisma.membership.findFirst({
        where: {
            userId: session.user.id,
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

    // 3. Pas membre → rediriger vers son org par défaut
    if (!membership) {
        const defaultSlug = await getDefaultOrgSlug(session.user.id)

        if (defaultSlug) {
            redirect(`/${defaultSlug}`)
        } else {
            // Aucune org → probablement un compte incomplet, retour login
            redirect("/login")
        }
    }

    const { organization } = membership

    return {
        session,
        membership,
        org: organization,
        role: membership.role as UserRole,
        plan: organization.subscription?.plan ?? null,
        subscription: organization.subscription ?? null,
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// getDefaultOrgRedirect
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère la session et redirige vers /{orgSlug} du premier org de l'user
 * À utiliser sur la page /login après connexion réussie
 * et sur la page racine / pour rediriger les users connectés
 */
export async function getDefaultOrgRedirect(): Promise<never> {
    const session = await auth.api.getSession({
        headers: await headers(),
    })

    if (!session) {
        redirect("/login")
    }

    const defaultSlug = await getDefaultOrgSlug(session.user.id)

    if (defaultSlug) {
        redirect(`/${defaultSlug}`)
    }

    // User connecté mais sans org → page de création d'org
    redirect("/onboarding")
}

// ══════════════════════════════════════════════════════════════════════════════
// Rôles
// ══════════════════════════════════════════════════════════════════════════════

const ROLE_HIERARCHY: Record<UserRole, number> = {
    OWNER: 4,
    ADMIN: 3,
    ACCOUNTANT: 2,
    MEMBER: 1,
}

export function hasMinRole(userRole: UserRole, requiredRole: UserRole): boolean {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export function requireRole(userRole: UserRole, requiredRole: UserRole): void {
    if (!hasMinRole(userRole, requiredRole)) {
        redirect("/unauthorized")
    }
}