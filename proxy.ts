// src/proxy.ts  (anciennement middleware.ts — renommé dans Next.js 16)
import { NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

// Routes publiques — pas de vérification session
const PUBLIC_ROUTES = [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/api/auth",
    "/unauthorized",
]

// Ressources statiques — toujours autorisées
const STATIC_PATTERNS = [
    /^\/_next/,
    /^\/favicon/,
    /^\/icons/,
    /^\/manifest/,
    /\.(ico|png|jpg|jpeg|svg|webp|css|js|woff2?)$/,
]

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    // 1. Toujours autoriser les ressources statiques
    if (STATIC_PATTERNS.some((p) => p.test(pathname))) {
        return NextResponse.next()
    }

    // 2. Toujours autoriser les routes publiques
    if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
        return NextResponse.next()
    }

    // 3. Vérification du cookie Better-Auth via helper officiel
    // getSessionCookie() lit better-auth.session_token (ou __Secure- en HTTPS)
    // Vérification cookie uniquement — Edge, pas d'appel DB
    // La validation DB réelle se fait dans requireOrgSession() dans le layout
    const sessionCookie = getSessionCookie(request)

    if (!sessionCookie) {
        const loginUrl = new URL("/login", request.url)
        loginUrl.searchParams.set("callbackUrl", pathname)
        return NextResponse.redirect(loginUrl)
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
}