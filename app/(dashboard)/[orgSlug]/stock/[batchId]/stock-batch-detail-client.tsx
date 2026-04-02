// src/app/(dashboard)/[orgSlug]/stock/[batchId]/stock-batch-detail-client.tsx
"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
    ArrowLeft, Loader2, AlertTriangle, Plus, X,
    CheckCircle2, ArrowDownToLine, ArrowUpFromLine, Package,
    TrendingUp, TrendingDown, RotateCcw, Save, Pencil,
} from "lucide-react"
import {
    updateStockBatchAction, validateStockBatchAction,
    cancelStockBatchAction,
    OUTPUT_REASON_LABELS, OUTPUT_REASON_ICONS,
    type UpdateBatchInput,
} from "@/server/actions/stock.action"

// ─── Types ────────────────────────────────────────────────────────────────────
type Product = {
    id: string; name: string; sku: string | null; barcode: string | null
    unit: string | null; currentStock: number; costPrice: number | null
    category: { name: string; icon: string | null } | null
}
type BatchItem = {
    id: string; productId: string; quantity: number; unitCost: number | null
    totalCost: number | null; batchNumber: string | null; expiryDate: Date | null; note: string | null
    product: { id: string; name: string; sku: string | null; unit: string | null; currentStock: number; costPrice: number | null }
}
type Movement = {
    id: string; type: string; direction: number; quantity: number
    unitCost: number | null; totalCost: number | null; movedAt: Date; note: string | null
    product: { id: string; name: string; unit: string | null }
}
type Batch = {
    id: string; number: string; type: string; status: string
    outputReason: string | null; externalRef: string | null
    note: string | null; batchDate: Date; validatedAt: Date | null
    totalCost: number | null
    vendor: { id: string; name: string } | null
    items: BatchItem[]
    movements: Movement[]
}
type Props = {
    orgSlug: string; currency: string; userRole: string
    batch: Batch
    products: Product[]
    vendors: { id: string; name: string }[]
}

