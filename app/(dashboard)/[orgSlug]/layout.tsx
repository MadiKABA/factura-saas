// src/app/(dashboard)/[orgSlug]/layout.tsx
// MODIFIÉ : pb-28 retiré du wrapper principal — chaque page gère son propre padding
// Le POS (z-5) passe sous la MobileNav (z-50) grâce aux z-index

import { MobileNav } from "@/components/layout/mobile-nav"
import { OrgTopbar } from "@/components/layout/org-topbar"
import { SidebarContent } from "@/components/layout/sidebar-content"
import { SessionProvider } from "@/components/providers/session-provider"
import { requireOrgSession } from "@/server/session/get-session"

export default async function OrgLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ orgSlug: string }>
}) {
    const { orgSlug } = await params
    const session = await requireOrgSession(orgSlug)

    return (
        <SessionProvider session={session}>
            <div className="flex h-screen bg-gray-100 overflow-hidden">
                <SidebarContent />

                <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
                    <OrgTopbar />

                    {/*
            Pas de pb-28 global — le POS est fixed et n'en a pas besoin.
            Les pages normales (listes, formulaires) doivent ajouter
            pb-24 dans leur propre composant pour éviter que MobileNav
            cache le contenu en bas.
          */}
                    <div className="flex-1 overflow-y-auto min-h-0">
                        {children}
                    </div>
                </main>

                {/* MobileNav z-50 — passe au-dessus du POS (z-5) et de tout le reste */}
                <MobileNav />
            </div>
        </SessionProvider>
    )
}