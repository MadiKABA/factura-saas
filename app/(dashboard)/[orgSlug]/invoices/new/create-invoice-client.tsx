"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card as PreviewCard } from "@/components/ui/card";
import { Plus, Trash } from "lucide-react";
import { createInvoiceAction } from "@/server/actions/invoice.action";
import type { CreateInvoiceInput } from "@/lib/validations/invoice.schema";
import type { PlanLimitInfo } from "@/server/queries/invoice.query";

// ─── Props injectées par le Server Component ──────────────────────────────────
type Props = {
    orgSlug: string;
    orgName: string;
    defaultCurrency: string;
    clients: { id: string; name: string; email: string | null; phone: string | null; type: string }[];
    products: { id: string; name: string; price: number; isService: boolean; sku: string | null }[];
    taxRates: { id: string; name: string; rate: number; isDefault: boolean }[];
    quotes: { id: string; number: string; clientName: string; total: number }[];
    planInfo: PlanLimitInfo;
};

type InvoiceItemType = {
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    isService: boolean;
    productId?: string;
};

export default function CreateInvoiceClient({
    orgSlug,
    orgName,
    defaultCurrency,
    clients,
    products,
    taxRates,
    quotes,
    planInfo,
}: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // ─── État identique au design original + champs supplémentaires pour l'action
    const [clientType, setClientType] = useState("INDIVIDUAL");
    const [useExistingClient, setUseExistingClient] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState("");
    const [useVAT, setUseVAT] = useState(false);
    const [vatRate, setVatRate] = useState(
        taxRates.find(t => t.isDefault)?.rate ?? 18
    );
    const [selectedTaxRateId, setSelectedTaxRateId] = useState(
        taxRates.find(t => t.isDefault)?.id ?? ""
    );

    const [client, setClient] = useState({ name: "", email: "", address: "", taxId: "" });

    const [items, setItems] = useState<InvoiceItemType[]>([
        { name: "", quantity: 1, unitPrice: 0, total: 0, isService: false },
    ]);

    const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0] ?? "");
    const [dueDate, setDueDate] = useState("");
    const [notes, setNotes] = useState("");
    const [terms, setTerms] = useState("");
    const [originQuoteId, setOriginQuoteId] = useState("");
    const [globalError, setGlobalError] = useState<string | null>(null);

    // ─── Logique items (identique à l'original) ───────────────────────────────
    const handleItemChange = (
        index: number,
        field: keyof InvoiceItemType,
        value: string | number
    ) => {
        const updated = [...items];
        if (field === "quantity" || field === "unitPrice") {
            (updated[index] as any)[field] = Number(value);
        } else {
            (updated[index] as any)[field] = value;
        }
        updated[index].total = updated[index].quantity * updated[index].unitPrice;
        setItems(updated);
    };

    const addItem = () => {
        setItems([...items, { name: "", quantity: 1, unitPrice: 0, total: 0, isService: false }]);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    // Pré-remplir depuis le catalogue
    const handleSelectProduct = (index: number, productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        const updated = [...items];
        updated[index] = {
            ...updated[index],
            productId,
            name: product.name,
            unitPrice: product.price,
            isService: product.isService,
            total: updated[index].quantity * product.price,
        };
        setItems(updated);
    };

    // ─── Totaux (identique à l'original) ─────────────────────────────────────
    const subtotal = items.reduce((acc, item) => acc + item.total, 0);
    const tax = useVAT ? subtotal * (vatRate / 100) : 0;
    const total = subtotal + tax;

    // ─── Soumission → Server Action ───────────────────────────────────────────
    async function handleSave(status: "DRAFT" | "SENT") {
        setGlobalError(null);

        const isNewClient = !useExistingClient;
        const payload: CreateInvoiceInput = {
            clientId: useExistingClient && selectedClientId ? selectedClientId : undefined,
            newClient: isNewClient && client.name ? {
                type: clientType as "INDIVIDUAL" | "COMPANY",
                name: client.name,
                email: client.email || undefined,
                address: client.address || undefined,
                taxId: client.taxId || undefined,
            } : undefined,
            originQuoteId: originQuoteId || undefined,
            issueDate,
            dueDate: dueDate || undefined,
            currencyCode: defaultCurrency || "XOF",
            items: items.filter(i => i.name.trim()).map(i => ({
                productId: i.productId,
                taxRateId: useVAT && selectedTaxRateId ? selectedTaxRateId : undefined,
                name: i.name,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                taxRate: useVAT ? vatRate : 0,
                isService: i.isService,
            })),
            notes: notes || undefined,
            terms: terms || undefined,
            status,
        };

        if (!payload.clientId && !payload.newClient) {
            setGlobalError("Sélectionne ou crée un client.");
            return;
        }
        if (!payload.items.length) {
            setGlobalError("Ajoute au moins un article.");
            return;
        }

        startTransition(async () => {
            const result = await createInvoiceAction(orgSlug, payload);
            if (!result.success) {
                setGlobalError(result.error);
                return;
            }
            router.push(`/${orgSlug}/invoices/${result.data.id}`);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RENDU — design 100% identique à l'original
    // ─────────────────────────────────────────────────────────────────────────

    const FormSection = (
        <div className="space-y-8">

            {globalError && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                    ⚠️ {globalError}
                </div>
            )}

            {/* Devis d'origine — affiché seulement si des devis existent */}
            {quotes.length > 0 && (
                <Card className="rounded-2xl">
                    <CardHeader><CardTitle>Depuis un devis (optionnel)</CardTitle></CardHeader>
                    <CardContent>
                        <Select value={originQuoteId} onValueChange={setOriginQuoteId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Aucun devis associé" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">Aucun</SelectItem>
                                {quotes.map(q => (
                                    <SelectItem key={q.id} value={q.id}>
                                        {q.number} — {q.clientName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
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
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionner un client" />
                            </SelectTrigger>
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
                            <Input
                                placeholder={clientType === "COMPANY" ? "Nom de l'entreprise" : "Nom complet"}
                                value={client.name}
                                onChange={e => setClient({ ...client, name: e.target.value })}
                            />
                            <Input
                                placeholder="Email"
                                value={client.email}
                                onChange={e => setClient({ ...client, email: e.target.value })}
                            />
                            <Input
                                placeholder="Adresse"
                                value={client.address}
                                onChange={e => setClient({ ...client, address: e.target.value })}
                            />
                            {clientType === "COMPANY" && (
                                <Input
                                    placeholder="Numéro TVA / SIRET"
                                    value={client.taxId}
                                    onChange={e => setClient({ ...client, taxId: e.target.value })}
                                />
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
                        <Label>Date d'échéance (optionnel)</Label>
                        <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>
                </CardContent>
            </Card>

            {/* Produits / Services */}
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
                                            <Select
                                                value={item.productId ?? ""}
                                                onValueChange={pid => handleSelectProduct(index, pid)}
                                            >
                                                <SelectTrigger className="h-7 text-xs">
                                                    <SelectValue placeholder="Catalogue…" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {products.map(p => (
                                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                        <Input
                                            placeholder="Produit ou service"
                                            value={item.name}
                                            onChange={e => handleItemChange(index, "name", e.target.value)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            className="w-20"
                                            value={item.quantity}
                                            onChange={e => handleItemChange(index, "quantity", e.target.value)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            className="w-28"
                                            value={item.unitPrice}
                                            onChange={e => handleItemChange(index, "unitPrice", e.target.value)}
                                        />
                                    </TableCell>
                                    <TableCell>{item.total.toFixed(2)}</TableCell>
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
                            <Select
                                value={selectedTaxRateId}
                                onValueChange={id => {
                                    setSelectedTaxRateId(id);
                                    const tr = taxRates.find(t => t.id === id);
                                    if (tr) setVatRate(tr.rate);
                                }}
                            >
                                <SelectTrigger><SelectValue placeholder="Choisir un taux" /></SelectTrigger>
                                <SelectContent>
                                    {taxRates.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.name} ({t.rate}%)</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                type="number"
                                value={vatRate}
                                onChange={e => setVatRate(Number(e.target.value))}
                                placeholder="Taux TVA %"
                            />
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
                        <Textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Ex : Merci pour votre confiance."
                            rows={3}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Conditions de paiement</Label>
                        <Textarea
                            value={terms}
                            onChange={e => setTerms(e.target.value)}
                            placeholder="Ex : Paiement à 30 jours."
                            rows={2}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );

    const PreviewSection = (
        <PreviewCard className="rounded-2xl p-8 min-h-[600px]">
            <div className="space-y-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold">FACTURE</h2>
                        <p>Date: {new Date().toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="font-semibold">{orgName}</p>
                    </div>
                </div>

                <div className="border-t pt-4">
                    <p className="font-semibold">Facturé à :</p>
                    {useExistingClient ? (
                        (() => {
                            const c = clients.find(c => c.id === selectedClientId);
                            return c ? (
                                <>
                                    <p>{c.name}</p>
                                    {c.email && <p>{c.email}</p>}
                                    {c.phone && <p>{c.phone}</p>}
                                </>
                            ) : <p className="text-muted-foreground">—</p>;
                        })()
                    ) : (
                        <>
                            <p>{client.name || "Nom du client"}</p>
                            <p>{client.email}</p>
                            <p>{client.address}</p>
                            {clientType === "COMPANY" && client.taxId && <p>TVA: {client.taxId}</p>}
                        </>
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
                        {items.map((item, index) => (
                            <TableRow key={index}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>{item.unitPrice}</TableCell>
                                <TableCell>{item.total.toFixed(2)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                <div className="flex justify-end">
                    <div className="w-64 space-y-2 text-lg">
                        <div className="flex justify-between">
                            <span>Sous-total</span>
                            <span>{subtotal.toFixed(2)} {defaultCurrency}</span>
                        </div>
                        {useVAT && (
                            <div className="flex justify-between">
                                <span>TVA ({vatRate}%)</span>
                                <span>{tax.toFixed(2)} {defaultCurrency}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-xl">
                            <span>Total</span>
                            <span>{total.toFixed(2)} {defaultCurrency}</span>
                        </div>
                    </div>
                </div>
            </div>
        </PreviewCard>
    );

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">

            {/* Compteur plan — discret, en haut à droite */}
            {planInfo.planLimit !== null && (
                <p className="mb-4 text-xs text-muted-foreground text-right">
                    {planInfo.currentCount}/{planInfo.planLimit} factures — plan {planInfo.planName}
                </p>
            )}

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

            <div className="flex justify-end gap-4 mt-8">
                <Button variant="outline" onClick={() => handleSave("DRAFT")} disabled={isPending}>
                    {isPending ? "Enregistrement..." : "Brouillon"}
                </Button>
                <Button onClick={() => handleSave("SENT")} disabled={isPending}>
                    {isPending ? "..." : "Créer la facture"}
                </Button>
            </div>
        </div>
    );
}