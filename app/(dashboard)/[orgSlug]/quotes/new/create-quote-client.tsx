// src/app/(dashboard)/[orgSlug]/quotes/new/create-quote-client.tsx
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card as PreviewCard } from "@/components/ui/card"
import { Plus, Trash } from "lucide-react"
import { Loader2 } from "lucide-react"
import { createQuoteAction } from "@/server/actions/quote.action"
import type { CreateQuoteInput } from "@/lib/validations/quote.schema"

type Props = {
    orgSlug: string
    orgName: string
    defaultCurrency: string
    clients: { id: string; name: string; email: string | null; phone: string | null; type: string }[]
    products: { id: string; name: string; price: number; isService: boolean; sku: string | null }[]
    taxRates: { id: string; name: string; rate: number; isDefault: boolean }[]
}

type LineItem = {
    name: string; quantity: number; unitPrice: number; total: number
    isService: boolean; productId?: string
}

export default function CreateQuoteClient({
    orgSlug, orgName, defaultCurrency, clients, products, taxRates,
}: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // ─── État formulaire ───────────────────────────────────────────────────────
    const [clientType, setClientType] = useState("INDIVIDUAL")
    const [useExistingClient, setUseExistingClient] = useState(true)
    const [selectedClientId, setSelectedClientId] = useState("")
    const [useVAT, setUseVAT] = useState(true)
    const [vatRate, setVatRate] = useState(taxRates.find(t => t.isDefault)?.rate ?? 18)
    const [selectedTaxRateId, setSelectedTaxRateId] = useState(taxRates.find(t => t.isDefault)?.id ?? "")

    const [client, setClient] = useState({ name: "", email: "", address: "", taxId: "" })
    const [items, setItems] = useState<LineItem[]>([
        { name: "", quantity: 1, unitPrice: 0, total: 0, isService: false },
    ])

    const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0] ?? "")
    const [expiryDate, setExpiryDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() + 30)
        return d.toISOString().split("T")[0] ?? ""
    })
    const [notes, setNotes] = useState("")
    const [terms, setTerms] = useState("")
    const [globalError, setGlobalError] = useState<string | null>(null)

    // ─── Gestion items ─────────────────────────────────────────────────────────
    const handleItemChange = (index: number, field: keyof LineItem, value: string | number) => {
        const updated = [...items]
        if (field === "quantity" || field === "unitPrice") {
            (updated[index] as any)[field] = Number(value)
        } else {
            (updated[index] as any)[field] = value
        }
        updated[index].total = updated[index].quantity * updated[index].unitPrice
        setItems(updated)
    }

    const addItem = () => setItems([...items, { name: "", quantity: 1, unitPrice: 0, total: 0, isService: false }])
    const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))

    const handleSelectProduct = (index: number, productId: string) => {
        const p = products.find(x => x.id === productId)
        if (!p) return
        const updated = [...items]
        updated[index] = { ...updated[index], productId, name: p.name, unitPrice: p.price, isService: p.isService, total: updated[index].quantity * p.price }
        setItems(updated)
    }

    // ─── Totaux ────────────────────────────────────────────────────────────────
    const subtotal = items.reduce((acc, i) => acc + i.total, 0)
    const tax = useVAT ? subtotal * (vatRate / 100) : 0
    const total = subtotal + tax

    // ─── Soumission ────────────────────────────────────────────────────────────
    async function handleSave(status: "DRAFT" | "SENT") {
        setGlobalError(null)
        const isNew = !useExistingClient
        const payload: CreateQuoteInput = {
            clientId: useExistingClient && selectedClientId ? selectedClientId : undefined,
            newClient: isNew && client.name ? {
                type: clientType as "INDIVIDUAL" | "COMPANY",
                name: client.name, email: client.email || undefined,
                address: client.address || undefined, taxId: client.taxId || undefined,
            } : undefined,
            issueDate, expiryDate: expiryDate || undefined,
            currencyCode: defaultCurrency || "XOF",
            items: items.filter(i => i.name.trim()).map(i => ({
                productId: i.productId, name: i.name, quantity: i.quantity,
                unitPrice: i.unitPrice, taxRate: useVAT ? vatRate : 0,
                taxRateId: useVAT && selectedTaxRateId ? selectedTaxRateId : undefined,
                isService: i.isService,
            })),
            notes: notes || undefined, terms: terms || undefined, status,
        }

        if (!payload.clientId && !payload.newClient) { setGlobalError("Sélectionne ou crée un client."); return }
        if (!payload.items.length) { setGlobalError("Ajoute au moins un article."); return }

        startTransition(async () => {
            const result = await createQuoteAction(orgSlug, payload)
            if (!result.success) { setGlobalError(result.error); return }
            router.push(`/${orgSlug}/quotes/${result.data.id}`)
        })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RENDU
    // ─────────────────────────────────────────────────────────────────────────
    const FormSection = (
        <div className="space-y-8">

            {globalError && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                    ⚠️ {globalError}
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
                                        {c.name}{c.email ? ` — ${c.email}` : c.phone ? ` — ${c.phone}` : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Type de client</Label>
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
                        <Label>Date d'émission</Label>
                        <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Date d'expiration</Label>
                        <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
                    </div>
                    {/* Raccourcis expiration */}
                    <div className="flex flex-wrap gap-2">
                        {[15, 30, 45, 60].map(days => (
                            <button key={days} type="button"
                                onClick={() => { const d = new Date(issueDate || Date.now()); d.setDate(d.getDate() + days); setExpiryDate(d.toISOString().split("T")[0] ?? "") }}
                                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-800 hover:bg-zinc-50 transition-colors">
                                {days} jours
                            </button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Articles */}
            <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Produits / Services</CardTitle>
                    <Button variant="outline" onClick={addItem} className="gap-2">
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
                                    <TableCell>{item.total.toFixed(0)}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
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
                            <Select value={selectedTaxRateId} onValueChange={id => { setSelectedTaxRateId(id); const tr = taxRates.find(t => t.id === id); if (tr) setVatRate(tr.rate) }}>
                                <SelectTrigger><SelectValue placeholder="Choisir un taux" /></SelectTrigger>
                                <SelectContent>
                                    {taxRates.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.rate}%)</SelectItem>)}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input type="number" value={vatRate} onChange={e => setVatRate(Number(e.target.value))} placeholder="Taux TVA %" />
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
                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                            placeholder="Ex : Ce devis est valable 30 jours." />
                    </div>
                    <div className="space-y-2">
                        <Label>Conditions</Label>
                        <Textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2}
                            placeholder="Ex : Acompte de 30% à la commande." />
                    </div>
                </CardContent>
            </Card>
        </div>
    )

    const PreviewSection = (
        <PreviewCard className="rounded-2xl p-8 min-h-[600px]">
            <div className="space-y-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold">DEVIS</h2>
                        <p className="text-sm text-zinc-500">Date : {new Date(issueDate).toLocaleDateString("fr-FR")}</p>
                        {expiryDate && <p className="text-sm text-orange-500">Expire le : {new Date(expiryDate).toLocaleDateString("fr-FR")}</p>}
                    </div>
                    <div className="text-right">
                        <p className="font-semibold">{orgName}</p>
                    </div>
                </div>

                <div className="border-t pt-4">
                    <p className="font-semibold text-sm text-zinc-500 mb-1">Destinataire</p>
                    {useExistingClient ? (
                        (() => { const c = clients.find(c => c.id === selectedClientId); return c ? <><p className="font-bold">{c.name}</p>{c.email && <p className="text-sm text-zinc-500">{c.email}</p>}</> : <p className="text-zinc-400">—</p> })()
                    ) : (
                        <><p className="font-bold">{client.name || "Nom du client"}</p><p className="text-sm text-zinc-500">{client.email}</p><p className="text-sm text-zinc-500">{client.address}</p></>
                    )}
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead>Qté</TableHead>
                            <TableHead>PU</TableHead>
                            <TableHead>Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item, i) => (
                            <TableRow key={i}>
                                <TableCell>{item.name || <span className="text-zinc-300">—</span>}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>{item.unitPrice}</TableCell>
                                <TableCell>{item.total.toFixed(0)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                <div className="flex justify-end">
                    <div className="w-64 space-y-2 text-lg">
                        <div className="flex justify-between text-sm text-zinc-500">
                            <span>Sous-total HT</span>
                            <span>{subtotal.toFixed(0)} {defaultCurrency}</span>
                        </div>
                        {useVAT && (
                            <div className="flex justify-between text-sm text-zinc-500">
                                <span>TVA ({vatRate}%)</span>
                                <span>{tax.toFixed(0)} {defaultCurrency}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-xl border-t pt-2">
                            <span>Total</span>
                            <span>{total.toFixed(0)} {defaultCurrency}</span>
                        </div>
                    </div>
                </div>

                {notes && <div className="border-t pt-4 text-sm text-zinc-600 italic">{notes}</div>}
            </div>
        </PreviewCard>
    )

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            {/* Header sticky mobile */}
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
                    ← Retour
                </button>
                <h1 className="text-2xl font-bold">Nouveau devis</h1>
            </div>

            <div className="hidden md:grid md:grid-cols-2 gap-8">
                {FormSection}
                {PreviewSection}
            </div>

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

            {/* Boutons d'action — sticky en bas sur mobile */}
            <div className="flex justify-end gap-3 mt-8 pb-6">
                <Button variant="outline" onClick={() => handleSave("DRAFT")} disabled={isPending} className="flex-1 sm:flex-none">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "💾 Brouillon"}
                </Button>
                <Button onClick={() => handleSave("SENT")} disabled={isPending} className="flex-1 sm:flex-none">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "✉️ Envoyer"}
                </Button>
            </div>
        </div>
    )
}