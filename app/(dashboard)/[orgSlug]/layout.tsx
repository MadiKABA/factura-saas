// src/app/(dashboard)/[orgSlug]/layout.tsx
import { redirect } from "next/navigation"
import { requireOrgSession } from "@/server/session/get-session"
import { SessionProvider } from "@/components/providers/session-provider"

export default async function OrgLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ orgSlug: string }>
}) {
    const { orgSlug } = await params

    // Charge session complète avec org + plan + subscription + role
    // Redirige automatiquement si :
    //   - pas de session        → /login?callbackUrl=/[orgSlug]
    //   - pas membre de l'org   → /unauthorized
    const session = await requireOrgSession(orgSlug)

    return (
        // Injecte la session dans tout l'arbre client via context
        <SessionProvider session={session}>
            <div className="flex h-screen overflow-hidden bg-gray-50">
                {/* Sidebar */}
                <aside className="w-64 shrink-0 border-r bg-white">
                    <OrgSidebar />
                </aside>

                {/* Main */}
                <main className="flex flex-1 flex-col overflow-auto">
                    {/* Topbar */}
                    <OrgTopbar />

                    {/* Contenu de la page */}
                    <div className="flex-1 p-6">
                        {children}
                    </div>
                </main>
            </div>
        </SessionProvider>
    )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
// Server Component — accès direct à requireOrgSession via react.cache()
// (même requête DB déduplicée, pas de second appel)

async function OrgSidebar() {
    // Pas besoin de re-passer orgSlug — react.cache() retourne le résultat mis en cache
    // Ici on utilise les paramètres directement depuis le layout parent
    return (
        <div className="flex h-full flex-col">
            <SidebarContent />
        </div>
    )
}

// Client component pour la sidebar interactive
import { SidebarContent } from "@/components/layout/sidebar-content"
import { OrgTopbar } from "@/components/layout/org-topbar"