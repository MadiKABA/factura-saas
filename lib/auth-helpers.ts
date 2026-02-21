// src/lib/auth-helpers.ts
import { auth } from "@/server/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/server/db"
import { UserRole } from "./generated/prisma/enums"

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

/**
 * Récupère la session + vérifie l'appartenance à l'org
 * À utiliser dans les layouts du dashboard [orgSlug]
 */
export async function requireOrgAccess(orgSlug: string) {
    const session = await requireSession()

    const membership = await prisma.membership.findFirst({
        where: {
            userId: session.user.id,
            organization: { slug: orgSlug },
        },
        include: {
            organization: true,
        },
    })

    if (!membership) {
        redirect("/")
    }

    return {
        session,
        membership,
        org: membership.organization,
        role: membership.role,
    }
}

/**
 * Vérifie que l'utilisateur a le rôle minimum requis
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
    OWNER: 4,
    ADMIN: 3,
    ACCOUNTANT: 2,
    MEMBER: 1,
}

export function hasMinRole(
    userRole: UserRole,
    requiredRole: UserRole
): boolean {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export function requireRole(
    userRole: UserRole,
    requiredRole: UserRole
) {
    if (!hasMinRole(userRole, requiredRole)) {
        redirect("/")
    }
}