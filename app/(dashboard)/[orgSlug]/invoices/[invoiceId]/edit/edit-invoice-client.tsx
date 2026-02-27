// src/app/(dashboard)/[orgSlug]/invoices/[invoiceId]/edit/edit-invoice-client.tsx
"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card as PreviewCard } from "@/components/ui/card"
import { Plus, Trash, ArrowLeft, Loader2, AlertTriangle } from "lucide-react"
import { updateInvoiceAction } from "@/server/actions/update-invoice.action"
import type { UpdateInvoiceInput } from "@/lib/validations/update.schema"

type Props = {
    orgSlug: string
    orgName: string
    defaultCurrency: string
    invoice: {
        id: string; number: string; status: string
        clientId: string | null
        issueDate: Date; dueDate: Date | null
        currencyCode: string
        subtotal: number; taxTotal: number; total: number
        notes: string | null; terms: string | null; internalNotes: string | null
        client: { id: string; name: string; email: string | null; phone: string | null; address: string | null; taxId: string | null } | null
        items: { id: string; name: string; description: string | null; quantity: number; unitPrice: number; total: number; isService: boolean; taxRateId: string | null; productId: string | null; taxRate: { id: string; name: string; rate: number } | null }[]
    }
    clients: { id: string; name: string; email: string | null; phone: string | null; type: string }[]
    products: { id: string; name: string; price: number; isService: boolean; sku: string | null }[]
    taxRates: { id: string; name: string; rate: number; isDefault: boolean }[]
}

type LineItem = {
    name: string; quantity: number; unitPrice: number; total: number
    isService: boolean; productId?: string; taxRateId?: string
}

function statusLabel(s: string) {
    const m: Record<string, string> = { DRAFT: "Brouillon", SENT: "Envoyée", PAID: "Payée", PARTIAL: "Partiel", OVERDUE: "En retard", CANCELLED: "Annulée" }
    return m[s] ?? s
}

const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
const toDateStr = (d: Date | null) => d ? new Date(d).toISOString().split("T")[0] ?? "" : ""

