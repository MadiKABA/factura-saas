// src/app/(dashboard)/[orgSlug]/invoices/[invoiceId]/invoice-detail-client.tsxMadikaba@2004
"use client"
import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
    ArrowLeft, FileDown, Mail, Pencil, RefreshCw,
    Share2, Loader2, Building2, Calendar, Clock, CreditCard, StickyNote,
} from "lucide-react"
import { updateInvoiceStatusAction } from "@/server/actions/invoice.action"

// ─── jsPDF chargé dynamiquement (évite le bundle SSR) ────────────────────────
async function loadJsPDF() {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")
    return { jsPDF, autoTable }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "PARTIAL" | "OVERDUE" | "CANCELLED"

type Props = {
    orgSlug: string
    org: {
        id: string; name: string; address: string | null
        email: string | null; phone: string | null; logoUrl: string | null
    }
    invoice: {
        id: string; number: string; status: string
        issueDate: Date; dueDate: Date | null
        subtotal: number; taxTotal: number; total: number; currencyCode: string
        notes: string | null; terms: string | null; internalNotes: string | null
        originQuote: { id: string; number: string } | null
        client: {
            id: string; name: string; email: string | null
            phone: string | null; address: string | null; taxId: string | null
        } | null
        items: {
            id: string; name: string; description: string | null
            quantity: number; unitPrice: number; total: number
            taxRate: { name: string; rate: number } | null
        }[]
        payments: { id: string; amount: number; paidAt: Date; method: string | null; note: string | null }[]
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
const fmtDate = (d: Date | string | null) =>
    d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—"

function statusConfig(status: string) {
    switch (status) {
        case "PAID": return { label: "Payée", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" }
        case "SENT": return { label: "Envoyée", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200" }
        case "DRAFT": return { label: "Brouillon", dot: "bg-zinc-400", badge: "bg-zinc-100 text-zinc-500 border-zinc-200" }
        case "PARTIAL": return { label: "Partiel", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200" }
        case "OVERDUE": return { label: "En retard", dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200" }
        case "CANCELLED": return { label: "Annulée", dot: "bg-red-300", badge: "bg-red-50 text-red-400 border-red-100" }
        default: return { label: status, dot: "bg-zinc-400", badge: "bg-zinc-100 text-zinc-500 border-zinc-200" }
    }
}

function allowedTransitions(current: string): InvoiceStatus[] {
    switch (current) {
        case "DRAFT": return ["SENT", "CANCELLED"]
        case "SENT": return ["PAID", "PARTIAL", "OVERDUE", "CANCELLED"]
        case "PARTIAL": return ["PAID", "OVERDUE", "CANCELLED"]
        case "OVERDUE": return ["PAID", "PARTIAL", "CANCELLED"]
        default: return []
    }
}

// ═════════════════════════════════════════════════════════════════════════════
export default function InvoiceDetailClient({ orgSlug, org, invoice }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const [currentStatus, setCurrentStatus] = useState(invoice.status)
    const [statusModal, setStatusModal] = useState(false)
    const [newStatus, setNewStatus] = useState<InvoiceStatus | "">("")
    const [statusError, setStatusError] = useState<string | null>(null)
    const [shareToast, setShareToast] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [emailSending, setEmailSending] = useState(false)
    const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)

    const sc = statusConfig(currentStatus)
    const paidAmount = invoice.payments.reduce((s, p) => s + p.amount, 0)
    const remaining = invoice.total - paidAmount
    const transitions = allowedTransitions(currentStatus)

    // ─── Actions ───────────────────────────────────────────────────────────────
    function handleUpdateStatus() {
        if (!newStatus) return
        setStatusError(null)
        startTransition(async () => {
            const result = await updateInvoiceStatusAction(orgSlug, invoice.id, newStatus)
            if (!result.success) { setStatusError(result.error); return }
            setCurrentStatus(newStatus)
            setStatusModal(false)
            setNewStatus("")
        })
    }

    // ─── Génération PDF côté client avec jsPDF ────────────────────────────────
    async function generatePdfBlob(): Promise<Blob> {
        const { jsPDF: JsPDF, autoTable } = await loadJsPDF()
        const doc = new JsPDF({ unit: "mm", format: "a4" })

        // ───────── FORMATTER MONTANT ─────────
        const currencyFormatter = new Intl.NumberFormat("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })

        const fmtAmount = (value: number) =>
            currencyFormatter.format(Number(value) || 0)

        // ───────── CONVERSION NOMBRE → LETTRES ─────────
        function numberToFrenchWords(n: number): string {
            const units = [
                "", "un", "deux", "trois", "quatre", "cinq", "six",
                "sept", "huit", "neuf", "dix", "onze", "douze",
                "treize", "quatorze", "quinze", "seize"
            ]

            if (n === 0) return "zéro"
            if (n < 17) return units[n]
            if (n < 20) return "dix-" + units[n - 10]

            if (n < 100) {
                const tens = Math.floor(n / 10)
                const remainder = n % 10
                const tensWords = [
                    "", "", "vingt", "trente", "quarante",
                    "cinquante", "soixante"
                ]

                if (tens <= 6) {
                    return tensWords[tens] + (remainder ? "-" + units[remainder] : "")
                }

                if (tens === 7) {
                    return "soixante-" + numberToFrenchWords(10 + remainder)
                }

                if (tens === 8) {
                    return "quatre-vingt" + (remainder ? "-" + units[remainder] : "s")
                }

                if (tens === 9) {
                    return "quatre-vingt-" + numberToFrenchWords(10 + remainder)
                }
            }

            if (n < 1000) {
                const hundreds = Math.floor(n / 100)
                const remainder = n % 100
                let word = hundreds > 1 ? units[hundreds] + " cent" : "cent"
                if (remainder) word += " " + numberToFrenchWords(remainder)
                return word
            }

            if (n < 1000000) {
                const thousands = Math.floor(n / 1000)
                const remainder = n % 1000
                let word = thousands > 1
                    ? numberToFrenchWords(thousands) + " mille"
                    : "mille"
                if (remainder) word += " " + numberToFrenchWords(remainder)
                return word
            }

            return n.toString()
        }

        // ───────── PALETTE ─────────
        const primary = [15, 23, 42] as [number, number, number]
        const muted = [100, 116, 139] as [number, number, number]
        const border = [226, 232, 240] as [number, number, number]

        // ───────── CALCULS TOTAUX ─────────
        const subtotal = invoice.items.reduce((acc, item) => {
            const q = Number(item.quantity) || 0
            const p = Number(item.unitPrice) || 0
            return acc + q * p
        }, 0)

        const taxRate = Number(invoice.taxTotal) || 0
        const totalTVA = subtotal * (taxRate / 100)
        const totalTTC = subtotal + totalTVA

        // ───────── HEADER ─────────
        doc.setFillColor(245, 245, 245)
        doc.roundedRect(14, 15, 20, 20, 3, 3, "F")
        doc.setTextColor(...muted)
        doc.setFontSize(12)
        doc.setFont("helvetica", "bold")
        doc.text(org.name ? org.name.charAt(0).toUpperCase() : "F", 24, 28, { align: "center" })

        doc.setTextColor(...primary)
        doc.setFontSize(22)
        doc.text("FACTURE", 40, 26)

        doc.setFontSize(10)
        doc.text(org.name.toUpperCase(), 196, 20, { align: "right" })
        doc.setFontSize(8)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(...muted)
        if (org.address) doc.text(org.address, 196, 25, { align: "right" })

        doc.setDrawColor(...border)
        doc.line(14, 40, 196, 40)

        // ───────── CLIENT & INFOS ─────────
        doc.setTextColor(...muted)
        doc.setFontSize(8)
        doc.setFont("helvetica", "bold")
        doc.text("FACTURÉ À", 14, 50)

        doc.setTextColor(...primary)
        doc.setFontSize(11)
        doc.text(invoice.client?.name || "Client", 14, 56)

        doc.setFont("helvetica", "normal")
        doc.setFontSize(9)
        doc.setTextColor(...muted)
        if (invoice.client?.address)
            doc.text(invoice.client.address, 14, 62)

        const infoX = 140
        doc.setFont("helvetica", "bold")
        doc.text("N° FACTURE", infoX, 50)
        doc.text("DATE", infoX, 60)

        doc.setFont("helvetica", "normal")
        doc.setTextColor(...primary)
        doc.text(invoice.number, 196, 50, { align: "right" })
        doc.text(
            new Date(invoice.issueDate).toLocaleDateString("fr-FR"),
            196,
            60,
            { align: "right" }
        )

        // ───────── TABLEAU (SANS TVA) ─────────
        const tableData = invoice.items.map(item => {
            const quantity = Number(item.quantity) || 0
            const unitPrice = Number(item.unitPrice) || 0
            const lineTotal = quantity * unitPrice

            return [
                item.name,
                quantity,
                fmtAmount(unitPrice),
                fmtAmount(lineTotal)
            ]
        })

        autoTable(doc, {
            startY: 75,
            head: [["DÉSIGNATION", "QTÉ", "PRIX UNITÉ", "TOTAL"]],
            body: tableData,
            theme: "striped",
            headStyles: { fillColor: primary, fontSize: 8, fontStyle: "bold" },
            bodyStyles: { fontSize: 9, textColor: [40, 40, 40] },
            margin: { left: 14, right: 14 },
        })

        let finalY = (doc as any).lastAutoTable.finalY + 12

        // ───────── MONTANT EN LETTRES ─────────
        doc.setFontSize(8)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(...muted)
        doc.text("ARRÊTÉE LA PRÉSENTE FACTURE À LA SOMME DE :", 14, finalY)

        const totalRounded = Math.round(totalTTC)
        const totalInWords = numberToFrenchWords(totalRounded)

        doc.setFont("helvetica", "normal")
        doc.setTextColor(...primary)
        doc.text(
            `${totalInWords.toUpperCase()} ${invoice.currencyCode}`,
            14,
            finalY + 6
        )

        // ───────── TOTAL TTC ─────────
        const totalsX = 145
        doc.setFont("helvetica", "bold")
        doc.setFontSize(12)
        doc.setTextColor(...primary)
        doc.text("TOTAL TTC", totalsX, finalY + 15)
        doc.text(
            `${fmtAmount(totalTTC)} ${invoice.currencyCode}`,
            196,
            finalY + 15,
            { align: "right" }
        )

        // ───────── FOOTER ─────────
        doc.setFontSize(7)
        doc.text(
            "Document généré par Factura - Merci de votre confiance",
            105,
            285,
            { align: "center" }
        )

        return doc.output("blob")
    }

    async function handleExportPdf() {
        setExporting(true)
        try {
            const blob = await generatePdfBlob()
            const url = URL.createObjectURL(blob)
            setPdfBlobUrl(url)
            // Déclencher le téléchargement
            const a = document.createElement("a")
            a.href = url
            a.download = `${invoice.number}.pdf`
            a.click()
        } catch (e) {
            console.error("PDF generation error:", e)
        } finally {
            setExporting(false)
        }
    }

    async function handleSendEmail() {
        setEmailSending(true)
        await new Promise(r => setTimeout(r, 900)) // TODO: appeler sendInvoiceEmailAction
        setEmailSending(false)
    }

    // ─── Partager via WhatsApp avec PDF en pièce jointe ─────────────────────────
    // WhatsApp ne supporte pas les fichiers via URL directement.
    // Stratégie : générer le PDF → uploader vers un endpoint temporaire → partager le lien.
    // En attendant l'endpoint : on génère le PDF localement + on ouvre WhatsApp
    // avec un message qui inclut les infos clés de la facture.
    async function handleShare() {
        setExporting(true)
        try {
            // 1. Générer le PDF côté client
            const blob = await generatePdfBlob()

            // 2. Essayer de partager via Web Share API (supporte les fichiers sur mobile)
            if (navigator.canShare && navigator.canShare({ files: [new File([blob], `${invoice.number}.pdf`, { type: "application/pdf" })] })) {
                const file = new File([blob], `${invoice.number}.pdf`, { type: "application/pdf" })
                await navigator.share({
                    title: `Facture ${invoice.number}`,
                    text: buildWhatsAppText(),
                    files: [file],
                })
                return
            }

            // 3. Fallback : télécharger le PDF + ouvrir WhatsApp avec le texte
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${invoice.number}.pdf`
            a.click()

            // Ouvrir WhatsApp après un court délai (le temps que le téléchargement démarre)
            setTimeout(() => {
                const phone = invoice.client?.phone?.replace(/\D/g, "") ?? ""
                const waUrl = phone
                    ? `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppText())}`
                    : `https://wa.me/?text=${encodeURIComponent(buildWhatsAppText())}`
                window.open(waUrl, "_blank")
            }, 500)

        } catch (e) {
            console.error("Share error:", e)
        } finally {
            setExporting(false)
        }
    }

    function buildWhatsAppText(): string {
        const clientName = invoice.client?.name ?? "Client"
        const dueStr = invoice.dueDate
            ? `Échéance : ${new Date(invoice.dueDate).toLocaleDateString("fr-FR")}\n`
            : ""
        return (
            `Bonjour ${clientName},\n\n` +
            `Veuillez trouver ci-joint votre facture *${invoice.number}*.\n\n` +
            `Montant TTC : *${fmt(invoice.total)} ${invoice.currencyCode}*\n` +
            `${dueStr}` +
            `\nCordialement,\n${org.name}`
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-zinc-50/60">

            {/* ── Barre supérieure ─────────────────────────────────────────────── */}
            <header className="sticky top-0 z-20 bg-white border-b border-zinc-200 shadow-sm w-full">
                <div className="mx-auto max-w-6xl px-3 sm:px-6 flex items-center h-14 gap-2 sm:gap-3">

                    {/* Navigation & Numéro : On utilise shrink-0 pour éviter que le texte ne s'écrase */}
                    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink-0">
                        <button
                            onClick={() => router.push(`/${orgSlug}/invoices`)}
                            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span className="hidden xs:inline">Factures</span>
                        </button>

                        <span className="text-zinc-300 shrink-0">/</span>

                        {/* truncate pour éviter de casser le layout sur très petits écrans */}
                        <span className="font-mono text-xs sm:text-sm font-semibold text-zinc-800 truncate max-w-[80px] xs:max-w-none">
                            {invoice.number}
                        </span>

                        {/* Badge statut : On cache le point sur mobile pour gagner de la place */}
                        <Badge variant="outline" className={`rounded-full flex items-center gap-1 px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-semibold shrink-0 ${sc.badge}`}>
                            <span className={`hidden xs:block h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                        </Badge>
                    </div>

                    {/* Actions header : Flex-1 et justify-end pour pousser à droite proprement */}
                    <div className="flex-1 flex items-center justify-end gap-1 sm:gap-2 min-w-0">
                        {/* Changer statut */}
                        {transitions.length > 0 && (
                            <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3 gap-1.5" onClick={() => setStatusModal(true)}>
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span className="hidden md:inline text-xs">Statut</span>
                            </Button>
                        )}

                        {/* Modifier */}
                        <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3 gap-1.5"
                            onClick={() => router.push(`/${orgSlug}/invoices/${invoice.id}/edit`)}>
                            <Pencil className="w-3.5 h-3.5" />
                            <span className="hidden md:inline text-xs">Modifier</span>
                        </Button>

                        {/* Envoyer email */}
                        <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3 gap-1.5" onClick={handleSendEmail} disabled={emailSending}>
                            {emailSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline text-xs">Envoyer</span>
                        </Button>

                        {/* Exporter PDF */}
                        <Button size="sm" className="h-8 px-2 sm:px-3 gap-1.5 bg-zinc-900 hover:bg-zinc-800" onClick={handleExportPdf} disabled={exporting}>
                            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline text-xs">PDF</span>
                        </Button>

                        {/* Partager : Toujours visible en icône */}
                        <button onClick={handleShare} className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors shrink-0">
                            <Share2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Contenu ──────────────────────────────────────────────────────── */}
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">

                {/* ── Layout 2 colonnes (gauche: principal / droite: sidebar) ───── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* ════════ COLONNE PRINCIPALE ════════════════════════════════ */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* ── Carte facture principale ─────────────────────────────── */}
                        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">

                            {/* Bandeau coloré selon statut */}
                            <div className={`h-1.5 w-full ${currentStatus === "PAID" ? "bg-emerald-400" :
                                currentStatus === "OVERDUE" ? "bg-red-400" :
                                    currentStatus === "SENT" ? "bg-blue-400" :
                                        currentStatus === "PARTIAL" ? "bg-amber-400" : "bg-zinc-200"
                                }`} />

                            <div className="p-6 sm:p-8">

                                {/* En-tête facture */}
                                <div className="flex items-start justify-between mb-8">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-1">Facture</p>
                                        <h1 className="text-3xl font-black font-mono tracking-tight text-zinc-900">{invoice.number}</h1>
                                        {invoice.originQuote && (
                                            <p className="mt-1 text-xs text-zinc-400">
                                                Devis d'origine :{" "}
                                                <button
                                                    onClick={() => router.push(`/${orgSlug}/quotes/${invoice.originQuote!.id}`)}
                                                    className="text-blue-500 underline hover:text-blue-700"
                                                >
                                                    {invoice.originQuote.number}
                                                </button>
                                            </p>
                                        )}
                                    </div>
                                    {/* Logo ou initiales org */}
                                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-900 text-white text-xl font-black shadow-sm">
                                        {org.name.charAt(0)}
                                    </div>
                                </div>

                                {/* Émetteur ↔ Client */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                                    {/* De */}
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
                                            <Building2 className="w-3.5 h-3.5" /> De
                                        </p>
                                        <p className="font-bold text-zinc-900">{org.name}</p>
                                        {org.address && <p className="text-sm text-zinc-500 mt-0.5">{org.address}</p>}
                                        {org.email && <p className="text-sm text-zinc-500">{org.email}</p>}
                                        {org.phone && <p className="text-sm text-zinc-500">{org.phone}</p>}
                                    </div>
                                    {/* À */}
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
                                            <Building2 className="w-3.5 h-3.5" /> Facturé à
                                        </p>
                                        {invoice.client ? (
                                            <>
                                                <p className="font-bold text-zinc-900">{invoice.client.name}</p>
                                                {invoice.client.address && <p className="text-sm text-zinc-500 mt-0.5">{invoice.client.address}</p>}
                                                {invoice.client.email && <p className="text-sm text-zinc-500">{invoice.client.email}</p>}
                                                {invoice.client.phone && <p className="text-sm text-zinc-500">{invoice.client.phone}</p>}
                                                {invoice.client.taxId && <p className="text-sm text-zinc-400 mt-0.5">N° TVA : {invoice.client.taxId}</p>}
                                            </>
                                        ) : (
                                            <p className="text-sm text-zinc-400">— Client non associé</p>
                                        )}
                                    </div>
                                </div>

                                {/* Dates */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
                                    <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3">
                                        <p className="text-xs text-zinc-400 flex items-center gap-1 mb-1"><Calendar className="w-3 h-3" /> Émise le</p>
                                        <p className="text-sm font-semibold text-zinc-800">{fmtDate(invoice.issueDate)}</p>
                                    </div>
                                    <div className={`rounded-xl border px-4 py-3 ${currentStatus === "OVERDUE"
                                        ? "bg-red-50 border-red-100"
                                        : "bg-zinc-50 border-zinc-100"
                                        }`}>
                                        <p className={`text-xs flex items-center gap-1 mb-1 ${currentStatus === "OVERDUE" ? "text-red-400" : "text-zinc-400"}`}>
                                            <Clock className="w-3 h-3" /> Échéance
                                        </p>
                                        <p className={`text-sm font-semibold ${currentStatus === "OVERDUE" ? "text-red-700" : "text-zinc-800"}`}>
                                            {fmtDate(invoice.dueDate)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3">
                                        <p className="text-xs text-zinc-400 flex items-center gap-1 mb-1"><CreditCard className="w-3 h-3" /> Devise</p>
                                        <p className="text-sm font-semibold text-zinc-800">{invoice.currencyCode}</p>
                                    </div>
                                </div>

                                {/* ── Tableau des articles ──────────────────────────────── */}
                                <div className="rounded-xl border border-zinc-200 overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-zinc-50 border-b border-zinc-200">
                                                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Article</th>
                                                <th className="text-center py-3 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-16">Qté</th>
                                                <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-28">Prix unit.</th>
                                                <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-20">TVA</th>
                                                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-32">Total HT</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100">
                                            {invoice.items.map((item, i) => (
                                                <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/40"}>
                                                    <td className="py-3.5 px-4">
                                                        <p className="font-medium text-zinc-800">{item.name}</p>
                                                        {item.description && (
                                                            <p className="text-xs text-zinc-400 mt-0.5">{item.description}</p>
                                                        )}
                                                    </td>
                                                    <td className="py-3.5 px-3 text-center text-zinc-600 tabular-nums">{item.quantity}</td>
                                                    <td className="py-3.5 px-3 text-right text-zinc-600 tabular-nums">{fmt(item.unitPrice)}</td>
                                                    <td className="py-3.5 px-3 text-right text-zinc-400 tabular-nums text-xs">
                                                        {item.taxRate ? `${item.taxRate.rate}%` : "—"}
                                                    </td>
                                                    <td className="py-3.5 px-4 text-right font-semibold text-zinc-800 tabular-nums">{fmt(item.total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* ── Totaux ────────────────────────────────────────────── */}
                                <div className="mt-4 flex justify-end">
                                    <div className="w-72 space-y-2">
                                        <div className="flex justify-between text-sm text-zinc-500">
                                            <span>Sous-total HT</span>
                                            <span className="tabular-nums">{fmt(invoice.subtotal)} {invoice.currencyCode}</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-zinc-500">
                                            <span>TVA</span>
                                            <span className="tabular-nums">{fmt(invoice.taxTotal)} {invoice.currencyCode}</span>
                                        </div>
                                        <div className="flex justify-between border-t border-zinc-200 pt-2.5 mt-1">
                                            <span className="font-black text-zinc-900 text-base">Total TTC</span>
                                            <span className="font-black text-zinc-900 text-xl tabular-nums">
                                                {fmt(invoice.total)} {invoice.currencyCode}
                                            </span>
                                        </div>

                                        {/* Progression paiement si partiel */}
                                        {(currentStatus === "PARTIAL" || paidAmount > 0) && (
                                            <div className="mt-3 rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 space-y-2">
                                                <div className="flex justify-between text-xs text-zinc-500">
                                                    <span>Déjà réglé</span>
                                                    <span className="text-emerald-600 font-semibold tabular-nums">
                                                        {fmt(paidAmount)} {invoice.currencyCode}
                                                    </span>
                                                </div>
                                                {/* Barre de progression */}
                                                <div className="h-2 rounded-full bg-zinc-200 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-emerald-400 transition-all"
                                                        style={{ width: `${Math.min(100, (paidAmount / invoice.total) * 100)}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between text-xs text-zinc-500">
                                                    <span>Reste à payer</span>
                                                    <span className="font-semibold tabular-nums text-amber-600">
                                                        {fmt(remaining)} {invoice.currencyCode}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ── Notes client ─────────────────────────────────────── */}
                                {(invoice.notes || invoice.terms) && (
                                    <div className="mt-8 pt-6 border-t border-zinc-100 grid sm:grid-cols-2 gap-4">
                                        {invoice.notes && (
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Note</p>
                                                <p className="text-sm text-zinc-600 leading-relaxed">{invoice.notes}</p>
                                            </div>
                                        )}
                                        {invoice.terms && (
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Conditions</p>
                                                <p className="text-sm text-zinc-600 leading-relaxed">{invoice.terms}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ════════ SIDEBAR ═══════════════════════════════════════════ */}
                    <div className="space-y-5">

                        {/* ── Résumé statut ─────────────────────────────────────────── */}
                        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Statut</p>
                            <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 ${sc.badge}`}>
                                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${sc.dot}`} />
                                <span className="font-bold">{sc.label}</span>
                            </div>

                            {transitions.length > 0 && (
                                <button
                                    onClick={() => setStatusModal(true)}
                                    className="mt-3 w-full rounded-xl border border-zinc-200 py-2.5 text-sm text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 flex items-center justify-center gap-1.5 transition-all"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" /> Changer le statut
                                </button>
                            )}
                        </div>
                        {/* ── Notes internes ────────────────────────────────────────── */}
                        {invoice.internalNotes && (
                            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                                <p className="text-xs font-semibold uppercase tracking-wider text-amber-500 mb-2 flex items-center gap-1.5">
                                    <StickyNote className="w-3.5 h-3.5" /> Note interne
                                </p>
                                <p className="text-sm text-amber-800 leading-relaxed">{invoice.internalNotes}</p>
                            </div>
                        )}

                        {/* ── Historique paiements ──────────────────────────────────── */}
                        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
                                <h2 className="font-bold text-zinc-800 flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-zinc-400" /> Paiements
                                </h2>
                                <span className="text-xs text-zinc-400">{invoice.payments.length} règlement{invoice.payments.length > 1 ? "s" : ""}</span>
                            </div>

                            {invoice.payments.length === 0 ? (
                                <div className="px-6 py-10 text-center">
                                    <p className="text-zinc-400 text-sm">Aucun paiement enregistré</p>
                                    {currentStatus !== "PAID" && currentStatus !== "CANCELLED" && (
                                        <button className="mt-3 text-sm text-blue-500 underline hover:text-blue-700">
                                            + Enregistrer un paiement
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="divide-y divide-zinc-100">
                                    {invoice.payments.map(p => (
                                        <div key={p.id} className="flex items-center justify-between px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-emerald-50 flex items-center justify-center">
                                                    <CreditCard className="w-4 h-4 text-emerald-500" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-zinc-800">
                                                        {p.method ?? "Paiement"}
                                                    </p>
                                                    <p className="text-xs text-zinc-400">{fmtDate(p.paidAt)}</p>
                                                    {p.note && <p className="text-xs text-zinc-400 italic">{p.note}</p>}
                                                </div>
                                            </div>
                                            <span className="font-bold text-emerald-600 tabular-nums">
                                                +{fmt(p.amount)} {invoice.currencyCode}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── Actions rapides ───────────────────────────────────────── */}
                        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Actions</p>
                            <button
                                onClick={handleExportPdf}
                                disabled={exporting}
                                className="w-full flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 transition-all disabled:opacity-50"
                            >
                                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4 text-violet-500" />}
                                Télécharger PDF
                            </button>
                            <button
                                onClick={handleSendEmail}
                                disabled={emailSending}
                                className="w-full flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 transition-all disabled:opacity-50"
                            >
                                {emailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4 text-blue-500" />}
                                Envoyer par email
                            </button>
                            <button
                                onClick={handleShare}
                                className="w-full flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 transition-all"
                            >
                                <Share2 className="w-4 h-4 text-green-500" />
                                Partager via WhatsApp
                            </button>
                            <button
                                onClick={() => router.push(`/${orgSlug}/invoices/${invoice.id}/edit`)}
                                className="w-full flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 transition-all"
                            >
                                <Pencil className="w-4 h-4 text-zinc-500" />
                                Modifier la facture
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Modal changement statut ──────────────────────────────────────── */}
            <Dialog open={statusModal} onOpenChange={open => { if (!open) setStatusModal(false) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Changer le statut — {invoice.number}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-zinc-500">
                            Statut actuel :{" "}
                            <Badge variant="outline" className={`rounded-full ml-1 ${statusConfig(currentStatus).badge}`}>
                                {statusConfig(currentStatus).label}
                            </Badge>
                        </p>
                        <Select value={newStatus} onValueChange={v => setNewStatus(v as InvoiceStatus)}>
                            <SelectTrigger><SelectValue placeholder="Nouveau statut…" /></SelectTrigger>
                            <SelectContent>
                                {transitions.map(s => (
                                    <SelectItem key={s} value={s}>
                                        <span className="flex items-center gap-2">
                                            <span className={`h-2 w-2 rounded-full ${statusConfig(s).dot}`} />
                                            {statusConfig(s).label}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {statusError && <p className="text-sm text-red-600">⚠️ {statusError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setStatusModal(false)}>Annuler</Button>
                        <Button onClick={handleUpdateStatus} disabled={!newStatus || isPending}>
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Toast ───────────────────────────────────────────────────────── */}
            {shareToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-zinc-900 text-white px-5 py-3 text-sm shadow-xl z-50 flex items-center gap-2">
                    <Share2 className="w-4 h-4" /> PDF généré et partagé via WhatsApp
                </div>
            )}
        </div>
    )
}