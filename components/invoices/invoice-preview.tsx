"use client";

import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceSummary } from "./invoice-summary";
import { useInvoiceFormContext } from "@/lib/context/invoice-form.context";

export function InvoicePreview() {
  const {
    orgName, clients, items,
    useExistingClient, selectedClientId,
    client, clientType,
  } = useInvoiceFormContext();

  const selectedClient = clients.find(c => c.id === selectedClientId);

  return (
    <Card className="rounded-sm h-fit p-8 w-full transition-all duration-300">
      <div className="flex flex-col space-y-6">

        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold tracking-tight">FACTURE</h2>
            <p className="text-sm text-muted-foreground">
              Date : {new Date().toLocaleDateString("fr-FR")}
            </p>
          </div>
          <div className="text-right flex-1">
            <p className="font-semibold text-lg">{orgName || "Votre Organisation"}</p>
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="font-semibold text-sm uppercase text-muted-foreground mb-2">
            Facturé à :
          </p>
          <div className="space-y-1">
            {useExistingClient ? (
              selectedClient ? (
                <>
                  <p className="font-medium">{selectedClient.name}</p>
                  {selectedClient.email && <p className="text-sm">{selectedClient.email}</p>}
                  {selectedClient.phone && <p className="text-sm">{selectedClient.phone}</p>}
                </>
              ) : (
                <p className="text-muted-foreground italic">— Sélectionner un client —</p>
              )
            ) : (
              <>
                <p className="font-medium">{client.name || "Nom du client"}</p>
                {client.email && <p className="text-sm">{client.email}</p>}
                {client.address && (
                  <p className="text-sm whitespace-pre-line">{client.address}</p>
                )}
                {clientType === "COMPANY" && client.taxId && (
                  <p className="text-xs mt-1">TVA : {client.taxId}</p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%] text-left">Description</TableHead>
                <TableHead className="text-center">Qté</TableHead>
                <TableHead className="text-right">PU</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length > 0 ? items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-center">{item.quantity}</TableCell>
                  <TableCell className="text-right">{item.unitPrice}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {item.total.toFixed(2)}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-24 text-center text-muted-foreground italic"
                  >
                    Aucun article ajouté
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <InvoiceSummary />
      </div>
    </Card>
  );
}
