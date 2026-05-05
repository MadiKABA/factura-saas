"use client";

import { Button } from "@/components/ui/button";
import { useInvoiceFormContext } from "@/lib/context/invoice-form.context";

type Props = {
  className?: string;
  mobile?: boolean;
};

export function FormActions({ className, mobile = false }: Props) {
  const { isPending, save } = useInvoiceFormContext();

  return (
    <div className={className}>
      <Button variant="outline" onClick={() => save("DRAFT")} disabled={isPending}>
        {isPending ? "Enregistrement..." : mobile ? "💾 Brouillon" : "Brouillon"}
      </Button>
      <Button onClick={() => save("SENT")} disabled={isPending}>
        {isPending ? "..." : mobile ? "✉️ Créer" : "Créer la facture"}
      </Button>
    </div>
  );
}
