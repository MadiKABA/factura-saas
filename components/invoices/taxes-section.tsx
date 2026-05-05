"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useInvoiceFormContext } from "@/lib/context/invoice-form.context";

export function TaxesSection() {
  const {
    taxRates,
    useVAT, setUseVAT,
    vatRate, setVatRate,
    selectedTaxRateId, handleTaxRateChange,
  } = useInvoiceFormContext();

  return (
    <Card className="rounded-2xl">
      <CardHeader><CardTitle>TVA</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Appliquer TVA</Label>
          <Switch checked={useVAT} onCheckedChange={setUseVAT} />
        </div>
        {useVAT && (
          taxRates.length > 0 ? (
            <Select value={selectedTaxRateId} onValueChange={handleTaxRateChange}>
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
  );
}
