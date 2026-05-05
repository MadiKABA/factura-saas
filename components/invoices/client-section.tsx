"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useInvoiceFormContext } from "@/lib/context/invoice-form.context";

export function ClientSection() {
  const {
    clients,
    clientType, setClientType,
    useExistingClient, setUseExistingClient,
    selectedClientId, setSelectedClientId,
    client, setClient,
  } = useInvoiceFormContext();

  return (
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
  );
}
