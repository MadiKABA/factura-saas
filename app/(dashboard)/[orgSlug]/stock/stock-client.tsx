// src/app/(dashboard)/[orgSlug]/stock/stock-client.tsx
"use client"
import { useState, useTransition, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Plus, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Package,
    Loader2, Trash2, CheckCircle2, MoreHorizontal, Eye, ClipboardList,
    Lock, ChevronLeft, ChevronRight, Search, X, Barcode,
} from "lucide-react"
import {
    createStockBatchAction, validateStockBatchAction,
    cancelStockBatchAction, deleteStockBatchAction,
    OUTPUT_REASON_LABELS, OUTPUT_REASON_ICONS,
    type CreateBatchInput,
} from "@/server/actions/stock.action"

// ─── Types ────────────────────────────────────────────────────────────────────
type Product = {
    id: string; name: string; sku: string | null; barcode: string | null
    unit: string | null; currentStock: number; costPrice: number | null
    category: { name: string; icon: string | null } | null
}
type Batch = {
    id: string; number: string; type: string; status: string
    outputReason: string | null; externalRef: string | null
    note: string | null; batchDate: Date; validatedAt: Date | null
    totalCost: number | null; itemCount: number; totalQty: number
    vendor: { id: string; name: string } | null
}
type Alert = {
    id: string; name: string; unit: string | null
    currentStock: number; minStockAlert: number | null; isOutOfStock: boolean
    category: { name: string; color: string | null; icon: string | null } | null
}
type Inventory = {
    id: string; name: string; status: string
    startedAt: Date; closedAt: Date | null; note: string | null
    itemCount: number; varianceCount: number
}
type Plan = {
    name: string; hasStockModule: boolean
    batchLimit: number | null; batchCount: number
    productLimit: number | null; productCount: number
}

type Props = {
    orgSlug: string
    currency: string
    plan: Plan
    initialBatches: Batch[]
    totalBatches: number
    page: number
    pageSize: number
    initialType: string
    initialStatus: string
    initialTab: string
    alerts: Alert[]
    inventories: Inventory[]
    vendors: { id: string; name: string }[]
    products: Product[]
    statsMonth: { in: number; out: number; adjustment: number }
}

// ─── Ligne de bon (state interne) ─────────────────────────────────────────────
type BatchLine = {
    productId: string
    quantity: number
    unitCost: string
    batchNumber: string
    expiryDate: string
    note: string
}

