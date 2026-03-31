// src/lib/cache-tags.ts
// ─── Tags de cache Next.js centralisés ────────────────────────────────────────
// Convention : "entité:scope"
// - Toujours passer par ces fonctions — jamais de string en dur dans les actions
// - revalidateTag(cacheTags.products(orgId)) invalide toutes les listes produits de cette org
// - revalidateTag(cacheTags.product(productId)) invalide le détail d'un produit précis

export const cacheTags = {
    // ── Stock ──────────────────────────────────────────────────────────────────
    stockBatches: (orgId: string) => `stock-batches:${orgId}`,
    stockBatch: (batchId: string) => `stock-batch:${batchId}`,
    stockMovements: (orgId: string) => `stock-movements:${orgId}`,
    stockAlerts: (orgId: string) => `stock-alerts:${orgId}`,

    // ── Produits ───────────────────────────────────────────────────────────────
    products: (orgId: string) => `products:${orgId}`,
    product: (productId: string) => `product:${productId}`,
    productCategories: (orgId: string) => `product-categories:${orgId}`,

    // ── Ventes ─────────────────────────────────────────────────────────────────
    sales: (orgId: string) => `sales:${orgId}`,
    sale: (saleId: string) => `sale:${saleId}`,

    // ── Factures ───────────────────────────────────────────────────────────────
    invoices: (orgId: string) => `invoices:${orgId}`,
    invoice: (invoiceId: string) => `invoice:${invoiceId}`,

    // ── Devis ──────────────────────────────────────────────────────────────────
    quotes: (orgId: string) => `quotes:${orgId}`,
    quote: (quoteId: string) => `quote:${quoteId}`,

    // ── Dettes ─────────────────────────────────────────────────────────────────
    debts: (orgId: string) => `debts:${orgId}`,
    debt: (debtId: string) => `debt:${debtId}`,

    // ── Clients ────────────────────────────────────────────────────────────────
    clients: (orgId: string) => `clients:${orgId}`,
    client: (clientId: string) => `client:${clientId}`,

    // ── Fournisseurs ───────────────────────────────────────────────────────────
    vendors: (orgId: string) => `vendors:${orgId}`,

    // ── Membres / équipe ───────────────────────────────────────────────────────
    members: (orgId: string) => `members:${orgId}`,
    member: (memberId: string) => `member:${memberId}`,

    // ── Inventaires ────────────────────────────────────────────────────────────
    inventories: (orgId: string) => `inventories:${orgId}`,
    inventory: (inventoryId: string) => `inventory:${inventoryId}`,

    // ── Organisation ───────────────────────────────────────────────────────────
    org: (orgId: string) => `org:${orgId}`,
    orgBySlug: (slug: string) => `org-slug:${slug}`,

    // ── Abonnement / plan ──────────────────────────────────────────────────────
    subscription: (orgId: string) => `subscription:${orgId}`,
    plans: () => `plans`,
} as const

// ═══════════════════════════════════════════════════════════════════════════
// GROUPES D'INVALIDATION — invalider plusieurs tags d'un coup
// ═══════════════════════════════════════════════════════════════════════════

/** Validation d'un bon de stock → stock + produits + alertes */
export function stockBatchValidatedTags(orgId: string, batchId: string): string[] {
    return [
        cacheTags.stockBatches(orgId),
        cacheTags.stockBatch(batchId),
        cacheTags.stockMovements(orgId),
        cacheTags.stockAlerts(orgId),
        cacheTags.products(orgId),
    ]
}

/** Création/annulation d'une vente → ventes + produits + alertes */
export function saleChangedTags(orgId: string): string[] {
    return [
        cacheTags.sales(orgId),
        cacheTags.stockMovements(orgId),
        cacheTags.stockAlerts(orgId),
        cacheTags.products(orgId),
    ]
}

/** Modification d'un produit → produit + liste + alertes */
export function productChangedTags(orgId: string, productId: string): string[] {
    return [
        cacheTags.products(orgId),
        cacheTags.product(productId),
        cacheTags.stockAlerts(orgId),
    ]
}

/** Ajout/suppression/changement de rôle d'un membre */
export function memberChangedTags(orgId: string, memberId?: string): string[] {
    const tags = [cacheTags.members(orgId)]
    if (memberId) tags.push(cacheTags.member(memberId))
    return tags
}

/** Changement d'abonnement → subscription + plans */
export function subscriptionChangedTags(orgId: string): string[] {
    return [
        cacheTags.subscription(orgId),
        cacheTags.org(orgId),
    ]
}