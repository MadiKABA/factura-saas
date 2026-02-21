// src/app/(auth)/login/page.tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn, authClient } from "@/lib/auth-client"

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)

    const { error } = await signIn.email({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      callbackURL: "/",
    })

    if (error) {
      setError(error.message ?? "Erreur de connexion")
      setLoading(false)
      return
    }

    router.push("/")
  }

  async function handleGoogleLogin() {
    await signIn.social({
      provider: "google",
      callbackURL: "/",
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-6">
        <h1 className="text-2xl font-bold">Connexion</h1>

        {error && (
          <p className="rounded bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="password"
            type="password"
            placeholder="Mot de passe"
            required
            className="w-full rounded border px-3 py-2"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-500">ou</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full rounded border py-2 hover:bg-gray-50"
        >
          Continuer avec Google
        </button>

        <p className="text-center text-sm text-gray-600">
          Pas de compte ?{" "}
          <a href="/register" className="font-medium underline">
            S'inscrire
          </a>
        </p>
      </div>
    </div>
  )
}