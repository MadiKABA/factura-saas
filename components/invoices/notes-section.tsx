"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useInvoiceFormContext } from "@/lib/context/invoice-form.context";

export function NotesSection() {
  const { notes, setNotes, terms, setTerms } = useInvoiceFormContext();

  return (
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
  );
}
