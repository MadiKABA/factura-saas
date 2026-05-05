"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceFormProvider, useInvoiceFormContext } from "@/lib/context/invoice-form.context";
import type { InvoiceFormProps } from "@/lib/invoice/types";
import { ClientSection } from "./client-section";
import { DatesSection } from "./dates-section";
import { FormActions } from "./form-actions";
import { InvoicePreview } from "./invoice-preview";
import { LineItemsTable } from "./line-items-table";
import { NotesSection } from "./notes-section";
import { TaxesSection } from "./taxes-section";

function QuoteSelector() {
  const { quotes, originQuoteId, setOriginQuoteId } = useInvoiceFormContext();
  if (!quotes.length) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader><CardTitle>Depuis un devis (optionnel)</CardTitle></CardHeader>
      <CardContent>
        <Select value={originQuoteId} onValueChange={setOriginQuoteId}>
          <SelectTrigger><SelectValue placeholder="Aucun devis associé" /></SelectTrigger>
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
  );
}

function ErrorBanner() {
  const { globalError } = useInvoiceFormContext();
  if (!globalError) return null;
  return (
    <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
      ⚠️ {globalError}
    </div>
  );
}

function FormSections() {
  return (
    <div className="space-y-8">
      <ErrorBanner />
      <QuoteSelector />
      <LineItemsTable />
      <DatesSection />
      <ClientSection />
      <TaxesSection />
      <NotesSection />
    </div>
  );
}

function FormLayout() {
  const { planInfo } = useInvoiceFormContext();

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
      {planInfo.planLimit !== null && (
        <p className="mb-4 text-xs text-muted-foreground text-right">
          {planInfo.currentCount}/{planInfo.planLimit} factures — plan {planInfo.planName}
        </p>
      )}

      {/* Desktop : form | preview */}
      <div className="hidden md:grid md:grid-cols-2 gap-8 items-start">
        <FormSections />
        <div className="flex flex-col gap-4">
          <InvoicePreview />
          <FormActions className="flex justify-end gap-3" />
        </div>
      </div>

      {/* Mobile : onglets */}
      <div className="md:hidden">
        <Tabs defaultValue="form">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="form">Formulaire</TabsTrigger>
            <TabsTrigger value="preview">Aperçu</TabsTrigger>
          </TabsList>
          <TabsContent value="form"><FormSections /></TabsContent>
          <TabsContent value="preview"><InvoicePreview /></TabsContent>
        </Tabs>
      </div>

      {/* Sticky mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-zinc-200 px-4 py-3 flex gap-3">
        <FormActions mobile className="flex gap-3 w-full [&>button]:flex-1" />
      </div>
    </div>
  );
}

export function NewInvoiceForm(props: InvoiceFormProps) {
  return (
    <InvoiceFormProvider {...props}>
      <FormLayout />
    </InvoiceFormProvider>
  );
}
