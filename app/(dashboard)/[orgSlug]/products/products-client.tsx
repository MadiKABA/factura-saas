// src/app/(dashboard)/[orgSlug]/products/products-client.tsx
"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Plus, Search, MoreHorizontal, Pencil, Trash2, Package,
    Loader2, AlertTriangle, Tag,
} from "lucide-react"
import { deleteProductAction } from "@/server/actions/product.action"

// ─── Types ────────────────────────────────────────────────────────────────────
type Product = {
    id: string; name: string; description: string | null
    sku: string | null; barcode: string | null
    price: number; costPrice: number | null; isService: boolean
    currentStock: number; minStockAlert: number | null; unit: string | null
    category: { id: string; name: string; color: string | null; icon: string | null } | null
}
type Category = { id: string; name: string; color: string | null; icon: string | null }
type Props = {
    orgSlug: string; currency: string
    initialProducts: Product[]; categories: Category[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtN = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
const fmt = (n: number, cur: string) => `${fmtN(n)} ${cur}`

function StockBadge({ p }: { p: Product }) {
    if (p.isService)
        return <Badge variant="outline" className="rounded-full text-xs bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />Service</Badge>
    if (p.currentStock <= 0)
        return <Badge variant="outline" className="rounded-full text-xs bg-red-50 text-red-700 border-red-200 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />Rupture</Badge>
    if (p.minStockAlert !== null && p.currentStock <= p.minStockAlert)
        return <Badge variant="outline" className="rounded-full text-xs bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Stock bas</Badge>
    return <Badge variant="outline" className="rounded-full text-xs bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />En stock</Badge>
}

// ═════════════════════════════════════════════════════════════════════════════
export default function ProductsClient({ orgSlug, currency, initialProducts, categories }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const [products, setProducts] = useState<Product[]>(initialProducts)
    const [search, setSearch] = useState("")
    const [catFilter, setCatFilter] = useState("")
    const [typeFilter, setTypeFilter] = useState<"all" | "product" | "service">("all")
    const [deleteModal, setDeleteModal] = useState<Product | null>(null)
    const [deleteError, setDeleteError] = useState<string | null>(null)

    // ─── Filtres ────────────────────────────────────────────────────────────────
    const displayed = products.filter(p => {
        if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
            !p.sku?.toLowerCase().includes(search.toLowerCase())) return false
        if (catFilter && p.category?.id !== catFilter) return false
        if (typeFilter === "product" && p.isService) return false
        if (typeFilter === "service" && !p.isService) return false
        return true
    })

    const lowStockCount = products.filter(p =>
        !p.isService && p.minStockAlert !== null && p.currentStock <= p.minStockAlert
    ).length

    // ─── Suppression ────────────────────────────────────────────────────────────
    function handleDelete() {
        if (!deleteModal) return
        setDeleteError(null)
        startTransition(async () => {
            const result = await deleteProductAction(orgSlug, deleteModal.id)
            if (!result.success) { setDeleteError(result.error); return }
            setProducts(prev => prev.filter(p => p.id !== deleteModal.id))
            setDeleteModal(null)
        })
    }

    // ─── Menu actions ────────────────────────────────────────────────────────────
    const ActionsMenu = ({ p }: { p: Product }) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="w-4 h-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                    onClick={() => router.push(`/${orgSlug}/products/${p.id}/edit`)}
                    className="gap-2 cursor-pointer"
                >
                    <Pencil className="w-4 h-4 text-blue-500" /> Modifier
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => { setDeleteModal(p); setDeleteError(null) }}
                    className="gap-2 cursor-pointer text-red-600 focus:text-red-600"
                >
                    <Trash2 className="w-4 h-4" /> Supprimer
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

            {/* ── Header ────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold">Produits</h1>
                    <p className="text-sm text-zinc-500 mt-0.5">
                        {products.length} produit{products.length > 1 ? "s" : ""}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        onClick={() => router.push(`/${orgSlug}/products/categories`)}
                        className="gap-2"
                    >
                        <Tag className="w-4 h-4" />
                        <span className="hidden sm:inline">Catégories</span>
                    </Button>
                    <Button
                        onClick={() => router.push(`/${orgSlug}/products/new`)}
                        className="gap-2"
                    >
                        <Plus className="w-4 h-4" /> Nouveau produit
                    </Button>
                </div>
            </div>

            {/* Alerte stock bas */}
            {lowStockCount > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-sm text-amber-700 font-medium">
                        {lowStockCount} produit{lowStockCount > 1 ? "s" : ""} en rupture ou stock bas — pensez à réapprovisionner.
                    </p>
                </div>
            )}

            {/* ── Filtres ───────────────────────────────────────────────────── */}
            <Card className="rounded-2xl">
                <CardContent className="p-4 grid sm:grid-cols-3 gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <Input
                            className="pl-9"
                            placeholder="Rechercher par nom ou SKU…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <Select value={catFilter} onValueChange={setCatFilter}>
                        <SelectTrigger><SelectValue placeholder="Toutes catégories" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Toutes</SelectItem>
                            {categories.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    <span className="flex items-center gap-2">{c.icon} {c.name}</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Tous les types</SelectItem>
                            <SelectItem value="product">Produits physiques</SelectItem>
                            <SelectItem value="service">Services</SelectItem>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* ── Tableau desktop ───────────────────────────────────────────── */}
            <div className="hidden md:block">
                <div className="rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-white border-b border-zinc-200">
                                <th className="text-left py-4 pl-6 text-xs font-semibold uppercase tracking-wider text-zinc-500">Produit</th>
                                <th className="text-left py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-36">Catégorie</th>
                                <th className="text-right py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-40">Prix vente</th>
                                <th className="text-right py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-24">Marge</th>
                                <th className="text-center py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-28">Stock</th>
                                <th className="text-center py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-32">Statut</th>
                                <th className="py-4 pr-4 w-12" />
                            </tr>
                        </thead>
                        <tbody>
                            {displayed.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center text-zinc-400 text-sm">
                                        <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                        Aucun produit trouvé
                                    </td>
                                </tr>
                            ) : displayed.map(p => {
                                const margin = p.price > 0 && p.costPrice
                                    ? (((p.price - p.costPrice) / p.price) * 100).toFixed(0)
                                    : null
                                return (
                                    <tr
                                        key={p.id}
                                        className="group border-b border-zinc-200 hover:bg-blue-50/40 transition-colors cursor-pointer"
                                        onClick={() => router.push(`/${orgSlug}/products/${p.id}/edit`)}
                                    >
                                        {/* Produit */}
                                        <td className="py-4 pl-6">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center text-base shrink-0">
                                                    {p.category?.icon ?? (p.isService ? "⚙️" : "📦")}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-zinc-800">{p.name}</p>
                                                    {p.sku && <p className="text-xs text-zinc-400 font-mono mt-0.5">{p.sku}</p>}
                                                    {p.barcode && <p className="text-xs text-zinc-300 font-mono">{p.barcode}</p>}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Catégorie */}
                                        <td className="py-4">
                                            {p.category ? (
                                                <span className="text-xs rounded-full px-2.5 py-1 font-medium"
                                                    style={{ background: (p.category.color ?? "#888") + "22", color: p.category.color ?? "#666" }}>
                                                    {p.category.name}
                                                </span>
                                            ) : <span className="text-zinc-300 text-xs">—</span>}
                                        </td>

                                        {/* Prix */}
                                        <td className="py-4 text-right">
                                            <p className="text-sm font-bold text-zinc-900 tabular-nums">{fmt(p.price, currency)}</p>
                                            {p.costPrice && (
                                                <p className="text-xs text-zinc-400 tabular-nums">Achat : {fmt(p.costPrice, currency)}</p>
                                            )}
                                        </td>

                                        {/* Marge */}
                                        <td className="py-4 text-right">
                                            {margin
                                                ? <span className="text-sm font-semibold text-emerald-600">+{margin}%</span>
                                                : <span className="text-zinc-300 text-xs">—</span>}
                                        </td>

                                        {/* Stock */}
                                        <td className="py-4 text-center">
                                            {!p.isService
                                                ? <p className="text-sm font-medium text-zinc-700 tabular-nums">{p.currentStock} <span className="text-zinc-400 text-xs">{p.unit}</span></p>
                                                : <span className="text-zinc-300 text-xs">—</span>}
                                        </td>

                                        {/* Statut */}
                                        <td className="py-4 text-center" onClick={e => e.stopPropagation()}>
                                            <StockBadge p={p} />
                                        </td>

                                        {/* Actions */}
                                        <td className="py-4 pr-4 text-right" onClick={e => e.stopPropagation()}>
                                            <ActionsMenu p={p} />
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Cards mobile ──────────────────────────────────────────────── */}
            <div className="md:hidden space-y-3">
                {displayed.length === 0 ? (
                    <div className="py-12 text-center text-zinc-400">
                        <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">Aucun produit trouvé</p>
                    </div>
                ) : displayed.map(p => {
                    const margin = p.price > 0 && p.costPrice
                        ? (((p.price - p.costPrice) / p.price) * 100).toFixed(0)
                        : null
                    return (
                        <Card
                            key={p.id}
                            className="rounded-2xl shadow-sm active:scale-[0.99] transition-all cursor-pointer"
                            onClick={() => router.push(`/${orgSlug}/products/${p.id}/edit`)}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center text-lg shrink-0">
                                            {p.category?.icon ?? (p.isService ? "⚙️" : "📦")}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-zinc-900 text-sm truncate">{p.name}</p>
                                            {p.sku && <p className="text-xs text-zinc-400 font-mono">{p.sku}</p>}
                                            {p.category && (
                                                <span className="text-xs rounded-full px-2 py-0.5 mt-1 inline-block"
                                                    style={{ background: (p.category.color ?? "#888") + "22", color: p.category.color ?? "#666" }}>
                                                    {p.category.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                        <StockBadge p={p} />
                                        <ActionsMenu p={p} />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-100">
                                    <div>
                                        <p className="font-black text-zinc-900 tabular-nums">{fmt(p.price, currency)}</p>
                                        {margin && <p className="text-xs text-emerald-600 font-medium">Marge +{margin}%</p>}
                                    </div>
                                    {!p.isService && (
                                        <p className="text-sm text-zinc-500">
                                            Stock : <strong className="text-zinc-800">{p.currentStock} {p.unit}</strong>
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* ── Modal suppression ─────────────────────────────────────────── */}
            <Dialog open={!!deleteModal} onOpenChange={o => !o && setDeleteModal(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer {deleteModal?.name} ?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-zinc-500 py-2">Cette action est irréversible.</p>
                    {deleteError && (
                        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {deleteError}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteModal(null)}>Annuler</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Supprimer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}