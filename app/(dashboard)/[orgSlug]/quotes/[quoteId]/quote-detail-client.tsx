// src/app/(dashboard)/[orgSlug]/quotes/[quoteId]/quote-detail-client.tsx
"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
    ArrowLeft, FileDown, Mail, Pencil, RefreshCw, Share2,
    Loader2, Building2, Calendar, Clock, StickyNote, ArrowRightLeft,
    CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react"
import { updateQuoteStatusAction, convertQuoteToInvoiceAction } from "@/server/actions/quote.action"

// ─── Types ────────────────────────────────────────────────────────────────────
type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED"

type Props = {
    orgSlug: string
    org: {
        id: string; name: string; address: string | null
        email: string | null; phone: string | null
    }
    quote: {
        id: string; number: string; status: string
        issueDate: Date; expiryDate: Date | null
        subtotal: number; taxTotal: number; total: number; currencyCode: string
        notes: string | null; terms: string | null; internalNotes: string | null
        client: {
            id: string; name: string; email: string | null
            phone: string | null; address: string | null; taxId: string | null
        } | null
        items: {
            id: string; name: string; description: string | null
            quantity: number; unitPrice: number; total: number
            isService: boolean
            taxRate: { name: string; rate: number } | null
        }[]
        invoices: { id: string; number: string; status: string }[]
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
const fmtDate = (d: Date | string | null) =>
    d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—"

function statusConfig(status: string) {
    switch (status) {
        case "ACCEPTED": return { label: "Accepté", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 }
        case "SENT": return { label: "Envoyé", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200", icon: Mail }
        case "DRAFT": return { label: "Brouillon", dot: "bg-zinc-400", badge: "bg-zinc-100 text-zinc-500 border-zinc-200", icon: Pencil }
        case "REJECTED": return { label: "Refusé", dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200", icon: XCircle }
        case "EXPIRED": return { label: "Expiré", dot: "bg-orange-400", badge: "bg-orange-50 text-orange-600 border-orange-200", icon: AlertTriangle }
        default: return { label: status, dot: "bg-zinc-400", badge: "bg-zinc-100 text-zinc-500 border-zinc-200", icon: Pencil }
    }
}

function allowedTransitions(current: string): QuoteStatus[] {
    switch (current) {
        case "DRAFT": return ["SENT", "EXPIRED"]
        case "SENT": return ["ACCEPTED", "REJECTED", "EXPIRED"]
        case "REJECTED": return ["SENT"]
        default: return []
    }
}

function isExpiringSoon(expiryDate: Date | null): boolean {
    if (!expiryDate) return false
    return new Date(expiryDate) < new Date(Date.now() + 3 * 86400000)
}

// ═════════════════════════════════════════════════════════════════════════════
export default function QuoteDetailClient({ orgSlug, org, quote }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const [currentStatus, setCurrentStatus] = useState(quote.status)
    const [statusModal, setStatusModal] = useState(false)
    const [newStatus, setNewStatus] = useState<QuoteStatus | "">("")
    const [statusError, setStatusError] = useState<string | null>(null)
    const [convertModal, setConvertModal] = useState(false)
    const [convertError, setConvertError] = useState<string | null>(null)
    const [shareToast, setShareToast] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [emailSending, setEmailSending] = useState(false)

    const sc = statusConfig(currentStatus)
    const transitions = allowedTransitions(currentStatus)
    const canConvert = currentStatus === "SENT" || currentStatus === "ACCEPTED"
    const expiring = isExpiringSoon(quote.expiryDate) && currentStatus === "SENT"
    const alreadyConverted = quote.invoices.length > 0

    // ─── Actions ───────────────────────────────────────────────────────────────
    function handleUpdateStatus() {
        if (!newStatus) return
        setStatusError(null)
        startTransition(async () => {
            const result = await updateQuoteStatusAction(orgSlug, quote.id, newStatus)
            if (!result.success) { setStatusError(result.error); return }
            setCurrentStatus(newStatus)
            setStatusModal(false)
            setNewStatus("")
        })
    }

    function handleConvert() {
        setConvertError(null)
        startTransition(async () => {
            const result = await convertQuoteToInvoiceAction(orgSlug, quote.id)
            if (!result.success) { setConvertError(result.error); return }
            setCurrentStatus("ACCEPTED")
            setConvertModal(false)
            router.push(`/${orgSlug}/invoices/${result.data.invoiceId}`)
        })
    }

    async function handleExportPdf() {
        setExporting(true)
        // TODO: generateQuotePdfAction
        await new Promise(r => setTimeout(r, 800))
        setExporting(false)
    }

    async function handleSendEmail() {
        setEmailSending(true)
        // TODO: sendQuoteEmailAction
        await new Promise(r => setTimeout(r, 800))
        setEmailSending(false)
    }

    function handleShare() {
        navigator.clipboard.writeText(`${window.location.origin}/${orgSlug}/quotes/${quote.id}`)
        setShareToast(true)
        setTimeout(() => setShareToast(false), 2500)
    }

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-zinc-50/60">

            {/* ── Header sticky ────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-20 bg-white border-b border-zinc-200 shadow-sm">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center gap-3 h-14">
                    {/* Retour */}
                    <button
                        onClick={() => router.push(`/${orgSlug}/quotes`)}
                        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors shrink-0"
                    >
                        <ArrowLeft className="w-4 h-4" /> Devis
                    </button>

                    <span className="text-zinc-300">/</span>
                    <span className="font-mono text-sm font-semibold text-zinc-800 truncate">{quote.number}</span>

                    <Badge variant="outline" className={`ml-1 rounded-full flex items-center gap-1.5 text-xs font-semibold shrink-0 ${sc.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                    </Badge>

                    {/* Actions */}
                    <div className="ml-auto flex items-center gap-2">
                        {/* Convertir en facture */}
                        {canConvert && (
                            <Button
                                size="sm"
                                className="gap-1.5 bg-violet-600 hover:bg-violet-700 hidden sm:flex"
                                onClick={() => { setConvertModal(true); setConvertError(null) }}
                            >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                <span>Convertir</span>
                            </Button>
                        )}
                        {transitions.length > 0 && (
                            <Button variant="outline" size="sm" className="gap-1.5"
                                onClick={() => { setStatusModal(true); setNewStatus(""); setStatusError(null) }}>
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Statut</span>
                            </Button>
                        )}
                        <Button variant="outline" size="sm" className="gap-1.5"
                            onClick={() => router.push(`/${orgSlug}/quotes/${quote.id}/edit`)}>
                            <Pencil className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Modifier</span>
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSendEmail} disabled={emailSending}>
                            {emailSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">Envoyer</span>
                        </Button>
                        <Button size="sm" className="gap-1.5 bg-zinc-900 hover:bg-zinc-800" onClick={handleExportPdf} disabled={exporting}>
                            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">PDF</span>
                        </Button>
                        <button onClick={handleShare} className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors">
                            <Share2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Body ─────────────────────────────────────────────────────────── */}
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">

                {/* Alerte expiration */}
                {expiring && (
                    <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
                        <p className="text-sm text-orange-700 font-medium">
                            Ce devis expire le {fmtDate(quote.expiryDate)} — relancez votre client.
                        </p>
                    </div>
                )}

                {/* Alerte déjà converti */}
                {alreadyConverted && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        <div>
                            <p className="text-sm text-emerald-700 font-medium">Devis converti en facture</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {quote.invoices.map(inv => (
                                    <button key={inv.id} onClick={() => router.push(`/${orgSlug}/invoices/${inv.id}`)}
                                        className="text-xs text-emerald-600 underline hover:text-emerald-800">
                                        {inv.number} →
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Layout 2 colonnes ──────────────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* ═══════ COLONNE PRINCIPALE ══════════════════════════════════ */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Carte principale devis */}
                        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">

                            {/* Bandeau statut */}
                            <div className={`h-1.5 w-full ${currentStatus === "ACCEPTED" ? "bg-emerald-400" :
                                currentStatus === "SENT" ? "bg-blue-400" :
                                    currentStatus === "REJECTED" ? "bg-red-400" :
                                        currentStatus === "EXPIRED" ? "bg-orange-400" : "bg-zinc-200"
                                }`} />

                            <div className="p-6 sm:p-8">

                                {/* En-tête */}
                                <div className="flex items-start justify-between mb-8">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-1">Devis</p>
                                        <h1 className="text-3xl font-black font-mono tracking-tight text-zinc-900">{quote.number}</h1>
                                    </div>
                                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-900 text-white text-xl font-black shadow-sm">
                                        {org.name.charAt(0)}
                                    </div>
                                </div>

                                {/* Émetteur ↔ Destinataire */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
                                            <Building2 className="w-3.5 h-3.5" /> De
                                        </p>
                                        <p className="font-bold text-zinc-900">{org.name}</p>
                                        {org.address && <p className="text-sm text-zinc-500 mt-0.5">{org.address}</p>}
                                        {org.email && <p className="text-sm text-zinc-500">{org.email}</p>}
                                        {org.phone && <p className="text-sm text-zinc-500">{org.phone}</p>}
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
                                            <Building2 className="w-3.5 h-3.5" /> Destinataire
                                        </p>
                                        {quote.client ? (
                                            <>
                                                <p className="font-bold text-zinc-900">{quote.client.name}</p>
                                                {quote.client.address && <p className="text-sm text-zinc-500 mt-0.5">{quote.client.address}</p>}
                                                {quote.client.email && <p className="text-sm text-zinc-500">{quote.client.email}</p>}
                                                {quote.client.phone && <p className="text-sm text-zinc-500">{quote.client.phone}</p>}
                                                {quote.client.taxId && <p className="text-sm text-zinc-400 mt-0.5">N° TVA : {quote.client.taxId}</p>}
                                            </>
                                        ) : (
                                            <p className="text-sm text-zinc-400">— Client non associé</p>
                                        )}
                                    </div>
                                </div>

                                {/* Dates */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
                                    <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3">
                                        <p className="text-xs text-zinc-400 flex items-center gap-1 mb-1">
                                            <Calendar className="w-3 h-3" /> Émis le
                                        </p>
                                        <p className="text-sm font-semibold text-zinc-800">{fmtDate(quote.issueDate)}</p>
                                    </div>
                                    <div className={`rounded-xl border px-4 py-3 ${expiring ? "bg-orange-50 border-orange-100" : "bg-zinc-50 border-zinc-100"
                                        }`}>
                                        <p className={`text-xs flex items-center gap-1 mb-1 ${expiring ? "text-orange-400" : "text-zinc-400"}`}>
                                            <Clock className="w-3 h-3" /> Expire le
                                        </p>
                                        <p className={`text-sm font-semibold ${expiring ? "text-orange-700" : "text-zinc-800"}`}>
                                            {fmtDate(quote.expiryDate)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3">
                                        <p className="text-xs text-zinc-400 mb-1">Devise</p>
                                        <p className="text-sm font-semibold text-zinc-800">{quote.currencyCode}</p>
                                    </div>
                                </div>

                                {/* Tableau articles */}
                                <div className="rounded-xl border border-zinc-200 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm min-w-[480px]">
                                            <thead>
                                                <tr className="bg-zinc-50 border-b border-zinc-200">
                                                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Article</th>
                                                    <th className="text-center py-3 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-16">Qté</th>
                                                    <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-28">Prix unit.</th>
                                                    <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-20">TVA</th>
                                                    <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-32">Total HT</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-100">
                                                {quote.items.map((item, i) => (
                                                    <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/40"}>
                                                        <td className="py-3.5 px-4">
                                                            <div className="flex items-center gap-2">
                                                                {item.isService && (
                                                                    <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-1.5 py-0.5 shrink-0">
                                                                        Service
                                                                    </span>
                                                                )}
                                                                <p className="font-medium text-zinc-800">{item.name}</p>
                                                            </div>
                                                            {item.description && (
                                                                <p className="text-xs text-zinc-400 mt-0.5 ml-0">{item.description}</p>
                                                            )}
                                                        </td>
                                                        <td className="py-3.5 px-3 text-center text-zinc-600 tabular-nums">{Number(item.quantity)}</td>
                                                        <td className="py-3.5 px-3 text-right text-zinc-600 tabular-nums">{fmt(item.unitPrice)}</td>
                                                        <td className="py-3.5 px-3 text-right text-zinc-400 tabular-nums text-xs">
                                                            {item.taxRate ? `${item.taxRate.rate}%` : "—"}
                                                        </td>
                                                        <td className="py-3.5 px-4 text-right font-semibold text-zinc-800 tabular-nums">{fmt(item.total)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Totaux */}
                                <div className="mt-4 flex justify-end">
                                    <div className="w-64 sm:w-72 space-y-2">
                                        <div className="flex justify-between text-sm text-zinc-500">
                                            <span>Sous-total HT</span>
                                            <span className="tabular-nums">{fmt(Number(quote.subtotal))} {quote.currencyCode}</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-zinc-500">
                                            <span>TVA</span>
                                            <span className="tabular-nums">{fmt(Number(quote.taxTotal))} {quote.currencyCode}</span>
                                        </div>
                                        <div className="flex justify-between border-t border-zinc-200 pt-2.5">
                                            <span className="font-black text-zinc-900 text-base">Total TTC</span>
                                            <span className="font-black text-zinc-900 text-xl tabular-nums">
                                                {fmt(Number(quote.total))} {quote.currencyCode}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Notes / Conditions */}
                                {(quote.notes || quote.terms) && (
                                    <div className="mt-8 pt-6 border-t border-zinc-100 grid sm:grid-cols-2 gap-4">
                                        {quote.notes && (
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Note</p>
                                                <p className="text-sm text-zinc-600 leading-relaxed">{quote.notes}</p>
                                            </div>
                                        )}
                                        {quote.terms && (
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Conditions</p>
                                                <p className="text-sm text-zinc-600 leading-relaxed">{quote.terms}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Factures liées ─────────────────────────────────────────── */}
                        {quote.invoices.length > 0 && (
                            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                                    <h2 className="font-bold text-zinc-800 flex items-center gap-2">
                                        <ArrowRightLeft className="w-4 h-4 text-violet-500" />
                                        Factures générées
                                    </h2>
                                    <span className="text-xs text-zinc-400">{quote.invoices.length}</span>
                                </div>
                                <div className="divide-y divide-zinc-100">
                                    {quote.invoices.map(inv => {
                                        const invStatusColors: Record<string, string> = {
                                            PAID: "text-emerald-600 bg-emerald-50 border-emerald-200",
                                            SENT: "text-blue-600 bg-blue-50 border-blue-200",
                                            DRAFT: "text-zinc-500 bg-zinc-100 border-zinc-200",
                                            PARTIAL: "text-amber-600 bg-amber-50 border-amber-200",
                                            OVERDUE: "text-red-600 bg-red-50 border-red-200",
                                            CANCELLED: "text-red-400 bg-red-50 border-red-100",
                                        }
                                        const invStatusLabels: Record<string, string> = {
                                            PAID: "Payée", SENT: "Envoyée", DRAFT: "Brouillon",
                                            PARTIAL: "Partiel", OVERDUE: "En retard", CANCELLED: "Annulée",
                                        }
                                        return (
                                            <div key={inv.id}
                                                onClick={() => router.push(`/${orgSlug}/invoices/${inv.id}`)}
                                                className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-zinc-50 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
                                                        <ArrowRightLeft className="w-4 h-4 text-violet-500" />
                                                    </div>
                                                    <p className="font-mono font-semibold text-sm text-zinc-800">{inv.number}</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="outline" className={`text-xs rounded-full ${invStatusColors[inv.status] ?? "text-zinc-500 bg-zinc-100 border-zinc-200"}`}>
                                                        {invStatusLabels[inv.status] ?? inv.status}
                                                    </Badge>
                                                    <ArrowLeft className="w-4 h-4 text-zinc-300 rotate-180" />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ═══════ SIDEBAR ═══════════════════════════════════════════════ */}
                    <div className="space-y-5">

                        {/* Statut */}
                        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Statut</p>
                            <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 ${sc.badge}`}>
                                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${sc.dot}`} />
                                <span className="font-bold">{sc.label}</span>
                            </div>
                            {transitions.length > 0 && (
                                <button
                                    onClick={() => { setStatusModal(true); setNewStatus(""); setStatusError(null) }}
                                    className="mt-3 w-full rounded-xl border border-zinc-200 py-2.5 text-sm text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 flex items-center justify-center gap-1.5 transition-all"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" /> Changer le statut
                                </button>
                            )}
                        </div>

                        {/* Convertir en facture */}
                        {canConvert && (
                            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 space-y-3">
                                <p className="text-xs font-semibold uppercase tracking-wider text-violet-500 mb-1">Prêt à facturer ?</p>
                                <p className="text-sm text-violet-700 leading-relaxed">
                                    Convertissez ce devis en facture en un clic. Toutes les lignes et le client seront copiés automatiquement.
                                </p>
                                <Button
                                    className="w-full gap-2 bg-violet-600 hover:bg-violet-700"
                                    onClick={() => { setConvertModal(true); setConvertError(null) }}
                                    disabled={isPending}
                                >
                                    <ArrowRightLeft className="w-4 h-4" />
                                    Convertir en facture
                                </Button>
                            </div>
                        )}

                        {/* Montants */}
                        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Montants</p>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-500">HT</span>
                                    <span className="font-medium tabular-nums">{fmt(Number(quote.subtotal))} {quote.currencyCode}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-500">TVA</span>
                                    <span className="font-medium tabular-nums">{fmt(Number(quote.taxTotal))} {quote.currencyCode}</span>
                                </div>
                                <div className="flex justify-between border-t border-zinc-100 pt-2 text-sm">
                                    <span className="font-black text-zinc-900">TTC</span>
                                    <span className="font-black text-zinc-900 tabular-nums">{fmt(Number(quote.total))} {quote.currencyCode}</span>
                                </div>
                            </div>
                        </div>

                        {/* Client */}
                        {quote.client && (
                            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5">
                                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Client</p>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-100 to-pink-100 flex items-center justify-center font-bold text-zinc-600 shrink-0 text-sm">
                                        {quote.client.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-zinc-800 text-sm truncate">{quote.client.name}</p>
                                        {quote.client.email && <p className="text-xs text-zinc-400 truncate">{quote.client.email}</p>}
                                        {quote.client.phone && <p className="text-xs text-zinc-400">{quote.client.phone}</p>}
                                    </div>
                                </div>
                                <button
                                    onClick={() => router.push(`/${orgSlug}/clients/${quote.client!.id}`)}
                                    className="w-full text-xs text-blue-500 hover:text-blue-700 underline text-center"
                                >
                                    Voir la fiche client →
                                </button>
                            </div>
                        )}

                        {/* Note interne */}
                        {quote.internalNotes && (
                            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                                <p className="text-xs font-semibold uppercase tracking-wider text-amber-500 mb-2 flex items-center gap-1.5">
                                    <StickyNote className="w-3.5 h-3.5" /> Note interne
                                </p>
                                <p className="text-sm text-amber-800 leading-relaxed">{quote.internalNotes}</p>
                            </div>
                        )}

                        {/* Actions rapides */}
                        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Actions</p>
                            <button onClick={handleExportPdf} disabled={exporting}
                                className="w-full flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 transition-all disabled:opacity-50">
                                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4 text-violet-500" />}
                                Télécharger PDF
                            </button>
                            <button onClick={handleSendEmail} disabled={emailSending}
                                className="w-full flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 transition-all disabled:opacity-50">
                                {emailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4 text-blue-500" />}
                                Envoyer par email
                            </button>
                            <button onClick={handleShare}
                                className="w-full flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 transition-all">
                                <Share2 className="w-4 h-4 text-green-500" /> Copier le lien
                            </button>
                            <button onClick={() => router.push(`/${orgSlug}/quotes/${quote.id}/edit`)}
                                className="w-full flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 transition-all">
                                <Pencil className="w-4 h-4 text-zinc-500" /> Modifier le devis
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Modal statut ─────────────────────────────────────────────────── */}
            <Dialog open={statusModal} onOpenChange={open => !open && setStatusModal(false)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Changer le statut — {quote.number}</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-zinc-500">
                            Statut actuel :{" "}
                            <Badge variant="outline" className={`rounded-full ml-1 ${statusConfig(currentStatus).badge}`}>
                                {statusConfig(currentStatus).label}
                            </Badge>
                        </p>
                        <Select value={newStatus} onValueChange={v => setNewStatus(v as QuoteStatus)}>
                            <SelectTrigger><SelectValue placeholder="Nouveau statut…" /></SelectTrigger>
                            <SelectContent>
                                {transitions.map(s => (
                                    <SelectItem key={s} value={s}>
                                        <span className="flex items-center gap-2">
                                            <span className={`h-2 w-2 rounded-full ${statusConfig(s).dot}`} />
                                            {statusConfig(s).label}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {statusError && <p className="text-sm text-red-600">⚠️ {statusError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setStatusModal(false)}>Annuler</Button>
                        <Button onClick={handleUpdateStatus} disabled={!newStatus || isPending}>
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Modal conversion ─────────────────────────────────────────────── */}
            <Dialog open={convertModal} onOpenChange={open => !open && setConvertModal(false)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Convertir en facture — {quote.number}</DialogTitle></DialogHeader>
                    <div className="py-2 space-y-4">
                        <p className="text-sm text-zinc-600">
                            Une nouvelle facture sera créée à partir de ce devis. Le devis passera au statut{" "}
                            <strong className="text-emerald-700">Accepté</strong>.
                        </p>
                        <div className="rounded-xl bg-zinc-50 border border-zinc-200 divide-y divide-zinc-100">
                            <div className="flex justify-between px-4 py-2.5 text-sm">
                                <span className="text-zinc-500">Client</span>
                                <span className="font-medium text-zinc-800">{quote.client?.name ?? "—"}</span>
                            </div>
                            <div className="flex justify-between px-4 py-2.5 text-sm">
                                <span className="text-zinc-500">Lignes articles</span>
                                <span className="font-medium text-zinc-800">{quote.items.length} article{quote.items.length > 1 ? "s" : ""}</span>
                            </div>
                            <div className="flex justify-between px-4 py-2.5 text-sm">
                                <span className="text-zinc-500">Montant TTC</span>
                                <span className="font-black text-zinc-900">{fmt(Number(quote.total))} {quote.currencyCode}</span>
                            </div>
                        </div>
                        <div className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3 text-sm text-violet-700">
                            La facture sera créée en <strong>Brouillon</strong> — vous pourrez la modifier avant envoi.
                        </div>
                        {convertError && <p className="text-sm text-red-600">⚠️ {convertError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConvertModal(false)}>Annuler</Button>
                        <Button onClick={handleConvert} disabled={isPending} className="gap-2 bg-violet-600 hover:bg-violet-700">
                            {isPending
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <><ArrowRightLeft className="w-4 h-4" /> Convertir en facture</>
                            }
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Toast ────────────────────────────────────────────────────────── */}
            {shareToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-zinc-900 text-white px-5 py-3 text-sm shadow-xl z-50 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                    <Share2 className="w-4 h-4" /> Lien copié dans le presse-papiers
                </div>
            )}
        </div>
    )
}