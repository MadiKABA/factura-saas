"use client"
import React, { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    LayoutDashboard, FileText, ClipboardList, Wallet, Users2,
    Box, Factory, Settings, UserCog, ChevronLeft, Menu, X
} from "lucide-react"
import { useCurrentOrg, useCurrentPlan, useCurrentRole, useHasRole, useIsActive } from "@/components/providers/session-provider"

const NAV_ITEMS = [
    { href: "", label: "Dashboard", icon: LayoutDashboard },
    { href: "/invoices", label: "Factures", icon: FileText },
    { href: "/quotes", label: "Devis", icon: ClipboardList },
    { href: "/expenses", label: "Dépenses", icon: Wallet },
    { href: "/clients", label: "Clients", icon: Users2 },
    { href: "/products", label: "Produits", icon: Box },
    { href: "/vendors", label: "Fournisseurs", icon: Factory },
]

const ADMIN_ITEMS = [
    { href: "/settings", label: "Paramètres", icon: Settings },
    { href: "/members", label: "Membres", icon: UserCog },
]

export function SidebarContent() {
    const org = useCurrentOrg()
    const plan = useCurrentPlan()
    const role = useCurrentRole()
    const isActive = useIsActive()
    const isAdmin = useHasRole("ADMIN")
    const pathname = usePathname()
    const base = `/${org.slug}`

    // États pour la responsivité
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isMobileOpen, setIsMobileOpen] = useState(false)

    const toggleSidebar = () => setIsCollapsed(!isCollapsed)

    return (
        <>
            {/* Bouton Mobile (uniquement visible sur petit écran) */}
            <div className="fixed top-4 left-4 z-50 md:hidden">
                <button
                    onClick={() => setIsMobileOpen(!isMobileOpen)}
                    className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm"
                >
                    {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
            </div>

            {/* Sidebar Principale */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-40 bg-white border-r border-gray-200 transition-all duration-300 ease-in-out
                    ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
                    md:relative md:translate-x-0
                    ${isCollapsed ? "md:w-20" : "md:w-48"}
                `}
            >
                <div className="flex h-full flex-col justify-between py-4 overflow-x-hidden">

                    <div>
                        {/* Header & Bouton Réduire (Desktop) */}
                        <div className="flex items-center justify-between mb-6 px-4">
                            {!isCollapsed && (
                                <div className="flex items-center gap-3 animate-in fade-in duration-500">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black text-sm font-bold text-white uppercase">
                                        {org.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-gray-900">{org.name}</p>
                                    </div>
                                </div>
                            )}
                            {isCollapsed && (
                                <div className="mx-auto bg-black h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold">
                                    {org.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <button
                                onClick={toggleSidebar}
                                className="hidden md:flex absolute -right-3 top-7 h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-50 transition-transform"
                                style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            >
                                <ChevronLeft size={14} />
                            </button>
                        </div>

                        {/* Navigation Principale */}
                        <nav className="space-y-1 px-3">
                            {NAV_ITEMS.map((item) => {
                                const href = `${base}${item.href}`
                                const active = pathname === href || (item.href !== "" && pathname.startsWith(href))
                                return (
                                    <Link
                                        key={item.href}
                                        href={href}
                                        title={isCollapsed ? item.label : ""}
                                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${active ? "bg-black text-white" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                            }`}
                                    >
                                        <item.icon size={20} className="shrink-0" />
                                        {!isCollapsed && <span className="animate-in slide-in-from-left-1">{item.label}</span>}
                                    </Link>
                                )
                            })}
                        </nav>

                        {/* Admin section */}
                        {isAdmin && (
                            <div className="mt-8 px-3">
                                {!isCollapsed && (
                                    <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                        Admin
                                    </p>
                                )}
                                <nav className="space-y-1">
                                    {ADMIN_ITEMS.map((item) => {
                                        const href = `${base}${item.href}`
                                        const active = pathname.startsWith(href)
                                        return (
                                            <Link
                                                key={item.href}
                                                href={href}
                                                title={isCollapsed ? item.label : ""}
                                                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${active ? "bg-black text-white" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                                    }`}
                                            >
                                                <item.icon size={20} className="shrink-0" />
                                                {!isCollapsed && <span className="animate-in slide-in-from-left-1">{item.label}</span>}
                                            </Link>
                                        )
                                    })}
                                </nav>
                            </div>
                        )}
                    </div>

                    {/* Footer Info / Plan */}
                    <div className="px-3">
                        {!isActive && !isCollapsed && (
                            <div className="mb-3 rounded-xl bg-red-50 p-2 text-[10px] text-red-600 font-medium text-center border border-red-100">
                                Inactif
                            </div>
                        )}
                        <div className={`rounded-2xl border border-gray-100 bg-gray-50 p-2 transition-all ${isCollapsed ? 'items-center' : ''}`}>
                            {!isCollapsed ? (
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{plan.name}</span>
                                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                </div>
                            ) : (
                                <div className="mx-auto h-2 w-2 rounded-full bg-green-500" />
                            )}
                        </div>
                    </div>
                </div>
            </aside>

            {/* Overlay Mobile : permet de fermer le menu en cliquant à côté */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}
        </>
    )
}