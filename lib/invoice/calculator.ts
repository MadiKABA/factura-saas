import type { InvoiceLineItem } from "./types";

export function computeItemTotal(quantity: number, unitPrice: number): number {
  return quantity * unitPrice;
}

export function computeSubtotal(items: InvoiceLineItem[]): number {
  return items.reduce((acc, item) => acc + item.total, 0);
}

export function computeTax(subtotal: number, useVAT: boolean, vatRate: number): number {
  return useVAT ? subtotal * (vatRate / 100) : 0;
}
