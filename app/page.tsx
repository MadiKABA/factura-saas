// src/app/page.tsx
import { auth } from "@/server/auth"
import { headers } from "next/headers"
import { prisma } from "@/server/db"
import { redirect } from "next/navigation"
import LandingPage from "@/components/landing-page" // ton composant landing

export default async function HomePage() {
  // Vérifie si l'user est déjà connecté
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session?.user) {
    // Connecté → trouve son premier org et redirige
    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      include: { organization: { select: { slug: true } } },
    })

    if (membership) {
      redirect(`/${membership.organization.slug}`)
    }

    // Connecté mais sans org → onboarding
    redirect("/onboarding")
  }

  // Pas connecté → affiche la landing
  return <LandingPage />
}