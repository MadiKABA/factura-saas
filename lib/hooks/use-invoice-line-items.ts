"use client";

import { useState } from "react";
import { computeItemTotal } from "@/lib/invoice/calculator";
import type { InvoiceLineItem, ProductOption } from "@/lib/invoice/types";

const EMPTY_ITEM: InvoiceLineItem = {
  name: "",
  quantity: 1,
  unitPrice: 0,
  total: 0,
  isService: false,
};

export function useInvoiceLineItems(products: ProductOption[]) {
  const [items, setItems] = useState<InvoiceLineItem[]>([{ ...EMPTY_ITEM }]);

  function addItem() {
    setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  function handleItemChange(
    index: number,
    field: keyof InvoiceLineItem,
    value: string | number,
  ) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index]! };
      if (field === "quantity" || field === "unitPrice") {
        (item as Record<string, unknown>)[field] = Number(value);
      } else {
        (item as Record<string, unknown>)[field] = value;
      }
      item.total = computeItemTotal(item.quantity, item.unitPrice);
      updated[index] = item;
      return updated;
    });
  }

  function handleSelectProduct(index: number, productId: string) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setItems(prev => {
      const updated = [...prev];
      const item = updated[index]!;
      updated[index] = {
        ...item,
        productId,
        name: product.name,
        unitPrice: product.price,
        isService: product.isService,
        total: computeItemTotal(item.quantity, product.price),
      };
      return updated;
    });
  }

  return { items, addItem, removeItem, handleItemChange, handleSelectProduct };
}
