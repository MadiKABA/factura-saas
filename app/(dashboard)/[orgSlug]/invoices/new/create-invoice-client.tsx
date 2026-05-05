"use client";

import { NewInvoiceForm } from "@/components/invoices/new-invoice-form";
import type { InvoiceFormProps } from "@/lib/invoice/types";

export default function CreateInvoiceClient(props: InvoiceFormProps) {
  return <NewInvoiceForm {...props} />;
}
