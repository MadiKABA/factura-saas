// src/app/unauthorized/page.tsx
import Link from "next/link"

export default function UnauthorizedPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
            <div className="text-center">
                <p className="text-5xl font-bold text-gray-900">403</p>
                <h1 className="mt-3 text-xl font-semibold text-gray-700">Accès refusé</h1>
                <p className="mt-2 text-sm text-gray-500">
                    Tu n'as pas les droits pour accéder à cette organisation ou cette page.
                </p>
                <Link
                    href="/login"
                    className="mt-6 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                    Retour à la connexion
                </Link>
            </div>
        </div>
    )
}