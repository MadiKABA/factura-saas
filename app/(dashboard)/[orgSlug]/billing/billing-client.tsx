// src/app/(dashboard)/[orgSlug]/billing/billing-client.tsx
"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    CheckCircle2, XCircle, AlertTriangle, Loader2,
    Zap, Package, TrendingUp, Users, FileText, BarChart3,
    CreditCard, Clock, Shield,
} from "lucide-react"
import { initiateSubscriptionPaymentAction, cancelSubscriptionAction } from "@/server/actions/billing.action"

// ─── Types ────────────────────────────────────────────────────────────────────
type Plan = {
    id: string; name: string
    priceMonthly: number; priceYearly: number
    maxProducts: number | null; maxSales: number | null
    maxInvoices: number | null; maxUsers: number | null
    hasStock: boolean; hasReports: boolean; hasApi: boolean
    description: string | null
}
type Sub = {
    id: string; status: string; billingCycle: string
    trialEndsAt: Date | null; currentPeriodEnd: Date
    cancelAtPeriodEnd: boolean; canceledAt: Date | null
    plan: { id: string; name: string; priceMonthly: number; priceYearly: number; hasStock: boolean; hasReports: boolean }
    recentInvoices: Array<{
        id: string; status: string; amountXof: number; billingCycle: string
        periodStart: Date; periodEnd: Date; paidAt: Date | null
        paydunyaCheckoutUrl: string | null; paymentMethod: string | null; createdAt: Date
    }>
}
type Props = { orgSlug: string; plans: Plan[]; subscription: Sub | null; initialSuccess?: string; initialError?: string; initialPlan?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtN = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
const fmtDate = (d: Date) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
const CURRENCY = "XOF"

const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
    ACTIVE: { label: "Actif", dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    TRIALING: { label: "Essai", dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    PAST_DUE: { label: "En retard", dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    SUSPENDED: { label: "Suspendu", dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    CANCELED: { label: "Annulé", dot: "bg-zinc-400", bg: "bg-zinc-100", text: "text-zinc-500", border: "border-zinc-200" },
    EXPIRED: { label: "Expiré", dot: "bg-zinc-400", bg: "bg-zinc-100", text: "text-zinc-500", border: "border-zinc-200" },
    PAID: { label: "Payé", dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    PENDING: { label: "En attente", dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    FAILED: { label: "Échoué", dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
}

function StatusBadge({ status }: { status: string }) {
    const c = STATUS_CFG[status] ?? STATUS_CFG.EXPIRED!
    return (
        <Badge variant="outline" className={`rounded-full text-xs flex items-center gap-1 ${c.bg} ${c.text} ${c.border}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />{c.label}
        </Badge>
    )
}

const PLAN_COLORS: Record<string, { accent: string; bg: string; border: string; badge: string }> = {
    FREE: { accent: "text-zinc-600", bg: "bg-zinc-50", border: "border-zinc-200", badge: "bg-zinc-100 text-zinc-600" },
    STARTER: { accent: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700" },
    PRO: { accent: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200", badge: "bg-violet-100 text-violet-700" },
    BUSINESS: { accent: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700" },
}

// ═════════════════════════════════════════════════════════════════════════════
export default function BillingClient({ orgSlug, plans, subscription, initialSuccess, initialError, initialPlan }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [selectedCycle, setSelectedCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY")
    const [actionError, setActionError] = useState<string | null>(null)
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

    const success = initialSuccess
    const error = initialError
    const planMsg = initialPlan

    const currentPlanName = subscription?.plan.name ?? "FREE"

    function handleSubscribe(planId: string, planName: string) {
        if (planName === "FREE") return
        setActionError(null)
        setLoadingPlan(planId)
        startTransition(async () => {
            const result = await initiateSubscriptionPaymentAction(orgSlug, planId, selectedCycle)
            setLoadingPlan(null)
            if (!result.success) { setActionError(result.error); return }
            // Rediriger vers PayDunya
            window.location.href = result.data.checkoutUrl
        })
    }

    function handleCancel() {
        if (!confirm("Confirmer l'annulation ? Votre accès reste actif jusqu'à la fin de la période en cours.")) return
        setActionError(null)
        startTransition(async () => {
            const result = await cancelSubscriptionAction(orgSlug)
            if (!result.success) { setActionError(result.error); return }
            router.refresh()
        })
    }

    const yearlyDiscount = 20 // %

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 pb-24 md:pb-8">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div>
                <h1 className="text-3xl font-bold">Abonnement</h1>
                <p className="text-sm text-zinc-500 mt-0.5">Gérez votre plan et vos paiements</p>
            </div>

            {/* ── Notifications ────────────────────────────────────────────── */}
            {success && (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-4 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <p className="text-sm font-medium text-emerald-800">
                        🎉 Abonnement <strong>{planMsg}</strong> activé avec succès !
                    </p>
                </div>
            )}
            {error && (
                <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 flex items-center gap-3">
                    <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
                </div>
            )}
            {actionError && (
                <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                    <p className="text-sm text-red-700">{actionError}</p>
                </div>
            )}

            {/* ── Abonnement actuel ────────────────────────────────────────── */}
            {subscription && (
                <Card className="rounded-2xl">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Shield className="w-4 h-4 text-zinc-500" />
                            Abonnement actuel
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-2xl font-black text-zinc-900">{subscription.plan.name}</span>
                                    <StatusBadge status={subscription.status} />
                                    {subscription.cancelAtPeriodEnd && (
                                        <Badge variant="outline" className="rounded-full text-xs bg-amber-50 text-amber-700 border-amber-200">
                                            Annulation programmée
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-sm text-zinc-500">
                                    {subscription.billingCycle === "YEARLY" ? "Annuel" : "Mensuel"} ·
                                    Renouvellement le <strong>{fmtDate(subscription.currentPeriodEnd)}</strong>
                                </p>
                                {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
                                    <p className="text-sm text-amber-600">
                                        Accès actif jusqu'au {fmtDate(subscription.currentPeriodEnd)}
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                {!subscription.cancelAtPeriodEnd && subscription.status === "ACTIVE" && (
                                    <Button variant="outline" size="sm" onClick={handleCancel} disabled={isPending}
                                        className="text-red-600 border-red-200 hover:bg-red-50">
                                        Annuler
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Toggle mensuel / annuel ──────────────────────────────────── */}
            <div className="flex items-center justify-center gap-2">
                <button onClick={() => setSelectedCycle("MONTHLY")}
                    className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${selectedCycle === "MONTHLY" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                    Mensuel
                </button>
                <button onClick={() => setSelectedCycle("YEARLY")}
                    className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${selectedCycle === "YEARLY" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                    Annuel
                    <span className="text-xs bg-emerald-500 text-white rounded-full px-2 py-0.5 font-bold">
                        -{yearlyDiscount}%
                    </span>
                </button>
            </div>

            {/* ── Grille plans ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {plans.map(plan => {
                    const colors = PLAN_COLORS[plan.name] ?? PLAN_COLORS.FREE!
                    const isCurrent = plan.name === currentPlanName
                    const price = selectedCycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly
                    const isPro = plan.name === "PRO"
                    const isLoading = loadingPlan === plan.id

                    return (
                        <div key={plan.id}
                            className={`relative rounded-2xl border-2 p-6 flex flex-col transition-all ${isCurrent
                                    ? `${colors.border} ${colors.bg}`
                                    : isPro
                                        ? "border-violet-400 bg-violet-50 shadow-lg shadow-violet-100"
                                        : "border-zinc-200 bg-white hover:border-zinc-300"
                                }`}>

                            {/* Badge populaire */}
                            {isPro && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="bg-violet-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                                        ⭐ Populaire
                                    </span>
                                </div>
                            )}

                            {/* Badge plan actuel */}
                            {isCurrent && (
                                <div className="absolute -top-3 right-4">
                                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${colors.badge}`}>
                                        Plan actuel
                                    </span>
                                </div>
                            )}

                            {/* Nom + prix */}
                            <div className="mb-4">
                                <h3 className={`text-xl font-black ${colors.accent}`}>{plan.name}</h3>
                                {plan.description && <p className="text-xs text-zinc-500 mt-0.5">{plan.description}</p>}
                                <div className="mt-3">
                                    {plan.name === "FREE" ? (
                                        <p className="text-3xl font-black text-zinc-900">Gratuit</p>
                                    ) : (
                                        <>
                                            <p className="text-3xl font-black text-zinc-900 tabular-nums">
                                                {fmtN(price)}
                                                <span className="text-sm font-normal text-zinc-500 ml-1">{CURRENCY}</span>
                                            </p>
                                            <p className="text-xs text-zinc-400 mt-0.5">
                                                par {selectedCycle === "YEARLY" ? "an" : "mois"}
                                                {selectedCycle === "YEARLY" && (
                                                    <span className="ml-2 text-emerald-600 font-medium">
                                                        soit {fmtN(Math.round(price / 12))}/mois
                                                    </span>
                                                )}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Limites */}
                            <ul className="space-y-2 flex-1 mb-6">
                                {[
                                    { icon: Package, label: plan.maxProducts ? `${plan.maxProducts} produits` : "Produits illimités", ok: true },
                                    { icon: TrendingUp, label: plan.maxSales ? `${plan.maxSales} ventes/mois` : "Ventes illimitées", ok: true },
                                    { icon: FileText, label: plan.maxInvoices ? `${plan.maxInvoices} factures/mois` : "Factures illimitées", ok: true },
                                    { icon: Users, label: plan.maxUsers ? `${plan.maxUsers} membres` : "Membres illimités", ok: true },
                                    { icon: BarChart3, label: "Module Stock", ok: plan.hasStock },
                                    { icon: BarChart3, label: "Rapports avancés", ok: plan.hasReports },
                                    { icon: Zap, label: "Accès API", ok: plan.hasApi },
                                ].map((item, i) => (
                                    <li key={i} className="flex items-center gap-2 text-sm">
                                        {item.ok
                                            ? <CheckCircle2 className={`w-4 h-4 shrink-0 ${colors.accent}`} />
                                            : <XCircle className="w-4 h-4 shrink-0 text-zinc-300" />
                                        }
                                        <span className={item.ok ? "text-zinc-700" : "text-zinc-400"}>{item.label}</span>
                                    </li>
                                ))}
                            </ul>

                            {/* Bouton */}
                            {plan.name === "FREE" ? (
                                <Button variant="outline" disabled className="w-full rounded-xl opacity-50">
                                    Plan gratuit
                                </Button>
                            ) : isCurrent ? (
                                <Button variant="outline" disabled className={`w-full rounded-xl ${colors.border}`}>
                                    <CheckCircle2 className="w-4 h-4 mr-2" /> Plan actuel
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => handleSubscribe(plan.id, plan.name)}
                                    disabled={isPending}
                                    className={`w-full rounded-xl ${isPro ? "bg-violet-600 hover:bg-violet-700" : ""}`}
                                >
                                    {isLoading
                                        ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Redirection…</>
                                        : `Choisir ${plan.name} →`
                                    }
                                </Button>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* ── Méthodes de paiement acceptées ───────────────────────────── */}
            <Card className="rounded-2xl">
                <CardContent className="p-5">
                    <p className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
                        <CreditCard className="w-4 h-4" /> Moyens de paiement acceptés
                    </p>
                    <div className="flex flex-wrap gap-3">
                        {[
                            { icon: "📱", label: "Orange Money" },
                            { icon: "💚", label: "Free Money" },
                            { icon: "🌊", label: "Wave" },
                            { icon: "💳", label: "Mastercard / Visa" },
                            { icon: "🏦", label: "Virement bancaire" },
                        ].map(m => (
                            <span key={m.label} className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-full px-3 py-1.5 text-sm text-zinc-700">
                                {m.icon} {m.label}
                            </span>
                        ))}
                    </div>
                    <p className="text-xs text-zinc-400 mt-3">
                        Paiements sécurisés via PayDunya · XOF (Franc CFA)
                    </p>
                </CardContent>
            </Card>

            {/* ── Historique paiements ─────────────────────────────────────── */}
            {subscription && subscription.recentInvoices.length > 0 && (
                <Card className="rounded-2xl">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Clock className="w-4 h-4 text-zinc-500" /> Historique des paiements
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-zinc-100">
                            {subscription.recentInvoices.map(inv => (
                                <div key={inv.id} className="flex items-center justify-between px-5 py-3 gap-3 flex-wrap">
                                    <div>
                                        <p className="text-sm font-medium text-zinc-900">
                                            Plan {subscription.plan.name} — {inv.billingCycle === "YEARLY" ? "Annuel" : "Mensuel"}
                                        </p>
                                        <p className="text-xs text-zinc-400 mt-0.5">
                                            {fmtDate(inv.periodStart)} → {fmtDate(inv.periodEnd)}
                                            {inv.paymentMethod && <> · {inv.paymentMethod}</>}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <StatusBadge status={inv.status} />
                                        <p className="font-bold text-zinc-900 tabular-nums text-sm">
                                            {fmtN(inv.amountXof)} {CURRENCY}
                                        </p>
                                        {inv.status === "PENDING" && inv.paydunyaCheckoutUrl && (
                                            <Button size="sm" variant="outline" className="text-xs"
                                                onClick={() => window.open(inv.paydunyaCheckoutUrl!, "_blank")}>
                                                Payer →
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}