function emptyLine(): BatchLine {
    return { productId: "", quantity: 1, unitCost: "", batchNumber: "", expiryDate: "", note: "" }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtN = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
const fmt = (n: number, cur: string) => `${fmtN(n)} ${cur}`
const fmtDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
    const cfg: Record<string, [string, string, string, string]> = {
        VALIDATED: ["Validé", "bg-emerald-500", "bg-emerald-50 text-emerald-700", "border-emerald-200"],
        CANCELLED: ["Annulé", "bg-zinc-400", "bg-zinc-100 text-zinc-400", "border-zinc-200"],
        DRAFT: ["Brouillon", "bg-amber-500", "bg-amber-50 text-amber-700", "border-amber-200"],
    }
    const [label, dot, cls, border] = cfg[status] ?? cfg.DRAFT!
    return (
        <Badge variant="outline" className={`rounded-full text-xs flex items-center gap-1.5 ${cls} ${border}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}
        </Badge>
    )
}

// ─── Sélecteur produit avec recherche ─────────────────────────────────────────
function ProductPicker({
    products, value, onChange, placeholder = "Choisir un produit…"
}: {
    products: Product[]; value: string
    onChange: (id: string, product: Product | null) => void
    placeholder?: string
}) {
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState("")
    const selected = products.find(p => p.id === value)

    const filtered = useMemo(() => {
        if (!q) return products.slice(0, 40)
        const lq = q.toLowerCase()
        return products.filter(p =>
            p.name.toLowerCase().includes(lq) ||
            p.sku?.toLowerCase().includes(lq) ||
            p.barcode?.includes(q)
        ).slice(0, 30)
    }, [products, q])

    return (
        <div className="relative">
            <button type="button"
                onClick={() => setOpen(true)}
                className="w-full flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-left bg-white hover:border-zinc-300 transition-colors min-h-[42px]">
                {selected ? (
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-zinc-900 truncate">{selected.name}</p>
                        <p className="text-[10px] text-zinc-400">{selected.sku} · {fmtN(selected.currentStock)} {selected.unit}</p>
                    </div>
                ) : (
                    <span className="text-zinc-400 flex-1">{placeholder}</span>
                )}
                <Package className="w-4 h-4 text-zinc-300 shrink-0" />
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
                    <div className="p-3 border-b border-zinc-100">
                        <div className="flex items-center gap-2 bg-zinc-50 rounded-xl px-3 py-2">
                            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                                placeholder="Nom, SKU, code-barres…"
                                className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 outline-none" />
                            {q && <button onClick={() => setQ("")}><X className="w-3.5 h-3.5 text-zinc-400" /></button>}
                        </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <p className="py-8 text-center text-sm text-zinc-400">Aucun produit trouvé</p>
                        ) : filtered.map(p => (
                            <button key={p.id} type="button"
                                onClick={() => { onChange(p.id, p); setQ(""); setOpen(false) }}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors border-b border-zinc-50 last:border-0 ${value === p.id ? "bg-blue-50" : ""}`}>
                                <span className="text-lg shrink-0">{p.category?.icon ?? "📦"}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-zinc-900 truncate">{p.name}</p>
                                    <p className="text-xs text-zinc-400">{p.sku} · stock: {fmtN(p.currentStock)} {p.unit}</p>
                                </div>
                                {value === p.id && <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />}
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function StockClient({
    orgSlug, currency, plan, initialBatches, totalBatches, page, pageSize,
    initialType, initialStatus, initialTab, alerts, inventories, vendors, products, statsMonth,
}: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // ─── Filtres / navigation ─────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState(initialTab)
    const [typeFilter, setTypeFilter] = useState(initialType)
    const [statusFilter, setStatusFilter] = useState(initialStatus)

    function applyFilters(newType?: string, newStatus?: string, newPage?: number) {
        const t = newType ?? typeFilter
        const s = newStatus ?? statusFilter
        const p = newPage ?? 1
        const params = new URLSearchParams({ type: t, status: s, page: String(p), tab: activeTab })
        router.push(`/${orgSlug}/stock?${params}`)
    }

    // ─── Modal création bon ───────────────────────────────────────────────────
    const [batchModal, setBatchModal] = useState(false)
    const [batchType, setBatchType] = useState<"RECEPTION" | "OUTPUT">("RECEPTION")
    const [lines, setLines] = useState<BatchLine[]>([emptyLine()])
    const [outputReason, setOutputReason] = useState("")
    const [vendorId, setVendorId] = useState("")
    const [externalRef, setExternalRef] = useState("")
    const [batchNote, setBatchNote] = useState("")
    const [batchDate, setBatchDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [formError, setFormError] = useState<string | null>(null)

    // ─── Modals actions ───────────────────────────────────────────────────────
    const [validateModal, setValidateModal] = useState<Batch | null>(null)
    const [deleteModal, setDeleteModal] = useState<Batch | null>(null)
    const [cancelModal, setCancelModal] = useState<Batch | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)

    // ─── Inventaire ───────────────────────────────────────────────────────────
    const [invModal, setInvModal] = useState(false)
    const [invName, setInvName] = useState("")
    const [invNote, setInvNote] = useState("")
    const [invError, setInvError] = useState<string | null>(null)
    const [cancelInvModal, setCancelInvModal] = useState<Inventory | null>(null)

    // ─── Gestion lignes bon ───────────────────────────────────────────────────
    function updateLine(idx: number, field: keyof BatchLine, value: string | number) {
        setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
    }
    function addLine() {
        setLines(prev => [...prev, emptyLine()])
    }
    function removeLine(idx: number) {
        setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
    }
    function onProductPicked(idx: number, productId: string, product: Product | null) {
        setLines(prev => prev.map((l, i) => i === idx
            ? { ...l, productId, unitCost: product?.costPrice ? String(product.costPrice) : l.unitCost }
            : l
        ))
    }

    const totalEstimated = lines.reduce((s, l) => {
        const cost = parseFloat(l.unitCost) || 0
        return s + cost * l.quantity
    }, 0)

    // ─── Reset form ───────────────────────────────────────────────────────────
    function resetBatchForm() {
        setLines([emptyLine()])
        setOutputReason(""); setVendorId(""); setExternalRef(""); setBatchNote(""); setFormError(null)
        setBatchDate(new Date().toISOString().slice(0, 10))
    }

    // ─── Créer bon avec produits ──────────────────────────────────────────────
    function handleCreateBatch() {
        setFormError(null)
        if (batchType === "OUTPUT" && !outputReason) { setFormError("Sélectionnez un motif de sortie."); return }
        const validLines = lines.filter(l => l.productId)
        if (validLines.length === 0) { setFormError("Ajoutez au moins un produit."); return }

        // Vérifier doublons
        const ids = validLines.map(l => l.productId)
        if (new Set(ids).size !== ids.length) { setFormError("Un même produit apparaît plusieurs fois."); return }

        const input: CreateBatchInput = {
            type: batchType,
            vendorId: vendorId || undefined,
            externalRef: externalRef || undefined,
            outputReason: outputReason as any || undefined,
            note: batchNote || undefined,
            batchDate: batchDate,
            items: validLines.map(l => ({
                productId: l.productId,
                quantity: l.quantity,
                unitCost: l.unitCost ? parseFloat(l.unitCost) : undefined,
                batchNumber: l.batchNumber || undefined,
                expiryDate: l.expiryDate || undefined,
                note: l.note || undefined,
            })),
        }

        startTransition(async () => {
            const result = await createStockBatchAction(orgSlug, input)
            if (!result.success) { setFormError(result.error); return }
            setBatchModal(false)
            resetBatchForm()
            router.refresh()
        })
    }

    // ─── Valider bon ──────────────────────────────────────────────────────────
    function handleValidate() {
        if (!validateModal) return
        setActionError(null)
        startTransition(async () => {
            const result = await validateStockBatchAction(orgSlug, validateModal.id)
            if (!result.success) { setActionError(result.error); return }
            setValidateModal(null)
            router.refresh()
        })
    }

    // ─── Annuler bon ──────────────────────────────────────────────────────────
    function handleCancelBatch() {
        if (!cancelModal) return
        setActionError(null)
        startTransition(async () => {
            const result = await cancelStockBatchAction(orgSlug, cancelModal.id)
            if (!result.success) { setActionError(result.error); return }
            setCancelModal(null)
            router.refresh()
        })
    }

    // ─── Supprimer bon ────────────────────────────────────────────────────────
    function handleDelete() {
        if (!deleteModal) return
        setActionError(null)
        startTransition(async () => {
            const result = await deleteStockBatchAction(orgSlug, deleteModal.id)
            if (!result.success) { setActionError(result.error); return }
            setDeleteModal(null)
            router.refresh()
        })
    }

    // ─── Inventaire ───────────────────────────────────────────────────────────
    function handleCreateInventory() {
        setInvError(null)
        if (!invName.trim()) { setInvError("Le nom est requis."); return }
    }

    function handleCancelInventory() {
        if (!cancelInvModal) return
        setActionError(null)

    }

    const totalPages = Math.ceil(totalBatches / pageSize)
    const isLocked = !plan.hasStockModule

    // ─── Mémo alertes critiques ───────────────────────────────────────────────
    const criticalAlerts = alerts.filter(a => a.isOutOfStock)
    const lowStockAlerts = alerts.filter(a => !a.isOutOfStock)

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold">Stock</h1>
                    <p className="text-sm text-zinc-500 mt-0.5">Réceptions, sorties & inventaires</p>
                </div>
                {!isLocked && (
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setBatchType("OUTPUT"); resetBatchForm(); setBatchModal(true) }} className="gap-2">
                            <ArrowUpFromLine className="w-4 h-4" />
                            <span className="hidden sm:inline">Sortie</span>
                        </Button>
                        <Button size="sm" onClick={() => { setBatchType("RECEPTION"); resetBatchForm(); setBatchModal(true) }} className="gap-2">
                            <ArrowDownToLine className="w-4 h-4" />
                            <span className="hidden sm:inline">Réception</span>
                        </Button>
                    </div>
                )}
            </div>

            {/* ── Bloc module verrouillé ───────────────────────────────────────── */}
            {isLocked && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center gap-4">
                    <Lock className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="flex-1">
                        <p className="font-semibold text-amber-800 text-sm">Module Stock non disponible — plan {plan.name}</p>
                        <p className="text-xs text-amber-600 mt-0.5">Passez au plan STARTER pour gérer votre stock.</p>
                    </div>
                    <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white shrink-0"
                        onClick={() => router.push(`/${orgSlug}/billing`)}>
                        Upgrader
                    </Button>
                </div>
            )}

            {/* ── Stats mois ──────────────────────────────────────────────────── */}
            {!isLocked && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: "Entrées ce mois", value: fmtN(statsMonth.in), icon: "📥", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
                        { label: "Sorties ce mois", value: fmtN(statsMonth.out), icon: "📤", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
                        { label: "Ajustements", value: fmtN(statsMonth.adjustment), icon: "⚖️", color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100" },
                        { label: "Produits en rupture", value: String(criticalAlerts.length), icon: "⚠️", color: "text-red-600", bg: "bg-red-50", border: "border-red-100" },
                    ].map((s, i) => (
                        <div key={i} className={`rounded-2xl border ${s.border} ${s.bg} px-4 py-4`}>
                            <p className="text-2xl mb-1">{s.icon}</p>
                            <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Quota plan ──────────────────────────────────────────────────── */}
            {!isLocked && plan.batchLimit !== null && plan.batchCount / plan.batchLimit >= 0.8 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-sm text-amber-700 flex-1">
                        <strong>{plan.batchCount}/{plan.batchLimit}</strong> bons créés ce mois — plan {plan.name}.
                    </p>
                    <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 shrink-0"
                        onClick={() => router.push(`/${orgSlug}/billing`)}>
                        Upgrader
                    </Button>
                </div>
            )}

            {/* ── Alertes rupture ─────────────────────────────────────────────── */}
            {alerts.length > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                            <p className="text-sm font-bold text-red-700">
                                {criticalAlerts.length > 0 && `${criticalAlerts.length} en rupture`}
                                {criticalAlerts.length > 0 && lowStockAlerts.length > 0 && " · "}
                                {lowStockAlerts.length > 0 && `${lowStockAlerts.length} sous le seuil`}
                            </p>
                        </div>
                        <Button size="sm" variant="outline" className="border-red-200 text-red-600 text-xs"
                            onClick={() => { setBatchType("RECEPTION"); resetBatchForm(); setBatchModal(true) }}>
                            + Réception
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {alerts.slice(0, 12).map(a => (
                            <span key={a.id}
                                className={`rounded-full border px-3 py-1 text-xs font-medium flex items-center gap-1.5 ${a.isOutOfStock
                                    ? "bg-white border-red-200 text-red-700"
                                    : "bg-white border-amber-200 text-amber-700"
                                    }`}>
                                {a.category?.icon ?? "📦"} {a.name}
                                <span className={a.isOutOfStock ? "text-red-400" : "text-amber-400"}>
                                    · {a.currentStock} {a.unit}
                                </span>
                            </span>
                        ))}
                        {alerts.length > 12 && (
                            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-400">
                                +{alerts.length - 12} autres
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* ── Onglets ─────────────────────────────────────────────────────── */}
            <div>
                <div className="flex items-center border-b border-zinc-200 gap-1">
                    {[
                        { key: "batches", label: "Mouvements", icon: Package },
                        { key: "inventory", label: "Inventaires", icon: ClipboardList },
                    ].map(tab => (
                        <button key={tab.key}
                            onClick={() => {
                                setActiveTab(tab.key)
                                router.push(`/${orgSlug}/stock?type=${typeFilter}&status=${statusFilter}&tab=${tab.key}`)
                            }}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab === tab.key
                                ? "border-zinc-900 text-zinc-900"
                                : "border-transparent text-zinc-400 hover:text-zinc-600"
                                }`}>
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                            {tab.key === "inventory" && inventories.filter(i => i.status === "DRAFT").length > 0 && (
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            )}
                        </button>
                    ))}
                </div>

                {/* ══ ONGLET MOUVEMENTS ══════════════════════════════════════════ */}
                {activeTab === "batches" && (
                    <div className="mt-4 space-y-4">
                        {/* Filtres */}
                        <div className="flex gap-3 flex-wrap">
                            <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); applyFilters(v, statusFilter, 1) }}>
                                <SelectTrigger className="w-44">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Tous les types</SelectItem>
                                    <SelectItem value="RECEPTION">📥 Réceptions</SelectItem>
                                    <SelectItem value="OUTPUT">📤 Sorties</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); applyFilters(typeFilter, v, 1) }}>
                                <SelectTrigger className="w-44">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Tous les statuts</SelectItem>
                                    <SelectItem value="DRAFT">Brouillon</SelectItem>
                                    <SelectItem value="VALIDATED">Validé</SelectItem>
                                    <SelectItem value="CANCELLED">Annulé</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="ml-auto text-sm text-zinc-400 self-center">{totalBatches} bon{totalBatches > 1 ? "s" : ""}</p>
                        </div>

                        {/* Tableau desktop */}
                        <div className="hidden md:block rounded-2xl border border-zinc-200 overflow-hidden shadow-sm bg-white">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-zinc-100 bg-zinc-50/80">
                                        <th className="text-left py-3.5 pl-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Bon</th>
                                        <th className="text-left py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-32">Type</th>
                                        <th className="text-left py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Source / Motif</th>
                                        <th className="text-center py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-20">Lignes</th>
                                        <th className="text-right py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-36">Coût total</th>
                                        <th className="text-center py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-28">Statut</th>
                                        <th className="py-3.5 pr-4 w-10" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {initialBatches.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-16 text-center text-zinc-400">
                                                <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                                <p className="text-sm">Aucun bon de mouvement</p>
                                                {!isLocked && (
                                                    <Button size="sm" className="mt-4 gap-2"
                                                        onClick={() => { setBatchType("RECEPTION"); resetBatchForm(); setBatchModal(true) }}>
                                                        <Plus className="w-4 h-4" /> Créer un bon
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ) : initialBatches.map(b => (
                                        <tr key={b.id}
                                            className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors cursor-pointer"
                                            onClick={() => router.push(`/${orgSlug}/stock/${b.id}`)}>
                                            <td className="py-4 pl-5">
                                                <p className="font-mono font-bold text-zinc-900 text-sm">{b.number}</p>
                                                <p className="text-xs text-zinc-400 mt-0.5">{fmtDate(b.batchDate)}</p>
                                                {b.externalRef && <p className="text-[10px] text-zinc-400 font-mono mt-0.5">Réf: {b.externalRef}</p>}
                                            </td>
                                            <td className="py-4">
                                                <span className={`flex items-center gap-1.5 text-xs font-semibold ${b.type === "RECEPTION" ? "text-blue-600" : "text-amber-600"}`}>
                                                    {b.type === "RECEPTION"
                                                        ? <><ArrowDownToLine className="w-3.5 h-3.5" />Réception</>
                                                        : <><ArrowUpFromLine className="w-3.5 h-3.5" />Sortie</>
                                                    }
                                                </span>
                                            </td>
                                            <td className="py-4 text-sm text-zinc-600">
                                                {b.type === "RECEPTION"
                                                    ? (b.vendor?.name ?? <span className="text-zinc-300">—</span>)
                                                    : (b.outputReason
                                                        ? <span>{OUTPUT_REASON_ICONS[b.outputReason as keyof typeof OUTPUT_REASON_ICONS] ?? ""} {OUTPUT_REASON_LABELS[b.outputReason as keyof typeof OUTPUT_REASON_LABELS]}</span>
                                                        : <span className="text-zinc-300">—</span>)
                                                }
                                            </td>
                                            <td className="py-4 text-center">
                                                <span className="text-sm font-semibold text-zinc-700 tabular-nums">{b.itemCount}</span>
                                            </td>
                                            <td className="py-4 text-right pr-2">
                                                {b.totalCost
                                                    ? <span className="text-sm font-bold text-zinc-900 tabular-nums">{fmt(b.totalCost, currency)}</span>
                                                    : <span className="text-zinc-300 text-xs">—</span>
                                                }
                                            </td>
                                            <td className="py-4 text-center" onClick={e => e.stopPropagation()}>
                                                <StatusBadge status={b.status} />
                                            </td>
                                            <td className="py-4 pr-4" onClick={e => e.stopPropagation()}>
                                                <BatchActions b={b}
                                                    onValidate={() => { setValidateModal(b); setActionError(null) }}
                                                    onCancel={() => { setCancelModal(b); setActionError(null) }}
                                                    onDelete={() => { setDeleteModal(b); setActionError(null) }}
                                                    onView={() => router.push(`/${orgSlug}/stock/${b.id}`)}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Cards mobile */}
                        <div className="md:hidden space-y-3">
                            {initialBatches.length === 0 ? (
                                <div className="py-12 text-center text-zinc-400">
                                    <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p className="text-sm">Aucun bon de mouvement</p>
                                </div>
                            ) : initialBatches.map(b => (
                                <Card key={b.id} className="rounded-2xl shadow-sm active:scale-[0.99] transition-all cursor-pointer"
                                    onClick={() => router.push(`/${orgSlug}/stock/${b.id}`)}>
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="font-mono font-bold text-zinc-900">{b.number}</p>
                                                <p className="text-xs text-zinc-400 mt-0.5">{fmtDate(b.batchDate)}</p>
                                                <div className={`flex items-center gap-1 text-xs font-semibold mt-1.5 ${b.type === "RECEPTION" ? "text-blue-600" : "text-amber-600"}`}>
                                                    {b.type === "RECEPTION"
                                                        ? <><ArrowDownToLine className="w-3 h-3" /> Réception · {b.vendor?.name ?? "—"}</>
                                                        : <><ArrowUpFromLine className="w-3 h-3" /> {b.outputReason ? OUTPUT_REASON_LABELS[b.outputReason as keyof typeof OUTPUT_REASON_LABELS] : "Sortie"}</>
                                                    }
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                                <StatusBadge status={b.status} />
                                                <BatchActions b={b}
                                                    onValidate={() => { setValidateModal(b); setActionError(null) }}
                                                    onCancel={() => { setCancelModal(b); setActionError(null) }}
                                                    onDelete={() => { setDeleteModal(b); setActionError(null) }}
                                                    onView={() => router.push(`/${orgSlug}/stock/${b.id}`)}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-100">
                                            <span className="text-xs text-zinc-400">{b.itemCount} ligne{b.itemCount > 1 ? "s" : ""} · {b.totalQty} unités</span>
                                            {b.totalCost
                                                ? <span className="font-bold text-zinc-900 tabular-nums text-sm">{fmt(b.totalCost, currency)}</span>
                                                : <span className="text-zinc-300 text-xs">—</span>
                                            }
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between pt-2">
                                <p className="text-xs text-zinc-500">
                                    {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalBatches)} sur {totalBatches}
                                </p>
                                <div className="flex gap-2">
                                    {page > 1 && (
                                        <Button variant="outline" size="sm" onClick={() => applyFilters(undefined, undefined, page - 1)}>
                                            <ChevronLeft className="w-4 h-4" />
                                        </Button>
                                    )}
                                    <span className="flex items-center px-3 text-sm text-zinc-600 font-medium">{page} / {totalPages}</span>
                                    {page < totalPages && (
                                        <Button variant="outline" size="sm" onClick={() => applyFilters(undefined, undefined, page + 1)}>
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ══ ONGLET INVENTAIRES ═════════════════════════════════════════ */}
                {activeTab === "inventory" && (
                    <div className="mt-4 space-y-4">
                        <div className="flex justify-end">
                            <Button onClick={() => setInvModal(true)} disabled={isLocked} className="gap-2">
                                <Plus className="w-4 h-4" /> Nouvel inventaire
                            </Button>
                        </div>

                        <div className="hidden md:block rounded-2xl border border-zinc-200 overflow-hidden shadow-sm bg-white">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-zinc-100 bg-zinc-50/80">
                                        <th className="text-left py-3.5 pl-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Inventaire</th>
                                        <th className="text-center py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-24">Produits</th>
                                        <th className="text-center py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-28">Écarts</th>
                                        <th className="text-center py-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-28">Statut</th>
                                        <th className="py-3.5 pr-4 w-10" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventories.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-16 text-center text-zinc-400">
                                                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                                <p className="text-sm">Aucun inventaire · démarrez un comptage physique</p>
                                            </td>
                                        </tr>
                                    ) : inventories.map(inv => (
                                        <tr key={inv.id}
                                            className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors cursor-pointer"
                                            onClick={() => router.push(`/${orgSlug}/stock/inventory/${inv.id}`)}>
                                            <td className="py-4 pl-5">
                                                <p className="font-semibold text-zinc-900 text-sm">{inv.name}</p>
                                                <p className="text-xs text-zinc-400 mt-0.5">Démarré le {fmtDate(inv.startedAt)}</p>
                                                {inv.closedAt && <p className="text-xs text-zinc-400">Clos le {fmtDate(inv.closedAt)}</p>}
                                            </td>
                                            <td className="py-4 text-center text-sm font-medium text-zinc-700">{inv.itemCount}</td>
                                            <td className="py-4 text-center">
                                                {inv.varianceCount > 0
                                                    ? <span className="text-sm font-semibold text-amber-600">{inv.varianceCount} écart{inv.varianceCount > 1 ? "s" : ""}</span>
                                                    : <span className="text-sm text-emerald-600 font-medium">✓ Aucun</span>
                                                }
                                            </td>
                                            <td className="py-4 text-center" onClick={e => e.stopPropagation()}>
                                                <StatusBadge status={inv.status} />
                                            </td>
                                            <td className="py-4 pr-4 text-right" onClick={e => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-44">
                                                        <DropdownMenuItem onClick={() => router.push(`/${orgSlug}/stock/inventory/${inv.id}`)} className="gap-2 cursor-pointer">
                                                            <Eye className="w-4 h-4 text-blue-500" /> Voir / Saisir
                                                        </DropdownMenuItem>
                                                        {inv.status === "DRAFT" && (
                                                            <>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={() => { setCancelInvModal(inv); setActionError(null) }}
                                                                    className="gap-2 cursor-pointer text-red-600 focus:text-red-600">
                                                                    <Trash2 className="w-4 h-4" /> Annuler
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Cards mobile inventaires */}
                        <div className="md:hidden space-y-3">
                            {inventories.length === 0 ? (
                                <div className="py-12 text-center text-zinc-400">
                                    <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p className="text-sm">Aucun inventaire</p>
                                </div>
                            ) : inventories.map(inv => (
                                <Card key={inv.id} className="rounded-2xl shadow-sm cursor-pointer active:scale-[0.99] transition-all"
                                    onClick={() => router.push(`/${orgSlug}/stock/inventory/${inv.id}`)}>
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-bold text-zinc-900 text-sm">{inv.name}</p>
                                                <p className="text-xs text-zinc-400 mt-0.5">{fmtDate(inv.startedAt)}</p>
                                            </div>
                                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <StatusBadge status={inv.status} />
                                                {inv.status === "DRAFT" && (
                                                    <Button variant="ghost" size="icon" className="h-8 w-8"
                                                        onClick={() => { setCancelInvModal(inv); setActionError(null) }}>
                                                        <Trash2 className="w-4 h-4 text-red-400" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex justify-between mt-3 pt-2.5 border-t border-zinc-100">
                                            <span className="text-xs text-zinc-400">{inv.itemCount} produit{inv.itemCount > 1 ? "s" : ""}</span>
                                            {inv.varianceCount > 0
                                                ? <span className="text-xs font-semibold text-amber-600">{inv.varianceCount} écart{inv.varianceCount > 1 ? "s" : ""}</span>
                                                : <span className="text-xs text-emerald-600">✓ Aucun écart</span>
                                            }
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ════════════════════ MODALS ════════════════════════════════════ */}

            {/* ── Création bon avec saisie produits inline ─────────────────── */}
            <Dialog open={batchModal} onOpenChange={o => { if (!o) { setBatchModal(false); resetBatchForm() } }}>
                <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0">
                    {/* Header */}
                    <DialogHeader className="px-6 pt-5 pb-4 border-b border-zinc-100 shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                            {batchType === "RECEPTION"
                                ? <><ArrowDownToLine className="w-5 h-5 text-blue-500" />Nouveau bon de réception</>
                                : <><ArrowUpFromLine className="w-5 h-5 text-amber-500" />Nouveau bon de sortie</>
                            }
                        </DialogTitle>
                    </DialogHeader>

                    {/* Corps scrollable */}
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 min-h-0">
                        {formError && (
                            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{formError}
                            </div>
                        )}

                        {/* Type + champs de base */}
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Type</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(["RECEPTION", "OUTPUT"] as const).map(t => (
                                        <button key={t} type="button" onClick={() => { setBatchType(t); setOutputReason("") }}
                                            className={`flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${batchType === t
                                                ? t === "RECEPTION" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-amber-500 bg-amber-50 text-amber-700"
                                                : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                                                }`}>
                                            {t === "RECEPTION" ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                                            {t === "RECEPTION" ? "Réception" : "Sortie"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Date</Label>
                                <Input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} />
                            </div>

                            {batchType === "RECEPTION" ? (
                                <>
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-zinc-600">Fournisseur</Label>
                                        <Select value={vendorId} onValueChange={setVendorId}>
                                            <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="">Aucun</SelectItem>
                                                {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-zinc-600">N° BL / Référence</Label>
                                        <Input value={externalRef} onChange={e => setExternalRef(e.target.value)} placeholder="Optionnel" />
                                    </div>
                                </>
                            ) : (
                                <div className="sm:col-span-2 space-y-2">
                                    <Label className="text-sm font-semibold">Motif <span className="text-red-400">*</span></Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {Object.entries(OUTPUT_REASON_LABELS).map(([key, label]) => (
                                            <button key={key} type="button" onClick={() => setOutputReason(key)}
                                                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-xs font-medium transition-all ${outputReason === key ? "border-amber-500 bg-amber-50 text-amber-800" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                                                    }`}>
                                                <span className="text-xl">{OUTPUT_REASON_ICONS[key as keyof typeof OUTPUT_REASON_ICONS]}</span>
                                                <span className="text-center leading-tight">{label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Lignes produits */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-semibold">
                                    Produits <span className="text-red-400">*</span>
                                    <span className="ml-2 text-xs font-normal text-zinc-400">{lines.filter(l => l.productId).length} sélectionné{lines.filter(l => l.productId).length > 1 ? "s" : ""}</span>
                                </Label>
                                {totalEstimated > 0 && (
                                    <span className="text-xs font-semibold text-zinc-600">
                                        Total estimé : {fmt(totalEstimated, currency)}
                                    </span>
                                )}
                            </div>

                            <div className="space-y-3">
                                {lines.map((line, idx) => {
                                    const selectedProduct = products.find(p => p.id === line.productId)
                                    return (
                                        <div key={idx} className="rounded-2xl border border-zinc-200 p-4 space-y-3 bg-white">
                                            {/* Sélection produit */}
                                            <div className="flex items-start gap-2">
                                                <div className="flex-1">
                                                    <ProductPicker
                                                        products={products}
                                                        value={line.productId}
                                                        onChange={(id, prod) => onProductPicked(idx, id, prod)}
                                                        placeholder="Sélectionner un produit…"
                                                    />
                                                </div>
                                                {lines.length > 1 && (
                                                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                                        onClick={() => removeLine(idx)}>
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>

                                            {/* Champs quantité + coût */}
                                            {line.productId && (
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs text-zinc-500 font-medium">
                                                            Quantité {selectedProduct?.unit ? `(${selectedProduct.unit})` : ""}
                                                        </Label>
                                                        <Input type="number" min={0.01} step={0.01}
                                                            value={line.quantity}
                                                            onChange={e => updateLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                                                            className="text-right tabular-nums font-semibold" />
                                                    </div>

                                                    {batchType === "RECEPTION" && (
                                                        <div className="space-y-1.5">
                                                            <Label className="text-xs text-zinc-500 font-medium">Prix achat (XOF)</Label>
                                                            <Input type="number" min={0} step={1}
                                                                value={line.unitCost}
                                                                onChange={e => updateLine(idx, "unitCost", e.target.value)}
                                                                placeholder={selectedProduct?.costPrice ? String(selectedProduct.costPrice) : "0"}
                                                                className="text-right tabular-nums" />
                                                        </div>
                                                    )}

                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs text-zinc-500 font-medium">N° lot</Label>
                                                        <Input value={line.batchNumber}
                                                            onChange={e => updateLine(idx, "batchNumber", e.target.value)}
                                                            placeholder="Optionnel" />
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs text-zinc-500 font-medium">Date expiration</Label>
                                                        <Input type="date" value={line.expiryDate}
                                                            onChange={e => updateLine(idx, "expiryDate", e.target.value)} />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Infos stock */}
                                            {selectedProduct && (
                                                <div className="flex items-center justify-between text-xs text-zinc-400 bg-zinc-50 rounded-lg px-3 py-2">
                                                    <span>Stock actuel : <strong className={selectedProduct.currentStock <= 0 ? "text-red-500" : "text-zinc-700"}>{fmtN(selectedProduct.currentStock)} {selectedProduct.unit}</strong></span>
                                                    {batchType === "RECEPTION" && line.quantity > 0 && (
                                                        <span>→ Après réception : <strong className="text-emerald-600">{fmtN(selectedProduct.currentStock + line.quantity)} {selectedProduct.unit}</strong></span>
                                                    )}
                                                    {batchType === "OUTPUT" && line.quantity > 0 && (
                                                        <span>→ Après sortie : <strong className={selectedProduct.currentStock - line.quantity < 0 ? "text-red-500" : "text-zinc-700"}>{fmtN(selectedProduct.currentStock - line.quantity)} {selectedProduct.unit}</strong></span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            <Button variant="outline" size="sm" onClick={addLine} className="w-full gap-2 border-dashed">
                                <Plus className="w-4 h-4" /> Ajouter un produit
                            </Button>
                        </div>

                        {/* Note globale */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-zinc-600">Note générale (optionnel)</Label>
                            <Textarea value={batchNote} onChange={e => setBatchNote(e.target.value)}
                                rows={2} placeholder="Observations sur ce bon…" />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="shrink-0 px-6 py-4 border-t border-zinc-100 bg-white flex items-center justify-between gap-3">
                        <p className="text-xs text-zinc-400">
                            Le bon sera créé en <strong>brouillon</strong> — vous pourrez valider depuis le détail.
                        </p>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => { setBatchModal(false); resetBatchForm() }} disabled={isPending}>
                                Annuler
                            </Button>
                            <Button onClick={handleCreateBatch} disabled={isPending} className="gap-2">
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Créer le bon →
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Valider bon ─────────────────────────────────────────────── */}
            <Dialog open={!!validateModal} onOpenChange={o => !o && setValidateModal(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Valider {validateModal?.number} ?</DialogTitle>
                    </DialogHeader>
                    <div className="py-2 space-y-3">
                        <p className="text-sm text-zinc-600">
                            La validation est <strong>irréversible</strong>. Le stock sera mis à jour immédiatement pour les {validateModal?.itemCount} ligne{(validateModal?.itemCount ?? 0) > 1 ? "s" : ""} du bon.
                        </p>
                        <div className={`rounded-xl px-4 py-3 text-sm ${validateModal?.type === "RECEPTION" ? "bg-blue-50 border border-blue-100 text-blue-700" : "bg-amber-50 border border-amber-100 text-amber-700"}`}>
                            {validateModal?.type === "RECEPTION"
                                ? `📥 ${validateModal.totalQty} unités seront ajoutées en stock.`
                                : `📤 ${validateModal?.totalQty} unités seront retirées du stock.`
                            }
                        </div>
                        {actionError && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">⚠️ {actionError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setValidateModal(null)}>Annuler</Button>
                        <Button onClick={handleValidate} disabled={isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Valider
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Annuler bon ─────────────────────────────────────────────── */}
            <Dialog open={!!cancelModal} onOpenChange={o => !o && setCancelModal(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Annuler {cancelModal?.number} ?</DialogTitle></DialogHeader>
                    <p className="text-sm text-zinc-500 py-2">Le bon sera marqué annulé. Aucun impact sur le stock.</p>
                    {actionError && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">⚠️ {actionError}</p>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelModal(null)}>Retour</Button>
                        <Button variant="destructive" onClick={handleCancelBatch} disabled={isPending}>
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Annuler le bon"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Supprimer bon ───────────────────────────────────────────── */}
            <Dialog open={!!deleteModal} onOpenChange={o => !o && setDeleteModal(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Supprimer {deleteModal?.number} ?</DialogTitle></DialogHeader>
                    <p className="text-sm text-zinc-500 py-2">Cette action est irréversible. Le bon et ses lignes seront supprimés définitivement.</p>
                    {actionError && <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">⚠️ {actionError}</p>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteModal(null)}>Annuler</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Supprimer définitivement"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Créer inventaire ────────────────────────────────────────── */}
            <Dialog open={invModal} onOpenChange={o => { if (!o) { setInvModal(false); setInvName(""); setInvNote(""); setInvError(null) } }}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="text-lg font-bold">Nouvel inventaire</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-1">
                        {invError && (
                            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{invError}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Nom <span className="text-red-400">*</span></Label>
                            <Input autoFocus value={invName} onChange={e => setInvName(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleCreateInventory()}
                                placeholder="Ex : Inventaire Janvier 2025" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-zinc-500">Note (optionnel)</Label>
                            <Textarea value={invNote} onChange={e => setInvNote(e.target.value)}
                                rows={2} placeholder="Observations…" />
                        </div>
                        <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-sm text-zinc-600">
                            📋 Un snapshot du stock actuel sera pris pour tous vos <strong>{plan.productCount}</strong> produits physiques actifs.
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setInvModal(false)} disabled={isPending}>Annuler</Button>
                        <Button onClick={handleCreateInventory} disabled={isPending} className="gap-2">
                            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            Démarrer l'inventaire →
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Annuler inventaire ──────────────────────────────────────── */}
            <Dialog open={!!cancelInvModal} onOpenChange={o => !o && setCancelInvModal(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Annuler « {cancelInvModal?.name} » ?</DialogTitle></DialogHeader>
                    <p className="text-sm text-zinc-500 py-2">L'inventaire sera annulé sans aucun impact sur le stock.</p>
                    {actionError && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">⚠️ {actionError}</p>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelInvModal(null)}>Retour</Button>
                        <Button variant="destructive" onClick={handleCancelInventory} disabled={isPending}>
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmer l'annulation"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// ─── Menu actions bon ─────────────────────────────────────────────────────────
function BatchActions({
    b, onValidate, onCancel, onDelete, onView,
}: {
    b: Batch
    onValidate: () => void
    onCancel: () => void
    onDelete: () => void
    onView: () => void
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="w-4 h-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onView} className="gap-2 cursor-pointer">
                    <Eye className="w-4 h-4 text-blue-500" /> Voir le détail
                </DropdownMenuItem>
                {b.status === "DRAFT" && (
                    <>
                        <DropdownMenuItem onClick={onValidate} className="gap-2 cursor-pointer">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Valider le bon
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onCancel} className="gap-2 cursor-pointer text-amber-600 focus:text-amber-600">
                            <X className="w-4 h-4" /> Annuler
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onDelete} className="gap-2 cursor-pointer text-red-600 focus:text-red-600">
                            <Trash2 className="w-4 h-4" /> Supprimer
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}