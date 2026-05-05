"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInvoiceFormContext } from "@/lib/context/invoice-form.context";

export function DatesSection() {
  const { issueDate, setIssueDate, dueDate, setDueDate } = useInvoiceFormContext();

  return (
    <Card className="rounded-2xl">
      <CardHeader><CardTitle>Dates</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Date de facturation</Label>
          <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{"Date d'échéance (optionnel)"}</Label>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}
