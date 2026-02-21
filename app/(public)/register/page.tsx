// src/app/(auth)/register/page.tsx
"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { registerAction } from "@/server/actions/register.action"
import { generateSlug } from "@/lib/slug"
import type { RegisterInput, FieldErrors } from "@/lib/validations/register.schema"

// ─── Indicatifs téléphoniques ─────────────────────────────────────────────────
const PHONE_CODES = [
    { code: "+221", flag: "🇸🇳", country: "Sénégal" },
    { code: "+224", flag: "🇬🇳", country: "Guinée" },
    { code: "+225", flag: "🇨🇮", country: "Côte d'Ivoire" },
    { code: "+226", flag: "🇧🇫", country: "Burkina Faso" },
    { code: "+227", flag: "🇳🇪", country: "Niger" },
    { code: "+228", flag: "🇹🇬", country: "Togo" },
    { code: "+229", flag: "🇧🇯", country: "Bénin" },
    { code: "+223", flag: "🇲🇱", country: "Mali" },
    { code: "+222", flag: "🇲🇷", country: "Mauritanie" },
    { code: "+245", flag: "🇬🇼", country: "Guinée-Bissau" },
    { code: "+238", flag: "🇨🇻", country: "Cap-Vert" },
    { code: "+220", flag: "🇬🇲", country: "Gambie" },
    { code: "+233", flag: "🇬🇭", country: "Ghana" },
    { code: "+234", flag: "🇳🇬", country: "Nigeria" },
    { code: "+237", flag: "🇨🇲", country: "Cameroun" },
    { code: "+212", flag: "🇲🇦", country: "Maroc" },
    { code: "+213", flag: "🇩🇿", country: "Algérie" },
    { code: "+216", flag: "🇹🇳", country: "Tunisie" },
    { code: "+33", flag: "🇫🇷", country: "France" },
    { code: "+32", flag: "🇧🇪", country: "Belgique" },
    { code: "+1", flag: "🇺🇸", country: "États-Unis" },
    { code: "+44", flag: "🇬🇧", country: "Royaume-Uni" },
]

type Step = 1 | 2

type FormState = RegisterInput & {
    phoneCode: string
    phoneLocal: string
    orgAddress: string
}

