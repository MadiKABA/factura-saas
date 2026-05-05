import type { PlanLimitInfo } from "@/server/queries/invoice.query";

export type ClientOption = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: string;
};

export type ProductOption = {
  id: string;
  name: string;
  price: number;
  isService: boolean;
  sku: string | null;
};

export type TaxRateOption = {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
};

export type QuoteOption = {
  id: string;
  number: string;
  clientName: string;
  total: number;
};

export type InvoiceLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  isService: boolean;
  productId?: string;
};

export type NewClientData = {
  name: string;
  email: string;
  address: string;
  taxId: string;
};

export type InvoiceFormProps = {
  orgSlug: string;
  orgName: string;
  defaultCurrency: string;
  clients: ClientOption[];
  products: ProductOption[];
  taxRates: TaxRateOption[];
  quotes: QuoteOption[];
  planInfo: PlanLimitInfo;
};
