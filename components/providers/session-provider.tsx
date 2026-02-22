// src/components/providers/session-provider.tsx
"use client"
import { AppSession, UserRole } from "@/types/session"
import { createContext, useContext } from "react"

// ─── Context ──────────────────────────────────────────────────────────────────

const SessionContext = createContext<AppSession | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SessionProvider({
    session,
    children,
}: {
    session: AppSession
    children: React.ReactNode
}) {
    return (
        <SessionContext.Provider value={session}>
            {children}
        </SessionContext.Provider>
    )
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useAppSession(): AppSession {
    const ctx = useContext(SessionContext)
    if (!ctx) throw new Error("useAppSession doit être utilisé dans un SessionProvider")
    return ctx
}

// ─── Hooks dérivés pratiques ──────────────────────────────────────────────────

export function useCurrentUser() {
    return useAppSession().user
}

export function useCurrentOrg() {
    return useAppSession().org
}

export function useCurrentRole(): UserRole {
    return useAppSession().role
}

export function useCurrentPlan() {
    return useAppSession().plan
}

export function useSubscription() {
    return useAppSession().subscription
}

/** Vérifie si l'utilisateur a au moins le rôle requis */
export function useHasRole(minRole: UserRole): boolean {
    const { role } = useAppSession()
    const weights: Record<UserRole, number> = {
        OWNER: 4, ADMIN: 3, ACCOUNTANT: 2, MEMBER: 1,
    }
    return weights[role] >= weights[minRole]
}

/** Vérifie si la subscription est active */
export function useIsActive(): boolean {
    return useAppSession().isActive
}