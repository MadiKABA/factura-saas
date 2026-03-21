// src/app/(dashboard)/[orgSlug]/sales/sales-client.tsx
"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    ShoppingCart, Search, MoreHorizontal, Eye, FileText,
    TrendingUp, Package, AlertTriangle,
} from "lucide-react"

type Sale = {
    id: string; number: string; status: string; saleDate: Date
    total: number; amountPaid: number; discount: number; currencyCode: string
    itemCount: number; note: string | null
    client: { id: string; name: string; phone: string | null } | null
    payments: { method: string; amount: number }[]
}
type Props = {
    orgSlug: string; currency: string
    initialSales: Sale[]
    stats: { todayCount: number; todayTotal: number; totalCount: number; totalRevenue: number }
}

const fmtN = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
const fmt = (n: number, cur: string) => `${fmtN(n)} ${cur}`
const fmtDate = (d: Date) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
const fmtTime = (d: Date) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
    COMPLETED: { label: "Complétée", dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    CANCELLED: { label: "Annulée", dot: "bg-zinc-400", bg: "bg-zinc-100", text: "text-zinc-400", border: "border-zinc-200" },
    REFUNDED: { label: "Remboursée", dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    PARTIAL_REFUND: { label: "Rem. partiel", dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    ON_HOLD: { label: "En attente", dot: "bg-violet-500", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
}

const PAYMENT_ICONS: Record<string, string> = {
    CASH: "💵", MOBILE_MONEY: "📱", CARD: "💳", CREDIT: "📒", BANK_TRANSFER: "🏦", OTHER: "💰",
}

function SaleStatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.COMPLETED!
    return (
        <Badge variant="outline" className={`rounded-full text-xs flex items-center gap-1 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </Badge>
    )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function SalesClient({ orgSlug, currency, initialSales, stats }: Props) {
    const router = useRouter()

    const [sales, setSales] = useState<Sale[]>(initialSales)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("ALL")

    const displayed = sales.filter(s => {
        if (statusFilter !== "ALL" && s.status !== statusFilter) return false
        if (search) {
            const q = search.toLowerCase()
            return s.number.toLowerCase().includes(q) ||
                s.client?.name.toLowerCase().includes(q) ||
                s.client?.phone?.includes(q) || false
        }
        return true
    })

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold">Ventes</h1>
                    <p className="text-sm text-zinc-500 mt-0.5">{sales.length} vente{sales.length > 1 ? "s" : ""}</p>
                </div>
                <Button onClick={() => router.push(`/${orgSlug}/pos`)} className="gap-2">
                    <ShoppingCart className="w-4 h-4" /> Nouvelle vente
                </Button>
            </div>

            {/* ── Stats du jour ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: "Ventes aujourd'hui", value: fmtN(stats.todayCount), sub: "transactions", icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-50" },
                    { label: "CA aujourd'hui", value: fmt(stats.todayTotal, currency), sub: "encaissé", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Total ventes", value: fmtN(stats.totalCount), sub: "toutes périodes", icon: Package, color: "text-violet-600", bg: "bg-violet-50" },
                    { label: "CA total", value: fmt(stats.totalRevenue, currency), sub: "cumulé", icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50" },
                ].map((stat, i) => (
                    <Card key={i} className="rounded-2xl">
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs text-zinc-500 font-medium">{stat.label}</p>
                                    <p className="text-xl font-black text-zinc-900 mt-1 tabular-nums leading-tight">{stat.value}</p>
                                    <p className="text-xs text-zinc-400 mt-0.5">{stat.sub}</p>
                                </div>
                                <div className={`h-9 w-9 rounded-xl ${stat.bg} flex items-center justify-center shrink-0`}>
                                    <stat.icon className={`w-4.5 h-4.5 ${stat.color}`} size={18} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* ── Filtres ─────────────────────────────────────────────────── */}
            <Card className="rounded-2xl">
                <CardContent className="p-4 grid sm:grid-cols-2 gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <Input className="pl-9" placeholder="N° vente, client, téléphone…"
                            value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Tous les statuts</SelectItem>
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* ── Tableau desktop ─────────────────────────────────────────── */}
            <div className="hidden md:block">
                <div className="rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-white border-b border-zinc-200">
                                <th className="text-left py-4 pl-6 text-xs font-semibold uppercase tracking-wider text-zinc-500">Vente</th>
                                <th className="text-left py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-40">Client</th>
                                <th className="text-left py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-32">Paiement</th>
                                <th className="text-center py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-20">Articles</th>
                                <th className="text-right py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-36">Total</th>
                                <th className="text-center py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-32">Statut</th>
                                <th className="py-4 pr-4 w-12" />
                            </tr>
                        </thead>
                        <tbody>
                            {displayed.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center text-zinc-400 text-sm">
                                        <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                        Aucune vente trouvée
                                    </td>
                                </tr>
                            ) : displayed.map(s => (
                                <tr key={s.id}
                                    className="group border-b border-zinc-100 hover:bg-blue-50/40 transition-colors cursor-pointer"
                                    onClick={() => router.push(`/${orgSlug}/sales/${s.id}`)}>

                                    {/* Vente */}
                                    <td className="py-4 pl-6">
                                        <p className="font-mono font-semibold text-zinc-900 text-sm">{s.number}</p>
                                        <p className="text-xs text-zinc-400 mt-0.5">{fmtDate(s.saleDate)} · {fmtTime(s.saleDate)}</p>
                                    </td>

                                    {/* Client */}
                                    <td className="py-4">
                                        {s.client ? (
                                            <div>
                                                <p className="text-sm font-medium text-zinc-800">{s.client.name}</p>
                                                {s.client.phone && <p className="text-xs text-zinc-400">{s.client.phone}</p>}
                                            </div>
                                        ) : <span className="text-zinc-300 text-xs">Anonyme</span>}
                                    </td>

                                    {/* Paiement */}
                                    <td className="py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {s.payments.map((p, i) => (
                                                <span key={i} className="text-lg" title={p.method}>{PAYMENT_ICONS[p.method] ?? "💰"}</span>
                                            ))}
                                        </div>
                                    </td>

                                    {/* Articles */}
                                    <td className="py-4 text-center">
                                        <span className="text-sm font-medium text-zinc-700">{s.itemCount}</span>
                                    </td>

                                    {/* Total */}
                                    <td className="py-4 text-right">
                                        <p className="text-sm font-bold text-zinc-900 tabular-nums">{fmt(s.total, currency)}</p>
                                        {s.discount > 0 && <p className="text-xs text-zinc-400 tabular-nums">Remise : {fmt(s.discount, currency)}</p>}
                                    </td>

                                    {/* Statut */}
                                    <td className="py-4 text-center" onClick={e => e.stopPropagation()}>
                                        <SaleStatusBadge status={s.status} />
                                    </td>

                                    {/* Actions */}
                                    <td className="py-4 pr-4 text-right" onClick={e => e.stopPropagation()}>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuItem onClick={() => router.push(`/${orgSlug}/sales/${s.id}`)} className="gap-2 cursor-pointer">
                                                    <Eye className="w-4 h-4 text-blue-500" /> Voir le détail
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => router.push(`/${orgSlug}/sales/${s.id}?tab=ticket`)} className="gap-2 cursor-pointer">
                                                    🧾 Ticket / Reçu
                                                </DropdownMenuItem>
                                                {s.status === "COMPLETED" && (
                                                    <DropdownMenuItem onClick={() => router.push(`/${orgSlug}/sales/${s.id}?tab=invoice`)} className="gap-2 cursor-pointer">
                                                        <FileText className="w-4 h-4 text-violet-500" /> Générer facture
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Cards mobile ────────────────────────────────────────────── */}
            <div className="md:hidden space-y-3">
                {displayed.length === 0 ? (
                    <div className="py-12 text-center text-zinc-400">
                        <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">Aucune vente trouvée</p>
                    </div>
                ) : displayed.map(s => (
                    <Card key={s.id} className="rounded-2xl shadow-sm active:scale-[0.99] transition-all cursor-pointer"
                        onClick={() => router.push(`/${orgSlug}/sales/${s.id}`)}>
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-mono font-bold text-zinc-900 text-sm">{s.number}</p>
                                        <SaleStatusBadge status={s.status} />
                                    </div>
                                    <p className="text-xs text-zinc-400 mt-0.5">{fmtDate(s.saleDate)} · {fmtTime(s.saleDate)}</p>
                                    {s.client && <p className="text-sm text-zinc-700 font-medium mt-1">{s.client.name}</p>}
                                </div>
                                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreHorizontal className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48">
                                            <DropdownMenuItem onClick={() => router.push(`/${orgSlug}/sales/${s.id}`)} className="gap-2 cursor-pointer">
                                                <Eye className="w-4 h-4 text-blue-500" /> Voir le détail
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => router.push(`/${orgSlug}/sales/${s.id}?tab=ticket`)} className="gap-2 cursor-pointer">
                                                🧾 Ticket / Reçu
                                            </DropdownMenuItem>
                                            {s.status === "COMPLETED" && (
                                                <DropdownMenuItem onClick={() => router.push(`/${orgSlug}/sales/${s.id}?tab=invoice`)} className="gap-2 cursor-pointer">
                                                    <FileText className="w-4 h-4 text-violet-500" /> Générer facture
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-100">
                                <div className="flex items-center gap-2">
                                    {s.payments.map((p, i) => (
                                        <span key={i} className="text-base" title={p.method}>{PAYMENT_ICONS[p.method] ?? "💰"}</span>
                                    ))}
                                    <span className="text-xs text-zinc-400">{s.itemCount} article{s.itemCount > 1 ? "s" : ""}</span>
                                </div>
                                <p className="font-black text-zinc-900 tabular-nums">{fmt(s.total, currency)}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}