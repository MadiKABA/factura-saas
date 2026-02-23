// src/server/actions/invoice.action.ts
"use server"
import { revalidatePath, revalidateTag } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import {
    createInvoiceSchema,
    type CreateInvoiceInput,
    type ActionResult,
} from "@/lib/validations/invoice.schema"

// ─── Helper : récupérer la session + org courante ────────────────────────────
async function getSessionAndOrg(orgSlug: string) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return { error: "Non authentifié" } as const
    }

    const org = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        include: {
            subscription: { include: { plan: true } },
        },
    })

    if (!org) return { error: "Organisation introuvable" } as const

    // Vérifier que l'user est membre
    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })

    if (!membership) return { error: "Accès refusé" } as const

    return { session, org, membership } as const
}

// ─── Helper : générer le numéro de facture ────────────────────────────────────
// Format : FAC-2024-0001 (séquentiel par org, reset chaque année)
async function generateInvoiceNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear()
    const prefix = `FAC-${year}-`

    // Compter les factures de cette année pour cette org
    const count = await prisma.invoice.count({
        where: {
            organizationId,
            number: { startsWith: prefix },
        },
    })

    const seq = String(count + 1).padStart(4, "0")
    return `${prefix}${seq}`
}

// ─── Helper : vérifier la limite du plan ─────────────────────────────────────
async function checkInvoiceLimit(organizationId: string): Promise<{ allowed: boolean; reason?: string }> {
    const subscription = await prisma.subscription.findUnique({
        where: { organizationId },
        include: { plan: true },
    })

    if (!subscription || subscription.status !== "ACTIVE") {
        return { allowed: false, reason: "Abonnement inactif ou introuvable" }
    }

    const plan = subscription.plan

    // Plan sans limite sur les factures → OK
    if (plan.maxInvoices === null) return { allowed: true }

    // Compter les factures non-annulées de l'org
    const count = await prisma.invoice.count({
        where: {
            organizationId,
            status: { not: "CANCELLED" },
        },
    })

    if (count >= plan.maxInvoices) {
        return {
            allowed: false,
            reason: `Ton plan ${plan.name} est limité à ${plan.maxInvoices} factures. Passe à un plan supérieur pour continuer.`,
        }
    }

    return { allowed: true }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTION — Créer une facture
// ═════════════════════════════════════════════════════════════════════════════
export async function createInvoiceAction(
    orgSlug: string,
    input: CreateInvoiceInput
): Promise<ActionResult<{ id: string; number: string }>> {

    // 1. Auth + accès org
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    // 2. Validation Zod
    const parsed = createInvoiceSchema.safeParse(input)
    if (!parsed.success) {
        const firstError = parsed.error.issues[0]
        return {
            success: false,
            error: firstError?.message ?? "Données invalides",
            field: firstError?.path.join("."),
        }
    }

    const data = parsed.data

    // 3. Vérification limite plan
    const limitCheck = await checkInvoiceLimit(org.id)
    if (!limitCheck.allowed) {
        return { success: false, error: limitCheck.reason ?? "Limite atteinte" }
    }

    // 4. Générer le numéro de facture
    const number = await generateInvoiceNumber(org.id)

    // 5. Transaction atomique
    try {
        const invoice = await prisma.$transaction(async (tx) => {

            // 5a. Créer le client inline si besoin
            let clientId = data.clientId ?? null

            if (!clientId && data.newClient) {
                const nc = data.newClient
                const client = await tx.client.create({
                    data: {
                        organizationId: org.id,
                        type: nc.type,
                        name: nc.name,
                        email: nc.email ?? null,
                        phone: nc.phone ?? null,
                        address: nc.address ?? null,
                        city: nc.city ?? null,
                        country: nc.country ?? null,
                        taxId: nc.taxId ?? null,
                    },
                })
                clientId = client.id
            }

            // 5b. Calcul des totaux côté serveur (ne jamais faire confiance au client)
            const computedItems = data.items.map(item => {
                const ht = Number((item.quantity * item.unitPrice).toFixed(2))
                const tva = Number((ht * (item.taxRate / 100)).toFixed(2))
                const total = Number((ht + tva).toFixed(2))
                return { ...item, ht, tva, total }
            })

            const subtotal = Number(computedItems.reduce((s, i) => s + i.ht, 0).toFixed(2))
            const taxTotal = Number(computedItems.reduce((s, i) => s + i.tva, 0).toFixed(2))
            const total = Number(computedItems.reduce((s, i) => s + i.total, 0).toFixed(2))

            // 5c. Créer la facture
            const invoice = await tx.invoice.create({
                data: {
                    organizationId: org.id,
                    clientId,
                    originQuoteId: data.originQuoteId ?? null,
                    number,
                    status: data.status,
                    issueDate: new Date(data.issueDate),
                    dueDate: data.dueDate ? new Date(data.dueDate) : null,
                    subtotal,
                    taxTotal,
                    total,
                    currencyCode: data.currencyCode,
                    exchangeRate: data.exchangeRate ?? null,
                    notes: data.notes || null,
                    terms: data.terms || null,
                    internalNotes: data.internalNotes || null,
                },
            })

            // 5d. Créer les lignes
            await tx.invoiceItem.createMany({
                data: computedItems.map(item => ({
                    invoiceId: invoice.id,
                    productId: item.productId ?? null,
                    taxRateId: item.taxRateId ?? null,
                    name: item.name,
                    description: item.description || null,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    total: item.total,
                    isService: item.isService,
                })),
            })

            // 5e. Si converti depuis un devis, mettre à jour le statut du devis
            if (data.originQuoteId) {
                await tx.quote.update({
                    where: { id: data.originQuoteId },
                    data: { status: "ACCEPTED" },
                }).catch(() => {
                    // Pas bloquant si le devis n'existe plus
                })
            }

            return invoice
        })

        // 6. Invalider le cache
        revalidateTag(`invoices-${org.id}`, "default")
        revalidateTag(`dashboard-${org.id}`, "default")
        revalidatePath(`/${orgSlug}/invoices`, "page")


        return { success: true, data: { id: invoice.id, number: invoice.number } }

    } catch (err: unknown) {
        console.error("createInvoiceAction error:", err)

        // Numéro dupliqué (race condition rare)
        if (err instanceof Error && err.message.includes("Unique constraint")) {
            return { success: false, error: "Erreur de numérotation, réessaie." }
        }

        return { success: false, error: "Erreur lors de la création de la facture." }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTION — Récupérer les données nécessaires au formulaire
// (clients, produits, taux TVA, devis, limites plan)
// ═════════════════════════════════════════════════════════════════════════════
export async function getInvoiceFormDataAction(orgSlug: string): Promise<
    ActionResult<{
        clients: { id: string; name: string; email: string | null; phone: string | null; type: string }[]
        products: { id: string; name: string; price: number; isService: boolean; sku: string | null }[]
        taxRates: { id: string; name: string; rate: number; isDefault: boolean }[]
        quotes: { id: string; number: string; clientName: string; total: number }[]
        canCreate: boolean
        planLimit: number | null
        currentCount: number
    }>
> {
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const [clients, products, taxRates, quotes, limitCheck, invoiceCount, subscription] =
        await Promise.all([
            prisma.client.findMany({
                where: { organizationId: org.id },
                select: { id: true, name: true, email: true, phone: true, type: true },
                orderBy: { name: "asc" },
            }),
            prisma.product.findMany({
                where: { organizationId: org.id },
                select: { id: true, name: true, price: true, isService: true, sku: true },
                orderBy: { name: "asc" },
            }),
            prisma.taxRate.findMany({
                where: { organizationId: org.id },
                select: { id: true, name: true, rate: true, isDefault: true },
                orderBy: [{ isDefault: "desc" }, { rate: "asc" }],
            }),
            // Devis acceptables (SENT ou ACCEPTED) sans facture associée
            prisma.quote.findMany({
                where: {
                    organizationId: org.id,
                    status: { in: ["SENT", "ACCEPTED"] },
                    invoices: { none: {} },
                },
                select: {
                    id: true, number: true, total: true,
                    client: { select: { name: true } },
                },
                orderBy: { createdAt: "desc" },
                take: 20,
            }),
            checkInvoiceLimit(org.id),
            prisma.invoice.count({
                where: { organizationId: org.id, status: { not: "CANCELLED" } },
            }),
            prisma.subscription.findUnique({
                where: { organizationId: org.id },
                include: { plan: true },
            }),
        ])

    return {
        success: true,
        data: {
            clients,
            products: products.map(p => ({ ...p, price: Number(p.price) })),
            taxRates: taxRates.map(t => ({ ...t, rate: Number(t.rate) })),
            quotes: quotes.map(q => ({
                id: q.id,
                number: q.number,
                clientName: q.client?.name ?? "Client inconnu",
                total: Number(q.total),
            })),
            canCreate: limitCheck.allowed,
            planLimit: subscription?.plan.maxInvoices ?? null,
            currentCount: invoiceCount,
        },
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTION — Liste des factures (avec filtres)
// ═════════════════════════════════════════════════════════════════════════════
export async function getInvoicesAction(
    orgSlug: string,
    filters?: {
        status?: "DRAFT" | "SENT" | "PAID" | "PARTIAL" | "OVERDUE" | "CANCELLED"
        search?: string
        page?: number
        pageSize?: number
    }
): Promise<ActionResult<{
    invoices: {
        id: string; number: string; status: string
        clientName: string | null; total: number
        issueDate: Date; dueDate: Date | null; currencyCode: string
    }[]
    total: number
    page: number
    pageSize: number
}>> {
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const page = filters?.page ?? 1
    const pageSize = filters?.pageSize ?? 20
    const skip = (page - 1) * pageSize

    const where = {
        organizationId: org.id,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.search && {
            OR: [
                { number: { contains: filters.search, mode: "insensitive" as const } },
                { client: { name: { contains: filters.search, mode: "insensitive" as const } } },
            ],
        }),
    }

    const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
            where,
            select: {
                id: true, number: true, status: true,
                total: true, issueDate: true, dueDate: true, currencyCode: true,
                client: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: pageSize,
        }),
        prisma.invoice.count({ where }),
    ])

    return {
        success: true,
        data: {
            invoices: invoices.map(inv => ({
                id: inv.id,
                number: inv.number,
                status: inv.status,
                clientName: inv.client?.name ?? null,
                total: Number(inv.total),
                issueDate: inv.issueDate,
                dueDate: inv.dueDate,
                currencyCode: inv.currencyCode,
            })),
            total,
            page,
            pageSize,
        },
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTION — Récupérer une facture (détail)
// ═════════════════════════════════════════════════════════════════════════════
export async function getInvoiceAction(
    orgSlug: string,
    invoiceId: string
): Promise<ActionResult<{
    invoice: {
        id: string; number: string; status: string
        issueDate: Date; dueDate: Date | null
        subtotal: number; taxTotal: number; total: number; currencyCode: string
        notes: string | null; terms: string | null; internalNotes: string | null
        client: { id: string; name: string; email: string | null; phone: string | null; address: string | null; taxId: string | null } | null
        items: { id: string; name: string; description: string | null; quantity: number; unitPrice: number; total: number; taxRate: { name: string; rate: number } | null }[]
    }
}>> {
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: org.id },
        include: {
            client: { select: { id: true, name: true, email: true, phone: true, address: true, taxId: true } },
            items: {
                include: { taxRate: { select: { name: true, rate: true } } },
                orderBy: { id: "asc" },
            },
        },
    })

    if (!invoice) return { success: false, error: "Facture introuvable" }

    return {
        success: true,
        data: {
            invoice: {
                id: invoice.id,
                number: invoice.number,
                status: invoice.status,
                issueDate: invoice.issueDate,
                dueDate: invoice.dueDate,
                subtotal: Number(invoice.subtotal),
                taxTotal: Number(invoice.taxTotal),
                total: Number(invoice.total),
                currencyCode: invoice.currencyCode,
                notes: invoice.notes,
                terms: invoice.terms,
                internalNotes: invoice.internalNotes,
                client: invoice.client,
                items: invoice.items.map(item => ({
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                    total: Number(item.total),
                    taxRate: item.taxRate ? { name: item.taxRate.name, rate: Number(item.taxRate.rate) } : null,
                })),
            },
        },
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTION — Changer le statut d'une facture
// ═════════════════════════════════════════════════════════════════════════════
export async function updateInvoiceStatusAction(
    orgSlug: string,
    invoiceId: string,
    status: "DRAFT" | "SENT" | "PAID" | "PARTIAL" | "OVERDUE" | "CANCELLED"
): Promise<ActionResult<{ status: string }>> {
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    // Vérifier que la facture appartient à l'org
    const existing = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: org.id },
    })
    if (!existing) return { success: false, error: "Facture introuvable" }

    // Règles métier : une facture CANCELLED ne peut pas changer de statut
    if (existing.status === "CANCELLED" && status !== "CANCELLED") {
        return { success: false, error: "Une facture annulée ne peut pas être modifiée." }
    }

    const updated = await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status },
    })

    revalidateTag(`invoices-${org.id}`, "default")
    revalidateTag(`invoice-${invoiceId}`, "default")
    revalidateTag(`dashboard-${org.id}`, "default")
    revalidatePath(`/${orgSlug}/invoices`)
    revalidatePath(`/${orgSlug}/invoices/${invoiceId}`)

    return { success: true, data: { status: updated.status } }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTION — Supprimer une facture (DRAFT uniquement)
// ═════════════════════════════════════════════════════════════════════════════
export async function deleteInvoiceAction(
    orgSlug: string,
    invoiceId: string
): Promise<ActionResult> {
    const ctx = await getSessionAndOrg(orgSlug)
    if ("error" in ctx) return { success: false, error: ctx.error ?? "Erreur d'authentification ou d'accès" }
    const { org } = ctx

    const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: org.id },
    })

    if (!invoice) return { success: false, error: "Facture introuvable" }

    // Sécurité : on ne supprime que les brouillons
    if (invoice.status !== "DRAFT") {
        return {
            success: false,
            error: "Seuls les brouillons peuvent être supprimés. Annule d'abord la facture.",
        }
    }

    await prisma.invoice.delete({ where: { id: invoiceId } })

    revalidateTag(`invoices-${org.id}`, "default")
    revalidateTag(`dashboard-${org.id}`, "default")
    revalidatePath(`/${orgSlug}/invoices`, "page")

    return { success: true, data: undefined }
}