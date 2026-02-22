import { MobileNav } from "@/components/layout/mobile-nav"
import { OrgTopbar } from "@/components/layout/org-topbar"
import { SidebarContent } from "@/components/layout/sidebar-content"
import { SessionProvider } from "@/components/providers/session-provider"
import { requireOrgSession } from "@/server/session/get-session"

export default async function OrgLayout({ children, params }: { children: React.ReactNode, params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await params
    const session = await requireOrgSession(orgSlug)

    return (
        <SessionProvider session={session}>
            <div className="flex h-screen bg-gray-50 overflow-hidden">
                <SidebarContent />

                <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
                    <OrgTopbar />

                    {/* On ajoute pb-20 sur mobile pour laisser la place au MobileNav */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 md:pb-8">
                        {children}
                    </div>
                </main>

                {/* Le menu mobile s'affiche uniquement sur petit écran via md:hidden */}
                <MobileNav />
            </div>
        </SessionProvider>
    )
}