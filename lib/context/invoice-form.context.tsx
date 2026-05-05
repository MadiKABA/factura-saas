"use client";

import { createContext, useContext, type ReactNode } from "react";
import { computeSubtotal, computeTax } from "@/lib/invoice/calculator";
import { useInvoiceLineItems } from "@/lib/hooks/use-invoice-line-items";
import { useInvoiceTaxes } from "@/lib/hooks/use-invoice-taxes";
import { useInvoiceForm } from "@/lib/hooks/use-invoice-form";
import type {
  InvoiceFormProps,
  InvoiceLineItem,
  NewClientData,
  ClientOption,
  ProductOption,
  TaxRateOption,
  QuoteOption,
} from "@/lib/invoice/types";
import type { PlanLimitInfo } from "@/server/queries/invoice.query";

type InvoiceFormContextValue = {
  orgSlug: string;
  orgName: string;
  defaultCurrency: string;
  clients: ClientOption[];
  products: ProductOption[];
  taxRates: TaxRateOption[];
  quotes: QuoteOption[];
  planInfo: PlanLimitInfo;
  // Line items
  items: InvoiceLineItem[];
  addItem: () => void;
  removeItem: (i: number) => void;
  handleItemChange: (i: number, field: keyof InvoiceLineItem, value: string | number) => void;
  handleSelectProduct: (i: number, productId: string) => void;
  // Taxes
  useVAT: boolean;
  setUseVAT: (v: boolean) => void;
  vatRate: number;
  setVatRate: (v: number) => void;
  selectedTaxRateId: string;
  handleTaxRateChange: (id: string) => void;
  // Client / dates / notes
  clientType: string;
  setClientType: (v: string) => void;
  useExistingClient: boolean;
  setUseExistingClient: (v: boolean) => void;
  selectedClientId: string;
  setSelectedClientId: (v: string) => void;
  client: NewClientData;
  setClient: (v: NewClientData) => void;
  issueDate: string;
  setIssueDate: (v: string) => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  terms: string;
  setTerms: (v: string) => void;
  originQuoteId: string;
  setOriginQuoteId: (v: string) => void;
  // Computed
  subtotal: number;
  tax: number;
  total: number;
  // Submit
  globalError: string | null;
  isPending: boolean;
  save: (status: "DRAFT" | "SENT") => void;
};

const InvoiceFormContext = createContext<InvoiceFormContextValue | null>(null);

export function useInvoiceFormContext() {
  const ctx = useContext(InvoiceFormContext);
  if (!ctx) throw new Error("useInvoiceFormContext must be used inside InvoiceFormProvider");
  return ctx;
}

export function InvoiceFormProvider({
  children,
  ...props
}: InvoiceFormProps & { children: ReactNode }) {
  const lineItems = useInvoiceLineItems(props.products);
  const taxes = useInvoiceTaxes(props.taxRates);
  const { handleSave, ...form } = useInvoiceForm({
    orgSlug: props.orgSlug,
    defaultCurrency: props.defaultCurrency,
  });

  const subtotal = computeSubtotal(lineItems.items);
  const tax = computeTax(subtotal, taxes.useVAT, taxes.vatRate);

  function save(status: "DRAFT" | "SENT") {
    handleSave(lineItems.items, taxes.useVAT, taxes.vatRate, taxes.selectedTaxRateId, status);
  }

  return (
    <InvoiceFormContext.Provider
      value={{
        ...props,
        ...lineItems,
        ...taxes,
        ...form,
        subtotal,
        tax,
        total: subtotal + tax,
        save,
      }}
    >
      {children}
    </InvoiceFormContext.Provider>
  );
}
