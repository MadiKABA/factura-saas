"use client";

import { useState } from "react";
import type { TaxRateOption } from "@/lib/invoice/types";

export function useInvoiceTaxes(taxRates: TaxRateOption[]) {
  const defaultRate = taxRates.find(t => t.isDefault);
  const [useVAT, setUseVAT] = useState(false);
  const [vatRate, setVatRate] = useState(defaultRate?.rate ?? 18);
  const [selectedTaxRateId, setSelectedTaxRateId] = useState(defaultRate?.id ?? "");

  function handleTaxRateChange(id: string) {
    setSelectedTaxRateId(id);
    const tr = taxRates.find(t => t.id === id);
    if (tr) setVatRate(tr.rate);
  }

  return { useVAT, setUseVAT, vatRate, setVatRate, selectedTaxRateId, handleTaxRateChange };
}
