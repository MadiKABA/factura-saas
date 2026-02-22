// src/app/(auth)/forgot-password/page.tsx
"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { sendResetOtpAction, resetPasswordAction } from "@/server/actions/forgot-password.action"

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
    { code: "+233", flag: "🇬🇭", country: "Ghana" },
    { code: "+234", flag: "🇳🇬", country: "Nigeria" },
    { code: "+237", flag: "🇨🇲", country: "Cameroun" },
    { code: "+212", flag: "🇲🇦", country: "Maroc" },
    { code: "+213", flag: "🇩🇿", country: "Algérie" },
    { code: "+216", flag: "🇹🇳", country: "Tunisie" },
    { code: "+33", flag: "🇫🇷", country: "France" },
    { code: "+1", flag: "🇺🇸", country: "États-Unis" },
    { code: "+44", flag: "🇬🇧", country: "Royaume-Uni" },
]

type Method = "email" | "phone"
type Step = 1 | 2

export default function ForgotPasswordPage() {
    const router = useRouter()
    const [step, setStep] = useState<Step>(1)
    const [method, setMethod] = useState<Method>("email")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [resendCooldown, setResendCooldown] = useState(0)

    // Étape 1
    const [email, setEmail] = useState("")
    const [phoneCode, setPhoneCode] = useState("+221")
    const [phoneLocal, setPhoneLocal] = useState("")
    const phoneNumber = phoneLocal
        ? `${phoneCode}${phoneLocal.replace(/^0/, "")}`
        : ""
    const identifier = method === "email" ? email : phoneNumber

    // Étape 2
    const [otp, setOtp] = useState(["", "", "", "", "", ""])
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const otpRefs = useRef<(HTMLInputElement | null)[]>([])

    // Cooldown resend
    useEffect(() => {
        if (resendCooldown <= 0) return
        const t = setTimeout(() => setResendCooldown((v) => v - 1), 1000)
        return () => clearTimeout(t)
    }, [resendCooldown])

    // ─── Envoyer OTP ───────────────────────────────────────────────────────────
    async function handleSendCode(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        const result = await sendResetOtpAction(method, identifier)

        if (!result.success) {
            setError(result.error)
            setLoading(false)
            return
        }

        setStep(2)
        setResendCooldown(60)
        setSuccess(`Code envoyé sur ${identifier}`)
        setLoading(false)
    }

    // ─── Renvoyer OTP ──────────────────────────────────────────────────────────
    async function handleResend() {
        if (resendCooldown > 0) return
        setError(null)
        setLoading(true)

        const result = await sendResetOtpAction(method, identifier)

        if (!result.success) {
            setError(result.error)
        } else {
            setResendCooldown(60)
            setSuccess("Nouveau code envoyé !")
        }
        setLoading(false)
    }

    // ─── Saisie OTP ────────────────────────────────────────────────────────────
    function handleOtpChange(index: number, value: string) {
        const digit = value.replace(/\D/g, "").slice(-1)
        const next = [...otp]
        next[index] = digit
        setOtp(next)
        if (digit && index < 5) otpRefs.current[index + 1]?.focus()
    }

    function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
        if (e.key === "Backspace" && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus()
        }
    }

    function handleOtpPaste(e: React.ClipboardEvent) {
        const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
        if (digits.length === 6) {
            setOtp(digits.split(""))
            otpRefs.current[5]?.focus()
        }
        e.preventDefault()
    }

    // ─── Reset mot de passe ────────────────────────────────────────────────────
    async function handleResetPassword(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        const code = otp.join("")
        if (code.length < 6) return setError("Entre les 6 chiffres du code reçu")
        if (newPassword.length < 8) return setError("Minimum 8 caractères")
        if (!/[A-Z]/.test(newPassword)) return setError("Au moins une majuscule")
        if (!/[0-9]/.test(newPassword)) return setError("Au moins un chiffre")
        if (newPassword !== confirmPassword) return setError("Les mots de passe ne correspondent pas")

        setLoading(true)

        const result = await resetPasswordAction(method, identifier, code, newPassword)

        if (!result.success) {
            if (result.expired) {
                // Code expiré → retour étape 1 pour renvoyer
                setStep(1)
                setOtp(["", "", "", "", "", ""])
                setSuccess(null)
            }
            setError(result.error)
            setLoading(false)
            return
        }

        router.push("/login?reset=success")
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-md">

                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold text-gray-900">Mot de passe oublié</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {step === 1
                            ? "On t'envoie un code de vérification"
                            : "Entre le code reçu et ton nouveau mot de passe"}
                    </p>
                </div>

                {/* Stepper */}
                <div className="mb-6 flex items-center gap-2 px-4">
                    <StepDot number={1} label="Identification" active={step === 1} done={step > 1} />
                    <div className={`h-px flex-1 transition-colors duration-300 ${step > 1 ? "bg-black" : "bg-gray-200"}`} />
                    <StepDot number={2} label="Nouveau mdp" active={step === 2} done={false} />
                </div>

                <div className="rounded-xl bg-white p-8 shadow-md">

                    {error && (
                        <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
                    )}
                    {success && !error && (
                        <div className="mb-5 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>
                    )}

                    {/* ══ ÉTAPE 1 ══ */}
                    {step === 1 && (
                        <form onSubmit={handleSendCode} className="space-y-5">

                            <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-100">
                                {(["email", "phone"] as Method[]).map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => { setMethod(m); setError(null) }}
                                        className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${method === m ? "bg-white text-black" : "text-gray-500 hover:text-gray-700"
                                            }`}
                                    >
                                        {m === "email" ? "📧 Email" : "📱 Téléphone"}
                                    </button>
                                ))}
                            </div>

                            {method === "email" && (
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Adresse email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="alpha@noumtech.sn"
                                        required
                                        autoFocus
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black"
                                    />
                                </div>
                            )}

                            {method === "phone" && (
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Numéro de téléphone</label>
                                    <div className="flex gap-2">
                                        <select
                                            value={phoneCode}
                                            onChange={(e) => setPhoneCode(e.target.value)}
                                            className="w-36 rounded-lg border border-gray-200 bg-white px-2 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black"
                                        >
                                            {PHONE_CODES.map((p) => (
                                                <option key={`${p.code}-${p.country}`} value={p.code}>
                                                    {p.flag} {p.code} {p.country}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="tel"
                                            value={phoneLocal}
                                            onChange={(e) => setPhoneLocal(e.target.value)}
                                            placeholder="77 000 00 00"
                                            required
                                            autoFocus
                                            className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black"
                                        />
                                    </div>
                                    {phoneNumber && (
                                        <p className="mt-1 text-xs text-gray-400">→ {phoneNumber}</p>
                                    )}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || !identifier}
                                className="w-full rounded-lg bg-black py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                            >
                                {loading ? "Envoi en cours..." : "Envoyer le code"}
                            </button>

                            <p className="text-center text-sm text-gray-500">
                                <a href="/login" className="font-medium text-black underline">← Retour à la connexion</a>
                            </p>
                        </form>
                    )}

                    {/* ══ ÉTAPE 2 ══ */}
                    {step === 2 && (
                        <form onSubmit={handleResetPassword} className="space-y-5">

                            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
                                Code envoyé sur{" "}
                                <span className="font-medium text-gray-900">{identifier}</span>
                                {" · "}
                                <button
                                    type="button"
                                    onClick={() => { setStep(1); setOtp(["", "", "", "", "", ""]); setError(null); setSuccess(null) }}
                                    className="text-black underline"
                                >
                                    Modifier
                                </button>
                            </div>

                            {/* Cases OTP */}
                            <div>
                                <label className="mb-3 block text-sm font-medium text-gray-700">Code à 6 chiffres</label>
                                <div className="flex justify-center gap-2">
                                    {otp.map((digit, i) => (
                                        <input
                                            key={i}
                                            ref={(el) => { otpRefs.current[i] = el }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleOtpChange(i, e.target.value)}
                                            onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                            onPaste={i === 0 ? handleOtpPaste : undefined}
                                            className={`h-12 w-11 rounded-lg border text-center text-lg font-bold outline-none transition-all focus:ring-2 focus:ring-black ${digit ? "border-black bg-gray-50" : "border-gray-200"
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Nouveau mot de passe */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700">Nouveau mot de passe</label>
                                <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-black">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Min. 8 car., 1 majuscule, 1 chiffre"
                                        required
                                        className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                                    />
                                    <button type="button" onClick={() => setShowPassword(v => !v)} className="px-3 text-gray-400 hover:text-gray-700" tabIndex={-1}>
                                        {showPassword ? <EyeOff /> : <Eye />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirmer le mot de passe</label>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Répète ton mot de passe"
                                    required
                                    className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black ${confirmPassword && confirmPassword !== newPassword ? "border-red-400 bg-red-50" : "border-gray-200"
                                        }`}
                                />
                                {confirmPassword && confirmPassword !== newPassword && (
                                    <p className="mt-1 text-xs text-red-500">Les mots de passe ne correspondent pas</p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={loading || otp.join("").length < 6}
                                className="w-full rounded-lg bg-black py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                            >
                                {loading ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
                            </button>

                            <p className="text-center text-sm text-gray-500">
                                Code non reçu ?{" "}
                                <button
                                    type="button"
                                    onClick={handleResend}
                                    disabled={resendCooldown > 0 || loading}
                                    className="font-medium text-black underline disabled:text-gray-400 disabled:no-underline"
                                >
                                    {resendCooldown > 0 ? `Renvoyer dans ${resendCooldown}s` : "Renvoyer"}
                                </button>
                            </p>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}

function StepDot({ number, label, active, done }: { number: number; label: string; active: boolean; done: boolean }) {
    return (
        <div className="flex flex-col items-center gap-1">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all ${done || active ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}>
                {done ? "✓" : number}
            </div>
            <span className={`text-xs font-medium ${active || done ? "text-black" : "text-gray-400"}`}>{label}</span>
        </div>
    )
}

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