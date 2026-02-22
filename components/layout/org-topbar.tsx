// src/components/layout/org-topbar.tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import {
    useCurrentUser,
    useCurrentOrg,
    useCurrentRole,
} from "@/components/providers/session-provider"

export function OrgTopbar() {
    const user = useCurrentUser()
    const org = useCurrentOrg()
    const role = useCurrentRole()
    const router = useRouter()
    const [menuOpen, setMenuOpen] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)

    async function handleLogout() {
        setLoggingOut(true)
        await authClient.signOut()
        router.push("/login")
    }

    return (
        <header className="flex h-14 items-center justify-between border-b bg-white px-6">

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="font-medium text-gray-900">{org.name}</span>
            </div>

            {/* User menu */}
            <div className="relative">
                <button
                    onClick={() => setMenuOpen((v) => !v)}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                >
                    {/* Avatar */}
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-bold text-white">
                        {user.name?.charAt(0).toUpperCase() ?? user.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left">
                        <p className="text-xs font-medium text-gray-900 leading-none">{user.name ?? user.email}</p>
                        <p className="text-xs text-gray-400 leading-none mt-0.5">
                            {role === "OWNER" ? "Propriétaire" :
                                role === "ADMIN" ? "Admin" :
                                    role === "ACCOUNTANT" ? "Comptable" : "Membre"}
                        </p>
                    </div>
                    <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </button>

                {/* Dropdown */}
                {menuOpen && (
                    <>
                        {/* Overlay pour fermer */}
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />

                        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border bg-white shadow-lg overflow-hidden">
                            {/* Infos user */}
                            <div className="px-4 py-3 border-b bg-gray-50">
                                <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                                <p className="text-xs text-gray-500 truncate">{user.email}</p>
                            </div>

                            {/* Actions */}
                            <div className="py-1">
                                <button
                                    onClick={() => { router.push(`/${org.slug}/settings/profile`); setMenuOpen(false) }}
                                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <span>👤</span> Mon profil
                                </button>
                                <button
                                    onClick={() => { router.push(`/${org.slug}/settings`); setMenuOpen(false) }}
                                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <span>⚙️</span> Paramètres
                                </button>
                            </div>

                            <div className="border-t py-1">
                                <button
                                    onClick={handleLogout}
                                    disabled={loggingOut}
                                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                    <span>🚪</span> {loggingOut ? "Déconnexion..." : "Se déconnecter"}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </header>
    )
}