export default function EditInvoiceClient({
    orgSlug, orgName, defaultCurrency, invoice, clients, products, taxRates,
}: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // ─── Détecter le taux TVA par défaut depuis les items existants ────────────
    const existingTaxRate = invoice.items[0]?.taxRate
    const defaultTaxRateId = existingTaxRate?.id ?? taxRates.find(t => t.isDefault)?.id ?? ""
    const defaultTaxRateVal = existingTaxRate?.rate ?? taxRates.find(t => t.isDefault)?.rate ?? 18

    // ─── Pre-fill state depuis la facture existante ────────────────────────────
    const [useExistingClient, setUseExistingClient] = useState(!!invoice.clientId)
    const [selectedClientId, setSelectedClientId] = useState(invoice.clientId ?? "")
    const [clientType, setClientType] = useState("INDIVIDUAL")
    const [client, setClient] = useState({
        name: invoice.client?.name ?? "",
        email: invoice.client?.email ?? "",
        address: invoice.client?.address ?? "",
        taxId: invoice.client?.taxId ?? "",
    })

    const [useVAT, setUseVAT] = useState(Number(invoice.taxTotal) > 0)
    const [vatRate, setVatRate] = useState(defaultTaxRateVal)
    const [selectedTaxRateId, setSelectedTaxRateId] = useState(defaultTaxRateId)

    const [items, setItems] = useState<LineItem[]>(
        invoice.items.map(i => ({
            name: i.name,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            total: Number(i.total),
            isService: i.isService,
            productId: i.productId ?? undefined,
            taxRateId: i.taxRateId ?? undefined,
        }))
    )

    const [issueDate, setIssueDate] = useState(toDateStr(invoice.issueDate))
    const [dueDate, setDueDate] = useState(toDateStr(invoice.dueDate))
    const [notes, setNotes] = useState(invoice.notes ?? "")
    const [terms, setTerms] = useState(invoice.terms ?? "")
    const [internalNotes, setInternalNotes] = useState(invoice.internalNotes ?? "")
    const [globalError, setGlobalError] = useState<string | null>(null)

    // ─── Gestion items ─────────────────────────────────────────────────────────
    const handleItemChange = (index: number, field: keyof LineItem, value: string | number) => {
        const updated = [...items]
        if (field === "quantity" || field === "unitPrice") (updated[index] as any)[field] = Number(value)
        else (updated[index] as any)[field] = value
        updated[index].total = updated[index].quantity * updated[index].unitPrice
        setItems(updated)
    }

    const addItem = () => setItems([...items, { name: "", quantity: 1, unitPrice: 0, total: 0, isService: false }])
    const removeItem = (i: number) => { if (items.length > 1) setItems(items.filter((_, idx) => idx !== i)) }

    const handleSelectProduct = (index: number, productId: string) => {
        const p = products.find(x => x.id === productId)
        if (!p) return
        const updated = [...items]
        updated[index] = { ...updated[index], productId, name: p.name, unitPrice: p.price, isService: p.isService, total: updated[index].quantity * p.price }
        setItems(updated)
    }

    // ─── Totaux live ───────────────────────────────────────────────────────────
    const subtotal = items.reduce((s, i) => s + i.total, 0)
    const tax = useVAT ? subtotal * (vatRate / 100) : 0
    const total = subtotal + tax

    // ─── Soumission ────────────────────────────────────────────────────────────
    function handleSave() {
        setGlobalError(null)
        const isNew = !useExistingClient
        const payload: UpdateInvoiceInput = {
            clientId: useExistingClient && selectedClientId ? selectedClientId : undefined,
            newClient: isNew && client.name ? {
                type: clientType as "INDIVIDUAL" | "COMPANY",
                name: client.name, email: client.email || undefined,
                address: client.address || undefined, taxId: client.taxId || undefined,
            } : undefined,
            issueDate, dueDate: dueDate || undefined,
            currencyCode: defaultCurrency || "XOF",
            items: items.filter(i => i.name.trim()).map(i => ({
                productId: i.productId, name: i.name, quantity: i.quantity,
                unitPrice: i.unitPrice, taxRate: useVAT ? vatRate : 0,
                taxRateId: useVAT && selectedTaxRateId ? selectedTaxRateId : undefined,
                isService: i.isService,
            })),
            notes: notes || undefined, terms: terms || undefined, internalNotes: internalNotes || undefined,
        }
        if (!payload.clientId && !payload.newClient) { setGlobalError("Sélectionne ou crée un client."); return }
        if (!payload.items.length) { setGlobalError("Ajoute au moins un article."); return }

        startTransition(async () => {
            const result = await updateInvoiceAction(orgSlug, invoice.id, payload)
            if (!result.success) { setGlobalError(result.error); return }
            router.push(`/${orgSlug}/invoices/${invoice.id}`)
        })
    }

    // ─────────────────────────────────────────────────────────────────────────
    const FormSection = (
        <div className="space-y-8">

            {globalError && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {globalError}
                </div>
            )}

            {/* Avertissement statut SENT */}
            {invoice.status === "SENT" && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700">
                        Cette facture a déjà été envoyée au client. Toute modification sera visible à la prochaine consultation.
                    </p>
                </div>
            )}

            {/* Client */}
            <Card className="rounded-2xl">
                <CardHeader><CardTitle>Client</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <Label>Client existant</Label>
                        <Switch checked={useExistingClient} onCheckedChange={setUseExistingClient} />
                    </div>
                    {useExistingClient ? (
                        <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                            <SelectTrigger><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
                            <SelectContent>
                                {clients.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.name}{c.email ? ` — ${c.email}` : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={clientType} onValueChange={setClientType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="INDIVIDUAL">Particulier</SelectItem>
                                        <SelectItem value="COMPANY">Entreprise</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Input placeholder={clientType === "COMPANY" ? "Nom de l'entreprise" : "Nom complet"}
                                value={client.name} onChange={e => setClient({ ...client, name: e.target.value })} />
                            <Input placeholder="Email" value={client.email}
                                onChange={e => setClient({ ...client, email: e.target.value })} />
                            <Input placeholder="Adresse" value={client.address}
                                onChange={e => setClient({ ...client, address: e.target.value })} />
                            {clientType === "COMPANY" && (
                                <Input placeholder="Numéro TVA / SIRET" value={client.taxId}
                                    onChange={e => setClient({ ...client, taxId: e.target.value })} />
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Dates */}
            <Card className="rounded-2xl">
                <CardHeader><CardTitle>Dates</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Date de facturation</Label>
                        <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Date d'échéance</Label>
                        <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>
                </CardContent>
            </Card>

            {/* Articles */}
            <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Produits / Services</CardTitle>
                    <Button variant="outline" size="sm" onClick={addItem} className="gap-2">
                        <Plus className="w-4 h-4" /> Ajouter
                    </Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Description</TableHead>
                                <TableHead>Qté</TableHead>
                                <TableHead>Prix</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell className="space-y-1 min-w-[200px]">
                                        {products.length > 0 && (
                                            <Select value={item.productId ?? ""} onValueChange={pid => handleSelectProduct(index, pid)}>
                                                <SelectTrigger className="h-7 text-xs">
                                                    <SelectValue placeholder="Catalogue…" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                        <Input placeholder="Produit ou service" value={item.name}
                                            onChange={e => handleItemChange(index, "name", e.target.value)} />
                                    </TableCell>
                                    <TableCell>
                                        <Input type="number" className="w-20" value={item.quantity}
                                            onChange={e => handleItemChange(index, "quantity", e.target.value)} />
                                    </TableCell>
                                    <TableCell>
                                        <Input type="number" className="w-28" value={item.unitPrice}
                                            onChange={e => handleItemChange(index, "unitPrice", e.target.value)} />
                                    </TableCell>
                                    <TableCell className="tabular-nums text-sm">{fmt(item.total)}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => removeItem(index)} disabled={items.length === 1}>
                                            <Trash className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* TVA */}
            <Card className="rounded-2xl">
                <CardHeader><CardTitle>TVA</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>Appliquer TVA</Label>
                        <Switch checked={useVAT} onCheckedChange={setUseVAT} />
                    </div>
                    {useVAT && (
                        taxRates.length > 0 ? (
                            <Select value={selectedTaxRateId} onValueChange={id => {
                                setSelectedTaxRateId(id)
                                const tr = taxRates.find(t => t.id === id)
                                if (tr) setVatRate(tr.rate)
                            }}>
                                <SelectTrigger><SelectValue placeholder="Choisir un taux" /></SelectTrigger>
                                <SelectContent>
                                    {taxRates.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.rate}%)</SelectItem>)}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input type="number" value={vatRate} onChange={e => setVatRate(Number(e.target.value))} />
                        )
                    )}
                </CardContent>
            </Card>

            {/* Notes */}
            <Card className="rounded-2xl">
                <CardHeader><CardTitle>Notes et conditions</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Message pour le client</Label>
                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Merci pour votre confiance." />
                    </div>
                    <div className="space-y-2">
                        <Label>Conditions de paiement</Label>
                        <Textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2} placeholder="Paiement à 30 jours." />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-zinc-500">Note interne (non visible par le client)</Label>
                        <Textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={2}
                            className="bg-amber-50 border-amber-200 focus:border-amber-400"
                            placeholder="Note interne…" />
                    </div>
                </CardContent>
            </Card>
        </div>
    )

    const PreviewSection = (
        <PreviewCard className="rounded-2xl p-8 min-h-[600px] sticky top-20">
            <div className="space-y-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold">FACTURE</h2>
                        <p className="font-mono text-sm text-zinc-500">{invoice.number}</p>
                    </div>
                    <div className="text-right">
                        <p className="font-semibold">{orgName}</p>
                    </div>
                </div>

                <div className="border-t pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Facturé à</p>
                    {useExistingClient ? (
                        (() => { const c = clients.find(c => c.id === selectedClientId); return c ? <><p className="font-bold">{c.name}</p>{c.email && <p className="text-sm text-zinc-500">{c.email}</p>}</> : <p className="text-zinc-400 text-sm">—</p> })()
                    ) : (
                        <><p className="font-bold">{client.name || "—"}</p>{client.email && <p className="text-sm text-zinc-500">{client.email}</p>}</>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-zinc-50 p-2.5">
                        <p className="text-xs text-zinc-400 mb-0.5">Date</p>
                        <p className="font-medium">{issueDate ? new Date(issueDate).toLocaleDateString("fr-FR") : "—"}</p>
                    </div>
                    {dueDate && (
                        <div className="rounded-lg bg-zinc-50 p-2.5">
                            <p className="text-xs text-zinc-400 mb-0.5">Échéance</p>
                            <p className="font-medium">{new Date(dueDate).toLocaleDateString("fr-FR")}</p>
                        </div>
                    )}
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead>Qté</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item, i) => (
                            <TableRow key={i}>
                                <TableCell className="text-sm">{item.name || <span className="text-zinc-300">—</span>}</TableCell>
                                <TableCell className="text-sm">{item.quantity}</TableCell>
                                <TableCell className="text-right text-sm tabular-nums">{fmt(item.total)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                <div className="flex justify-end">
                    <div className="w-56 space-y-1.5 text-sm">
                        <div className="flex justify-between text-zinc-500">
                            <span>Sous-total HT</span>
                            <span className="tabular-nums">{fmt(subtotal)} {defaultCurrency}</span>
                        </div>
                        {useVAT && (
                            <div className="flex justify-between text-zinc-500">
                                <span>TVA {vatRate}%</span>
                                <span className="tabular-nums">{fmt(tax)} {defaultCurrency}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-base border-t pt-1.5 mt-1">
                            <span>Total TTC</span>
                            <span className="tabular-nums">{fmt(total)} {defaultCurrency}</span>
                        </div>
                    </div>
                </div>
            </div>
        </PreviewCard>
    )

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
                <button onClick={() => router.back()}
                    className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Retour
                </button>
                <span className="text-zinc-300">/</span>
                <h1 className="text-xl font-bold">Modifier {invoice.number}</h1>
                <Badge variant="outline" className="ml-1">
                    {statusLabel(invoice.status)}
                </Badge>
            </div>

            {/* Layout desktop */}
            <div className="hidden md:grid md:grid-cols-2 gap-8">
                {FormSection}
                {PreviewSection}
            </div>

            {/* Layout mobile */}
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

            {/* Boutons — sticky bas sur mobile */}
            <div className="flex gap-3 mt-8 pb-6 justify-end">
                <Button variant="outline" onClick={() => router.back()} disabled={isPending} className="flex-1 sm:flex-none">
                    Annuler
                </Button>
                <Button onClick={handleSave} disabled={isPending} className="flex-1 sm:flex-none gap-2">
                    {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</> : "✓ Enregistrer les modifications"}
                </Button>
            </div>
        </div>
    )
}