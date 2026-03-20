"use client"
import React, { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import {
    Home, FileText, ClipboardList, ShoppingCart, BookOpen,
    Store, Package, Users2, Plus, X,
    Receipt, ClipboardEdit, Banknote, CreditCard,
    Settings,
} from "lucide-react"
import { useCurrentOrg, useHasRole } from "@/components/providers/session-provider"

// ─── Types ────────────────────────────────────────────────────────────────────
type NavItem = { href: string; label: string; icon: React.ElementType }
type DrawerAction = {
    href: string; label: string; icon: React.ElementType
    color: string; bg: string
}

// ─── Nav items selon type org ─────────────────────────────────────────────────
const NAV_BUSINESS: NavItem[] = [
    { href: "", label: "Accueil", icon: Home },
    { href: "/invoices", label: "Factures", icon: FileText },
    { href: "/quotes", label: "Devis", icon: ClipboardList },
    { href: "/settings", label: "Réglages", icon: Settings },
]

const NAV_COMMERCE: NavItem[] = [
    { href: "", label: "Accueil", icon: Home },
    { href: "/pos", label: "Caisse", icon: Store },
    { href: "/sales", label: "Ventes", icon: ShoppingCart },
    { href: "/debts", label: "Dettes", icon: BookOpen },
]

// ─── Actions du drawer "+" selon type org ────────────────────────────────────
const DRAWER_BUSINESS: DrawerAction[] = [
    { href: "/invoices/new", label: "Facture", icon: Receipt, color: "text-blue-600", bg: "bg-blue-50" },
    { href: "/quotes/new", label: "Devis", icon: ClipboardEdit, color: "text-violet-600", bg: "bg-violet-50" },
    { href: "/debts", label: "Dette", icon: Banknote, color: "text-amber-600", bg: "bg-amber-50" },
    { href: "/expenses/new", label: "Dépense", icon: CreditCard, color: "text-red-600", bg: "bg-red-50" },
]

const DRAWER_COMMERCE: DrawerAction[] = [
    { href: "/pos", label: "Vente rapide", icon: Store, color: "text-emerald-600", bg: "bg-emerald-50" },
    { href: "/debts", label: "Dette client", icon: Banknote, color: "text-amber-600", bg: "bg-amber-50" },
    { href: "/products/new", label: "Produit", icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
    { href: "/clients", label: "Client", icon: Users2, color: "text-violet-600", bg: "bg-violet-50" },
]

// ═════════════════════════════════════════════════════════════════════════════
export function MobileNav() {
    const pathname = usePathname()
    const router = useRouter()
    const org = useCurrentOrg()
    const base = `/${org.slug}`

    const [drawerOpen, setDrawerOpen] = useState(false)

    const orgType = (org as any).type ?? "BUSINESS"
    const isCommerce = orgType !== "BUSINESS"

    const navItems = isCommerce ? NAV_COMMERCE : NAV_BUSINESS
    const drawerItems = isCommerce ? DRAWER_COMMERCE : DRAWER_BUSINESS

    // Séparer les items : 2 gauche + 2 droite autour du bouton +
    const leftItems = navItems.slice(0, 2)
    const rightItems = navItems.slice(2, 4)

    function isActive(href: string) {
        const full = `${base}${href}`
        return href === ""
            ? pathname === full
            : pathname === full || pathname.startsWith(full + "/")
    }

    function handleDrawerAction(href: string) {
        setDrawerOpen(false)
        router.push(`${base}${href}`)
    }

    return (
        <>
            {/* ── Drawer actions ──────────────────────────────────────── */}
            <div className={`fixed inset-0 z-[60] transition-all duration-300 ${drawerOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
                }`}>
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={() => setDrawerOpen(false)}
                />

                {/* Drawer card */}
                <div className={`absolute bottom-24 left-4 right-4 bg-white rounded-3xl shadow-2xl overflow-hidden transition-all duration-300 ${drawerOpen ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
                    }`}>
                    {/* Header */}
                    <div className="px-5 pt-5 pb-3 border-b border-zinc-100">
                        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                            Créer
                        </p>
                    </div>

                    {/* Actions grille 2 colonnes */}
                    <div className="grid grid-cols-2 gap-2 p-4">
                        {drawerItems.map(action => (
                            <button
                                key={action.href}
                                onClick={() => handleDrawerAction(action.href)}
                                className={`flex items-center gap-3 p-4 ${action.bg} rounded-2xl active:scale-95 transition-all text-left`}
                            >
                                <div className={`h-9 w-9 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm`}>
                                    <action.icon size={18} className={action.color} />
                                </div>
                                <span className={`text-sm font-bold ${action.color}`}>
                                    {action.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Barre de navigation ──────────────────────────────────── */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50">
                {/* Fond frosted glass */}
                <div className="absolute inset-0 bg-white/90 backdrop-blur-xl border-t border-zinc-100 shadow-sm" />

                <div className="relative flex items-center justify-around px-2 pt-2.5 pb-6">

                    {/* Items gauche */}
                    {leftItems.map(item => {
                        const active = isActive(item.href)
                        return (
                            <Link
                                key={item.href}
                                href={`${base}${item.href}`}
                                className="flex flex-col items-center gap-1 w-14 py-0.5"
                            >
                                <item.icon
                                    size={22}
                                    strokeWidth={active ? 2.5 : 1.8}
                                    className={active ? "text-zinc-900" : "text-zinc-400"}
                                />
                                <span className={`text-[9px] font-bold tracking-tight ${active ? "text-zinc-900" : "text-zinc-400"
                                    }`}>
                                    {item.label}
                                </span>
                                {/* Indicateur actif */}
                                {active && (
                                    <div className="h-1 w-1 rounded-full bg-zinc-900" />
                                )}
                            </Link>
                        )
                    })}

                    {/* Bouton + central */}
                    <div className="relative -top-3">
                        <button
                            onClick={() => setDrawerOpen(!drawerOpen)}
                            className={`w-13 h-13 w-[52px] h-[52px] flex items-center justify-center rounded-2xl shadow-lg transition-all duration-300 active:scale-90 ${drawerOpen
                                ? "bg-zinc-700 rotate-45"
                                : "bg-zinc-900"
                                }`}
                        >
                            <Plus size={24} className="text-white" strokeWidth={2.5} />
                        </button>
                        <p className="text-[9px] font-bold text-zinc-400 text-center mt-1">
                            Créer
                        </p>
                    </div>

                    {/* Items droite */}
                    {rightItems.map(item => {
                        const active = isActive(item.href)
                        return (
                            <Link
                                key={item.href}
                                href={`${base}${item.href}`}
                                className="flex flex-col items-center gap-1 w-14 py-0.5"
                            >
                                <item.icon
                                    size={22}
                                    strokeWidth={active ? 2.5 : 1.8}
                                    className={active ? "text-zinc-900" : "text-zinc-400"}
                                />
                                <span className={`text-[9px] font-bold tracking-tight ${active ? "text-zinc-900" : "text-zinc-400"
                                    }`}>
                                    {item.label}
                                </span>
                                {active && (
                                    <div className="h-1 w-1 rounded-full bg-zinc-900" />
                                )}
                            </Link>
                        )
                    })}
                </div>
            </nav>
        </>
    )
}