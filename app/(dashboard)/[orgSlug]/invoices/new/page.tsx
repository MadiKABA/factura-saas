"use client";

import { useState } from "react";
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

type InvoiceItemType = {
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
};

export default function CreateInvoicePage() {
    const [clientType, setClientType] = useState("INDIVIDUAL");
    const [useExistingClient, setUseExistingClient] = useState(true);
    const [useVAT, setUseVAT] = useState(true);
    const [vatRate, setVatRate] = useState(20);

    const [client, setClient] = useState({
        name: "",
        email: "",
        address: "",
        taxId: "",
    });

    const [items, setItems] = useState<InvoiceItemType[]>([
        { name: "", quantity: 1, unitPrice: 0, total: 0 },
    ]);

    const handleItemChange = (
        index: number,
        field: keyof InvoiceItemType,
        value: string | number
    ) => {
        const updated = [...items];

        if (field === "quantity" || field === "unitPrice") {
            updated[index][field] = Number(value) as never;
        } else if (field === "name") {
            updated[index][field] = String(value) as never;
        }

        updated[index].total =
            updated[index].quantity * updated[index].unitPrice;

        setItems(updated);
    };

    const addItem = () => {
        setItems([...items, { name: "", quantity: 1, unitPrice: 0, total: 0 }]);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const subtotal = items.reduce((acc, item) => acc + item.total, 0);
    const tax = useVAT ? subtotal * (vatRate / 100) : 0;
    const total = subtotal + tax;

    const FormSection = (
        <div className="space-y-8">
            <Card className="rounded-sm">
                <CardHeader>
                    <CardTitle>Client</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <Label>Client existant</Label>
                        <Switch
                            checked={useExistingClient}
                            onCheckedChange={setUseExistingClient}
                        />
                    </div>

                    {useExistingClient ? (
                        <Select>
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionner un client" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">Client A</SelectItem>
                                <SelectItem value="2">Client B</SelectItem>
                            </SelectContent>
                        </Select>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Type de client</Label>
                                <Select value={clientType} onValueChange={setClientType}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="INDIVIDUAL">Particulier</SelectItem>
                                        <SelectItem value="COMPANY">Entreprise</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <Input
                                placeholder={
                                    clientType === "COMPANY"
                                        ? "Nom de l'entreprise"
                                        : "Nom complet"
                                }
                                value={client.name}
                                onChange={(e) =>
                                    setClient({ ...client, name: e.target.value })
                                }
                            />

                            <Input
                                placeholder="Email"
                                value={client.email}
                                onChange={(e) =>
                                    setClient({ ...client, email: e.target.value })
                                }
                            />

                            <Input
                                placeholder="Adresse"
                                value={client.address}
                                onChange={(e) =>
                                    setClient({ ...client, address: e.target.value })
                                }
                            />

                            {clientType === "COMPANY" && (
                                <Input
                                    placeholder="Numéro TVA / SIRET"
                                    value={client.taxId}
                                    onChange={(e) =>
                                        setClient({ ...client, taxId: e.target.value })
                                    }
                                />
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="rounded-sm">
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
                                    <TableCell>
                                        <Input
                                            placeholder="Produit ou service"
                                            value={item.name}
                                            onChange={(e) =>
                                                handleItemChange(index, "name", e.target.value)
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) =>
                                                handleItemChange(index, "quantity", e.target.value)
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            value={item.unitPrice}
                                            onChange={(e) =>
                                                handleItemChange(index, "unitPrice", e.target.value)
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>{item.total.toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeItem(index)}
                                        >
                                            <Trash className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card className="rounded-sm">
                <CardHeader>
                    <CardTitle>TVA</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>Appliquer TVA</Label>
                        <Switch checked={useVAT} onCheckedChange={setUseVAT} />
                    </div>

                    {useVAT && (
                        <Input
                            type="number"
                            value={vatRate}
                            onChange={(e) => setVatRate(Number(e.target.value))}
                            placeholder="Taux TVA %"
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );

    const PreviewSection = (
        <PreviewCard className="rounded-sm p-8 min-h-[600px]">
            <div className="space-y-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold">FACTURE</h2>
                        <p>Date: {new Date().toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="font-semibold">Votre Société</p>
                        <p>Adresse société</p>
                    </div>
                </div>

                <div className="border-t pt-4">
                    <p className="font-semibold">Facturé à :</p>
                    <p>{client.name || "Nom du client"}</p>
                    <p>{client.email}</p>
                    <p>{client.address}</p>
                    {clientType === "COMPANY" && client.taxId && (
                        <p>TVA: {client.taxId}</p>
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
                            <span>{subtotal.toFixed(2)}</span>
                        </div>
                        {useVAT && (
                            <div className="flex justify-between">
                                <span>TVA ({vatRate}%)</span>
                                <span>{tax.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-xl">
                            <span>Total</span>
                            <span>{total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </PreviewCard>
    );

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
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
                <Button variant="outline">Brouillon</Button>
                <Button>Créer la facture</Button>
            </div>
        </div>
    );
}
