// src/app/(dashboard)/[orgSlug]/pos/pos-client.tsx
"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { createSaleAction } from "@/server/actions/sale.action";
import { getProductByBarcodeAction } from "@/server/actions/product.action";

// ─── Types ────────────────────────────────────────────────────────────────────
type Product = {
    id: string; name: string; price: number; costPrice: number | null;
    currentStock: number; minStockAlert: number | null;
    isService: boolean; isFavorite: boolean; unit: string | null;
    barcode: string | null; sku: string | null;
    category: { id: string; name: string; color: string | null; icon: string | null } | null;
};

type CartItem = {
    productId?: string; name: string; price: number; costPrice: number | null;
    quantity: number; discount: number; isService: boolean; unit: string | null;
};

type Props = {
    orgSlug: string;
    org: { name: string; currency: string; receiptHeader: string | null; receiptFooter: string | null; receiptWidth: number | null };
    products: Product[];
    categories: { id: string; name: string; color: string | null; icon: string | null }[];
    activeCashSession: { id: string } | null;
    clients: { id: string; name: string; phone: string | null; loyaltyPoints?: number }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtNum = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
const fmt = (n: number, cur: string) => `${fmtNum(n)} ${cur}`;
const today = () => new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
const now = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const PAYMENT_LABELS: Record<string, string> = {
    CASH: "💵 Espèces", MOBILE_MONEY: "📱 Mobile Money",
    CARD: "💳 Carte", CREDIT: "📒 Crédit (dette)",
};

// ═════════════════════════════════════════════════════════════════════════════
export default function POSClient({ orgSlug, org, products, categories, activeCashSession, clients }: Props) {
    const [isPending, startTransition] = useTransition();

    const [cart, setCart] = useState<CartItem[]>([]);
    const [search, setSearch] = useState("");
    const [activeCat, setActiveCat] = useState<string | null>(null);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [receiptData, setReceiptData] = useState<any | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [saleError, setSaleError] = useState<string | null>(null);
    const [amountInput, setAmountInput] = useState("");
    const [splitMode, setSplitMode] = useState(false);
    const [payments, setPayments] = useState<{ method: string; amount: number }[]>([{ method: "CASH", amount: 0 }]);
    const [selectedClient, setSelectedClient] = useState("");
    const [debtName, setDebtName] = useState("");
    const [debtPhone, setDebtPhone] = useState("");
    const [debtDue, setDebtDue] = useState("");

    const barcodeBuffer = useRef("");
    const barcodeTimer = useRef<NodeJS.Timeout | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const [flash, setFlash] = useState(false);
    const scanLock = useRef(false);
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const beepRef = useRef<HTMLAudioElement | null>(null);

    const subtotal = cart.reduce((s, i) => s + i.price * i.quantity - i.discount, 0);
    const total = subtotal;
    const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
    const amountPaid = parseFloat(amountInput) || 0;
    const change = Math.max(0, amountPaid - total);
    const cartProductIds = new Set(cart.map(i => i.productId).filter(Boolean));

    const filtered = products.filter(p => {
        if (activeCat && p.category?.id !== activeCat) return false;
        if (search) {
            const q = search.toLowerCase();
            return p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.includes(q);
        }
        return true;
    });
    const favorites = filtered.filter(p => p.isFavorite);
    const rest = filtered.filter(p => !p.isFavorite);

    function triggerFeedback() {
        setFlash(true);
        if (beepRef.current) {
            beepRef.current.currentTime = 0;
            beepRef.current.play().catch(() => { });
        }
        setTimeout(() => setFlash(false), 150);
    }

    // ─── Lecteur USB ──────────────────────────────────────────────────────────
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (e.key === "Enter") {
                const code = barcodeBuffer.current.trim(); barcodeBuffer.current = "";
                if (code.length > 3) handleBarcodeDetected(code);
            } else if (e.key.length === 1) {
                barcodeBuffer.current += e.key;
                if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
                barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = "" }, 200);
            }
        }

        beepRef.current = new Audio("/beep.wav");
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    // ─── Scan caméra avec Html5QrcodeScanner ───────────────────────────────────
    const startScan = () => {
        setScanError(null);
        setIsScanning(true);

        scannerRef.current = new Html5QrcodeScanner(
            "reader",
            {
                fps: 12,
                qrbox: { width: 260, height: 180 },
                aspectRatio: 1.0,
                showTorchButtonIfSupported: true,
                rememberLastUsedCamera: true,
            },
            false
        );

        scannerRef.current.render(
            (decodedText) => {
                triggerFeedback();
                handleBarcodeDetected(decodedText);
            },
            () => { } // erreur silencieuse
        );
    };

    const stopScan = () => {
        if (scannerRef.current) {
            scannerRef.current.clear().catch(console.error);
            scannerRef.current = null;
        }
        setIsScanning(false);
    };

    async function handleBarcodeDetected(barcode: string) {
        if (scanLock.current) return;
        scanLock.current = true;

        triggerFeedback();

        const local = products.find(p => p.barcode === barcode);
        if (local) {
            addToCart(local);
        } else {
            const result = await getProductByBarcodeAction(orgSlug, barcode);
            if (result.success) {
                addToCart(result.data as Product);
            } else {
                setScanError(`"${barcode}" introuvable`);
                setTimeout(() => setScanError(null), 2000);
            }
        }

        setTimeout(() => {
            scanLock.current = false;
        }, 800);
    }

    // ─── Panier ────────────────────────────────────────────────────────────────
    const addToCart = useCallback((p: Product) => {
        if (!p.isService && p.currentStock <= 0) {
            setScanError(`${p.name} — rupture`); setTimeout(() => setScanError(null), 2500); return;
        }
        setCart(prev => {
            const idx = prev.findIndex(i => i.productId === p.id);
            if (idx >= 0) { const u = [...prev]; u[idx] = { ...u[idx], quantity: u[idx].quantity + 1 }; return u; }
            return [...prev, { productId: p.id, name: p.name, price: p.price, costPrice: p.costPrice, quantity: 1, discount: 0, isService: p.isService, unit: p.unit }];
        });
        navigator.vibrate?.(30);
    }, []);

    function updateQty(index: number, delta: number) {
        setCart(prev => {
            const u = [...prev]; const q = u[index].quantity + delta;
            if (q <= 0) return prev.filter((_, i) => i !== index);
            u[index] = { ...u[index], quantity: q }; return u;
        });
    }

    function setQty(index: number, qty: number) {
        if (qty <= 0) { setCart(prev => prev.filter((_, i) => i !== index)); return; }
        setCart(prev => { const u = [...prev]; u[index] = { ...u[index], quantity: qty }; return u; });
    }

    function removeItem(i: number) { setCart(prev => prev.filter((_, idx) => idx !== i)); }

    function clearCart() {
        setCart([]); setAmountInput(""); setPayments([{ method: "CASH", amount: 0 }]);
        setSelectedClient(""); setDebtName(""); setDebtPhone(""); setDebtDue("");
        setSplitMode(false); setCheckoutOpen(false);
    }

    function handleCheckout() {
        if (cart.length === 0) return;
        if (!splitMode && !amountInput) { setAmountInput(String(total)); setPayments([{ method: "CASH", amount: total }]); }
        setCheckoutOpen(true);
    }

    function handleConfirmSale() {
        setSaleError(null);
        const creditAmt = payments.find(p => p.method === "CREDIT")?.amount ?? 0;
        if (creditAmt > 0 && !selectedClient && !debtName) { setSaleError("Saisissez le nom du client pour la dette."); return; }
        const allPayments = splitMode ? payments : [{ method: payments[0].method, amount: amountPaid }];
        const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0);
        if (totalPaid < total - 0.01 && !payments.some(p => p.method === "CREDIT")) { setSaleError("Montant insuffisant."); return; }

        startTransition(async () => {
            const result = await createSaleAction(orgSlug, {
                clientId: selectedClient || undefined, cashSessionId: activeCashSession?.id,
                items: cart.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitPrice: i.price, costPrice: i.costPrice ?? undefined, discount: i.discount, taxRate: 0, total: i.price * i.quantity - i.discount })),
                payments: allPayments as any, discount: 0, amountPaid: totalPaid,
                change: Math.max(0, totalPaid - total), isOffline: false,
                debtContactName: debtName || undefined, debtContactPhone: debtPhone || undefined, debtDueDate: debtDue || undefined,
            });
            if (!result.success) { setSaleError(result.error); return; }
            setReceiptData({ number: result.data.number, saleDate: new Date(), items: cart, total, subtotal, amountPaid: totalPaid, change: result.data.change, payments: allPayments, clientName: clients.find(c => c.id === selectedClient)?.name ?? debtName ?? null, debtId: result.data.debtId });
            clearCart();
        });
    }

    function handlePrint() { window.print(); }

    function buildWhatsAppText() {
        if (!receiptData) return "";
        return `Reçu ${receiptData.number} — ${org.name}\n${receiptData.items.map((i: CartItem) => `${i.name} ×${i.quantity} = ${fmtNum(i.price * i.quantity)} ${org.currency}`).join("\n")}\n\nTotal : ${fmtNum(receiptData.total)} ${org.currency}\nMerci !`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TICKET REÇU
    // ═══════════════════════════════════════════════════════════════════════════
    if (receiptData) {
        return (
            <>
                <style>{`@media print { body * { visibility: hidden !important; } #receipt, #receipt * { visibility: visible !important; } #receipt { position: fixed !important; left: 0 !important; top: 0 !important; width: ${org.receiptWidth ?? 80}mm !important; font-family: monospace !important; font-size: 11px !important; } .no-print { display: none !important; } }`}</style>
                <div className="min-h-screen bg-zinc-100 flex items-start justify-center p-4 pt-8">
                    <div id="receipt" className="bg-white w-full max-w-xs rounded-2xl shadow-xl p-5 font-mono text-sm">
                        {org.receiptHeader && <p className="text-center text-xs text-zinc-500 mb-2">{org.receiptHeader}</p>}
                        <p className="text-center font-black text-base uppercase">{org.name}</p>
                        <p className="text-center text-xs text-zinc-400 mt-1">{today()} {now()}</p>
                        <p className="text-center text-xs text-zinc-400">N° {receiptData.number}</p>
                        {receiptData.clientName && <p className="text-center text-xs mt-1">Client : <strong>{receiptData.clientName}</strong></p>}
                        <div className="border-t border-dashed border-zinc-300 my-3" />
                        <div className="space-y-1.5">{receiptData.items.map((item: CartItem, i: number) => (<div key={i} className="flex justify-between text-xs"><span className="flex-1 truncate pr-2">{item.name} ×{item.quantity}</span><span className="shrink-0 font-semibold">{fmtNum(item.price * item.quantity)}</span></div>))}</div>
                        <div className="border-t border-dashed border-zinc-300 my-3" />
                        <div className="space-y-1 text-xs">
                            <div className="flex justify-between"><span>Sous-total</span><span>{fmtNum(receiptData.subtotal)}</span></div>
                            <div className="flex justify-between font-black text-sm"><span>TOTAL</span><span>{fmtNum(receiptData.total)} {org.currency}</span></div>
                            {receiptData.payments.map((p: any, i: number) => (<div key={i} className="flex justify-between text-zinc-500"><span>{PAYMENT_LABELS[p.method] ?? p.method}</span><span>{fmtNum(p.amount)}</span></div>))}
                            {receiptData.change > 0 && <div className="flex justify-between font-semibold text-emerald-700"><span>Rendu</span><span>{fmtNum(receiptData.change)} {org.currency}</span></div>}
                        </div>
                        {receiptData.debtId && <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800 text-center">⚠ Vente à crédit enregistrée</div>}
                        <div className="border-t border-dashed border-zinc-300 my-3" />
                        <p className="text-center text-xs text-zinc-400">{org.receiptFooter ?? "Merci pour votre achat !"}</p>
                    </div>
                    <div className="no-print fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={handlePrint} className="flex items-center justify-center gap-2 rounded-2xl border-2 border-zinc-200 py-3 text-sm font-semibold text-zinc-700 active:scale-95 transition-transform">🖨️ Imprimer</button>
                            <button onClick={() => { const phone = clients.find(c => c.name === receiptData.clientName)?.phone ?? ""; window.open(phone ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(buildWhatsAppText())}` : `https://wa.me/?text=${encodeURIComponent(buildWhatsAppText())}`, "_blank") }}
                                className="flex items-center justify-center gap-2 rounded-2xl border-2 border-emerald-200 py-3 text-sm font-semibold text-emerald-700 active:scale-95 transition-transform">📲 WhatsApp</button>
                        </div>
                        <button onClick={() => setReceiptData(null)} className="w-full rounded-2xl bg-zinc-900 py-4 text-white font-bold text-base active:scale-95 transition-transform">✓ Nouvelle vente</button>
                    </div>
                </div>
            </>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ENCAISSEMENT — modal sheet
    // ═══════════════════════════════════════════════════════════════════════════
    const CheckoutSheet = checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCheckoutOpen(false)} />
            <div className="relative z-10 w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "92vh" }}>
                <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
                    <div className="h-1 w-10 rounded-full bg-zinc-200" />
                </div>

                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
                    <div>
                        <p className="font-black text-zinc-900 text-lg">Encaissement</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{cart.length} article{cart.length > 1 ? "s" : ""}</p>
                    </div>
                    <button onClick={() => setCheckoutOpen(false)} className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-colors">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
                    <div className="rounded-2xl bg-zinc-900 px-5 py-4 flex items-center justify-between">
                        <p className="text-zinc-400 text-sm">Total à payer</p>
                        <p className="text-2xl font-black text-white tabular-nums">{fmt(total, org.currency)}</p>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Mode de paiement</p>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(PAYMENT_LABELS).map(([method, label]) => {
                                const active = payments[0].method === method && !splitMode;
                                return (
                                    <button key={method}
                                        onClick={() => { setSplitMode(false); setPayments([{ method, amount: total }]); setAmountInput(String(total)); }}
                                        className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-all active:scale-95 ${active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"}`}>
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                        <button onClick={() => setSplitMode(!splitMode)}
                            className={`w-full rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${splitMode ? "border-violet-500 bg-violet-50 text-violet-700" : "border-zinc-200 text-zinc-500 hover:border-zinc-300"}`}>
                            ✂️ Paiement mixte
                        </button>
                    </div>

                    {splitMode && (
                        <div className="space-y-2 rounded-xl border border-zinc-200 p-3 bg-zinc-50">
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Répartition</p>
                            {payments.map((p, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <select value={p.method} onChange={e => { const u = [...payments]; u[i].method = e.target.value; setPayments(u); }}
                                        className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white text-zinc-800">
                                        {Object.entries(PAYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                    <input type="number" value={p.amount || ""} onChange={e => { const u = [...payments]; u[i].amount = Number(e.target.value); setPayments(u); }}
                                        className="w-28 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-right bg-white" placeholder="Montant" />
                                    {i > 0 && <button onClick={() => setPayments(payments.filter((_, j) => j !== i))} className="text-red-400 text-lg">×</button>}
                                </div>
                            ))}
                            <button onClick={() => setPayments([...payments, { method: "MOBILE_MONEY", amount: 0 }])} className="text-xs text-violet-600 font-medium">+ Ajouter un mode</button>
                            <div className="flex justify-between text-sm pt-2 border-t border-zinc-200">
                                <span className="text-zinc-500">Total saisi</span>
                                <span className={`font-bold ${payments.reduce((s, p) => s + p.amount, 0) >= total ? "text-emerald-600" : "text-red-500"}`}>
                                    {fmt(payments.reduce((s, p) => s + p.amount, 0), org.currency)}
                                </span>
                            </div>
                        </div>
                    )}

                    {!splitMode && payments[0].method !== "CREDIT" && (
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Montant reçu</label>
                                <div className="relative">
                                    <input type="number" inputMode="numeric" autoFocus value={amountInput} onChange={e => setAmountInput(e.target.value)}
                                        placeholder={String(total)}
                                        className="w-full rounded-xl border-2 border-zinc-200 px-4 py-3.5 text-xl font-black text-zinc-900 text-right tabular-nums focus:border-zinc-900 focus:outline-none pr-20 transition-colors" />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400 font-medium">{org.currency}</span>
                                </div>
                            </div>

                            {amountPaid > 0 && amountPaid >= total && (
                                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center justify-between">
                                    <p className="text-sm font-semibold text-emerald-700">Rendu monnaie</p>
                                    <p className="text-xl font-black text-emerald-700 tabular-nums">{fmt(change, org.currency)}</p>
                                </div>
                            )}
                            {amountPaid > 0 && amountPaid < total && (
                                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center justify-between">
                                    <p className="text-sm font-semibold text-red-600">Reste à payer</p>
                                    <p className="text-xl font-black text-red-600 tabular-nums">{fmt(total - amountPaid, org.currency)}</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Client (optionnel)</p>
                        <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); const c = clients.find(cl => cl.id === e.target.value); if (c) { setDebtName(c.name); setDebtPhone(c.phone ?? ""); } }}
                            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm bg-white text-zinc-800">
                            <option value="">Anonyme</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}
                        </select>
                    </div>

                    {(payments[0].method === "CREDIT" || payments.some(p => p.method === "CREDIT")) && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-amber-600">📒 Informations dette</p>
                            {!selectedClient && (
                                <>
                                    <input value={debtName} onChange={e => setDebtName(e.target.value)} placeholder="Nom du client *" className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm bg-white" />
                                    <input value={debtPhone} onChange={e => setDebtPhone(e.target.value)} placeholder="Téléphone" className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm bg-white" />
                                </>
                            )}
                            <input type="date" value={debtDue} onChange={e => setDebtDue(e.target.value)} className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm bg-white" />
                            <p className="text-xs text-amber-600/70">Laissez vide si pas d'échéance.</p>
                        </div>
                    )}

                    {saleError && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">⚠ {saleError}</div>}
                </div>

                <div className="shrink-0 px-5 py-4 border-t border-zinc-100">
                    <button onClick={handleConfirmSale} disabled={isPending || cart.length === 0}
                        className="w-full rounded-2xl bg-emerald-500 py-4 text-white font-black text-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                        {isPending ? "Enregistrement…" : `✓ Encaisser ${fmt(total, org.currency)}`}
                    </button>
                </div>
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // PANIER DESKTOP (sidebar)
    // ═══════════════════════════════════════════════════════════════════════════
    const CartPanel = (
        <div className="flex flex-col h-full bg-white">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-zinc-100">
                <div><p className="font-black text-zinc-900 text-lg">Panier</p><p className="text-zinc-400 text-xs">{cartCount} article{cartCount > 1 ? "s" : ""}</p></div>
                {cart.length > 0 && <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-600">Vider</button>}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
                {cart.length === 0 ? (
                    <div className="py-12 text-center text-zinc-300"><p className="text-4xl mb-3">🛒</p><p className="text-sm">Panier vide</p><p className="text-xs mt-1">Cliquez sur un produit</p></div>
                ) : (
                    <div className="divide-y divide-zinc-100">
                        {cart.map((item, i) => (
                            <div key={i} className="px-5 py-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0"><p className="font-semibold text-zinc-900 text-sm truncate">{item.name}</p><p className="text-zinc-400 text-xs">{fmtNum(item.price)} × {item.quantity}</p></div>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                        <button onClick={() => updateQty(i, -1)} className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-bold active:scale-90 text-lg">−</button>
                                        <input type="number" value={item.quantity} onChange={e => setQty(i, Number(e.target.value))} className="w-10 text-center text-sm font-bold text-zinc-900 bg-transparent" />
                                        <button onClick={() => updateQty(i, 1)} className="h-8 w-8 rounded-full bg-zinc-900 flex items-center justify-center text-white font-bold active:scale-90 text-lg">+</button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                    <button onClick={() => removeItem(i)} className="text-xs text-red-400">Supprimer</button>
                                    <p className="font-bold text-zinc-900 tabular-nums">{fmtNum(item.price * item.quantity)} {org.currency}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="shrink-0 border-t border-zinc-100 p-5 space-y-3">
                <div className="flex justify-between font-black text-xl"><span>Total</span><span className="tabular-nums">{fmt(total, org.currency)}</span></div>
                <button onClick={handleCheckout} disabled={cart.length === 0}
                    className="w-full rounded-2xl bg-zinc-900 py-4 text-white font-black text-base active:scale-95 transition-transform disabled:opacity-30 disabled:cursor-not-allowed">
                    {cart.length === 0 ? "Panier vide" : "Encaisser →"}
                </button>
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // LAYOUT PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════════
    return (
        <div className="flex h-screen overflow-hidden bg-zinc-50">
            {CheckoutSheet}

            {/* MOBILE LAYOUT */}
            <div className="flex flex-col w-full lg:hidden h-screen overflow-hidden">

                {/* Barre supérieure */}
                <div className="shrink-0 bg-zinc-950 h-14 flex items-center px-3 gap-2 border-b border-zinc-800">
                    <button
                        onClick={isScanning ? stopScan : startScan}
                        className={`shrink-0 h-9 w-9 rounded-2xl flex items-center justify-center text-2xl active:scale-95 transition-all ${isScanning ? "bg-red-600" : "bg-emerald-600"}`}
                    >
                        {isScanning ? "✕" : "📷"}
                    </button>

                    <div className="flex-1 flex items-center gap-2 bg-zinc-800 rounded-2xl px-3 py-1.5">
                        <span className="text-zinc-500 text-sm">🔍</span>
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Rechercher un produit…"
                            className="flex-1 bg-transparent text-white text-sm placeholder-zinc-500 outline-none"
                        />
                        {search && <button onClick={() => setSearch("")} className="text-zinc-500 text-sm">✕</button>}
                    </div>

                    {scanError && <p className="text-red-400 text-xs shrink-0 max-w-[80px] leading-tight">{scanError}</p>}
                </div>

                {/* Zone Scanner */}
                {isScanning && (
                    <div className="bg-black relative" style={{ height: "150px" }}>
                        <div id="reader" className="w-full h-full" />
                        {flash && <div className="absolute inset-0 bg-green-400/30 animate-pulse pointer-events-none" />}
                        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-xs bg-black/60 rounded-full py-1 px-4">
                            Alignez le code-barres dans le cadre
                        </p>
                    </div>
                )}

                {/* Panier inline */}
                {cart.length > 0 && (
                    <div className="shrink-0 bg-white border-b border-zinc-200 overflow-y-auto" style={{ maxHeight: "38vh" }}>
                        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 bg-white sticky top-0 z-10">
                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{cartCount} article{cartCount > 1 ? "s" : ""} · {fmt(total, org.currency)}</p>
                            <button onClick={clearCart} className="text-xs text-red-400 font-medium">Vider</button>
                        </div>
                        {cart.map((item, i) => (
                            <div key={i} className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-50 last:border-0">
                                <button onClick={() => removeItem(i)} className="shrink-0 h-6 w-6 rounded-full bg-red-50 text-red-400 flex items-center justify-center text-sm active:scale-90 transition-transform hover:bg-red-100">×</button>
                                <p className="flex-1 text-sm font-semibold text-zinc-900 truncate leading-tight min-w-0">{item.name}</p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button onClick={() => updateQty(i, -1)} className="h-7 w-7 rounded-full bg-zinc-100 text-zinc-700 font-bold text-base flex items-center justify-center active:scale-90 transition-transform">−</button>
                                    <span className="w-6 text-center text-sm font-black text-zinc-900 tabular-nums">{item.quantity}</span>
                                    <button onClick={() => updateQty(i, 1)} className="h-7 w-7 rounded-full bg-zinc-900 text-white font-bold text-base flex items-center justify-center active:scale-90 transition-transform">+</button>
                                </div>
                                <p className="text-sm font-bold text-zinc-900 tabular-nums w-16 text-right shrink-0">{fmtNum(item.price * item.quantity)}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Chips catégories */}
                {categories.length > 0 && (
                    <div className="shrink-0 bg-white border-b border-zinc-100">
                        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-hide">
                            <button onClick={() => setActiveCat(null)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all ${!activeCat ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"}`}>Tout</button>
                            {categories.map(cat => (
                                <button key={cat.id} onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id)}
                                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1 transition-all ${activeCat === cat.id ? "text-white" : "bg-zinc-100 text-zinc-600"}`}
                                    style={activeCat === cat.id ? { backgroundColor: cat.color ?? "#18181b" } : {}}>
                                    {cat.icon} {cat.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Grille produits */}
                <div className="flex-1 overflow-y-auto bg-zinc-50 p-3 min-h-0">
                    <div className="grid grid-cols-3 gap-2">
                        {(search || activeCat ? filtered : products).map(p => (
                            <ProductTile key={p.id} p={p} currency={org.currency} onTap={addToCart}
                                isInCart={cartProductIds.has(p.id)}
                                cartQty={cart.find(i => i.productId === p.id)?.quantity} />
                        ))}
                        {(search || activeCat ? filtered : products).length === 0 && (
                            <div className="col-span-3 py-10 text-center text-zinc-400 text-sm">Aucun produit trouvé</div>
                        )}
                    </div>
                </div>

                {/* Boutons bas */}
                <div className="shrink-0 bg-white border-t border-zinc-200 px-4 py-3 flex gap-3">
                    <button onClick={clearCart} disabled={cart.length === 0}
                        className="flex-1 rounded-2xl border-2 border-zinc-200 py-3.5 text-sm font-bold text-zinc-600 active:scale-95 transition-transform disabled:opacity-30 disabled:cursor-not-allowed">
                        Annuler
                    </button>
                    <button onClick={handleCheckout} disabled={cart.length === 0}
                        className="flex-[2] rounded-2xl bg-zinc-900 py-3.5 text-white font-black text-sm active:scale-95 transition-transform disabled:opacity-30 disabled:cursor-not-allowed">
                        {cart.length === 0 ? "Panier vide" : `Encaisser · ${fmt(total, org.currency)}`}
                    </button>
                </div>
            </div>

            {/* DESKTOP LAYOUT */}
            <div className="hidden lg:flex flex-1 overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="shrink-0 bg-white border-b border-zinc-200 px-6 py-3">
                        <div className="flex items-center gap-3 max-w-4xl mx-auto">
                            <div className="flex-1 flex items-center gap-2 bg-zinc-100 rounded-2xl px-4 py-2.5">
                                <span className="text-zinc-400">🔍</span>
                                <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                                    placeholder="Rechercher ou brancher un lecteur code-barres…"
                                    className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 outline-none" />
                                {search && <button onClick={() => setSearch("")} className="text-zinc-400 text-sm">✕</button>}
                            </div>
                            <span className="text-xs text-zinc-400 bg-zinc-100 px-3 py-2 rounded-xl whitespace-nowrap hidden xl:block">🖥 Lecteur USB prêt</span>
                        </div>
                    </div>
                    <div className="shrink-0 bg-white border-b border-zinc-100">
                        <div className="flex items-center gap-2 px-6 py-2 overflow-x-auto scrollbar-hide max-w-4xl mx-auto">
                            <button onClick={() => setActiveCat(null)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${!activeCat ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"}`}>Tout</button>
                            {categories.map(cat => (
                                <button key={cat.id} onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id)}
                                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold flex items-center gap-1.5 transition-all ${activeCat === cat.id ? "text-white" : "bg-zinc-100 text-zinc-600"}`}
                                    style={activeCat === cat.id ? { backgroundColor: cat.color ?? "#18181b" } : {}}>
                                    {cat.icon} {cat.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    {scanError && <div className="bg-red-50 border-b border-red-100 px-4 py-2 text-sm text-red-700 text-center">{scanError}</div>}
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="max-w-4xl mx-auto space-y-5">
                            {!search && !activeCat && favorites.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">⭐ Favoris</p>
                                    <div className="grid grid-cols-4 xl:grid-cols-5 gap-3">
                                        {favorites.map(p => <ProductTile key={p.id} p={p} currency={org.currency} onTap={addToCart} isInCart={cartProductIds.has(p.id)} cartQty={cart.find(i => i.productId === p.id)?.quantity} />)}
                                    </div>
                                </div>
                            )}
                            <div>
                                {!search && !activeCat && favorites.length > 0 && <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Tous les produits</p>}
                                <div className="grid grid-cols-4 xl:grid-cols-5 gap-3">
                                    {(search || activeCat ? filtered : rest).map(p => <ProductTile key={p.id} p={p} currency={org.currency} onTap={addToCart} isInCart={cartProductIds.has(p.id)} cartQty={cart.find(i => i.productId === p.id)?.quantity} />)}
                                </div>
                                {filtered.length === 0 && <div className="py-16 text-center text-zinc-400"><p className="text-3xl mb-2">📦</p><p className="text-sm">Aucun produit trouvé</p></div>}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col w-96 border-l border-zinc-200 bg-white shrink-0 h-screen overflow-hidden">
                    {CartPanel}
                </div>
            </div>
        </div>
    );
}

// ─── Tuile produit ────────────────────────────────────────────────────────────
function ProductTile({
    p, currency, onTap, isInCart, cartQty,
}: {
    p: Product; currency: string; onTap: (p: Product) => void;
    isInCart?: boolean; cartQty?: number;
}) {
    const outOfStock = !p.isService && p.currentStock <= 0;
    return (
        <button
            onClick={() => !outOfStock && onTap(p)}
            disabled={outOfStock}
            className={`relative flex flex-col rounded-2xl border-2 p-3 text-left transition-all active:scale-95 select-none
                ${outOfStock
                    ? "border-zinc-200 bg-zinc-50 opacity-50 cursor-not-allowed"
                    : isInCart
                        ? "border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100"
                        : "border-transparent bg-white shadow-sm hover:border-zinc-200 hover:shadow-md"
                }`}>

            {isInCart && cartQty && (
                <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm z-10">
                    {cartQty}
                </div>
            )}

            <div className="text-2xl mb-2 leading-none">
                {p.category?.icon ?? (p.isService ? "⚙️" : "📦")}
            </div>

            <p className={`text-xs font-bold leading-tight line-clamp-2 ${isInCart ? "text-emerald-800" : "text-zinc-900"}`}>
                {p.name}
            </p>

            <p className={`mt-auto pt-2 text-sm font-black tabular-nums ${isInCart ? "text-emerald-700" : "text-zinc-900"}`}>
                {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(p.price)}
                <span className={`font-normal text-xs ml-0.5 ${isInCart ? "text-emerald-500" : "text-zinc-400"}`}>{currency}</span>
            </p>

            {!p.isService && (
                <p className={`text-xs mt-0.5 ${outOfStock ? "text-red-400 font-semibold"
                    : p.minStockAlert && p.currentStock <= p.minStockAlert ? "text-amber-500"
                        : isInCart ? "text-emerald-600"
                            : "text-zinc-400"}`}>
                    {outOfStock ? "Rupture" : `${p.currentStock} ${p.unit ?? "pcs"}`}
                </p>
            )}

            {p.isFavorite && !isInCart && (
                <div className="absolute top-2 right-2 text-amber-400 text-xs">⭐</div>
            )}
        </button>
    );
}