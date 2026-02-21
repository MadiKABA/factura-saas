// src/app/(auth)/login/page.tsx
"use client"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient, signIn } from "@/lib/auth-client"

type Tab = "email" | "phone"

export default function LoginPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const callbackUrl = searchParams.get("callbackUrl") ?? "/"

    const [tab, setTab] = useState<Tab>("email")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    // ─── Login email + mot de passe ─────────────────────────────────────────────
    async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const form = new FormData(e.currentTarget)
        const { error } = await signIn.email({
            email: form.get("email") as string,
            password: form.get("password") as string,
            callbackURL: decodeURIComponent(callbackUrl),
        })

        if (error) {
            setError(error.message ?? "Identifiants incorrects")
            setLoading(false)
        }
        // Better-Auth gère la redirection via callbackURL
    }

    // ─── Login Google ────────────────────────────────────────────────────────────
    async function handleGoogleLogin() {
        await signIn.social({
            provider: "google",
            callbackURL: decodeURIComponent(callbackUrl),
        })
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">

                <h1 className="mb-6 text-2xl font-bold">Connexion</h1>

                {/* Tabs Email / Téléphone */}
                <div className="mb-6 flex rounded-lg bg-gray-100 p-1">
                    {(["email", "phone"] as Tab[]).map((t) => (
                        <button
                            key={t}
                            onClick={() => { setTab(t); setError(null) }}
                            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${tab === t
                                ? "bg-white text-black shadow-sm"
                                : "text-gray-500 hover:text-gray-700"
                                }`}
                        >
                            {t === "email" ? "Email" : "Téléphone"}
                        </button>
                    ))}
                </div>

                {error && (
                    <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                        {error}
                    </p>
                )}

                {/* Formulaire Email */}
                {tab === "email" && (
                    <form onSubmit={handleEmailLogin} className="space-y-4">
                        <input
                            name="email"
                            type="email"
                            placeholder="Email"
                            required
                            autoComplete="email"
                            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black"
                        />
                        <input
                            name="password"
                            type="password"
                            placeholder="Mot de passe"
                            required
                            autoComplete="current-password"
                            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black"
                        />
                        <div className="text-right">
                            <a href="/forgot-password" className="text-xs text-gray-500 hover:underline">
                                Mot de passe oublié ?
                            </a>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                            {loading ? "Connexion..." : "Se connecter"}
                        </button>
                    </form>
                )}

                {/* Formulaire Téléphone */}
                {tab === "phone" && <PhoneOtpForm callbackUrl={callbackUrl} />}

                {/* Séparateur */}
                <div className="my-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-xs text-gray-400">ou</span>
                    <div className="h-px flex-1 bg-gray-200" />
                </div>

                {/* Google */}
                <button
                    onClick={handleGoogleLogin}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium hover:bg-gray-50"
                >
                    <GoogleIcon />
                    Continuer avec Google
                </button>

                <p className="mt-6 text-center text-sm text-gray-500">
                    Pas encore de compte ?{" "}
                    <a href="/register" className="font-medium text-black underline">
                        S'inscrire
                    </a>
                </p>
            </div>
        </div>
    )
}

// ─── Composant OTP téléphone ─────────────────────────────────────────────────

function PhoneOtpForm({ callbackUrl }: { callbackUrl: string }) {
    const [step, setStep] = useState<"phone" | "code">("phone")
    const [phone, setPhone] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const { phoneNumber: phoneNumberClient } = authClient

    async function sendOtp() {
        setLoading(true)
        setError(null)
        const { error } = await phoneNumberClient.sendOtp({ phoneNumber: phone })
        if (error) {
            setError(error.message ?? "Impossible d'envoyer le code")
        } else {
            setStep("code")
        }
        setLoading(false)
    }

    async function verifyOtp(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const form = new FormData(e.currentTarget)
        const { error } = await phoneNumberClient.verify({
            phoneNumber: phone,
            code: form.get("code") as string,
        })

        if (error) {
            setError(error.message ?? "Code incorrect")
            setLoading(false)
        }
        // Redirection gérée automatiquement par Better-Auth
    }

    if (step === "phone") {
        return (
            <div className="space-y-4">
                <input
                    type="tel"
                    placeholder="+221 77 000 00 00"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black"
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                    onClick={sendOtp}
                    disabled={loading || phone.length < 8}
                    className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                    {loading ? "Envoi..." : "Recevoir le code"}
                </button>
            </div>
        )
    }

    return (
        <form onSubmit={verifyOtp} className="space-y-4">
            <p className="text-sm text-gray-600">
                Code envoyé au <strong>{phone}</strong>
            </p>
            <input
                name="code"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
                className="w-full rounded-lg border px-3 py-2.5 text-center text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-black"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
                {loading ? "Vérification..." : "Confirmer"}
            </button>
            <button
                type="button"
                onClick={() => setStep("phone")}
                className="w-full text-xs text-gray-400 hover:underline"
            >
                Changer de numéro
            </button>
        </form>
    )
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
    )
}