export default function RegisterPage() {
    const router = useRouter()
    const [step, setStep] = useState<Step>(1)
    const [loading, setLoading] = useState(false)
    const [globalError, setGlobalError] = useState<string | null>(null)
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
    const [showPassword, setShowPassword] = useState(false)

    const [form, setForm] = useState<FormState>({
        name: "",
        email: "",
        password: "",
        phoneCode: "+221",
        phoneLocal: "",
        phoneNumber: "",
        orgName: "",
        orgSlug: "",
        orgAddress: "",
    })

    // Auto-slug depuis le nom de l'org
    useEffect(() => {
        if (form.orgName) {
            setForm((f) => ({ ...f, orgSlug: generateSlug(f.orgName) }))
        }
    }, [form.orgName])

    // Combine indicatif + numéro local → phoneNumber complet
    useEffect(() => {
        const local = form.phoneLocal.replace(/^0/, "")
        setForm((f) => ({ ...f, phoneNumber: local ? `${f.phoneCode}${local}` : "" }))
    }, [form.phoneLocal, form.phoneCode])

    function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
        const { name, value } = e.target
        setForm((f) => ({ ...f, [name]: value }))
        if (fieldErrors[name as keyof FieldErrors]) {
            setFieldErrors((prev) => ({ ...prev, [name]: undefined }))
        }
        setGlobalError(null)
    }

    // ─── Étape 1 → 2 : validation côté client avant de continuer ─────────────
    function handleNextStep(e: React.FormEvent) {
        e.preventDefault()
        const errors: FieldErrors = {}

        if (form.name.trim().length < 2)
            errors.name = "Le nom doit contenir au moins 2 caractères"
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
            errors.email = "Email invalide"
        if (form.password.length < 8)
            errors.password = "Minimum 8 caractères"
        else if (!/[A-Z]/.test(form.password))
            errors.password = "Au moins une majuscule"
        else if (!/[0-9]/.test(form.password))
            errors.password = "Au moins un chiffre"

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors)
            return
        }

        setFieldErrors({})
        setGlobalError(null)
        setStep(2)
    }

    // ─── Étape 2 : soumission finale ──────────────────────────────────────────
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setGlobalError(null)

        const result = await registerAction({
            name: form.name,
            email: form.email,
            password: form.password,
            phoneNumber: form.phoneNumber || undefined,
            orgName: form.orgName,
            orgSlug: form.orgSlug,
            orgAddress: form.orgAddress || undefined,
        })

        if (!result.success) {
            // Si l'erreur concerne un champ de l'étape 1, revenir à l'étape 1
            const step1Fields = ["name", "email", "password", "phoneNumber"]
            if (result.field && step1Fields.includes(result.field)) {
                setStep(1)
                setFieldErrors({ [result.field]: result.error })
            } else if (result.field) {
                setFieldErrors({ [result.field]: result.error })
            } else {
                setGlobalError(result.error)
            }
            setLoading(false)
            return
        }

        router.push(result.redirectTo)
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-md">

                {/* Header */}
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold text-gray-900">Créer un compte</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Ton espace de facturation sera prêt en quelques secondes
                    </p>
                </div>

                {/* Stepper */}
                <div className="mb-6 flex items-center gap-2 px-4">
                    <StepDot number={1} label="Ton compte" active={step === 1} done={step > 1} />
                    <div className={`h-px flex-1 transition-colors duration-300 ${step > 1 ? "bg-black" : "bg-gray-200"}`} />
                    <StepDot number={2} label="Organisation" active={step === 2} done={false} />
                </div>

                <div className="rounded-xl bg-white p-8 shadow-sm">

                    {globalError && (
                        <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                            {globalError}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════
              ÉTAPE 1 — Compte utilisateur
          ══════════════════════════════════════════════════════ */}
                    {step === 1 && (
                        <form onSubmit={handleNextStep} className="space-y-4">

                            <Field
                                label="Nom complet"
                                name="name"
                                type="text"
                                placeholder="Alpha Diallo"
                                value={form.name}
                                onChange={handleChange}
                                error={fieldErrors.name}
                                autoComplete="name"
                                required
                            />

                            <Field
                                label="Email"
                                name="email"
                                type="email"
                                placeholder="alpha@noumtech.sn"
                                value={form.email}
                                onChange={handleChange}
                                error={fieldErrors.email}
                                autoComplete="email"
                                required
                            />

                            {/* Mot de passe avec show/hide */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Mot de passe
                                </label>
                                <div className={`flex items-center overflow-hidden rounded-lg border focus-within:ring-2 focus-within:ring-black ${fieldErrors.password ? "border-red-400 bg-red-50" : "border-gray-200"
                                    }`}>
                                    <input
                                        name="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Min. 8 car., 1 majuscule, 1 chiffre"
                                        value={form.password}
                                        onChange={handleChange}
                                        autoComplete="new-password"
                                        required
                                        className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((v) => !v)}
                                        className="px-3 text-gray-400 hover:text-gray-700 transition-colors"
                                        tabIndex={-1}
                                        aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                                    >
                                        {showPassword ? <EyeOff /> : <Eye />}
                                    </button>
                                </div>
                                {fieldErrors.password && (
                                    <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
                                )}
                            </div>

                            {/* Téléphone avec indicatif pays */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Téléphone{" "}
                                    <span className="font-normal text-gray-400">(optionnel)</span>
                                </label>
                                <div className="flex gap-2">
                                    <select
                                        name="phoneCode"
                                        value={form.phoneCode}
                                        onChange={handleChange}
                                        className="w-36 rounded-lg border border-gray-200 px-2 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black bg-white"
                                    >
                                        {PHONE_CODES.map((p) => (
                                            <option key={`${p.code}-${p.country}`} value={p.code}>
                                                {p.flag} {p.code} {p.country}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        name="phoneLocal"
                                        type="tel"
                                        placeholder="77 000 00 00"
                                        value={form.phoneLocal}
                                        onChange={handleChange}
                                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black"
                                    />
                                </div>
                                {form.phoneNumber && (
                                    <p className="mt-1 text-xs text-gray-400">
                                        Numéro complet : {form.phoneNumber}
                                    </p>
                                )}
                                {fieldErrors.phoneNumber && (
                                    <p className="mt-1 text-xs text-red-500">{fieldErrors.phoneNumber}</p>
                                )}
                            </div>

                            <button
                                type="submit"
                                className="mt-2 w-full rounded-lg bg-black py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                            >
                                Continuer →
                            </button>

                            <p className="text-center text-sm text-gray-500">
                                Déjà un compte ?{" "}
                                <a href="/login" className="font-medium text-black underline">
                                    Se connecter
                                </a>
                            </p>
                        </form>
                    )}

                    {/* ══════════════════════════════════════════════════════
              ÉTAPE 2 — Organisation
          ══════════════════════════════════════════════════════ */}
                    {step === 2 && (
                        <form onSubmit={handleSubmit} className="space-y-4">

                            <Field
                                label="Nom de l'organisation"
                                name="orgName"
                                type="text"
                                placeholder="Noumtech"
                                value={form.orgName}
                                onChange={handleChange}
                                error={fieldErrors.orgName}
                                autoFocus
                                required
                            />

                            {/* Slug avec preview */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Identifiant unique
                                </label>
                                <div className={`flex items-center overflow-hidden rounded-lg border focus-within:ring-2 focus-within:ring-black ${fieldErrors.orgSlug ? "border-red-400" : "border-gray-200"
                                    }`}>
                                    <span className="select-none border-r bg-gray-50 px-3 py-2.5 text-sm text-gray-400 whitespace-nowrap">
                                        app.com/
                                    </span>
                                    <input
                                        name="orgSlug"
                                        type="text"
                                        value={form.orgSlug}
                                        onChange={handleChange}
                                        placeholder="noumtech"
                                        className="flex-1 px-3 py-2.5 text-sm outline-none"
                                        required
                                    />
                                </div>
                                {fieldErrors.orgSlug ? (
                                    <p className="mt-1 text-xs text-red-500">{fieldErrors.orgSlug}</p>
                                ) : (
                                    <p className="mt-1 text-xs text-gray-400">
                                        Lettres minuscules, chiffres et tirets uniquement
                                    </p>
                                )}
                            </div>

                            <Field
                                label={
                                    <>
                                        Adresse{" "}
                                        <span className="font-normal text-gray-400">(optionnel)</span>
                                    </>
                                }
                                name="orgAddress"
                                type="text"
                                placeholder="Dakar, Plateau, Rue 10"
                                value={form.orgAddress}
                                onChange={handleChange}
                                error={fieldErrors.orgAddress}
                            />

                            {/* Info plan FREE */}
                            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-700">Plan gratuit</p>
                                        <p className="text-xs text-gray-400">
                                            5 factures · 10 dépenses · 1 utilisateur
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-black px-2.5 py-0.5 text-xs font-medium text-white">
                                        FREE
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => { setStep(1); setGlobalError(null) }}
                                    className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                    ← Retour
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 rounded-lg bg-black py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                    {loading ? "Création..." : "Créer mon compte"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Stepper dot ──────────────────────────────────────────────────────────────
function StepDot({
    number, label, active, done,
}: {
    number: number
    label: string
    active: boolean
    done: boolean
}) {
    return (
        <div className="flex flex-col items-center gap-1">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all duration-300 ${done || active ? "bg-black text-white" : "bg-gray-100 text-gray-400"
                }`}>
                {done ? "✓" : number}
            </div>
            <span className={`text-xs font-medium ${active || done ? "text-black" : "text-gray-400"}`}>
                {label}
            </span>
        </div>
    )
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({
    label, error, ...props
}: {
    label: React.ReactNode
    error?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
            <input
                {...props}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black transition-colors ${error ? "border-red-400 bg-red-50" : "border-gray-200"
                    }`}
            />
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
    )
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function Eye() {
    return (
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}

function EyeOff() {
    return (
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    )
}