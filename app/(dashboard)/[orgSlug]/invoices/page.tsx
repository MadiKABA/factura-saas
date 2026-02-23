"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MoreHorizontal, Eye, RefreshCw, Share2, Loader2, Plus, FileDown } from "lucide-react";
import { getInvoicesAction, updateInvoiceStatusAction } from "@/server/actions/invoice.action";

// ─── Types ────────────────────────────────────────────────────────────────────
type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "PARTIAL" | "OVERDUE" | "CANCELLED";
type Invoice = {
    id: string; number: string; clientName: string | null;
    status: string; total: number; issueDate: Date; dueDate: Date | null; currencyCode: string;
};

const STATUSES = ["ALL", "DRAFT", "SENT", "PAID", "PARTIAL", "OVERDUE", "CANCELLED"] as const;
const ITEMS_PER_PAGE = 10;

function statusBadgeClass(status: string): string {
    switch (status) {
        case "PAID": return "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold";
        case "SENT": return "bg-blue-50 text-blue-700 border-blue-200 font-semibold";
        case "DRAFT": return "bg-zinc-100 text-zinc-500 border-zinc-200";
        case "PARTIAL": return "bg-amber-50 text-amber-700 border-amber-200 font-semibold";
        case "OVERDUE": return "bg-red-50 text-red-700 border-red-200 font-semibold";
        case "CANCELLED": return "bg-red-50 text-red-300 border-red-100 line-through";
        default: return "bg-zinc-100 text-zinc-500 border-zinc-200";
    }
}

function statusDot(status: string): string {
    switch (status) {
        case "PAID": return "bg-emerald-500";
        case "SENT": return "bg-blue-500";
        case "DRAFT": return "bg-zinc-400";
        case "PARTIAL": return "bg-amber-500";
        case "OVERDUE": return "bg-red-500";
        case "CANCELLED": return "bg-red-300";
        default: return "bg-zinc-400";
    }
}

function statusLabel(status: string): string {
    const labels: Record<string, string> = {
        ALL: "Tous", DRAFT: "Brouillon", SENT: "Envoyée",
        PAID: "Payée", PARTIAL: "Partiel", OVERDUE: "En retard", CANCELLED: "Annulée",
    };
    return labels[status] ?? status;
}

function allowedTransitions(current: string): InvoiceStatus[] {
    switch (current) {
        case "DRAFT": return ["SENT", "CANCELLED"];
        case "SENT": return ["PAID", "PARTIAL", "OVERDUE", "CANCELLED"];
        case "PARTIAL": return ["PAID", "OVERDUE", "CANCELLED"];
        case "OVERDUE": return ["PAID", "PARTIAL", "CANCELLED"];
        default: return [];
    }
}

