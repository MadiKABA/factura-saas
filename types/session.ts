// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionUser = {
    id: string
    name: string | null
    email: string
    image: string | null
    phoneNumber: string | null
    emailVerified: boolean
}

export type SessionOrg = {
    id: string
    name: string
    slug: string
    logoUrl: string | null
    address: string | null
    phone: string | null
    email: string | null
    taxId: string | null
    defaultCurrency: string
}

export type SessionPlan = {
    name: "FREE" | "STARTER" | "PRO" | "BUSINESS"
    maxInvoices: number | null
    maxExpenses: number | null
    maxUsers: number | null
    maxProducts: number | null
}

export type SessionSubscription = {
    status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING"
    currentPeriodEnd: Date
    cancelAtPeriodEnd: boolean
}

export type UserRole = "OWNER" | "ADMIN" | "ACCOUNTANT" | "MEMBER"

export type AppSession = {
    user: SessionUser
    org: SessionOrg
    role: UserRole
    plan: SessionPlan
    subscription: SessionSubscription
    // Helpers dérivés
    isOwner: boolean
    isAdmin: boolean
    canWrite: boolean   // OWNER | ADMIN | ACCOUNTANT
    isActive: boolean   // subscription ACTIVE ou TRIALING
}