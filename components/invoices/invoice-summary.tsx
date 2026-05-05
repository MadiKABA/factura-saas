"use client";

import { useInvoiceFormContext } from "@/lib/context/invoice-form.context";

export function InvoiceSummary() {
  const { subtotal, tax, total, useVAT, vatRate, defaultCurrency } = useInvoiceFormContext();

  return (
    <div className="flex justify-end pt-4">
      <div className="w-full max-w-[280px] space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Sous-total</span>
          <span className="font-medium">{subtotal.toFixed(2)} {defaultCurrency}</span>
        </div>
        {useVAT && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">TVA ({vatRate}%)</span>
            <span className="font-medium">{tax.toFixed(2)} {defaultCurrency}</span>
          </div>
        )}
        <div className="border-t pt-3 flex justify-between items-center font-bold text-xl text-primary">
          <span>Total</span>
          <span>{total.toFixed(2)} {defaultCurrency}</span>
        </div>
      </div>
    </div>
  );
}
