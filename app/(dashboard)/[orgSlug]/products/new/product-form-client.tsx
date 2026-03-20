// src/app/(dashboard)/[orgSlug]/products/_components/product-form-client.tsx
"use client"
import { useState, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeft, Loader2, AlertTriangle, Barcode, ScanLine, X } from "lucide-react"
import { createProductAction, updateProductAction } from "@/server/actions/product.action"

// ─── Types ────────────────────────────────────────────────────────────────────
type Category = { id: string; name: string; color: string | null; icon: string | null }
type ProductData = {
    id: string; name: string; description: string | null
    sku: string | null; barcode: string | null
    price: number; costPrice: number | null; isService: boolean
    unit: string | null; currentStock: number; minStockAlert: number | null
    category: Category | null
}
type Props = {
    orgSlug: string; currency: string; categories: Category[]
    mode: "create" | "edit"; product?: ProductData
}

const UNITS = ["pcs", "kg", "g", "litre", "cl", "ml", "m", "cm", "carton", "sachet", "boîte", "lot"]
const fmtN = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
const fmt = (n: number, cur: string) => `${fmtN(n)} ${cur}`

// ═════════════════════════════════════════════════════════════════════════════
export default function ProductFormClient({ orgSlug, currency, categories, mode, product }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const isEdit = mode === "edit"

    // ─── State formulaire ──────────────────────────────────────────────────────
    const [name, setName] = useState(product?.name ?? "")
    const [description, setDescription] = useState(product?.description ?? "")
    const [barcode, setBarcode] = useState(product?.barcode ?? "")
    const [categoryId, setCategoryId] = useState(product?.category?.id ?? "")
    const [price, setPrice] = useState<number | "">(product?.price ?? "")
    const [costPrice, setCostPrice] = useState<number | "">(product?.costPrice ?? "")
    const [isService, setIsService] = useState(product?.isService ?? false)
    const [unit, setUnit] = useState(product?.unit ?? "pcs")
    const [initialStock, setInitialStock] = useState<number | "">(0)
    const [minStock, setMinStock] = useState<number | "">(product?.minStockAlert ?? "")
    const [globalError, setGlobalError] = useState<string | null>(null)

    // ─── Scanner barcode ───────────────────────────────────────────────────────
    const [scanOpen, setScanOpen] = useState(false)
    const [scanError, setScanError] = useState<string | null>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const barcodeBuffer = useRef("")
    const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Lecteur USB desktop — intercepte frappe rapide terminée par Enter
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            const tag = (e.target as HTMLElement).tagName
            if (tag === "INPUT" || tag === "TEXTAREA") return
            if (e.key === "Enter") {
                const code = barcodeBuffer.current.trim()
                barcodeBuffer.current = ""
                if (code.length > 3) { setBarcode(code); setScanOpen(false) }
            } else if (e.key.length === 1) {
                barcodeBuffer.current += e.key
                if (barcodeTimer.current) clearTimeout(barcodeTimer.current)
                barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = "" }, 200)
            }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [])

    async function startScan() {
        setScanError(null)
        setScanOpen(true)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            streamRef.current = stream
            if (videoRef.current) videoRef.current.srcObject = stream

            // @ts-ignore
            if ("BarcodeDetector" in window) {
                // @ts-ignore
                const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "qr_code", "code_128", "code_39", "upc_a"] })
                const detect = async () => {
                    if (!videoRef.current) return
                    try {
                        const codes = await detector.detect(videoRef.current)
                        if (codes.length > 0) {
                            setBarcode(codes[0].rawValue)
                            stopScan()
                        } else {
                            requestAnimationFrame(detect)
                        }
                    } catch { requestAnimationFrame(detect) }
                }
                videoRef.current?.addEventListener("playing", detect, { once: true })
            } else {
                setScanError("BarcodeDetector non supporté — utilisez Chrome Android ou saisissez manuellement.")
            }
        } catch {
            setScanError("Impossible d'accéder à la caméra.")
        }
    }

    function stopScan() {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setScanOpen(false)
        setScanError(null)
    }

    // ─── Calculs ───────────────────────────────────────────────────────────────
    const margin = Number(price) > 0 && Number(costPrice) > 0
        ? (((Number(price) - Number(costPrice)) / Number(price)) * 100).toFixed(1)
        : null
    const selectedCategory = categories.find(c => c.id === categoryId) ?? null

    // ─── Submit ────────────────────────────────────────────────────────────────
    function handleSave() {
        setGlobalError(null)
        if (!name.trim()) { setGlobalError("Le nom est requis."); return }
        if (price === "") { setGlobalError("Le prix de vente est requis."); return }
        if (Number(price) < 0) { setGlobalError("Le prix ne peut pas être négatif."); return }

        startTransition(async () => {
            if (isEdit && product) {
                const result = await updateProductAction(orgSlug, product.id, {
                    name, description: description || undefined,
                    barcode: barcode || undefined,
                    categoryId: categoryId || undefined,
                    price: Number(price), costPrice: Number(costPrice) || undefined,
                    isService, unit, minStockAlert: Number(minStock) || undefined,
                })
                if (!result.success) { setGlobalError(result.error); return }
            } else {
                const result = await createProductAction(orgSlug, {
                    name, description: description || undefined,
                    barcode: barcode || undefined,
                    categoryId: categoryId || undefined,
                    price: Number(price), costPrice: Number(costPrice) || undefined,
                    isService, unit,
                    initialStock: isService ? 0 : Number(initialStock),
                    minStockAlert: Number(minStock) || undefined,
                    isFavorite: false,
                })
                if (!result.success) { setGlobalError(result.error); return }
            }
            router.push(`/${orgSlug}/products`)
        })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FORMULAIRE
    // ─────────────────────────────────────────────────────────────────────────
    const FormSection = (
        <div className="space-y-6">

            {globalError && (
                <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {globalError}
                </div>
            )}

            {/* Type service */}
            <Card className="rounded-2xl">
                <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-zinc-800">Type service</p>
                            <p className="text-xs text-zinc-400 mt-0.5">Les services n'ont pas de stock physique</p>
                        </div>
                        <Switch checked={isService} onCheckedChange={setIsService} />
                    </div>
                </CardContent>
            </Card>

            {/* Informations générales */}
            <Card className="rounded-2xl">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Informations générales</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">

                    {/* Nom */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Nom <span className="text-red-400">*</span></Label>
                        <Input autoFocus value={name} onChange={e => setName(e.target.value)}
                            placeholder="Ex : Riz 25kg, Eau minérale 1.5L…" />
                    </div>

                    {/* Catégorie */}
                    {categories.length > 0 && (
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Catégorie</Label>
                            <Select
                                value={categoryId === "" ? "none" : categoryId}
                                onValueChange={v => setCategoryId(v === "none" ? "" : v)}
                            >
                                <SelectTrigger><SelectValue placeholder="Sans catégorie" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sans catégorie</SelectItem>
                                    {categories.map(c => (
                                        <SelectItem key={c.id} value={c.id}>
                                            <span className="flex items-center gap-2">
                                                {c.icon && <span>{c.icon}</span>}{c.name}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Description */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-zinc-500">Description (optionnel)</Label>
                        <Textarea value={description} onChange={e => setDescription(e.target.value)}
                            rows={2} placeholder="Détails supplémentaires…" />
                    </div>

                    {/* Code-barres avec scan */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-zinc-500 flex items-center gap-1.5">
                            <Barcode className="w-3.5 h-3.5" /> Code-barres
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                value={barcode}
                                onChange={e => setBarcode(e.target.value)}
                                placeholder="Scanner ou saisir le code…"
                                className="flex-1 font-mono"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={startScan}
                                className="shrink-0 h-10 w-10"
                                title="Scanner avec la caméra"
                            >
                                <ScanLine className="w-4 h-4" />
                            </Button>
                        </div>
                        {barcode && (
                            <div className="flex items-center gap-2 rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2">
                                <Barcode className="w-4 h-4 text-zinc-400 shrink-0" />
                                <p className="text-sm font-mono text-zinc-700 flex-1">{barcode}</p>
                                <button onClick={() => setBarcode("")} className="text-zinc-400 hover:text-red-500 transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                        <p className="text-xs text-zinc-400">
                            Le SKU est généré automatiquement par le système.
                        </p>
                        {/* SKU existant en mode édition */}
                        {isEdit && product?.sku && (
                            <p className="text-xs text-zinc-500 font-mono">
                                SKU actuel : <strong>{product.sku}</strong>
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Prix */}
            <Card className="rounded-2xl">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Prix</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Prix de vente <span className="text-red-400">*</span></Label>
                            <div className="relative">
                                <Input type="number" min={0} value={price} placeholder="0"
                                    onChange={e => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                                    className="pr-14" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-medium">{currency}</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-zinc-500">Prix d'achat</Label>
                            <div className="relative">
                                <Input type="number" min={0} value={costPrice} placeholder="0"
                                    onChange={e => setCostPrice(e.target.value === "" ? "" : Number(e.target.value))}
                                    className="pr-14" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-medium">{currency}</span>
                            </div>
                        </div>
                    </div>

                    {margin && (
                        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-emerald-700">Marge bénéficiaire</p>
                                <p className="text-xs text-emerald-600 mt-0.5">
                                    {fmt(Number(price) - Number(costPrice), currency)} de bénéfice par unité
                                </p>
                            </div>
                            <span className="text-2xl font-black text-emerald-700">{margin}%</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Stock */}
            {!isService && (
                <Card className="rounded-2xl">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Stock</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Unité de vente</Label>
                                <Select value={unit} onValueChange={setUnit}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-zinc-500">Seuil alerte rupture</Label>
                                <Input type="number" min={0} value={minStock} placeholder="Ex : 5"
                                    onChange={e => setMinStock(e.target.value === "" ? "" : Number(e.target.value))} />
                            </div>
                        </div>

                        {!isEdit && (
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Stock initial</Label>
                                <div className="relative">
                                    <Input type="number" min={0} value={initialStock} placeholder="0"
                                        onChange={e => setInitialStock(e.target.value === "" ? "" : Number(e.target.value))}
                                        className="pr-12" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">{unit}</span>
                                </div>
                                <p className="text-xs text-zinc-400">Un mouvement d'entrée de stock sera créé automatiquement.</p>
                            </div>
                        )}

                        {isEdit && product && (
                            <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Stock actuel</p>
                                    <p className="text-xl font-black text-zinc-900 mt-0.5 tabular-nums">
                                        {product.currentStock} <span className="text-sm font-normal text-zinc-400">{unit}</span>
                                    </p>
                                </div>
                                <p className="text-xs text-zinc-400 text-right max-w-[160px]">
                                    Pour modifier le stock, utilisez les mouvements de stock.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )

    // ─────────────────────────────────────────────────────────────────────────
    // APERÇU
    // ─────────────────────────────────────────────────────────────────────────
    const PreviewSection = (
        <Card className="rounded-2xl h-fit sticky top-20">
            <CardContent className="p-6 space-y-5">
                <div className="flex items-start gap-4">
                    <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                        style={{ background: selectedCategory?.color ? selectedCategory.color + "22" : "#f4f4f5" }}>
                        {selectedCategory?.icon ?? (isService ? "⚙️" : "📦")}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-black text-zinc-900 text-lg leading-tight">
                            {name || <span className="text-zinc-300">Nom du produit</span>}
                        </p>
                        {selectedCategory && (
                            <span className="text-xs rounded-full px-2.5 py-1 mt-1.5 inline-block font-medium"
                                style={{ background: (selectedCategory.color ?? "#888") + "22", color: selectedCategory.color ?? "#666" }}>
                                {selectedCategory.icon && <span className="mr-1">{selectedCategory.icon}</span>}
                                {selectedCategory.name}
                            </span>
                        )}
                    </div>
                    <Badge variant="outline" className={`rounded-full text-xs shrink-0 ${isService ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-zinc-50 text-zinc-600 border-zinc-200"
                        }`}>
                        {isService ? "Service" : "Produit"}
                    </Badge>
                </div>

                {description && (
                    <p className="text-sm text-zinc-500 leading-relaxed border-t border-zinc-100 pt-4">{description}</p>
                )}

                <div className="border-t border-zinc-100" />

                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Prix</p>
                    <div className="flex items-baseline justify-between">
                        <span className="text-sm text-zinc-500">Prix de vente</span>
                        <span className="font-black text-zinc-900 text-xl tabular-nums">
                            {Number(price) > 0 ? fmt(Number(price), currency) : <span className="text-zinc-300 text-base">—</span>}
                        </span>
                    </div>
                    {Number(costPrice) > 0 && (
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm text-zinc-500">Prix d'achat</span>
                            <span className="text-sm text-zinc-600 tabular-nums">{fmt(Number(costPrice), currency)}</span>
                        </div>
                    )}
                    {margin && (
                        <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                            <span className="text-sm text-emerald-700">Marge</span>
                            <span className="font-bold text-emerald-700">{margin}%</span>
                        </div>
                    )}
                </div>

                {!isService && (
                    <>
                        <div className="border-t border-zinc-100" />
                        <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Stock</p>
                            <div className="grid grid-cols-2 gap-3">
                                {!isEdit && (
                                    <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2.5">
                                        <p className="text-xs text-zinc-400 mb-0.5">Stock initial</p>
                                        <p className="font-bold text-zinc-900 tabular-nums">
                                            {Number(initialStock) || 0} <span className="text-zinc-400 font-normal text-xs">{unit}</span>
                                        </p>
                                    </div>
                                )}
                                {Number(minStock) > 0 && (
                                    <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                                        <p className="text-xs text-amber-500 mb-0.5">Alerte rupture</p>
                                        <p className="font-bold text-amber-700 tabular-nums">
                                            {Number(minStock)} <span className="text-amber-500 font-normal text-xs">{unit}</span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {barcode && (
                    <>
                        <div className="border-t border-zinc-100" />
                        <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Code-barres</p>
                            <p className="text-xs text-zinc-600 font-mono flex items-center gap-1.5">
                                <Barcode className="w-3 h-3" /> {barcode}
                            </p>
                            <p className="text-xs text-zinc-400">SKU généré automatiquement à la création</p>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )

    // ─────────────────────────────────────────────────────────────────────────
    // RENDU
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
                <button onClick={() => router.push(`/${orgSlug}/products`)}
                    className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Produits
                </button>
                <span className="text-zinc-300">/</span>
                <h1 className="text-xl font-bold text-zinc-900">
                    {isEdit ? `Modifier — ${product?.name}` : "Nouveau produit"}
                </h1>
                {isEdit && product && (
                    <Badge variant="outline" className="ml-1 rounded-full text-xs">
                        {product.isService ? "Service" : "Produit"}
                    </Badge>
                )}
            </div>

            {/* Desktop : 2 colonnes */}
            <div className="hidden md:grid md:grid-cols-2 gap-8 items-start">
                {FormSection}
                <div className="flex flex-col gap-4">
                    {PreviewSection}
                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => router.push(`/${orgSlug}/products`)} disabled={isPending}>
                            Annuler
                        </Button>
                        <Button onClick={handleSave} disabled={isPending} className="gap-2">
                            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isEdit ? "✓ Enregistrer les modifications" : "✓ Créer le produit"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Mobile : onglets */}
            <div className="md:hidden">
                <Tabs defaultValue="form">
                    <TabsList className="grid grid-cols-2 mb-4">
                        <TabsTrigger value="form">Formulaire</TabsTrigger>
                        <TabsTrigger value="preview">Aperçu</TabsTrigger>
                    </TabsList>
                    <TabsContent value="form">{FormSection}</TabsContent>
                    <TabsContent value="preview">{PreviewSection}</TabsContent>
                </Tabs>
            </div>

            {/* Boutons sticky mobile */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-zinc-200 px-4 py-3 flex gap-3">
                <Button variant="outline" onClick={() => router.push(`/${orgSlug}/products`)} disabled={isPending} className="flex-1">
                    Annuler
                </Button>
                <Button onClick={handleSave} disabled={isPending} className="flex-1 gap-2">
                    {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</> : isEdit ? "✓ Enregistrer" : "✓ Créer"}
                </Button>
            </div>

            {/* ── Modal scanner caméra ─────────────────────────────────────────── */}
            <Dialog open={scanOpen} onOpenChange={open => !open && stopScan()}>
                <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl">
                    <DialogHeader className="px-5 pt-5 pb-3">
                        <DialogTitle className="flex items-center gap-2">
                            <ScanLine className="w-5 h-5" /> Scanner le code-barres
                        </DialogTitle>
                    </DialogHeader>

                    <div className="relative bg-black aspect-video w-full">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        {/* Viseur */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-56 h-32 relative">
                                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg" />
                                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg" />
                                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg" />
                                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg" />
                                <div className="absolute inset-x-0 h-0.5 bg-red-400 top-1/2 animate-pulse" />
                            </div>
                        </div>
                    </div>

                    <div className="px-5 py-4 space-y-3">
                        {scanError ? (
                            <p className="text-sm text-red-600 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" /> {scanError}
                            </p>
                        ) : (
                            <p className="text-sm text-zinc-500 text-center">
                                Placez le code-barres dans le cadre
                            </p>
                        )}
                        <Button variant="outline" onClick={stopScan} className="w-full">
                            Annuler
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}