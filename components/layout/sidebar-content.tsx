// src/components/layout/sidebar-content.tsx
"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCurrentOrg, useCurrentPlan, useCurrentRole, useHasRole, useIsActive } from "@/components/providers/session-provider"

const NAV_ITEMS = [
    { href: "", label: "Tableau de bord", icon: "⊞" },
    { href: "/invoices", label: "Factures", icon: "📄" },
    { href: "/quotes", label: "Devis", icon: "📋" },
    { href: "/expenses", label: "Dépenses", icon: "💸" },
    { href: "/clients", label: "Clients", icon: "👥" },
    { href: "/products", label: "Produits", icon: "📦" },
    { href: "/vendors", label: "Fournisseurs", icon: "🏭" },
]

const ADMIN_ITEMS = [
    { href: "/settings", label: "Paramètres", icon: "⚙️" },
    { href: "/members", label: "Membres", icon: "👤" },
]

export function SidebarContent() {
    const org = useCurrentOrg()
    const plan = useCurrentPlan()
    const role = useCurrentRole()
    const isActive = useIsActive()
    const isAdmin = useHasRole("ADMIN")
    const pathname = usePathname()
    const base = `/${org.slug}`

    return (
        <div className="flex h-full flex-col justify-between py-4">

            {/* Logo + nom org */}
            <div>
                <div className="mb-6 px-4">
                    <div className="flex items-center gap-3">
                        {org.logoUrl ? (
                            <img src={org.logoUrl} alt={org.name} className="h-8 w-8 rounded-lg object-cover" />
                        ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-sm font-bold text-white">
                                {org.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{org.name}</p>
                            <p className="text-xs text-gray-400">{org.slug}</p>
                        </div>
                    </div>
                </div>

                {/* Navigation principale */}
                <nav className="space-y-0.5 px-2">
                    {NAV_ITEMS.map((item) => {
                        const href = `${base}${item.href}`
                        const isActive = pathname === href || (item.href !== "" && pathname.startsWith(href))
                        return (
                            <Link
                                key={item.href}
                                href={href}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive
                                    ? "bg-gray-100 font-medium text-gray-900"
                                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                                    }`}
                            >
                                <span className="text-base">{item.icon}</span>
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>

                {/* Admin uniquement */}
                {isAdmin && (
                    <div className="mt-4 px-2">
                        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                            Administration
                        </p>
                        <nav className="space-y-0.5">
                            {ADMIN_ITEMS.map((item) => {
                                const href = `${base}${item.href}`
                                const active = pathname.startsWith(href)
                                return (
                                    <Link
                                        key={item.href}
                                        href={href}
                                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active
                                            ? "bg-gray-100 font-medium text-gray-900"
                                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                                            }`}
                                    >
                                        <span className="text-base">{item.icon}</span>
                                        {item.label}
                                    </Link>
                                )
                            })}
                        </nav>
                    </div>
                )}
            </div>

            {/* Plan badge + abonnement */}
            <div className="px-4">
                {!isActive && (
                    <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                        ⚠️ Abonnement inactif
                    </div>
                )}
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Plan actuel</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${plan.name === "PRO" || plan.name === "BUSINESS"
                            ? "bg-black text-white"
                            : "bg-gray-100 text-gray-600"
                            }`}>
                            {plan.name}
                        </span>
                    </div>
                    {plan.name === "FREE" && (
                        <Link
                            href={`${base}/settings/billing`}
                            className="mt-2 block text-center text-xs font-medium text-black underline"
                        >
                            Passer à un plan supérieur →
                        </Link>
                    )}
                </div>

                {/* Rôle de l'utilisateur */}
                <p className="mt-2 text-center text-xs text-gray-400">
                    {role === "OWNER" ? "Propriétaire" :
                        role === "ADMIN" ? "Administrateur" :
                            role === "ACCOUNTANT" ? "Comptable" : "Membre"}
                </p>
            </div>
        </div>
    )
}