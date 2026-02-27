// src/components/invoices/add-payment-modal.tsx
"use client"
import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { createPaymentAction } from "@/server/actions/payment.action"
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/validations/payment.schema"

type Props = {
    open: boolean
    onClose: () => void
    onSuccess: (data: { paymentId: string; newStatus: string; paidTotal: number }) => void
    orgSlug: string
    invoiceId: string
    invoiceTotal: number
    alreadyPaid: number
    currency: string
}

const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)

export function AddPaymentModal({
    open, onClose, onSuccess,
    orgSlug, invoiceId, invoiceTotal, alreadyPaid, currency,
}: Props) {
    const [isPending, startTransition] = useTransition()

    const remaining = invoiceTotal - alreadyPaid

    const [amount, setAmount] = useState(remaining)
    const [method, setMethod] = useState<PaymentMethod>("CASH")
    const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0] ?? "")
    const [note, setNote] = useState("")
    const [error, setError] = useState<string | null>(null)

    function handleClose() {
        // Reset on close
        setAmount(remaining)
        setMethod("CASH")
        setPaidAt(new Date().toISOString().split("T")[0] ?? "")
        setNote("")
        setError(null)
        onClose()
    }

    function handleSubmit() {
        setError(null)

        if (!amount || amount <= 0) {
            setError("Le montant doit être supérieur à 0.")
            return
        }
        if (amount > remaining + 0.01) {
            setError(`Le montant ne peut pas dépasser le reste à payer : ${fmt(remaining)} ${currency}.`)
            return
        }

        startTransition(async () => {
            const result = await createPaymentAction(orgSlug, {
                invoiceId,
                amount,
                method,
                paidAt,
                note: note || undefined,
            })

            if (!result.success) {
                setError(result.error)
                return
            }

            onSuccess(result.data)
            handleClose()
        })
    }

    // Pourcentage payé pour la barre de progression
    const paidPct = Math.min(100, (alreadyPaid / invoiceTotal) * 100)
    const newPaidPct = Math.min(100, ((alreadyPaid + (amount || 0)) / invoiceTotal) * 100)

    return (
        <Dialog open={open} onOpenChange={o => !o && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold">Enregistrer un paiement</DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-1">

                    {/* ── Résumé montants ───────────────────────────────────────── */}
                    <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-4 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Total facture</span>
                            <span className="font-semibold tabular-nums">{fmt(invoiceTotal)} {currency}</span>
                        </div>
                        {alreadyPaid > 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-500">Déjà réglé</span>
                                <span className="font-semibold text-emerald-600 tabular-nums">
                                    {fmt(alreadyPaid)} {currency}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-500 font-medium">Reste à payer</span>
                            <span className="font-bold text-amber-600 tabular-nums">{fmt(remaining)} {currency}</span>
                        </div>

                        {/* Barre de progression dynamique */}
                        <div className="space-y-1">
                            <div className="h-2.5 rounded-full bg-zinc-200 overflow-hidden relative">
                                {/* Déjà payé */}
                                <div
                                    className="absolute left-0 top-0 h-full rounded-full bg-emerald-400 transition-all duration-300"
                                    style={{ width: `${paidPct}%` }}
                                />
                                {/* Nouveau paiement (preview) */}
                                {amount > 0 && (
                                    <div
                                        className="absolute top-0 h-full rounded-full bg-emerald-300 transition-all duration-300"
                                        style={{ left: `${paidPct}%`, width: `${newPaidPct - paidPct}%` }}
                                    />
                                )}
                            </div>
                            <p className="text-xs text-zinc-400 text-right">
                                {newPaidPct.toFixed(0)}% réglé après ce paiement
                            </p>
                        </div>
                    </div>

                    {/* ── Mode de paiement ──────────────────────────────────────── */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Mode de paiement</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {PAYMENT_METHODS.map(m => (
                                <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => setMethod(m.value)}
                                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 px-2 text-xs font-medium transition-all ${method === m.value
                                        ? "border-zinc-900 bg-zinc-900 text-white"
                                        : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                                        }`}
                                >
                                    <span className="text-lg leading-none">{m.icon}</span>
                                    <span className="leading-tight text-center">{m.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Montant ───────────────────────────────────────────────── */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">
                                Montant <span className="text-red-400">*</span>
                            </Label>
                            <button
                                type="button"
                                onClick={() => setAmount(remaining)}
                                className="text-xs text-blue-500 underline hover:text-blue-700"
                            >
                                Tout régler ({fmt(remaining)} {currency})
                            </button>
                        </div>
                        <div className="relative">
                            <Input
                                type="number"
                                min={1}
                                max={remaining}
                                step={100}
                                value={amount}
                                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                                className="pr-14 text-base font-semibold"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400 font-medium">
                                {currency}
                            </span>
                        </div>
                    </div>

                    {/* ── Date ─────────────────────────────────────────────────── */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">
                            Date du paiement <span className="text-red-400">*</span>
                        </Label>
                        <Input
                            type="date"
                            value={paidAt}
                            onChange={e => setPaidAt(e.target.value)}
                        />
                    </div>

                    {/* ── Référence (conditionnel selon mode) ───────────────────── */}


                    {/* ── Note ─────────────────────────────────────────────────── */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-zinc-600">Note (optionnel)</Label>
                        <Input
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Ex : Acompte de 50%, solde reçu..."
                        />
                    </div>

                    {/* ── Erreur ───────────────────────────────────────────────── */}
                    {error && (
                        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                            ⚠️ {error}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={handleClose} disabled={isPending}>
                        Annuler
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending || amount <= 0}
                        className="gap-2 bg-zinc-900 hover:bg-zinc-800"
                    >
                        {isPending
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
                            : `✓ Enregistrer ${amount > 0 ? fmt(amount) + " " + currency : ""}`
                        }
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}