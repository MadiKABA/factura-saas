"use client"
import React, { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    LayoutDashboard, FileText, ClipboardList, Wallet, Users2,
    Box, Factory, Settings, UserCog, ChevronLeft, Menu, X,
    ShoppingCart, BookOpen, Package, BarChart3,
    TrendingUp, Store,
} from "lucide-react"
import { useCurrentOrg, useCurrentPlan, useHasRole, useIsActive } from "@/components/providers/session-provider"

type NavItem = { href: string; label: string; icon: React.ElementType }
type NavGroup = { label: string; items: NavItem[] }

// ─── Dashboard (commun) ───────────────────────────────────────────────────────
const NAV_COMMON: NavItem[] = [
    { href: "", label: "Dashboard", icon: LayoutDashboard },
]

// ─── BUSINESS ────────────────────────────────────────────────────────────────
const NAV_BUSINESS_GROUPS: NavGroup[] = [
    {
        label: "Facturation",
        items: [
            { href: "/invoices", label: "Factures", icon: FileText },
            { href: "/quotes", label: "Devis", icon: ClipboardList },
            //{ href: "/expenses", label: "Dépenses", icon: Wallet },
        ],
    },
    {
        label: "Vente & Dettes",
        items: [
            { href: "/pos", label: "Ventes", icon: ShoppingCart },
            { href: "/debts", label: "Dettes", icon: BookOpen },
        ],
    },
    {
        label: "Tiers",
        items: [
            { href: "/clients", label: "Clients", icon: Users2 },
            { href: "/products", label: "Produits", icon: Box },
            { href: "/vendors", label: "Fournisseurs", icon: Factory },
        ],
    },
]

// ─── COMMERCE ────────────────────────────────────────────────────────────────
const NAV_COMMERCE_GROUPS: NavGroup[] = [
    {
        label: "Vente",
        items: [
            { href: "/pos", label: "Caisse", icon: Store },
            { href: "/sales", label: "Ventes", icon: ShoppingCart },
            { href: "/debts", label: "Dettes", icon: BookOpen },
        ],
    },
    {
        label: "Stock",
        items: [
            { href: "/products", label: "Produits", icon: Package },
            { href: "/stock", label: "Stock", icon: TrendingUp },
            { href: "/inventory", label: "Inventaire", icon: BarChart3 },
        ],
    },
    {
        label: "Tiers",
        items: [
            { href: "/clients", label: "Clients", icon: Users2 },
            { href: "/vendors", label: "Fournisseurs", icon: Factory },
        ],
    },
]

// ─── Admin ────────────────────────────────────────────────────────────────────
const ADMIN_ITEMS: NavItem[] = [
    { href: "/settings", label: "Paramètres", icon: Settings },
    { href: "/members", label: "Membres", icon: UserCog },
]

// ═════════════════════════════════════════════════════════════════════════════
export function SidebarContent() {
    const org = useCurrentOrg()
    const plan = useCurrentPlan()
    const isActive = useIsActive()
    const isAdmin = useHasRole("ADMIN")
    const pathname = usePathname()
    const base = `/${org.slug}`

    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isMobileOpen, setIsMobileOpen] = useState(false)

    const orgType = (org as any).type ?? "BUSINESS"
    const isCommerce = orgType !== "BUSINESS"
    const navGroups = isCommerce ? NAV_COMMERCE_GROUPS : NAV_BUSINESS_GROUPS

    // ─── Composant lien nav ────────────────────────────────────────────────
    function NavLink({ item }: { item: NavItem }) {
        const href = `${base}${item.href}`
        const active = item.href === ""
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/")
        return (
            <Link
                href={href}
                title={isCollapsed ? item.label : ""}
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
            >
                <item.icon size={18} className="shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
            </Link>
        )
    }

    return (
        <>
            {/* ── Bouton Mobile ──────────────────────────────────────────── */}
            <div className="fixed top-4 left-4 z-50 md:hidden">
                <button
                    onClick={() => setIsMobileOpen(!isMobileOpen)}
                    className="p-2 bg-white border border-zinc-200 rounded-xl shadow-sm"
                >
                    {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
            </div>

            {/* ── Sidebar ────────────────────────────────────────────────── */}
            <aside className={`
                fixed inset-y-0 left-0 z-40 bg-white border-r border-zinc-200
                transition-all duration-300 ease-in-out flex flex-col
                ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
                md:relative md:translate-x-0
                ${isCollapsed ? "md:w-20" : "md:w-52"}
            `}>
                <div className="flex h-full flex-col justify-between py-4 overflow-x-hidden overflow-y-auto">
                    <div className="space-y-1">

                        {/* Header org */}
                        <div className="flex items-center justify-between mb-4 px-4 relative">
                            {!isCollapsed ? (
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white uppercase">
                                        {org.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-zinc-900">{org.name}</p>
                                        <p className="text-[10px] text-zinc-400 uppercase tracking-wider">
                                            {isCommerce ? orgType : "Business"}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="mx-auto bg-zinc-900 h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                                    {org.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <button
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white hover:bg-zinc-50 transition-transform shrink-0"
                                style={{ transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)" }}
                            >
                                <ChevronLeft size={14} />
                            </button>
                        </div>

                        {/* Dashboard */}
                        <div className="px-3">
                            <NavLink item={NAV_COMMON[0]!} />
                        </div>

                        {/* Groupes */}
                        {navGroups.map(group => (
                            <div key={group.label} className="px-3 pt-4">
                                {!isCollapsed && (
                                    <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                                        {group.label}
                                    </p>
                                )}
                                {isCollapsed && <div className="border-t border-zinc-100 mb-1.5" />}
                                <nav className="space-y-0.5">
                                    {group.items.map(item => (
                                        <NavLink key={item.href} item={item} />
                                    ))}
                                </nav>
                            </div>
                        ))}

                        {/* Admin */}
                        {isAdmin && (
                            <div className="px-3 pt-4">
                                {!isCollapsed && (
                                    <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                                        Admin
                                    </p>
                                )}
                                {isCollapsed && <div className="border-t border-zinc-100 mb-1.5" />}
                                <nav className="space-y-0.5">
                                    {ADMIN_ITEMS.map(item => (
                                        <NavLink key={item.href} item={item} />
                                    ))}
                                </nav>
                            </div>
                        )}
                    </div>

                    {/* Footer plan */}
                    <div className="px-3 pt-4 border-t border-zinc-100 mt-4">
                        {!isActive && !isCollapsed && (
                            <div className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] text-red-600 font-semibold text-center border border-red-100">
                                Organisation inactive
                            </div>
                        )}
                        <div className={`rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 flex items-center ${isCollapsed ? "justify-center" : "justify-between"
                            }`}>
                            {!isCollapsed ? (
                                <>
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                                        {plan.name}
                                    </span>
                                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                </>
                            ) : (
                                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                            )}
                        </div>
                    </div>
                </div>
            </aside>

            {/* Overlay Mobile */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}
        </>
    )
}