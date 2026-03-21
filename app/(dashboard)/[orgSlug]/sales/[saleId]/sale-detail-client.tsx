// src/app/(dashboard)/[orgSlug]/sales/[saleId]/sale-detail-client.tsx
"use client"
import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
    ArrowLeft, Printer, Share2, FileText, AlertTriangle,
    Loader2, CheckCircle2, XCircle,
} from "lucide-react"
import { cancelSaleAction, convertSaleToInvoiceAction } from "@/server/actions/sales-list.action"

// ─── Types ────────────────────────────────────────────────────────────────────
type Org = {
    name: string; currency: string; phone: string | null; address: string | null
    email: string | null; logoUrl: string | null; taxId: string | null
    receiptHeader: string | null; receiptFooter: string | null; receiptWidth: number
}
type Sale = {
    id: string; number: string; status: string; saleDate: Date
    subtotal: number; taxTotal: number; total: number
    amountPaid: number; change: number; discount: number; currencyCode: string
    note: string | null; tableNumber: string | null
    client: { id: string; name: string; phone: string | null; email: string | null; address: string | null } | null
    items: { id: string; name: string; quantity: number; unitPrice: number; discount: number; taxRate: number; total: number }[]
    payments: { method: string; amount: number }[]
    debt: { id: string; amount: number; amountPaid: number; status: string; dueDate: Date | null } | null
}
type Props = { orgSlug: string; org: Org; sale: Sale; defaultTab: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtN = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
const fmt = (n: number, cur: string) => `${fmtN(n)} ${cur}`
const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
const fmtDateTime = (d: Date | string) => new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
    COMPLETED: { label: "Complétée", dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    CANCELLED: { label: "Annulée", dot: "bg-zinc-400", bg: "bg-zinc-100", text: "text-zinc-400", border: "border-zinc-200" },
    REFUNDED: { label: "Remboursée", dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    ON_HOLD: { label: "En attente", dot: "bg-violet-500", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
}

const PAYMENT_LABELS: Record<string, string> = {
    CASH: "💵 Espèces", MOBILE_MONEY: "📱 Mobile Money",
    CARD: "💳 Carte", CREDIT: "📒 Crédit", BANK_TRANSFER: "🏦 Virement", OTHER: "💰 Autre",
}

// ═════════════════════════════════════════════════════════════════════════════
export default function SaleDetailClient({ orgSlug, org, sale, defaultTab }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [cancelModal, setCancelModal] = useState(false)
    const [invoiceModal, setInvoiceModal] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const [invoiceResult, setInvoiceResult] = useState<{ invoiceId: string; invoiceNumber: string } | null>(null)

    const statusCfg = STATUS_CFG[sale.status] ?? STATUS_CFG.COMPLETED!

    // ─── Annuler vente ────────────────────────────────────────────────────────
    function handleCancel() {
        setActionError(null)
        startTransition(async () => {
            const result = await cancelSaleAction(orgSlug, sale.id)
            if (!result.success) { setActionError(result.error); return }
            setCancelModal(false)
            router.refresh()
        })
    }

    // ─── Convertir en facture ─────────────────────────────────────────────────
    function handleConvertToInvoice() {
        setActionError(null)
        startTransition(async () => {
            const result = await convertSaleToInvoiceAction(orgSlug, sale.id)
            if (!result.success) { setActionError(result.error); return }
            setInvoiceResult(result.data)
            setInvoiceModal(false)
        })
    }

    // ─── Imprimer / WhatsApp ──────────────────────────────────────────────────
    function handlePrint() { window.print() }

    function buildReceiptText() {
        const lines = sale.items.map(i => `${i.name} ×${i.quantity} = ${fmtN(i.total)} ${org.currency}`).join("\n")
        const pmts = sale.payments.map(p => `${PAYMENT_LABELS[p.method] ?? p.method}: ${fmtN(p.amount)}`).join(", ")
        return `*${org.name}* — Reçu N° ${sale.number}\n${fmtDateTime(sale.saleDate)}\n\n${lines}\n\n*Total : ${fmt(sale.total, org.currency)}*\n${pmts}${sale.change > 0 ? `\nRendu : ${fmt(sale.change, org.currency)}` : ""}\n\n${org.receiptFooter ?? "Merci pour votre achat !"}`
    }

    function handleWhatsApp() {
        const phone = sale.client?.phone?.replace(/\D/g, "") ?? ""
        const url = phone
            ? `https://wa.me/${phone}?text=${encodeURIComponent(buildReceiptText())}`
            : `https://wa.me/?text=${encodeURIComponent(buildReceiptText())}`
        window.open(url, "_blank")
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TICKET CAISSE (composant réutilisé dans onglet + print)
    // ═══════════════════════════════════════════════════════════════════════════
    const ReceiptContent = (
        <div id="receipt-print" className="bg-white rounded-2xl p-5 font-mono text-sm max-w-xs mx-auto shadow-lg">
            {/* En-tête org */}
            {org.receiptHeader && (
                <p className="text-center text-xs text-zinc-500 mb-1 whitespace-pre-line">{org.receiptHeader}</p>
            )}
            <p className="text-center font-black text-base uppercase tracking-wide">{org.name}</p>
            {org.address && <p className="text-center text-xs text-zinc-400 mt-0.5">{org.address}</p>}
            {org.phone && <p className="text-center text-xs text-zinc-400">{org.phone}</p>}
            {org.email && <p className="text-center text-xs text-zinc-400">{org.email}</p>}

            <div className="border-t border-dashed border-zinc-300 my-3" />

            {/* Info vente */}
            <p className="text-center text-xs text-zinc-500">N° {sale.number}</p>
            <p className="text-center text-xs text-zinc-400">{fmtDateTime(sale.saleDate)}</p>
            {sale.client && <p className="text-center text-xs mt-1 font-semibold">Client : {sale.client.name}</p>}
            {sale.tableNumber && <p className="text-center text-xs text-zinc-500">Table : {sale.tableNumber}</p>}

            <div className="border-t border-dashed border-zinc-300 my-3" />

            {/* Articles */}
            <div className="space-y-1.5">
                {sale.items.map((item, i) => (
                    <div key={item.id} className="flex justify-between text-xs gap-2">
                        <span className="flex-1 truncate">{item.name} ×{item.quantity}</span>
                        <span className="shrink-0 font-semibold tabular-nums">{fmtN(item.total)}</span>
                    </div>
                ))}
            </div>

            <div className="border-t border-dashed border-zinc-300 my-3" />

            {/* Totaux */}
            <div className="space-y-1 text-xs">
                {sale.discount > 0 && (
                    <div className="flex justify-between text-zinc-500">
                        <span>Remise</span><span>- {fmtN(sale.discount)}</span>
                    </div>
                )}
                <div className="flex justify-between font-black text-sm border-t border-zinc-200 pt-1.5">
                    <span>TOTAL</span>
                    <span className="tabular-nums">{fmt(sale.total, org.currency)}</span>
                </div>
                {sale.payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-zinc-500">
                        <span>{PAYMENT_LABELS[p.method] ?? p.method}</span>
                        <span className="tabular-nums">{fmtN(p.amount)}</span>
                    </div>
                ))}
                {sale.change > 0 && (
                    <div className="flex justify-between font-semibold text-emerald-700">
                        <span>Rendu</span>
                        <span className="tabular-nums">{fmt(sale.change, org.currency)}</span>
                    </div>
                )}
            </div>

            {/* Dette */}
            {sale.debt && sale.debt.status !== "SETTLED" && (
                <>
                    <div className="border-t border-dashed border-zinc-300 my-3" />
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800 text-center">
                        ⚠ Vente à crédit — Solde dû : {fmt(sale.debt.amount - sale.debt.amountPaid, org.currency)}
                        {sale.debt.dueDate && <> · Échéance : {fmtDate(sale.debt.dueDate)}</>}
                    </div>
                </>
            )}

            <div className="border-t border-dashed border-zinc-300 my-3" />
            <p className="text-center text-xs text-zinc-400 whitespace-pre-line">
                {org.receiptFooter ?? "Merci pour votre achat !"}
            </p>
            {org.taxId && <p className="text-center text-xs text-zinc-300 mt-1">N° {org.taxId}</p>}
        </div>
    )

    // ═══════════════════════════════════════════════════════════════════════════
    // FACTURE (format A4)
    // ═══════════════════════════════════════════════════════════════════════════
    const InvoiceContent = (
        <div id="invoice-print" className="bg-white rounded-2xl border border-zinc-200 p-6 md:p-8 space-y-6">

            {/* En-tête */}
            <div className="flex items-start justify-between gap-6">
                <div>
                    <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-wide">{org.name}</h2>
                    {org.address && <p className="text-sm text-zinc-500 mt-1">{org.address}</p>}
                    {org.phone && <p className="text-sm text-zinc-500">{org.phone}</p>}
                    {org.email && <p className="text-sm text-zinc-500">{org.email}</p>}
                    {org.taxId && <p className="text-xs text-zinc-400 mt-1">NINEA / RC : {org.taxId}</p>}
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Facture / Reçu</p>
                    <p className="text-2xl font-black text-zinc-900 font-mono mt-1">{sale.number}</p>
                    <p className="text-sm text-zinc-500 mt-1">{fmtDate(sale.saleDate)}</p>
                    <Badge variant="outline" className={`mt-2 rounded-full ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                        <span className={`h-1.5 w-1.5 rounded-full mr-1 ${statusCfg.dot}`} />
                        {statusCfg.label}
                    </Badge>
                </div>
            </div>

            {/* Client */}
            {sale.client && (
                <div className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Facturé à</p>
                    <p className="font-bold text-zinc-900">{sale.client.name}</p>
                    {sale.client.phone && <p className="text-sm text-zinc-500">{sale.client.phone}</p>}
                    {sale.client.email && <p className="text-sm text-zinc-500">{sale.client.email}</p>}
                    {sale.client.address && <p className="text-sm text-zinc-500">{sale.client.address}</p>}
                </div>
            )}

            {/* Tableau articles */}
            <div className="rounded-2xl border border-zinc-200 overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200">
                            <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Article</th>
                            <th className="text-center py-3 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-16">Qté</th>
                            <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-28">Prix unit.</th>
                            <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-28">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                        {sale.items.map((item, i) => (
                            <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/40"}>
                                <td className="py-3 px-4 font-medium text-zinc-900">{item.name}</td>
                                <td className="py-3 px-3 text-center text-zinc-600 tabular-nums">{item.quantity}</td>
                                <td className="py-3 px-4 text-right text-zinc-600 tabular-nums">{fmt(item.unitPrice, org.currency)}</td>
                                <td className="py-3 px-4 text-right font-semibold text-zinc-900 tabular-nums">{fmt(item.total, org.currency)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Totaux */}
            <div className="flex justify-end">
                <div className="w-full max-w-xs space-y-2">
                    {sale.discount > 0 && (
                        <div className="flex justify-between text-sm text-zinc-500">
                            <span>Remise</span><span className="tabular-nums">- {fmt(sale.discount, org.currency)}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-black text-lg border-t border-zinc-200 pt-2">
                        <span>Total</span>
                        <span className="tabular-nums">{fmt(sale.total, org.currency)}</span>
                    </div>
                    {sale.payments.map((p, i) => (
                        <div key={i} className="flex justify-between text-sm text-zinc-500">
                            <span>{PAYMENT_LABELS[p.method] ?? p.method}</span>
                            <span className="tabular-nums">{fmt(p.amount, org.currency)}</span>
                        </div>
                    ))}
                    {sale.change > 0 && (
                        <div className="flex justify-between text-sm font-semibold text-emerald-700">
                            <span>Rendu</span><span className="tabular-nums">{fmt(sale.change, org.currency)}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Dette */}
            {sale.debt && sale.debt.status !== "SETTLED" && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-amber-800">Vente à crédit</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                            Solde restant : <strong>{fmt(sale.debt.amount - sale.debt.amountPaid, org.currency)}</strong>
                            {sale.debt.dueDate && <> · Échéance : {fmtDate(sale.debt.dueDate)}</>}
                        </p>
                    </div>
                </div>
            )}

            {/* Notes */}
            {sale.note && (
                <p className="text-sm text-zinc-500 border-t border-zinc-100 pt-4 italic">{sale.note}</p>
            )}

            {/* Pied de page */}
            <div className="border-t border-zinc-100 pt-4 text-center text-xs text-zinc-400">
                {org.receiptFooter ?? `Merci pour votre confiance — ${org.name}`}
            </div>
        </div>
    )

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDU
    // ═══════════════════════════════════════════════════════════════════════════
    return (
        <>
            {/* CSS print */}
            <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #receipt-print, #receipt-print * { visibility: visible !important; }
          #invoice-print, #invoice-print * { visibility: visible !important; }
          #receipt-print, #invoice-print {
            position: fixed !important; left: 0 !important; top: 0 !important;
            width: 100% !important; border: none !important; box-shadow: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

            <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 pb-8 no-print">

                {/* Header */}
                <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={() => router.push(`/${orgSlug}/sales`)}
                        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Ventes
                    </button>
                    <span className="text-zinc-300">/</span>
                    <h1 className="text-xl font-bold font-mono text-zinc-900">{sale.number}</h1>
                    <Badge variant="outline" className={`rounded-full text-xs flex items-center gap-1 ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                        {statusCfg.label}
                    </Badge>
                </div>

                {/* Résultat conversion facture */}
                {invoiceResult && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <p className="text-sm font-medium text-emerald-800">
                                Facture <strong>{invoiceResult.invoiceNumber}</strong> créée avec succès
                            </p>
                        </div>
                        <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 shrink-0"
                            onClick={() => router.push(`/${orgSlug}/invoices/${invoiceResult.invoiceId}`)}>
                            Voir la facture →
                        </Button>
                    </div>
                )}

                {/* Onglets */}
                <Tabs defaultValue={defaultTab}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <TabsList className="h-9">
                            <TabsTrigger value="detail">Détail</TabsTrigger>
                            <TabsTrigger value="ticket">🧾 Ticket</TabsTrigger>
                            <TabsTrigger value="invoice">📄 Facture</TabsTrigger>
                        </TabsList>

                        {/* Actions globales */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {sale.status === "COMPLETED" && !invoiceResult && (
                                <Button variant="outline" size="sm" onClick={() => { setActionError(null); setInvoiceModal(true) }} className="gap-2">
                                    <FileText className="w-4 h-4" /> Générer facture
                                </Button>
                            )}
                            {sale.status === "COMPLETED" && (
                                <Button variant="outline" size="sm" onClick={() => { setActionError(null); setCancelModal(true) }}
                                    className="gap-2 text-red-600 border-red-200 hover:bg-red-50">
                                    <XCircle className="w-4 h-4" /> Annuler
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* ── Onglet Détail ─────────────────────────────────────────── */}
                    <TabsContent value="detail" className="mt-4 space-y-4">

                        {/* Infos générales */}
                        <Card className="rounded-2xl">
                            <CardContent className="p-5">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Date</p>
                                        <p className="font-semibold text-zinc-900">{fmtDateTime(sale.saleDate)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Client</p>
                                        <p className="font-semibold text-zinc-900">{sale.client?.name ?? "Anonyme"}</p>
                                        {sale.client?.phone && <p className="text-xs text-zinc-400">{sale.client.phone}</p>}
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Paiement</p>
                                        <div className="flex flex-wrap gap-1">
                                            {sale.payments.map((p, i) => (
                                                <span key={i} className="text-xs bg-zinc-100 rounded-full px-2 py-0.5 font-medium text-zinc-700">
                                                    {PAYMENT_LABELS[p.method] ?? p.method}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    {sale.tableNumber && (
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Table</p>
                                            <p className="font-semibold text-zinc-900">{sale.tableNumber}</p>
                                        </div>
                                    )}
                                </div>
                                {sale.note && <p className="mt-3 pt-3 border-t border-zinc-100 text-sm text-zinc-500 italic">{sale.note}</p>}
                            </CardContent>
                        </Card>

                        {/* Articles */}
                        <Card className="rounded-2xl">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">{sale.items.length} article{sale.items.length > 1 ? "s" : ""}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-zinc-100">
                                    {sale.items.map((item, i) => (
                                        <div key={item.id} className="flex items-center justify-between px-5 py-3 gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-zinc-900 text-sm">{item.name}</p>
                                                <p className="text-xs text-zinc-400 mt-0.5">
                                                    {fmtN(item.unitPrice)} × {item.quantity}
                                                    {item.discount > 0 && <span className="ml-2 text-amber-500">Remise: {fmtN(item.discount)}</span>}
                                                </p>
                                            </div>
                                            <p className="font-bold text-zinc-900 tabular-nums shrink-0">{fmt(item.total, org.currency)}</p>
                                        </div>
                                    ))}
                                </div>
                                {/* Total */}
                                <div className="border-t border-zinc-200 px-5 py-4 space-y-1.5">
                                    {sale.discount > 0 && (
                                        <div className="flex justify-between text-sm text-zinc-500">
                                            <span>Remise</span><span className="tabular-nums">- {fmt(sale.discount, org.currency)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between font-black text-lg">
                                        <span>Total</span>
                                        <span className="tabular-nums">{fmt(sale.total, org.currency)}</span>
                                    </div>
                                    {sale.payments.map((p, i) => (
                                        <div key={i} className="flex justify-between text-sm text-zinc-500">
                                            <span>{PAYMENT_LABELS[p.method] ?? p.method}</span>
                                            <span className="tabular-nums">{fmt(p.amount, org.currency)}</span>
                                        </div>
                                    ))}
                                    {sale.change > 0 && (
                                        <div className="flex justify-between text-sm font-semibold text-emerald-700">
                                            <span>Rendu</span><span className="tabular-nums">{fmt(sale.change, org.currency)}</span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Dette */}
                        {sale.debt && sale.debt.status !== "SETTLED" && (
                            <Card className="rounded-2xl border-amber-200">
                                <CardContent className="p-4 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="font-semibold text-amber-800">Vente à crédit</p>
                                        <p className="text-sm text-amber-700 mt-1">
                                            Montant dû : <strong>{fmt(sale.debt.amount - sale.debt.amountPaid, org.currency)}</strong>
                                            {sale.debt.dueDate && <> · Échéance : {fmtDate(sale.debt.dueDate)}</>}
                                        </p>
                                    </div>
                                    <Button size="sm" variant="outline" className="shrink-0 border-amber-300 text-amber-700"
                                        onClick={() => router.push(`/${orgSlug}/debts/${sale.debt!.id}`)}>
                                        Voir la dette →
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* ── Onglet Ticket ─────────────────────────────────────────── */}
                    <TabsContent value="ticket" className="mt-4">
                        <div className="space-y-4">
                            {/* Actions ticket */}
                            <div className="flex gap-3 justify-end">
                                <Button variant="outline" onClick={handlePrint} className="gap-2">
                                    <Printer className="w-4 h-4" /> Imprimer
                                </Button>
                                <Button variant="outline" onClick={handleWhatsApp} className="gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                                    <Share2 className="w-4 h-4" /> WhatsApp
                                </Button>
                            </div>
                            {/* Aperçu ticket */}
                            <div className="flex justify-center">
                                {ReceiptContent}
                            </div>
                        </div>
                    </TabsContent>

                    {/* ── Onglet Facture ─────────────────────────────────────────── */}
                    <TabsContent value="invoice" className="mt-4">
                        <div className="space-y-4">
                            {/* Actions facture */}
                            <div className="flex gap-3 justify-end flex-wrap">
                                <Button variant="outline" onClick={handlePrint} className="gap-2">
                                    <Printer className="w-4 h-4" /> Imprimer
                                </Button>
                                <Button variant="outline" onClick={handleWhatsApp} className="gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                                    <Share2 className="w-4 h-4" /> WhatsApp
                                </Button>
                                {sale.status === "COMPLETED" && !invoiceResult && (
                                    <Button onClick={() => { setActionError(null); setInvoiceModal(true) }} className="gap-2">
                                        <FileText className="w-4 h-4" /> Enregistrer comme facture
                                    </Button>
                                )}
                            </div>
                            {/* Aperçu facture */}
                            {InvoiceContent}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* ── Modal annulation ──────────────────────────────────────────── */}
            <Dialog open={cancelModal} onOpenChange={o => !o && setCancelModal(false)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Annuler la vente {sale.number} ?</DialogTitle></DialogHeader>
                    <div className="py-2 space-y-3">
                        <p className="text-sm text-zinc-600">
                            Le stock des produits sera <strong>remis en place</strong> automatiquement. Cette action est irréversible.
                        </p>
                        {actionError && (
                            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">⚠️ {actionError}</div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelModal(false)}>Retour</Button>
                        <Button variant="destructive" onClick={handleCancel} disabled={isPending}>
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmer l'annulation"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Modal conversion facture ──────────────────────────────────── */}
            <Dialog open={invoiceModal} onOpenChange={o => !o && setInvoiceModal(false)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Générer une facture pour {sale.number} ?</DialogTitle></DialogHeader>
                    <div className="py-2 space-y-3">
                        <p className="text-sm text-zinc-600">
                            Une facture sera créée à partir de cette vente. Elle apparaîtra dans le module Factures avec le statut{" "}
                            <strong>{sale.amountPaid >= sale.total ? "Payée" : "Paiement partiel"}</strong>.
                        </p>
                        {!sale.client && (
                            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-700">
                                ⚠ Cette vente n'a pas de client associé. La facture sera créée sans destinataire.
                            </div>
                        )}
                        {actionError && (
                            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">⚠️ {actionError}</div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setInvoiceModal(false)}>Annuler</Button>
                        <Button onClick={handleConvertToInvoice} disabled={isPending} className="gap-2">
                            {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Création…</> : <><FileText className="w-4 h-4" /> Créer la facture</>}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}