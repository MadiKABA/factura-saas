// src/app/(dashboard)/[orgSlug]/quotes/page.tsx
"use client"
import { useState, useEffect, useTransition } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { MoreHorizontal, Eye, RefreshCw, Share2, Loader2, Plus, FileDown, Trash2, ArrowRightLeft } from "lucide-react"
import { getQuotesAction, updateQuoteStatusAction, deleteQuoteAction, convertQuoteToInvoiceAction } from "@/server/actions/quote.action"

type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED"
type Quote = {
    id: string; number: string; clientName: string | null
    status: string; total: number; issueDate: Date; expiryDate: Date | null; currencyCode: string
}

const STATUSES = ["ALL", "DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const
const ITEMS_PER_PAGE = 10

function statusConfig(status: string) {
    switch (status) {
        case "ACCEPTED": return { label: "Accepté", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold" }
        case "SENT": return { label: "Envoyé", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200 font-semibold" }
        case "DRAFT": return { label: "Brouillon", dot: "bg-zinc-400", badge: "bg-zinc-100 text-zinc-500 border-zinc-200" }
        case "REJECTED": return { label: "Refusé", dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200 font-semibold" }
        case "EXPIRED": return { label: "Expiré", dot: "bg-orange-400", badge: "bg-orange-50 text-orange-600 border-orange-200 font-semibold" }
        default: return { label: status, dot: "bg-zinc-400", badge: "bg-zinc-100 text-zinc-500 border-zinc-200" }
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

const fmtDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"

const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)

// ═════════════════════════════════════════════════════════════════════════════
export default function QuoteListPage() {
    const router = useRouter()
    const params = useParams()
    const orgSlug = params.orgSlug as string

    const [statusFilter, setStatusFilter] = useState("ALL")
    const [clientFilter, setClientFilter] = useState("")
    const [fromDate, setFromDate] = useState("")
    const [toDate, setToDate] = useState("")
    const [page, setPage] = useState(1)

    const [quotes, setQuotes] = useState<Quote[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [isPending, startTransition] = useTransition()

    const [statusModal, setStatusModal] = useState<{ quoteId: string; current: string; number: string } | null>(null)
    const [newStatus, setNewStatus] = useState<QuoteStatus | "">("")
    const [statusError, setStatusError] = useState<string | null>(null)
    const [deleteModal, setDeleteModal] = useState<{ quoteId: string; number: string } | null>(null)
    const [convertModal, setConvertModal] = useState<{ quoteId: string; number: string } | null>(null)
    const [convertError, setConvertError] = useState<string | null>(null)
    const [shareToast, setShareToast] = useState(false)

    useEffect(() => {
        setLoading(true)
        getQuotesAction(orgSlug, {
            status: statusFilter === "ALL" ? undefined : statusFilter as QuoteStatus,
            search: clientFilter || undefined,
            page, pageSize: ITEMS_PER_PAGE,
        }).then(result => {
            if (result.success) {
                setQuotes(result.data.quotes as Quote[])
                setTotalCount(result.data.total)
            }
            setLoading(false)
        })
    }, [orgSlug, statusFilter, clientFilter, page])

    useEffect(() => { setPage(1) }, [statusFilter, clientFilter, fromDate, toDate])

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

    const displayed = quotes.filter(q => {
        const d = q.issueDate ? new Date(q.issueDate).toISOString().split("T")[0] : ""
        if (fromDate && d < fromDate) return false
        if (toDate && d > toDate) return false
        return true
    })

    function handleUpdateStatus() {
        if (!statusModal || !newStatus) return
        setStatusError(null)
        startTransition(async () => {
            const result = await updateQuoteStatusAction(orgSlug, statusModal.quoteId, newStatus)
            if (!result.success) { setStatusError(result.error); return }
            setQuotes(prev => prev.map(q => q.id === statusModal.quoteId ? { ...q, status: newStatus } : q))
            setStatusModal(null)
        })
    }

    function handleDelete() {
        if (!deleteModal) return
        startTransition(async () => {
            const result = await deleteQuoteAction(orgSlug, deleteModal.quoteId)
            if (!result.success) return
            setQuotes(prev => prev.filter(q => q.id !== deleteModal.quoteId))
            setDeleteModal(null)
        })
    }

    function handleConvert() {
        if (!convertModal) return
        setConvertError(null)
        startTransition(async () => {
            const result = await convertQuoteToInvoiceAction(orgSlug, convertModal.quoteId)
            if (!result.success) { setConvertError(result.error); return }
            setConvertModal(null)
            router.push(`/${orgSlug}/invoices/${result.data.invoiceId}`)
        })
    }

    function handleShare(q: Quote) {
        navigator.clipboard.writeText(`${window.location.origin}/${orgSlug}/quotes/${q.id}`)
        setShareToast(true)
        setTimeout(() => setShareToast(false), 2500)
    }

    const ActionsMenu = ({ q }: { q: Quote }) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="w-4 h-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => router.push(`/${orgSlug}/quotes/${q.id}`)} className="gap-2 cursor-pointer">
                    <Eye className="w-4 h-4 text-blue-500" /> Voir le devis
                </DropdownMenuItem>

                {/* Convertir en facture */}
                {(q.status === "SENT" || q.status === "ACCEPTED") && (
                    <DropdownMenuItem onClick={() => { setConvertModal({ quoteId: q.id, number: q.number }); setConvertError(null) }} className="gap-2 cursor-pointer">
                        <ArrowRightLeft className="w-4 h-4 text-violet-500" /> Convertir en facture
                    </DropdownMenuItem>
                )}

                {allowedTransitions(q.status).length > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => { setStatusModal({ quoteId: q.id, current: q.status, number: q.number }); setNewStatus(""); setStatusError(null) }} className="gap-2 cursor-pointer">
                            <RefreshCw className="w-4 h-4 text-amber-500" /> Changer le statut
                        </DropdownMenuItem>
                    </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleShare(q)} className="gap-2 cursor-pointer">
                    <Share2 className="w-4 h-4 text-zinc-400" /> Copier le lien
                </DropdownMenuItem>

                {q.status === "DRAFT" && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeleteModal({ quoteId: q.id, number: q.number })} className="gap-2 cursor-pointer text-red-600 focus:text-red-600">
                            <Trash2 className="w-4 h-4" /> Supprimer
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">

            {/* ── Header ───────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold">Devis</h1>
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="gap-2 hidden sm:flex">
                        <FileDown className="w-4 h-4" /> Exporter
                    </Button>
                    <Button onClick={() => router.push(`/${orgSlug}/quotes/new`)} className="gap-2">
                        <Plus className="w-4 h-4" /> Nouveau devis
                    </Button>
                </div>
            </div>

            {/* ── Filtres ───────────────────────────────────────────────────────── */}
            <Card className="rounded-2xl p-4 mb-6">
                <CardContent className="grid md:grid-cols-4 gap-4">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
                        <SelectContent>
                            {STATUSES.map(s => (
                                <SelectItem key={s} value={s}>
                                    <span className="flex items-center gap-2">
                                        {s !== "ALL" && <span className={`h-2 w-2 rounded-full ${statusConfig(s).dot}`} />}
                                        {s === "ALL" ? "Tous" : statusConfig(s).label}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input placeholder="Rechercher client" value={clientFilter} onChange={e => setClientFilter(e.target.value)} />
                    <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                    <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                </CardContent>
            </Card>

            {/* ── Tableau desktop ───────────────────────────────────────────────── */}
            <div className="hidden md:block">
                <div className="rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-white border-b border-zinc-200 hover:bg-white">
                                <TableHead className="py-4 pl-6 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-[160px]">Numéro</TableHead>
                                <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Client</TableHead>
                                <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-[130px]">Date</TableHead>
                                <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-[130px]">Expiration</TableHead>
                                <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-[120px]">Statut</TableHead>
                                <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 text-right w-[150px]">Total</TableHead>
                                <TableHead className="py-4 pr-4 w-[52px]" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                                    <Loader2 className="inline w-5 h-5 animate-spin mr-2" />Chargement…
                                </TableCell></TableRow>
                            ) : displayed.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="py-16 text-center text-zinc-400 text-sm">Aucun devis trouvé</TableCell></TableRow>
                            ) : displayed.map((q, i) => {
                                const sc = statusConfig(q.status)
                                const isExpiring = q.expiryDate && q.status === "SENT" &&
                                    new Date(q.expiryDate) < new Date(Date.now() + 3 * 86400000)
                                return (
                                    <TableRow key={q.id} className="group cursor-pointer border-b border-zinc-200 hover:bg-blue-50/40 transition-colors"
                                        onClick={() => router.push(`/${orgSlug}/quotes/${q.id}`)}>
                                        <TableCell className="pl-6 py-4">
                                            <span className="font-mono text-sm font-semibold text-zinc-800">{q.number}</span>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex items-center gap-2.5">
                                                <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-violet-100 to-pink-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                                                    {(q.clientName ?? "?").charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-sm font-medium text-zinc-800">{q.clientName ?? "—"}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <span className="text-sm text-zinc-500">{fmtDate(q.issueDate)}</span>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            {q.expiryDate ? (
                                                <span className={`text-sm ${isExpiring ? "text-orange-600 font-medium" : "text-zinc-500"}`}>
                                                    {isExpiring && "⚠️ "}{fmtDate(q.expiryDate)}
                                                </span>
                                            ) : <span className="text-zinc-300 text-sm">—</span>}
                                        </TableCell>
                                        <TableCell className="py-4" onClick={e => e.stopPropagation()}>
                                            <Badge variant="outline" className={`text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1.5 w-fit ${sc.badge}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                                {sc.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-4 text-right">
                                            <span className="text-sm font-bold text-zinc-900 tabular-nums">
                                                {fmt(q.total)} {q.currencyCode}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-4 pr-4 text-right" onClick={e => e.stopPropagation()}>
                                            <ActionsMenu q={q} />
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* ── Cards mobile ──────────────────────────────────────────────────── */}
            <div className="md:hidden space-y-3">
                {loading ? (
                    <div className="py-12 text-center text-muted-foreground">
                        <Loader2 className="inline w-5 h-5 animate-spin mr-2" />Chargement…
                    </div>
                ) : displayed.length === 0 ? (
                    <div className="py-12 text-center text-zinc-400 text-sm">Aucun devis trouvé</div>
                ) : displayed.map(q => {
                    const sc = statusConfig(q.status)
                    const isExpiring = q.expiryDate && q.status === "SENT" &&
                        new Date(q.expiryDate) < new Date(Date.now() + 3 * 86400000)
                    return (
                        <Card key={q.id} className="rounded-2xl p-4 shadow-sm active:scale-[0.99] transition-all"
                            onClick={() => router.push(`/${orgSlug}/quotes/${q.id}`)}>
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-sm font-bold text-zinc-800">{q.number}</span>
                                        {isExpiring && <span className="text-xs text-orange-500">⚠️ Expire bientôt</span>}
                                    </div>
                                    <p className="text-sm text-zinc-500 mt-0.5 truncate">{q.clientName ?? "—"}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                                    <Badge variant="outline" className={`text-xs rounded-full flex items-center gap-1.5 ${sc.badge}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                        {sc.label}
                                    </Badge>
                                    <ActionsMenu q={q} />
                                </div>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-100">
                                <span className="text-xs text-zinc-400">{fmtDate(q.issueDate)}{q.expiryDate ? ` → ${fmtDate(q.expiryDate)}` : ""}</span>
                                <span className="font-bold text-zinc-900 text-sm tabular-nums">{fmt(q.total)} {q.currencyCode}</span>
                            </div>
                        </Card>
                    )
                })}
            </div>

            {/* ── Pagination ────────────────────────────────────────────────────── */}
            <div className="mt-6 flex justify-center">
                <Pagination>
                    <PaginationContent>
                        {Array.from({ length: totalPages }).map((_, i) => (
                            <PaginationItem key={i}>
                                <PaginationLink isActive={page === i + 1} onClick={() => setPage(i + 1)} style={{ cursor: "pointer" }}>
                                    {i + 1}
                                </PaginationLink>
                            </PaginationItem>
                        ))}
                    </PaginationContent>
                </Pagination>
            </div>

            {/* ── Modal statut ──────────────────────────────────────────────────── */}
            <Dialog open={!!statusModal} onOpenChange={open => !open && setStatusModal(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Changer le statut — {statusModal?.number}</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-zinc-500">
                            Statut actuel :{" "}
                            <Badge variant="outline" className={`rounded-full ml-1 ${statusConfig(statusModal?.current ?? "").badge}`}>
                                {statusConfig(statusModal?.current ?? "").label}
                            </Badge>
                        </p>
                        <Select value={newStatus} onValueChange={v => setNewStatus(v as QuoteStatus)}>
                            <SelectTrigger><SelectValue placeholder="Nouveau statut…" /></SelectTrigger>
                            <SelectContent>
                                {allowedTransitions(statusModal?.current ?? "").map(s => (
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
                        <Button variant="outline" onClick={() => setStatusModal(null)}>Annuler</Button>
                        <Button onClick={handleUpdateStatus} disabled={!newStatus || isPending}>
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Modal suppression ─────────────────────────────────────────────── */}
            <Dialog open={!!deleteModal} onOpenChange={open => !open && setDeleteModal(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Supprimer {deleteModal?.number} ?</DialogTitle></DialogHeader>
                    <p className="text-sm text-zinc-500 py-2">Cette action est irréversible. Le devis sera définitivement supprimé.</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteModal(null)}>Annuler</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Supprimer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Modal conversion ──────────────────────────────────────────────── */}
            <Dialog open={!!convertModal} onOpenChange={open => !open && setConvertModal(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Convertir en facture — {convertModal?.number}</DialogTitle></DialogHeader>
                    <div className="py-2 space-y-3">
                        <p className="text-sm text-zinc-600">
                            Une nouvelle facture sera créée à partir de ce devis. Le devis passera au statut <strong>Accepté</strong>.
                        </p>
                        <div className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3 text-sm text-violet-700">
                            ✓ Toutes les lignes, le client et les montants seront copiés automatiquement.
                        </div>
                        {convertError && <p className="text-sm text-red-600">⚠️ {convertError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConvertModal(null)}>Annuler</Button>
                        <Button onClick={handleConvert} disabled={isPending} className="gap-2 bg-violet-600 hover:bg-violet-700">
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowRightLeft className="w-4 h-4" /> Convertir</>}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Toast ─────────────────────────────────────────────────────────── */}
            {shareToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-zinc-900 text-white px-5 py-3 text-sm shadow-xl z-50 flex items-center gap-2">
                    <Share2 className="w-4 h-4" /> Lien copié
                </div>
            )}
        </div>
    )
}