type EditLine = {
    productId: string; quantity: number; unitCost: string
    batchNumber: string; expiryDate: string; note: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtN = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
const fmt = (n: number, cur: string) => `${fmtN(n)} ${cur}`
const fmtDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—"
const fmtDatetime = (d: Date) =>
    new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

function StatusBadge({ status }: { status: string }) {
    const cfg: Record<string, [string, string, string]> = {
        VALIDATED: ["Validé", "bg-emerald-500", "bg-emerald-50 text-emerald-700 border-emerald-200"],
        CANCELLED: ["Annulé", "bg-zinc-400", "bg-zinc-100 text-zinc-400 border-zinc-200"],
        DRAFT: ["Brouillon", "bg-amber-500", "bg-amber-50 text-amber-700 border-amber-200"],
    }
    const [label, dot, cls] = cfg[status] ?? cfg.DRAFT!
    return (
        <Badge variant="outline" className={`rounded-full text-xs flex items-center gap-1.5 ${cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}
        </Badge>
    )
}

const MOV_ICONS: Record<string, { icon: string; color: string; label: string }> = {
    IN: { icon: "📥", color: "text-blue-600", label: "Entrée" },
    OUT: { icon: "📤", color: "text-amber-600", label: "Sortie" },
    ADJUSTMENT: { icon: "⚖️", color: "text-violet-600", label: "Ajustement" },
    LOSS: { icon: "💔", color: "text-red-500", label: "Perte" },
}

// ═════════════════════════════════════════════════════════════════════════════
export default function StockBatchDetailClient({
    orgSlug, currency, userRole, batch, products, vendors,
}: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const isEditable = batch.status === "DRAFT"
    const isReception = batch.type === "RECEPTION"
    const canEdit = isEditable && ["OWNER", "ADMIN", "MEMBER"].includes(userRole)

    const [activeTab, setActiveTab] = useState<"lignes" | "mouvements">("lignes")
    const [editing, setEditing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saveOk, setSaveOk] = useState(false)

    // Modals
    const [validateModal, setValidateModal] = useState(false)
    const [cancelModal, setCancelModal] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)

    // Lignes en édition
    const [lines, setLines] = useState<EditLine[]>(
        batch.items.length > 0
            ? batch.items.map(i => ({
                productId: i.productId,
                quantity: i.quantity,
                unitCost: i.unitCost?.toString() ?? "",
                batchNumber: i.batchNumber ?? "",
                expiryDate: i.expiryDate ? new Date(i.expiryDate).toISOString().slice(0, 10) : "",
                note: i.note ?? "",
            }))
            : [{ productId: "", quantity: 1, unitCost: "", batchNumber: "", expiryDate: "", note: "" }]
    )

    const totalEstimated = lines.reduce((s, l) => {
        const c = parseFloat(l.unitCost) || 0
        return s + c * l.quantity
    }, 0)

    function updateLine(idx: number, field: keyof EditLine, value: string | number) {
        setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
    }
    function addLine() { setLines(prev => [...prev, { productId: "", quantity: 1, unitCost: "", batchNumber: "", expiryDate: "", note: "" }]) }
    function removeLine(idx: number) { if (lines.length > 1) setLines(prev => prev.filter((_, i) => i !== idx)) }

    // ─── Sauvegarder les lignes ───────────────────────────────────────────────
    function handleSave() {
        setError(null)
        const valid = lines.filter(l => l.productId)
        if (valid.length === 0) { setError("Ajoutez au moins un produit."); return }
        const ids = valid.map(l => l.productId)
        if (new Set(ids).size !== ids.length) { setError("Un même produit apparaît plusieurs fois."); return }

        const input: UpdateBatchInput = {
            items: valid.map(l => ({
                productId: l.productId,
                quantity: l.quantity,
                unitCost: l.unitCost ? parseFloat(l.unitCost) : undefined,
                batchNumber: l.batchNumber || undefined,
                expiryDate: l.expiryDate || undefined,
                note: l.note || undefined,
            })),
        }

        startTransition(async () => {
            const result = await updateStockBatchAction(orgSlug, batch.id, input)
            if (!result.success) { setError(result.error); return }
            setSaveOk(true)
            setEditing(false)
            setTimeout(() => setSaveOk(false), 3000)
            router.refresh()
        })
    }

    // ─── Valider ──────────────────────────────────────────────────────────────
    function handleValidate() {
        setActionError(null)
        startTransition(async () => {
            const result = await validateStockBatchAction(orgSlug, batch.id)
            if (!result.success) { setActionError(result.error); return }
            setValidateModal(false)
            router.push(`/${orgSlug}/stock`)
        })
    }

    // ─── Annuler ──────────────────────────────────────────────────────────────
    function handleCancel() {
        setActionError(null)
        startTransition(async () => {
            const result = await cancelStockBatchAction(orgSlug, batch.id)
            if (!result.success) { setActionError(result.error); return }
            setCancelModal(false)
            router.refresh()
        })
    }

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 pb-24 md:pb-8">

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className="flex items-start gap-4 flex-wrap">
                <button onClick={() => router.push(`/${orgSlug}/stock`)}
                    className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-800 text-sm transition-colors mt-1 shrink-0">
                    <ArrowLeft className="w-4 h-4" /> Stock
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className={`flex items-center gap-2 text-base font-bold ${isReception ? "text-blue-600" : "text-amber-600"}`}>
                            {isReception ? <ArrowDownToLine className="w-5 h-5" /> : <ArrowUpFromLine className="w-5 h-5" />}
                            {batch.number}
                        </div>
                        <StatusBadge status={batch.status} />
                    </div>
                    <p className="text-sm text-zinc-500 mt-0.5">
                        {fmtDate(batch.batchDate)}
                        {batch.vendor && <> · {batch.vendor.name}</>}
                        {batch.externalRef && <> · Réf : {batch.externalRef}</>}
                        {!isReception && batch.outputReason && (
                            <> · {OUTPUT_REASON_ICONS[batch.outputReason as keyof typeof OUTPUT_REASON_ICONS]} {OUTPUT_REASON_LABELS[batch.outputReason as keyof typeof OUTPUT_REASON_LABELS]}</>
                        )}
                    </p>
                </div>

                {/* Boutons d'action */}
                {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                        {!editing ? (
                            <Button variant="outline" size="sm" onClick={() => { setEditing(true); setError(null) }} className="gap-2">
                                <Pencil className="w-4 h-4" /> Modifier les lignes
                            </Button>
                        ) : (
                            <>
                                <Button variant="outline" size="sm" onClick={() => { setEditing(false); setError(null) }}>Annuler</Button>
                                <Button size="sm" onClick={handleSave} disabled={isPending} className="gap-2">
                                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Enregistrer
                                </Button>
                            </>
                        )}
                        <Button size="sm" onClick={() => setValidateModal(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                            <CheckCircle2 className="w-4 h-4" /> Valider
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setCancelModal(true)} className="gap-2 text-red-600 border-red-200 hover:bg-red-50">
                            <X className="w-4 h-4" /> Annuler le bon
                        </Button>
                    </div>
                )}
                {batch.status === "VALIDATED" && batch.totalCost !== null && (
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700">
                        ✅ Validé le {fmtDate(batch.validatedAt)} · Total : {fmt(batch.totalCost, currency)}
                    </div>
                )}
            </div>

            {/* ── Feedback ────────────────────────────────────────────────────── */}
            {saveOk && (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" /> Lignes enregistrées avec succès.
                </div>
            )}
            {error && (
                <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}
                </div>
            )}

            {/* ── Onglets lignes / mouvements ─────────────────────────────────── */}
            <div>
                <div className="flex items-center border-b border-zinc-200 gap-1 mb-4">
                    {[
                        { key: "lignes", label: `Lignes (${batch.items.length})` },
                        { key: "mouvements", label: `Mouvements (${batch.movements.length})`, disabled: batch.status !== "VALIDATED" },
                    ].map(tab => (
                        <button key={tab.key}
                            onClick={() => !tab.disabled && setActiveTab(tab.key as any)}
                            disabled={tab.disabled}
                            className={`px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab.disabled ? "text-zinc-300 cursor-not-allowed border-transparent"
                                    : activeTab === tab.key ? "border-zinc-900 text-zinc-900"
                                        : "border-transparent text-zinc-400 hover:text-zinc-600"
                                }`}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ══ LIGNES ═══════════════════════════════════════════════════ */}
                {activeTab === "lignes" && (
                    <div className="space-y-4">
                        {/* Mode lecture */}
                        {!editing && (
                            <>
                                {/* Résumé coûts */}
                                {isReception && (
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-center">
                                            <p className="text-2xl font-black tabular-nums text-zinc-900">{batch.items.length}</p>
                                            <p className="text-xs text-zinc-500 mt-1">Produit{batch.items.length > 1 ? "s" : ""}</p>
                                        </div>
                                        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-center">
                                            <p className="text-2xl font-black tabular-nums text-blue-600">
                                                {fmtN(batch.items.reduce((s, i) => s + i.quantity, 0))}
                                            </p>
                                            <p className="text-xs text-zinc-500 mt-1">Unités</p>
                                        </div>
                                        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-center">
                                            <p className="text-2xl font-black tabular-nums text-emerald-600">
                                                {batch.totalCost ? fmt(batch.totalCost, currency) : "—"}
                                            </p>
                                            <p className="text-xs text-zinc-500 mt-1">Coût total</p>
                                        </div>
                                    </div>
                                )}

                                {/* Table lignes */}
                                <div className="rounded-2xl border border-zinc-200 overflow-hidden bg-white">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-zinc-100 bg-zinc-50/80">
                                                <th className="text-left py-3.5 pl-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Produit</th>
                                                <th className="text-right py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-24">Quantité</th>
                                                {isReception && <th className="text-right py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-32">P.U. achat</th>}
                                                {isReception && <th className="text-right py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-36">Total</th>}
                                                <th className="text-left py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-28">N° lot</th>
                                                <th className="text-left py-3.5 pr-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-32">Expiration</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {batch.items.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="py-10 text-center text-zinc-400 text-sm">
                                                        <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                                        Aucune ligne — cliquez sur « Modifier les lignes » pour ajouter des produits.
                                                    </td>
                                                </tr>
                                            ) : batch.items.map(item => (
                                                <tr key={item.id} className="border-b border-zinc-50 last:border-0">
                                                    <td className="py-3.5 pl-5">
                                                        <p className="font-medium text-zinc-900 text-sm">{item.product.name}</p>
                                                        <p className="text-xs text-zinc-400">{item.product.sku} · Stock: {fmtN(item.product.currentStock)} {item.product.unit}</p>
                                                    </td>
                                                    <td className="py-3.5 text-right pr-2">
                                                        <span className="font-bold tabular-nums text-sm">{fmtN(item.quantity)}</span>
                                                        <span className="text-xs text-zinc-400 ml-1">{item.product.unit}</span>
                                                    </td>
                                                    {isReception && (
                                                        <td className="py-3.5 text-right pr-2">
                                                            {item.unitCost ? (
                                                                <span className="text-sm tabular-nums">{fmtN(item.unitCost)} {currency}</span>
                                                            ) : <span className="text-zinc-300 text-xs">—</span>}
                                                        </td>
                                                    )}
                                                    {isReception && (
                                                        <td className="py-3.5 text-right pr-2">
                                                            {item.totalCost ? (
                                                                <span className="font-semibold tabular-nums text-sm">{fmtN(item.totalCost)} {currency}</span>
                                                            ) : <span className="text-zinc-300 text-xs">—</span>}
                                                        </td>
                                                    )}
                                                    <td className="py-3.5">
                                                        {item.batchNumber
                                                            ? <span className="font-mono text-xs bg-zinc-100 rounded px-1.5 py-0.5">{item.batchNumber}</span>
                                                            : <span className="text-zinc-300 text-xs">—</span>
                                                        }
                                                    </td>
                                                    <td className="py-3.5 pr-4">
                                                        {item.expiryDate
                                                            ? <span className="text-xs text-amber-600 font-medium">{fmtDate(item.expiryDate)}</span>
                                                            : <span className="text-zinc-300 text-xs">—</span>
                                                        }
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* Mode édition */}
                        {editing && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-zinc-700">
                                        Lignes produits
                                        <span className="ml-2 text-xs font-normal text-zinc-400">{lines.filter(l => l.productId).length} produit{lines.filter(l => l.productId).length > 1 ? "s" : ""}</span>
                                    </p>
                                    {totalEstimated > 0 && (
                                        <span className="text-xs font-semibold text-emerald-600">
                                            Total estimé : {fmt(totalEstimated, currency)}
                                        </span>
                                    )}
                                </div>

                                {lines.map((line, idx) => {
                                    const selProd = products.find(p => p.id === line.productId)
                                    return (
                                        <div key={idx} className="rounded-2xl border border-zinc-200 p-4 space-y-3 bg-white">
                                            {/* Sélecteur produit */}
                                            <div className="flex items-center gap-2">
                                                <Select value={line.productId} onValueChange={v => {
                                                    const prod = products.find(p => p.id === v)
                                                    updateLine(idx, "productId", v)
                                                    if (prod?.costPrice) updateLine(idx, "unitCost", String(prod.costPrice))
                                                }}>
                                                    <SelectTrigger className="flex-1">
                                                        <SelectValue placeholder="Sélectionner un produit…" />
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-60">
                                                        {products.map(p => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                {p.category?.icon ?? "📦"} {p.name}
                                                                <span className="text-zinc-400 ml-2 text-xs">— {fmtN(p.currentStock)} {p.unit}</span>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {lines.length > 1 && (
                                                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-red-400 hover:bg-red-50"
                                                        onClick={() => removeLine(idx)}>
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>

                                            {line.productId && (
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs text-zinc-500">Quantité {selProd?.unit ? `(${selProd.unit})` : ""}</Label>
                                                        <Input type="number" min={0.01} step={0.01}
                                                            value={line.quantity}
                                                            onChange={e => updateLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                                                            className="text-right tabular-nums font-semibold" />
                                                    </div>
                                                    {isReception && (
                                                        <div className="space-y-1.5">
                                                            <Label className="text-xs text-zinc-500">Prix achat (XOF)</Label>
                                                            <Input type="number" min={0}
                                                                value={line.unitCost}
                                                                onChange={e => updateLine(idx, "unitCost", e.target.value)}
                                                                placeholder="0"
                                                                className="text-right tabular-nums" />
                                                        </div>
                                                    )}
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs text-zinc-500">N° lot</Label>
                                                        <Input value={line.batchNumber}
                                                            onChange={e => updateLine(idx, "batchNumber", e.target.value)}
                                                            placeholder="Optionnel" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs text-zinc-500">Expiration</Label>
                                                        <Input type="date" value={line.expiryDate}
                                                            onChange={e => updateLine(idx, "expiryDate", e.target.value)} />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Preview stock après */}
                                            {selProd && line.quantity > 0 && (
                                                <div className="text-xs text-zinc-400 bg-zinc-50 rounded-lg px-3 py-2 flex justify-between">
                                                    <span>Stock actuel : <strong className={selProd.currentStock <= 0 ? "text-red-500" : "text-zinc-700"}>{fmtN(selProd.currentStock)} {selProd.unit}</strong></span>
                                                    {isReception
                                                        ? <span>→ Après : <strong className="text-emerald-600">{fmtN(selProd.currentStock + line.quantity)}</strong></span>
                                                        : <span>→ Après : <strong className={selProd.currentStock - line.quantity < 0 ? "text-red-500" : "text-zinc-700"}>{fmtN(selProd.currentStock - line.quantity)}</strong></span>
                                                    }
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}

                                <Button variant="outline" size="sm" onClick={addLine} className="w-full gap-2 border-dashed">
                                    <Plus className="w-4 h-4" /> Ajouter un produit
                                </Button>
                            </div>
                        )}

                        {/* Note */}
                        {batch.note && !editing && (
                            <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-sm text-zinc-600">
                                📝 {batch.note}
                            </div>
                        )}
                    </div>
                )}

                {/* ══ MOUVEMENTS ════════════════════════════════════════════════ */}
                {activeTab === "mouvements" && (
                    <div className="space-y-3">
                        {batch.movements.length === 0 ? (
                            <div className="py-12 text-center text-zinc-400">
                                <p className="text-3xl mb-3">📊</p>
                                <p className="text-sm">Aucun mouvement enregistré</p>
                            </div>
                        ) : (
                            <>
                                {/* Total mouvements */}
                                <div className="flex items-center justify-between text-sm">
                                    <p className="text-zinc-500">{batch.movements.length} mouvement{batch.movements.length > 1 ? "s" : ""}</p>
                                    {batch.totalCost && (
                                        <p className="font-semibold text-zinc-700">Coût total : {fmt(batch.totalCost, currency)}</p>
                                    )}
                                </div>

                                <div className="rounded-2xl border border-zinc-200 overflow-hidden bg-white">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-zinc-100 bg-zinc-50/80">
                                                <th className="text-left py-3.5 pl-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Produit</th>
                                                <th className="text-center py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-24">Type</th>
                                                <th className="text-right py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-24">Qté</th>
                                                <th className="text-right py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-32">Coût</th>
                                                <th className="text-left py-3.5 pr-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Horodatage</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {batch.movements.map(m => {
                                                const cfg = MOV_ICONS[m.type] ?? MOV_ICONS.IN!
                                                return (
                                                    <tr key={m.id} className="border-b border-zinc-50 last:border-0">
                                                        <td className="py-3.5 pl-5">
                                                            <p className="font-medium text-zinc-900 text-sm">{m.product.name}</p>
                                                            {m.note && <p className="text-xs text-zinc-400 mt-0.5">{m.note}</p>}
                                                        </td>
                                                        <td className="py-3.5 text-center">
                                                            <span className={`text-xs font-semibold flex items-center justify-center gap-1 ${cfg.color}`}>
                                                                {cfg.icon} {cfg.label}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 text-right pr-2">
                                                            <span className={`font-bold tabular-nums text-sm ${m.direction > 0 ? "text-blue-600" : "text-amber-600"}`}>
                                                                {m.direction > 0 ? "+" : "−"}{fmtN(m.quantity)}
                                                            </span>
                                                            <span className="text-xs text-zinc-400 ml-1">{m.product.unit}</span>
                                                        </td>
                                                        <td className="py-3.5 text-right pr-2">
                                                            {m.totalCost
                                                                ? <span className="text-sm tabular-nums font-medium">{fmtN(m.totalCost)} {currency}</span>
                                                                : <span className="text-zinc-300 text-xs">—</span>
                                                            }
                                                        </td>
                                                        <td className="py-3.5 pr-4 text-xs text-zinc-400">
                                                            {fmtDatetime(m.movedAt)}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ════════ MODALS ════════════════════════════════════════════════ */}

            {/* Valider */}
            <Dialog open={validateModal} onOpenChange={o => !o && setValidateModal(false)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Valider {batch.number} ?</DialogTitle></DialogHeader>
                    <div className="py-2 space-y-3">
                        <p className="text-sm text-zinc-600">
                            La validation est <strong>irréversible</strong>. Le stock sera mis à jour pour les {batch.items.length} produit{batch.items.length > 1 ? "s" : ""} de ce bon.
                        </p>
                        <div className={`rounded-xl px-4 py-3 text-sm border ${isReception ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-amber-50 border-amber-100 text-amber-700"}`}>
                            {isReception
                                ? `📥 ${fmtN(batch.items.reduce((s, i) => s + i.quantity, 0))} unités seront ajoutées en stock.`
                                : `📤 ${fmtN(batch.items.reduce((s, i) => s + i.quantity, 0))} unités seront retirées du stock.`
                            }
                            {totalEstimated > 0 && isReception && (
                                <p className="mt-1 font-semibold">Valeur totale : {fmt(totalEstimated, currency)}</p>
                            )}
                        </div>
                        {actionError && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">⚠️ {actionError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setValidateModal(false)}>Annuler</Button>
                        <Button onClick={handleValidate} disabled={isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Valider le bon
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Annuler */}
            <Dialog open={cancelModal} onOpenChange={o => !o && setCancelModal(false)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Annuler {batch.number} ?</DialogTitle></DialogHeader>
                    <p className="text-sm text-zinc-500 py-2">Le bon sera marqué annulé. Aucun mouvement de stock ne sera créé.</p>
                    {actionError && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">⚠️ {actionError}</p>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelModal(false)}>Retour</Button>
                        <Button variant="destructive" onClick={handleCancel} disabled={isPending}>
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Annuler le bon"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}