"use client";

import { Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInvoiceFormContext } from "@/lib/context/invoice-form.context";

export function LineItemsTable() {
  const { items, addItem, removeItem, handleItemChange, handleSelectProduct, products } =
    useInvoiceFormContext();

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Produits / Services</CardTitle>
        <Button variant="outline" onClick={addItem} className="gap-2">
          <Plus className="w-4 h-4" /> Ajouter
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Qté</TableHead>
              <TableHead>Prix</TableHead>
              <TableHead>Total</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={index}>
                <TableCell className="space-y-1 min-w-[200px]">
                  {products.length > 0 && (
                    <Select
                      value={item.productId ?? ""}
                      onValueChange={pid => handleSelectProduct(index, pid)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Catalogue…" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    placeholder="Produit ou service"
                    value={item.name}
                    onChange={e => handleItemChange(index, "name", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    className="w-20"
                    value={item.quantity}
                    onChange={e => handleItemChange(index, "quantity", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    className="w-28"
                    value={item.unitPrice}
                    onChange={e => handleItemChange(index, "unitPrice", e.target.value)}
                  />
                </TableCell>
                <TableCell>{item.total.toFixed(2)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                    <Trash className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