function fmtDate(d: Date | string | null): string {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(n: number, currency: string): string {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " " + currency;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function InvoiceListPage() {
    const router = useRouter();
    const params = useParams();
    const orgSlug = params.orgSlug as string;

    const [statusFilter, setStatusFilter] = useState("ALL");
    const [clientFilter, setClientFilter] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [page, setPage] = useState(1);

    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    const [statusModal, setStatusModal] = useState<{ invoiceId: string; current: string; number: string } | null>(null);
    const [newStatus, setNewStatus] = useState<InvoiceStatus | "">("");
    const [statusError, setStatusError] = useState<string | null>(null);
    const [shareToast, setShareToast] = useState(false);
    const [exportingId, setExportingId] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        getInvoicesAction(orgSlug, {
            status: statusFilter === "ALL" ? undefined : statusFilter as InvoiceStatus,
            search: clientFilter || undefined,
            page,
            pageSize: ITEMS_PER_PAGE,
        }).then(result => {
            if (result.success) {
                setInvoices(result.data.invoices as Invoice[]);
                setTotalCount(result.data.total);
            }
            setLoading(false);
        });
    }, [orgSlug, statusFilter, clientFilter, page]);

    useEffect(() => { setPage(1); }, [statusFilter, clientFilter, fromDate, toDate]);

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    const displayed = invoices.filter(inv => {
        const d = inv.issueDate ? new Date(inv.issueDate).toISOString().split("T")[0] : "";
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
    });

    function handleView(id: string) { router.push(`/${orgSlug}/invoices/${id}`); }
    function handleNew() { router.push(`/${orgSlug}/invoices/new`); }

    async function handleExportPdf(inv: Invoice) {
        setExportingId(inv.id);
        // TODO: appeler une action qui génère le PDF et retourne l'URL
        await new Promise(r => setTimeout(r, 1200));
        setExportingId(null);
        // window.open(pdfUrl, "_blank");
    }

    function openStatusModal(inv: Invoice) {
        setStatusModal({ invoiceId: inv.id, current: inv.status, number: inv.number });
        setNewStatus(""); setStatusError(null);
    }

    function handleUpdateStatus() {
        if (!statusModal || !newStatus) return;
        setStatusError(null);
        startTransition(async () => {
            const result = await updateInvoiceStatusAction(orgSlug, statusModal.invoiceId, newStatus);
            if (!result.success) { setStatusError(result.error); return; }
            setInvoices(prev => prev.map(inv =>
                inv.id === statusModal.invoiceId ? { ...inv, status: newStatus } : inv
            ));
            setStatusModal(null);
        });
    }

    function handleShare(inv: Invoice) {
        const url = `${window.location.origin}/${orgSlug}/invoices/${inv.id}`;
        navigator.clipboard.writeText(url).then(() => {
            setShareToast(true);
            setTimeout(() => setShareToast(false), 2500);
        });
    }

    const ActionsMenu = ({ inv }: { inv: Invoice }) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 ">
                    <MoreHorizontal className="w-4 h-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => handleView(inv.id)} className="gap-2 cursor-pointer">
                    <Eye className="w-4 h-4 text-blue-500" /> Voir la facture
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => handleExportPdf(inv)}
                    className="gap-2 cursor-pointer"
                    disabled={exportingId === inv.id}
                >
                    {exportingId === inv.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <FileDown className="w-4 h-4 text-violet-500" />
                    }
                    Exporter en PDF
                </DropdownMenuItem>
                {allowedTransitions(inv.status).length > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openStatusModal(inv)} className="gap-2 cursor-pointer">
                            <RefreshCw className="w-4 h-4 text-amber-500" /> Changer le statut
                        </DropdownMenuItem>
                    </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleShare(inv)} className="gap-2 cursor-pointer">
                    <Share2 className="w-4 h-4 text-gray-500" /> Copier le lien
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">

            {/* ── Header avec boutons ──────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold">Factures</h1>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        className="gap-2 hidden sm:flex"
                        onClick={() => {/* TODO: export global */ }}
                    >
                        <FileDown className="w-4 h-4" />
                        Exporter PDF
                    </Button>
                    <Button onClick={handleNew} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Nouvelle facture
                    </Button>
                </div>
            </div>

            {/* ── Filtres (identiques à l'original) ───────────────────────────── */}
            <Card className="rounded-2xl p-4 mb-6">
                <CardContent className="grid md:grid-cols-4 gap-4">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
                        <SelectContent>
                            {STATUSES.map(s => (
                                <SelectItem key={s} value={s}>
                                    <span className="flex items-center gap-2">
                                        {s !== "ALL" && <span className={`h-2 w-2 rounded-full ${statusDot(s)}`} />}
                                        {statusLabel(s)}
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

            {/* ── Tableau desktop — design amélioré ───────────────────────────── */}
            <div className="hidden md:block">
                <div className="rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-white border-b border-zinc-200 hover:bg-white">
                                <TableHead className="py-4 pl-6 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-[160px]">
                                    Numéro
                                </TableHead>
                                <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    Client
                                </TableHead>
                                <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-[130px]">
                                    Date
                                </TableHead>
                                <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-[120px]">
                                    Échéance
                                </TableHead>
                                <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-[120px]">
                                    Statut
                                </TableHead>
                                <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 text-right w-[150px]">
                                    Total
                                </TableHead>
                                <TableHead className="py-4 pr-4 w-[52px]" />
                            </TableRow>
                        </TableHeader>
                        <TableBody className="bg-white/70">
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                                        <Loader2 className="inline w-5 h-5 animate-spin mr-2" />Chargement…
                                    </TableCell>
                                </TableRow>
                            ) : displayed.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-16 text-center">
                                        <p className="text-zinc-400 text-sm">Aucune facture trouvée</p>
                                    </TableCell>
                                </TableRow>
                            ) : displayed.map((inv, i) => (
                                <TableRow
                                    key={inv.id}
                                    className=" group cursor-pointer border-b border-zinc-200 hover:bg-blue-50/40 transition-colors"
                                    onClick={() => handleView(inv.id)}
                                    style={{ animationDelay: `${i * 30}ms` }}
                                >
                                    {/* Numéro */}
                                    <TableCell className="pl-6 py-4">
                                        <span className="font-mono text-sm font-semibold text-zinc-800">{inv.number}</span>
                                    </TableCell>

                                    {/* Client */}
                                    <TableCell className="py-4">
                                        <div className="flex items-center gap-2.5">
                                            <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                                                {(inv.clientName ?? "?").charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-sm font-medium text-zinc-800">{inv.clientName ?? "—"}</span>
                                        </div>
                                    </TableCell>

                                    {/* Date */}
                                    <TableCell className="py-4">
                                        <span className="text-sm text-zinc-500">{fmtDate(inv.issueDate)}</span>
                                    </TableCell>

                                    {/* Échéance */}
                                    <TableCell className="py-4">
                                        {inv.dueDate ? (
                                            <span className={`text-sm ${inv.status === "OVERDUE" ? "text-red-600 font-medium" : "text-zinc-500"}`}>
                                                {fmtDate(inv.dueDate)}
                                            </span>
                                        ) : (
                                            <span className="text-zinc-300 text-sm">—</span>
                                        )}
                                    </TableCell>

                                    {/* Statut */}
                                    <TableCell className="py-4" onClick={e => e.stopPropagation()}>
                                        <Badge variant="outline" className={`text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1.5 w-fit ${statusBadgeClass(inv.status)}`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${statusDot(inv.status)}`} />
                                            {statusLabel(inv.status)}
                                        </Badge>
                                    </TableCell>

                                    {/* Total */}
                                    <TableCell className="py-4 text-right">
                                        <span className="text-sm font-bold text-zinc-900 tabular-nums">
                                            {fmtAmount(inv.total, inv.currencyCode)}
                                        </span>
                                    </TableCell>

                                    {/* Actions */}
                                    <TableCell className="py-4 pr-4 text-right" onClick={e => e.stopPropagation()}>
                                        <ActionsMenu inv={inv} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* ── Cards mobile (identiques à l'original + actions) ────────────── */}
            <div className="md:hidden space-y-4">
                {loading ? (
                    <div className="py-12 text-center text-muted-foreground">
                        <Loader2 className="inline w-5 h-5 animate-spin mr-2" />Chargement…
                    </div>
                ) : displayed.length === 0 ? (
                    <div className="py-12 text-center text-zinc-400 text-sm">Aucune facture trouvée</div>
                ) : displayed.map(inv => (
                    <Card key={inv.id} className="rounded-2xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => handleView(inv.id)}>
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-semibold font-mono text-sm">{inv.number}</p>
                                <p className="text-sm text-muted-foreground">{inv.clientName ?? "—"}</p>
                            </div>
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <Badge variant="outline" className={`text-xs rounded-full flex items-center gap-1.5 ${statusBadgeClass(inv.status)}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${statusDot(inv.status)}`} />
                                    {statusLabel(inv.status)}
                                </Badge>
                                <ActionsMenu inv={inv} />
                            </div>
                        </div>
                        <div className="flex justify-between mt-2 text-sm">
                            <span className="text-zinc-500">{fmtDate(inv.issueDate)}</span>
                            <span className="font-bold">{fmtAmount(inv.total, inv.currencyCode)}</span>
                        </div>
                    </Card>
                ))}
            </div>

            {/* ── Pagination ───────────────────────────────────────────────────── */}
            <div className="mt-6 flex justify-center">
                <Pagination>
                    <PaginationContent>
                        {Array.from({ length: totalPages }).map((_, i) => (
                            <PaginationItem key={i}>
                                <PaginationLink
                                    isActive={page === i + 1}
                                    onClick={() => setPage(i + 1)}
                                    style={{ cursor: "pointer" }}
                                >
                                    {i + 1}
                                </PaginationLink>
                            </PaginationItem>
                        ))}
                    </PaginationContent>
                </Pagination>
            </div>

            {/* ── Modal statut ─────────────────────────────────────────────────── */}
            <Dialog open={!!statusModal} onOpenChange={open => !open && setStatusModal(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Changer le statut — {statusModal?.number}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">
                            Statut actuel :{" "}
                            <Badge variant="outline" className={`rounded-full ${statusBadgeClass(statusModal?.current ?? "")}`}>
                                {statusLabel(statusModal?.current ?? "")}
                            </Badge>
                        </p>
                        <Select value={newStatus} onValueChange={v => setNewStatus(v as InvoiceStatus)}>
                            <SelectTrigger><SelectValue placeholder="Choisir le nouveau statut" /></SelectTrigger>
                            <SelectContent>
                                {allowedTransitions(statusModal?.current ?? "").map(s => (
                                    <SelectItem key={s} value={s}>
                                        <span className="flex items-center gap-2">
                                            <span className={`h-2 w-2 rounded-full ${statusDot(s)}`} />
                                            {statusLabel(s)}
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

            {/* ── Toast share ──────────────────────────────────────────────────── */}
            {shareToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-zinc-900 text-white px-5 py-3 text-sm shadow-xl z-50 flex items-center gap-2">
                    <Share2 className="w-4 h-4" /> Lien copié dans le presse-papiers
                </div>
            )}
        </div>
    );
}