"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvoiceAction } from "@/server/actions/invoice.action";
import type { CreateInvoiceInput } from "@/lib/validations/invoice.schema";
import type { InvoiceLineItem, NewClientData } from "@/lib/invoice/types";

type Options = { orgSlug: string; defaultCurrency: string };

export function useInvoiceForm({ orgSlug, defaultCurrency }: Options) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [clientType, setClientType] = useState("INDIVIDUAL");
  const [useExistingClient, setUseExistingClient] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [client, setClient] = useState<NewClientData>({
    name: "", email: "", address: "", taxId: "",
  });

  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().split("T")[0] ?? "",
  );
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [originQuoteId, setOriginQuoteId] = useState("");

  function handleSave(
    items: InvoiceLineItem[],
    useVAT: boolean,
    vatRate: number,
    selectedTaxRateId: string,
    status: "DRAFT" | "SENT",
  ) {
    setGlobalError(null);

    const filteredItems = items.filter(i => i.name.trim());

    if (!useExistingClient && !client.name) {
      setGlobalError("Sélectionne ou crée un client.");
      return;
    }
    if (useExistingClient && !selectedClientId) {
      setGlobalError("Sélectionne ou crée un client.");
      return;
    }
    if (!filteredItems.length) {
      setGlobalError("Ajoute au moins un article.");
      return;
    }

    const payload: CreateInvoiceInput = {
      clientId: useExistingClient && selectedClientId ? selectedClientId : undefined,
      newClient: !useExistingClient && client.name ? {
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
      items: filteredItems.map(i => ({
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

    startTransition(async () => {
      const result = await createInvoiceAction(orgSlug, payload);
      if (!result.success) {
        setGlobalError(result.error);
        return;
      }
      router.push(`/${orgSlug}/invoices/${result.data.id}`);
    });
  }

  return {
    isPending, globalError,
    clientType, setClientType,
    useExistingClient, setUseExistingClient,
    selectedClientId, setSelectedClientId,
    client, setClient,
    issueDate, setIssueDate,
    dueDate, setDueDate,
    notes, setNotes,
    terms, setTerms,
    originQuoteId, setOriginQuoteId,
    handleSave,
  };
}
