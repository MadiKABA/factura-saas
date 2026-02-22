"use client"
import React, { useState } from "react"
import { usePathname } from "next/navigation"
import { Home, FileText, Plus, BookOpen, Settings, Receipt, ClipboardEdit } from "lucide-react"
import { useCurrentOrg } from "@/components/providers/session-provider"
import Link from "next/link"

export function MobileNav() {
    const pathname = usePathname()
    const org = useCurrentOrg()
    const [isOpen, setIsOpen] = useState(false)
    const base = `/${org.slug}`

    const navItems = [
        { href: `${base}`, icon: Home, label: "Accueil" },
        { href: `${base}/invoices`, icon: FileText, label: "Factures" },
        { href: `${base}/tutorials`, icon: BookOpen, label: "Tutos" },
        { href: `${base}/settings`, icon: Settings, label: "Réglages" },
    ]

    return (
        <>
            {/* Drawer de création (Menu contextuel) */}
            <div className={`fixed inset-0 z-[60] transition-all duration-300 ${isOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}>
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
                <div className={`absolute bottom-20 left-4 right-4 bg-white rounded-3xl p-5 transition-transform duration-300 ${isOpen ? "translate-y-0" : "translate-y-10"}`}>
                    <div className="grid grid-cols-2 gap-3">
                        <button className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-2xl active:bg-gray-100 transition-all">
                            <div className="text-blue-600"><Receipt size={22} /></div>
                            <span className="text-xs font-bold">Facture</span>
                        </button>
                        <button className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-2xl active:bg-gray-100 transition-all">
                            <div className="text-purple-600"><ClipboardEdit size={22} /></div>
                            <span className="text-xs font-bold">Devis</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Barre de Navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50">
                {/* Effet Frosty Glass iOS */}
                <div className="absolute inset-0 bg-white/85 backdrop-blur-xl border-t border-gray-100 shadow-sm" />

                {/* Contenu - Padding réduit (pb-6 au lieu de pb-8) */}
                <div className="relative flex items-center justify-around px-2 pt-2.5 pb-6">

                    {/* Gauche */}
                    {navItems.slice(0, 2).map((item) => {
                        const active = pathname === item.href
                        return (
                            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 w-14">
                                <item.icon size={22} strokeWidth={active ? 2.5 : 2} className={active ? "text-black" : "text-gray-400"} />
                                <span className={`text-[9px] font-bold ${active ? "text-black" : "text-gray-400"}`}>{item.label}</span>
                            </Link>
                        )
                    })}

                    {/* Bouton "+" Noir et plus compact */}
                    <div className="relative -top-4">
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className={`w-12 h-12 flex items-center justify-center rounded-xl shadow-lg shadow-black/10 transition-all duration-300 active:scale-90 ${isOpen ? "bg-gray-400 rotate-45" : "bg-black"}`}
                        >
                            <Plus size={24} className="text-white" strokeWidth={3} />
                        </button>
                    </div>

                    {/* Droite */}
                    {navItems.slice(2, 4).map((item) => {
                        const active = pathname === item.href
                        return (
                            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 w-14">
                                <item.icon size={22} strokeWidth={active ? 2.5 : 2} className={active ? "text-black" : "text-gray-400"} />
                                <span className={`text-[9px] font-bold ${active ? "text-black" : "text-gray-400"}`}>{item.label}</span>
                            </Link>
                        )
                    })}
                </div>
            </nav>
        </>
    )
}