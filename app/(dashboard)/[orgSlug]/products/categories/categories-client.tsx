// src/app/(dashboard)/[orgSlug]/products/categories/_components/categories-client.tsx
"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ArrowLeft, Plus, Trash2, Loader2, AlertTriangle, Tag, Pencil } from "lucide-react"
import { upsertProductCategoryAction, deleteProductCategoryAction } from "@/server/actions/product.action"

type Category = {
    id: string; name: string
    color: string | null; icon: string | null
    productCount: number
}

const COLORS = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
    "#10b981", "#3b82f6", "#ef4444", "#14b8a6",
    "#f97316", "#84cc16", "#06b6d4", "#a855f7",
]

export default function CategoriesClient({
    orgSlug, initialCategories,
}: { orgSlug: string; initialCategories: Category[] }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const [categories, setCategories] = useState<Category[]>(initialCategories)
    const [deleteModal, setDeleteModal] = useState<Category | null>(null)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const [editModal, setEditModal] = useState<Category | null>(null)

    // Form state (create + edit)
    const [name, setName] = useState("")
    const [color, setColor] = useState(COLORS[0] ?? "#6366f1")
    const [icon, setIcon] = useState("")
    const [error, setError] = useState<string | null>(null)

    function openCreate() {
        setEditModal(null)
        setName(""); setIcon(""); setColor(COLORS[0] ?? "#6366f1"); setError(null)
    }

    function openEdit(c: Category) {
        setEditModal(c)
        setName(c.name); setIcon(c.icon ?? ""); setColor(c.color ?? COLORS[0] ?? "#6366f1"); setError(null)
    }

    function handleSave() {
        setError(null)
        if (!name.trim()) { setError("Le nom est requis."); return }
        startTransition(async () => {
            const result = await upsertProductCategoryAction(
                orgSlug,
                { name, color, icon: icon || undefined },
                editModal?.id
            )
            if (!result.success) { setError(result.error); return }

            if (editModal) {
                setCategories(prev => prev.map(c => c.id === editModal.id
                    ? { ...c, name: result.data.name, color, icon: icon || null }
                    : c
                ))
            } else {
                setCategories(prev => [...prev, {
                    id: result.data.id, name: result.data.name,
                    color, icon: icon || null, productCount: 0,
                }])
            }
            setEditModal(null)
            setName(""); setIcon(""); setColor(COLORS[0] ?? "#6366f1")
        })
    }

    function handleDelete() {
        if (!deleteModal) return
        setDeleteError(null)
        startTransition(async () => {
            const result = await deleteProductCategoryAction(orgSlug, deleteModal.id)
            if (!result.success) { setDeleteError(result.error); return }
            setCategories(prev => prev.filter(c => c.id !== deleteModal.id))
            setDeleteModal(null)
        })
    }

    // ─── Formulaire création/édition inline ───────────────────────────────────
    const CategoryForm = (
        <Card className="rounded-2xl">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">
                    {editModal ? `Modifier — ${editModal.name}` : "Nouvelle catégorie"}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

                {error && (
                    <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                    </div>
                )}

                {/* Nom + Emoji — 2 par ligne */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">
                            Nom <span className="text-red-400">*</span>
                        </Label>
                        <Input
                            autoFocus
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Alimentation, Boissons…"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-zinc-500">Emoji / Icône</Label>
                        <Input
                            value={icon}
                            onChange={e => setIcon(e.target.value)}
                            placeholder="🥩"
                            maxLength={4}
                            className="text-xl"
                        />
                    </div>
                </div>

                {/* Couleur */}
                <div className="space-y-2">
                    <Label className="text-sm font-medium text-zinc-500">Couleur</Label>
                    <div className="flex gap-2 flex-wrap">
                        {COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                className={`h-8 w-8 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-zinc-800 scale-110" : "hover:scale-105"
                                    }`}
                                style={{ background: c }}
                            />
                        ))}
                    </div>
                </div>

                {/* Aperçu badge */}
                <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 flex items-center gap-3">
                    <p className="text-xs text-zinc-400 font-medium">Aperçu</p>
                    <span className="text-sm rounded-full px-3 py-1 font-semibold"
                        style={{ background: color + "22", color }}>
                        {icon && <span className="mr-1.5">{icon}</span>}
                        {name || "Ma catégorie"}
                    </span>
                </div>

                <div className="flex gap-3 pt-1">
                    {editModal && (
                        <Button variant="outline" onClick={openCreate} disabled={isPending}>
                            Annuler
                        </Button>
                    )}
                    <Button onClick={handleSave} disabled={isPending} className="gap-2 flex-1">
                        {isPending
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Plus className="w-4 h-4" />
                        }
                        {editModal ? "Enregistrer les modifications" : "Créer la catégorie"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
                <button
                    onClick={() => router.push(`/${orgSlug}/products`)}
                    className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Produits
                </button>
                <span className="text-zinc-300">/</span>
                <h1 className="text-xl font-bold text-zinc-900">Catégories</h1>
                <span className="text-sm text-zinc-400">
                    {categories.length} catégorie{categories.length > 1 ? "s" : ""}
                </span>
            </div>

            {/* Layout 2 colonnes desktop */}
            <div className="grid md:grid-cols-2 gap-6 items-start">

                {/* Formulaire */}
                {CategoryForm}

                {/* Liste des catégories */}
                <div className="space-y-3">
                    {categories.length === 0 ? (
                        <Card className="rounded-2xl">
                            <CardContent className="py-16 text-center text-zinc-400">
                                <Tag className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">Aucune catégorie</p>
                                <p className="text-xs mt-1">Créez votre première catégorie à gauche.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 px-1">
                                Catégories existantes
                            </p>

                            {/* Tableau desktop */}
                            <div className="hidden sm:block rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-white border-b border-zinc-200">
                                            <th className="text-left py-3 pl-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Catégorie</th>
                                            <th className="text-center py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-28">Produits</th>
                                            <th className="py-3 pr-4 w-20" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categories.map(c => (
                                            <tr key={c.id}
                                                className="border-b border-zinc-100 hover:bg-blue-50/40 transition-colors group">
                                                <td className="py-3.5 pl-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-base shrink-0"
                                                            style={{ background: (c.color ?? "#888") + "22" }}>
                                                            {c.icon ?? <span style={{ color: c.color ?? "#888" }}>●</span>}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-semibold text-zinc-900">{c.name}</p>
                                                            {c.color && (
                                                                <p className="text-xs text-zinc-400 font-mono">{c.color}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 text-center">
                                                    <span className="text-sm text-zinc-600 font-medium">
                                                        {c.productCount} produit{c.productCount > 1 ? "s" : ""}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 pr-4 text-right">
                                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8"
                                                            onClick={() => openEdit(c)}>
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                                                            onClick={() => { setDeleteModal(c); setDeleteError(null) }}>
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Cards mobile */}
                            <div className="sm:hidden space-y-2">
                                {categories.map(c => (
                                    <Card key={c.id} className="rounded-2xl shadow-sm">
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full flex items-center justify-center text-lg shrink-0"
                                                        style={{ background: (c.color ?? "#888") + "22" }}>
                                                        {c.icon ?? "📁"}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-zinc-900 text-sm">{c.name}</p>
                                                        <p className="text-xs text-zinc-400 mt-0.5">
                                                            {c.productCount} produit{c.productCount > 1 ? "s" : ""}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400"
                                                        onClick={() => { setDeleteModal(c); setDeleteError(null) }}>
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modal suppression */}
            <Dialog open={!!deleteModal} onOpenChange={o => !o && setDeleteModal(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer la catégorie "{deleteModal?.name}" ?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-zinc-500 py-2">
                        Cette action est irréversible. Les produits associés perdront leur catégorie.
                    </p>
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