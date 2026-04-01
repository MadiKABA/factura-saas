// prisma/seed.ts
// ─── Seeder complet Factura v5 ────────────────────────────────────────────────
// Nouveau modèle Plan (priceMonthlyXof) + Subscription v5 (billingCycle,
// activatedAt, SubscriptionInvoice) + AdminUser + stock complet
import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { hashPassword } from "better-auth/crypto"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const addMonths = (d: Date, n: number) => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r }
const subDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() - n); return r }
const subMonths = (d: Date, n: number) => addMonths(d, -n)

async function main() {
    console.log("🌱 Seeding Factura v5…\n")
    const now = new Date()

    // ══════════════════════════════════════════════════════════════════════════
    // 1. PLANS — priceMonthlyXof / priceYearlyXof + feature flags
    // ══════════════════════════════════════════════════════════════════════════
    console.log("📦 Plans…")

    const planFree = await prisma.plan.upsert({
        where: { name: "FREE" }, update: {},
        create: {
            name: "FREE", priceMonthlyXof: 0, priceYearlyXof: 0,
            maxProducts: 20, maxSalesPerMonth: 50, maxInvoicesPerMonth: 10,
            maxStockBatchesPerMonth: 0, maxUsers: 2,
            hasStockModule: false, hasReportsModule: false,
            hasMultiUserModule: true, hasApiAccess: false, hasPrioritySupport: false,
            description: "Pour démarrer — sans engagement", displayOrder: 0, isActive: true,
        },
    })
    const planStarter = await prisma.plan.upsert({
        where: { name: "STARTER" }, update: {},
        create: {
            name: "STARTER", priceMonthlyXof: 9_900, priceYearlyXof: 95_040,
            maxProducts: 100, maxSalesPerMonth: 200, maxInvoicesPerMonth: 50,
            maxStockBatchesPerMonth: 50, maxUsers: 5,
            hasStockModule: true, hasReportsModule: false,
            hasMultiUserModule: true, hasApiAccess: false, hasPrioritySupport: false,
            description: "Pour les petits commerces", displayOrder: 1, isActive: true,
        },
    })
    const planPro = await prisma.plan.upsert({
        where: { name: "PRO" }, update: {},
        create: {
            name: "PRO", priceMonthlyXof: 24_900, priceYearlyXof: 239_040,
            maxProducts: null, maxSalesPerMonth: null, maxInvoicesPerMonth: null,
            maxStockBatchesPerMonth: null, maxUsers: 20,
            hasStockModule: true, hasReportsModule: true,
            hasMultiUserModule: true, hasApiAccess: false, hasPrioritySupport: true,
            description: "Pour les commerces en croissance", displayOrder: 2, isActive: true,
        },
    })
    await prisma.plan.upsert({
        where: { name: "BUSINESS" }, update: {},
        create: {
            name: "BUSINESS", priceMonthlyXof: 49_900, priceYearlyXof: 479_040,
            maxProducts: null, maxSalesPerMonth: null, maxInvoicesPerMonth: null,
            maxStockBatchesPerMonth: null, maxUsers: null,
            hasStockModule: true, hasReportsModule: true,
            hasMultiUserModule: true, hasApiAccess: true, hasPrioritySupport: true,
            description: "Pour les entreprises et multi-sites", displayOrder: 3, isActive: true,
        },
    })

    console.log("   ✅ FREE · STARTER 9 900 · PRO 24 900 · BUSINESS 49 900 XOF/mois\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 2. DEVISES
    // ══════════════════════════════════════════════════════════════════════════
    console.log("💱 Devises…")
    await prisma.currency.createMany({
        skipDuplicates: true,
        data: [
            { code: "XOF", name: "Franc CFA BCEAO", symbol: "FCFA" },
            { code: "GNF", name: "Franc guinéen", symbol: "FG" },
            { code: "USD", name: "Dollar US", symbol: "$" },
            { code: "EUR", name: "Euro", symbol: "€" },
            { code: "MAD", name: "Dirham marocain", symbol: "MAD" },
        ],
    })
    console.log("   ✅ XOF, GNF, USD, EUR, MAD\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 3. USERS — org members + superadmins plateforme
    // ══════════════════════════════════════════════════════════════════════════
    console.log("👤 Utilisateurs…")
    const hash = await hashPassword("Password123!")

    async function upsertUser(data: {
        email: string; name: string; phoneNumber: string
        emailVerified: boolean; phoneNumberVerified: boolean
    }) {
        const user = await prisma.user.upsert({
            where: { email: data.email }, update: {},
            create: { ...data, password: hash },
        })
        await prisma.account.upsert({
            where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
            update: { password: hash },
            create: { accountId: user.id, providerId: "credential", userId: user.id, password: hash },
        })
        return user
    }

    // Membres d'organisations
    const alpha = await upsertUser({ email: "alpha@noumtech.sn", name: "Alpha Diallo", phoneNumber: "+221771000001", emailVerified: true, phoneNumberVerified: true })
    const beta = await upsertUser({ email: "beta@noumtech.sn", name: "Beta Ndiaye", phoneNumber: "+221771000002", emailVerified: true, phoneNumberVerified: false })
    const gamma = await upsertUser({ email: "gamma@gadaco.sn", name: "Gamma Sow", phoneNumber: "+221771000003", emailVerified: true, phoneNumberVerified: true })
    const delta = await upsertUser({ email: "delta@gadaco.sn", name: "Delta Ba", phoneNumber: "+221771000004", emailVerified: false, phoneNumberVerified: false })
    const mamadi = await upsertUser({ email: "mamadi@factura.sn", name: "Mamadi Kaba", phoneNumber: "+224621000001", emailVerified: true, phoneNumberVerified: true })

    // ── Superadmins — NON liés à aucune organisation ─────────────────────────
    // Ils accèdent à la plateforme via /admin (AdminUser table)
    const sadmin1 = await upsertUser({ email: "admin@factura.sn", name: "Admin Factura", phoneNumber: "+221770000001", emailVerified: true, phoneNumberVerified: true })
    const sadmin2 = await upsertUser({ email: "support@factura.sn", name: "Support Factura", phoneNumber: "+221770000002", emailVerified: true, phoneNumberVerified: true })

    for (const [u, note] of [[sadmin1, "Fondateur"], [sadmin2, "Support technique"]] as [typeof sadmin1, string][]) {
        await prisma.adminUser.upsert({
            where: { userId: u.id }, update: {},
            create: { userId: u.id, canManagePlans: true, canManageOrgs: true, canManageSubs: true, note },
        })
    }

    console.log("   ✅ alpha · beta · gamma · delta · mamadi  (Password123!)")
    console.log("   ✅ admin@factura.sn · support@factura.sn  (superadmins — aucune org)\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 4. ORGANISATIONS
    // ══════════════════════════════════════════════════════════════════════════
    console.log("🏢 Organisations…")
    const noumtech = await prisma.organization.upsert({
        where: { slug: "noumtech" }, update: {},
        create: {
            name: "Noumtech", slug: "noumtech", type: "BUSINESS", defaultCurrency: "XOF",
            email: "contact@noumtech.sn", phone: "+221338001000",
            address: "Dakar, Plateau, Rue 10", taxId: "SN-2024-NOUM-001",
            receiptHeader: "Noumtech SARL\nDakar, Sénégal",
            receiptFooter: "Merci pour votre confiance !",
        },
    })
    const gadaco = await prisma.organization.upsert({
        where: { slug: "gadaco" }, update: {},
        create: {
            name: "Gadaco Commerce", slug: "gadaco", type: "RETAIL", defaultCurrency: "XOF",
            email: "info@gadaco.sn", phone: "+221338002000",
            address: "Dakar, Almadies, Villa 42", taxId: "SN-2024-GADA-002",
            receiptHeader: "Gadaco Commerce\nAlmadies, Dakar",
            receiptFooter: "Merci pour votre achat !",
            receiptWidth: 58,
        },
    })
    console.log("   ✅ Noumtech (BUSINESS) · Gadaco Commerce (RETAIL)\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 5. MEMBERSHIPS (superadmins exclus)
    // ══════════════════════════════════════════════════════════════════════════
    console.log("🔗 Memberships…")
    for (const m of [
        { userId: alpha.id, organizationId: noumtech.id, role: "OWNER" },
        { userId: beta.id, organizationId: noumtech.id, role: "ADMIN" },
        { userId: gamma.id, organizationId: gadaco.id, role: "OWNER" },
        { userId: delta.id, organizationId: gadaco.id, role: "ACCOUNTANT" },
        { userId: beta.id, organizationId: gadaco.id, role: "MEMBER" },
        { userId: mamadi.id, organizationId: gadaco.id, role: "CASHIER" },
    ]) {
        await prisma.membership.upsert({
            where: { userId_organizationId: { userId: m.userId, organizationId: m.organizationId } },
            update: {}, create: m as any,
        })
    }
    console.log("   ✅ Noumtech  → Alpha(OWNER) Beta(ADMIN)")
    console.log("   ✅ Gadaco    → Gamma(OWNER) Delta(ACCOUNTANT) Beta(MEMBER) Mamadi(CASHIER)")
    console.log("   ✅ Superadmins → aucun membership (AdminUser only)\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 6. SUBSCRIPTIONS v5
    // Champs : billingCycle, currentPeriodStart, activatedAt, activatedByNote
    //          + SubscriptionInvoice pour la traçabilité des paiements
    // ══════════════════════════════════════════════════════════════════════════
    console.log("💳 Abonnements v5…")

    const subNoumtech = await prisma.subscription.upsert({
        where: { organizationId: noumtech.id }, update: {},
        create: {
            organizationId: noumtech.id,
            planId: planPro.id,
            status: "ACTIVE",
            billingCycle: "YEARLY",
            currentPeriodStart: subMonths(now, 1),
            currentPeriodEnd: addMonths(now, 11),
            cancelAtPeriodEnd: false,
            activatedAt: subMonths(now, 1),
            activatedByNote: "Seed initial — PRO annuel",
        },
    })

    const subGadaco = await prisma.subscription.upsert({
        where: { organizationId: gadaco.id }, update: {},
        create: {
            organizationId: gadaco.id,
            planId: planStarter.id,
            status: "ACTIVE",
            billingCycle: "MONTHLY",
            currentPeriodStart: subDays(now, 5),
            currentPeriodEnd: addMonths(now, 1),
            cancelAtPeriodEnd: false,
            activatedAt: subDays(now, 5),
            activatedByNote: "Seed initial — STARTER mensuel",
        },
    })

    // Factures d'abonnement (PAID — activation manuelle seed)
    await prisma.subscriptionInvoice.createMany({
        skipDuplicates: true,
        data: [
            {
                organizationId: noumtech.id,
                planId: planPro.id,
                subscriptionId: subNoumtech.id,
                amountXof: 239_040,
                billingCycle: "YEARLY",
                periodStart: subMonths(now, 1),
                periodEnd: addMonths(now, 11),
                status: "PAID",
                paidAt: subMonths(now, 1),
                manuallyActivatedAt: subMonths(now, 1),
                notes: "Seed initial — activation manuelle",
            },
            {
                organizationId: gadaco.id,
                planId: planStarter.id,
                subscriptionId: subGadaco.id,
                amountXof: 9_900,
                billingCycle: "MONTHLY",
                periodStart: subDays(now, 5),
                periodEnd: addMonths(now, 1),
                status: "PAID",
                paidAt: subDays(now, 5),
                manuallyActivatedAt: subDays(now, 5),
                notes: "Seed initial — activation manuelle",
            },
        ],
    })

    console.log("   ✅ Noumtech → PRO YEARLY 12 mois — 239 040 XOF")
    console.log("   ✅ Gadaco   → STARTER MONTHLY 1 mois — 9 900 XOF\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 7. TAX RATES
    // ══════════════════════════════════════════════════════════════════════════
    console.log("🧾 Taux TVA…")
    await prisma.taxRate.createMany({
        skipDuplicates: true,
        data: [
            { organizationId: noumtech.id, name: "TVA 18%", rate: 18, isDefault: true },
            { organizationId: noumtech.id, name: "Exonéré", rate: 0, isDefault: false },
            { organizationId: gadaco.id, name: "TVA 18%", rate: 18, isDefault: true },
            { organizationId: gadaco.id, name: "TVA réduite 9%", rate: 9, isDefault: false },
            { organizationId: gadaco.id, name: "Exonéré", rate: 0, isDefault: false },
        ],
    })
    console.log("   ✅ Noumtech : TVA 18%, Exonéré")
    console.log("   ✅ Gadaco   : TVA 18%, TVA 9%, Exonéré\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 8. FOURNISSEURS
    // ══════════════════════════════════════════════════════════════════════════
    console.log("🏭 Fournisseurs…")
    const vSfco = await prisma.vendor.findFirst({ where: { organizationId: gadaco.id, name: "SFCO Distribution" } })
        ?? await prisma.vendor.create({ data: { organizationId: gadaco.id, name: "SFCO Distribution", phone: "+221771200001", email: "cmds@sfco.sn" } })
    const vDiouf = await prisma.vendor.findFirst({ where: { organizationId: gadaco.id, name: "Épicerie Diouf & Fils" } })
        ?? await prisma.vendor.create({ data: { organizationId: gadaco.id, name: "Épicerie Diouf & Fils", phone: "+221771200002" } })
    console.log("   ✅ SFCO Distribution · Épicerie Diouf & Fils\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 9. CATÉGORIES PRODUIT
    // ══════════════════════════════════════════════════════════════════════════
    console.log("📂 Catégories…")
    async function upsertCat(orgId: string, name: string, color: string, icon: string) {
        return prisma.productCategory.upsert({
            where: { organizationId_name: { organizationId: orgId, name } },
            update: {}, create: { organizationId: orgId, name, color, icon },
        })
    }
    const catBv = await upsertCat(gadaco.id, "Boissons", "#3b82f6", "💧")
    const catAl = await upsertCat(gadaco.id, "Alimentation", "#10b981", "🥩")
    const catHy = await upsertCat(gadaco.id, "Hygiène & Beauté", "#8b5cf6", "🧴")
    const catEl = await upsertCat(gadaco.id, "Électronique", "#f59e0b", "📱")
    const catDev = await upsertCat(noumtech.id, "Logiciels", "#6366f1", "💻")
    const catCon = await upsertCat(noumtech.id, "Conseil & Audit", "#ec4899", "🔍")
    console.log("   ✅ Gadaco : Boissons, Alimentation, Hygiène, Électronique")
    console.log("   ✅ Noumtech : Logiciels, Conseil & Audit\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 10. PRODUITS
    // ══════════════════════════════════════════════════════════════════════════
    console.log("📦 Produits…")
    async function upsertProd(data: any) {
        return prisma.product.upsert({
            where: { organizationId_sku: { organizationId: data.organizationId, sku: data.sku } },
            update: {}, create: data,
        })
    }
    const pCoca = await upsertProd({ organizationId: gadaco.id, categoryId: catBv.id, name: "Coca-Cola 33cl", sku: "GAD-BV-001", barcode: "5449000000996", price: 500, costPrice: 350, currentStock: 48, minStockAlert: 12, unit: "pcs", isService: false, isFavorite: true, isActive: true })
    const pEau = await upsertProd({ organizationId: gadaco.id, categoryId: catBv.id, name: "Eau minérale 1.5L", sku: "GAD-BV-002", barcode: "3274080005003", price: 350, costPrice: 220, currentStock: 72, minStockAlert: 24, unit: "pcs", isService: false, isFavorite: true, isActive: true })
    const pJus = await upsertProd({ organizationId: gadaco.id, categoryId: catBv.id, name: "Jus Bissap 50cl", sku: "GAD-BV-003", barcode: "6191503131064", price: 400, costPrice: 280, currentStock: 0, minStockAlert: 10, unit: "pcs", isService: false, isFavorite: false, isActive: true })
    const pRiz = await upsertProd({ organizationId: gadaco.id, categoryId: catAl.id, name: "Riz brisé 5kg", sku: "GAD-AL-001", barcode: "6191234567890", price: 3_500, costPrice: 2_800, currentStock: 25, minStockAlert: 5, unit: "sac", isService: false, isFavorite: true, isActive: true })
    const pHuile = await upsertProd({ organizationId: gadaco.id, categoryId: catAl.id, name: "Huile végétale 1L", sku: "GAD-AL-002", barcode: "6191234567891", price: 1_200, costPrice: 950, currentStock: 18, minStockAlert: 6, unit: "pcs", isService: false, isFavorite: false, isActive: true })
    const pSavon = await upsertProd({ organizationId: gadaco.id, categoryId: catHy.id, name: "Savon Cadum 200g", sku: "GAD-HY-001", barcode: "3017620425035", price: 600, costPrice: 420, currentStock: 30, minStockAlert: 10, unit: "pcs", isService: false, isFavorite: false, isActive: true })
    const pCable = await upsertProd({ organizationId: gadaco.id, categoryId: catEl.id, name: "Câble USB-C 1m", sku: "GAD-EL-001", barcode: "4895223306101", price: 2_500, costPrice: 1_500, currentStock: 8, minStockAlert: 3, unit: "pcs", isService: false, isFavorite: false, isActive: true })
    await upsertProd({ organizationId: noumtech.id, categoryId: catDev.id, name: "Développement Web", sku: "NTK-DEV-001", price: 500_000, costPrice: 0, currentStock: 0, unit: "projet", isService: true, isFavorite: true, isActive: true })
    await upsertProd({ organizationId: noumtech.id, categoryId: catDev.id, name: "Maintenance mensuelle", sku: "NTK-DEV-002", price: 75_000, costPrice: 0, currentStock: 0, unit: "mois", isService: true, isFavorite: true, isActive: true })
    await upsertProd({ organizationId: noumtech.id, categoryId: catCon.id, name: "Audit informatique", sku: "NTK-CON-001", price: 150_000, costPrice: 0, currentStock: 0, unit: "jours", isService: true, isFavorite: false, isActive: true })
    console.log("   ✅ Gadaco   : 7 produits physiques (Coca, Eau, Jus, Riz, Huile, Savon, Câble)")
    console.log("   ✅ Noumtech : 3 services (Dev Web, Maintenance, Audit)\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 11. CLIENTS
    // ══════════════════════════════════════════════════════════════════════════
    console.log("👥 Clients…")
    await prisma.client.createMany({
        skipDuplicates: true, data: [
            { organizationId: gadaco.id, name: "Moussa Diop", phone: "+221771300001", email: "moussa@gmail.com", type: "INDIVIDUAL" },
            { organizationId: gadaco.id, name: "Fatou Sarr", phone: "+221771300002", type: "INDIVIDUAL" },
            { organizationId: gadaco.id, name: "Restaurant Dakar Charme", phone: "+221338300001", type: "COMPANY" },
            { organizationId: noumtech.id, name: "Niox Technologies", phone: "+221338400001", email: "dsi@niox.sn", type: "COMPANY", taxId: "SN-2024-NIOX" },
        ]
    }).catch(() => { }) // skipDuplicates peut ne pas suffire selon la version Prisma
    console.log("   ✅ Gadaco : Moussa Diop, Fatou Sarr, Restaurant Dakar Charme")
    console.log("   ✅ Noumtech : Niox Technologies\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 12. STOCK BATCHES — bons de mouvement multi-produits
    // ══════════════════════════════════════════════════════════════════════════
    console.log("📥 Bons de mouvement…")

    // BON 1 — RECEPTION VALIDATED (fondation stock, -30j)
    const b1 = await prisma.stockBatch.create({
        data: {
            organizationId: gadaco.id, type: "RECEPTION", status: "VALIDATED",
            number: "REC-2025-0001", vendorId: vSfco.id, externalRef: "BL-SFCO-20250101",
            note: "Réception initiale ouverture stock",
            batchDate: subDays(now, 30), validatedAt: subDays(now, 30),
            totalCost: 48 * 350 + 72 * 220 + 20 * 280 + 30 * 2800 + 18 * 950,
            items: {
                create: [
                    { productId: pCoca.id, quantity: 48, unitCost: 350, totalCost: 48 * 350 },
                    { productId: pEau.id, quantity: 72, unitCost: 220, totalCost: 72 * 220 },
                    { productId: pJus.id, quantity: 20, unitCost: 280, totalCost: 20 * 280 },
                    { productId: pRiz.id, quantity: 30, unitCost: 2_800, totalCost: 30 * 2800 },
                    { productId: pHuile.id, quantity: 18, unitCost: 950, totalCost: 18 * 950 },
                ]
            },
        },
    })

    // BON 2 — OUTPUT VALIDATED péremption (-10j)
    const b2 = await prisma.stockBatch.create({
        data: {
            organizationId: gadaco.id, type: "OUTPUT", status: "VALIDATED",
            number: "OUT-2025-0001", outputReason: "EXPIRED",
            note: "Jus Bissap périmés — lot entier",
            batchDate: subDays(now, 10), validatedAt: subDays(now, 10),
            totalCost: 20 * 280,
            items: {
                create: [
                    { productId: pJus.id, quantity: 20, unitCost: 280, totalCost: 5_600, note: "Lot périmé" },
                ]
            },
        },
    })

    // BON 3 — RECEPTION VALIDATED réappro (-5j)
    const b3 = await prisma.stockBatch.create({
        data: {
            organizationId: gadaco.id, type: "RECEPTION", status: "VALIDATED",
            number: "REC-2025-0002", vendorId: vSfco.id, externalRef: "BL-SFCO-20250125",
            batchDate: subDays(now, 5), validatedAt: subDays(now, 5),
            totalCost: 12 * 350 + 5 * 2800 + 30 * 420 + 8 * 1500,
            items: {
                create: [
                    { productId: pCoca.id, quantity: 12, unitCost: 350, totalCost: 12 * 350 },
                    { productId: pRiz.id, quantity: 5, unitCost: 2_800, totalCost: 5 * 2800 },
                    { productId: pSavon.id, quantity: 30, unitCost: 420, totalCost: 30 * 420 },
                    { productId: pCable.id, quantity: 8, unitCost: 1_500, totalCost: 8 * 1500 },
                ]
            },
        },
    })

    // BON 4 — DRAFT (en attente, aujourd'hui)
    await prisma.stockBatch.create({
        data: {
            organizationId: gadaco.id, type: "RECEPTION", status: "DRAFT",
            number: "REC-2025-0003", vendorId: vDiouf.id, externalRef: "BL-DIOUF-20250130",
            note: "À vérifier avant validation", batchDate: now,
            items: {
                create: [
                    { productId: pRiz.id, quantity: 10, unitCost: 2_700 },
                    { productId: pHuile.id, quantity: 12, unitCost: 920 },
                    { productId: pEau.id, quantity: 48, unitCost: 210 },
                ]
            },
        },
    })

    console.log("   ✅ REC-2025-0001 VALIDATED — 5 produits (fondation stock)")
    console.log("   ✅ OUT-2025-0001 VALIDATED — péremption jus bissap")
    console.log("   ✅ REC-2025-0002 VALIDATED — réappro + nouveaux produits")
    console.log("   ✅ REC-2025-0003 DRAFT     — en attente validation\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 13. STOCK MOVEMENTS — un mouvement par ligne de bon validé + ventes
    //     Clé : stockBatchId relie chaque mouvement à son bon source
    // ══════════════════════════════════════════════════════════════════════════
    console.log("📊 Mouvements de stock…")

    // Batch 1 — entrées initiales
    for (const m of [
        { productId: pCoca.id, qty: 48, cost: 350 },
        { productId: pEau.id, qty: 72, cost: 220 },
        { productId: pJus.id, qty: 20, cost: 280 },
        { productId: pRiz.id, qty: 30, cost: 2_800 },
        { productId: pHuile.id, qty: 18, cost: 950 },
    ]) {
        await prisma.stockMovement.create({
            data: {
                organizationId: gadaco.id, productId: m.productId,
                stockBatchId: b1.id, vendorId: vSfco.id,
                type: "IN", direction: 1, quantity: m.qty,
                unitCost: m.cost, totalCost: m.qty * m.cost,
                referenceType: "BATCH", referenceId: b1.id,
                note: `Réception ${b1.number}`, movedAt: subDays(now, 30),
            }
        })
    }

    // Batch 2 — sortie perte
    await prisma.stockMovement.create({
        data: {
            organizationId: gadaco.id, productId: pJus.id,
            stockBatchId: b2.id,
            type: "LOSS", direction: -1, quantity: 20,
            unitCost: 280, totalCost: 5_600,
            referenceType: "BATCH", referenceId: b2.id,
            note: `Sortie ${b2.number} — Périmés`, movedAt: subDays(now, 10),
        }
    })

    // Batch 3 — réapprovisionnement
    for (const m of [
        { productId: pCoca.id, qty: 12, cost: 350 },
        { productId: pRiz.id, qty: 5, cost: 2_800 },
        { productId: pSavon.id, qty: 30, cost: 420 },
        { productId: pCable.id, qty: 8, cost: 1_500 },
    ]) {
        await prisma.stockMovement.create({
            data: {
                organizationId: gadaco.id, productId: m.productId,
                stockBatchId: b3.id, vendorId: vSfco.id,
                type: "IN", direction: 1, quantity: m.qty,
                unitCost: m.cost, totalCost: m.qty * m.cost,
                referenceType: "BATCH", referenceId: b3.id,
                note: `Réception ${b3.number}`, movedAt: subDays(now, 5),
            }
        })
    }

    // Ventes simulées (OUT sans batch — issues du POS)
    for (const m of [
        { productId: pCoca.id, qty: 12, cost: 350, note: "Vente VNT-20250120-001" },
        { productId: pEau.id, qty: 24, cost: 220, note: "Vente VNT-20250121-001" },
        { productId: pRiz.id, qty: 10, cost: 2_800, note: "Vente VNT-20250122-001" },
    ]) {
        await prisma.stockMovement.create({
            data: {
                organizationId: gadaco.id, productId: m.productId,
                type: "OUT", direction: -1, quantity: m.qty,
                unitCost: m.cost, totalCost: m.qty * m.cost,
                referenceType: "SALE", note: m.note, movedAt: subDays(now, 7),
            }
        })
    }

    console.log("   ✅ 9  mouvements IN  (réceptions batch1 + batch3)")
    console.log("   ✅ 1  mouvement  LOSS (péremption batch2)")
    console.log("   ✅ 3  mouvements OUT  (ventes simulées POS)\n")

    // ══════════════════════════════════════════════════════════════════════════
    // 14. INVENTAIRES
    // ══════════════════════════════════════════════════════════════════════════
    console.log("📋 Inventaires…")

    // Inventaire VALIDATED il y a 15 jours
    const inv1 = await prisma.inventory.create({
        data: {
            organizationId: gadaco.id, name: "Inventaire Janvier 2025",
            status: "VALIDATED", note: "Inventaire mensuel routine",
            startedAt: subDays(now, 16), closedAt: subDays(now, 15),
            items: {
                create: [
                    { productId: pCoca.id, expectedQty: 50, countedQty: 48, variance: -2 },
                    { productId: pEau.id, expectedQty: 70, countedQty: 72, variance: 2 },
                    { productId: pRiz.id, expectedQty: 28, countedQty: 25, variance: -3 },
                    { productId: pHuile.id, expectedQty: 18, countedQty: 18, variance: 0 },
                    { productId: pSavon.id, expectedQty: 0, countedQty: 0, variance: 0 },
                ]
            },
        },
    })

    // Ajustements issus de l'inventaire validé
    await prisma.stockMovement.createMany({
        data: [
            { organizationId: gadaco.id, productId: pCoca.id, type: "ADJUSTMENT", direction: -1, quantity: 2, referenceType: "INVENTORY", referenceId: inv1.id, note: "Ajustement Inv. Janvier — Coca-Cola", movedAt: subDays(now, 15) },
            { organizationId: gadaco.id, productId: pEau.id, type: "ADJUSTMENT", direction: 1, quantity: 2, referenceType: "INVENTORY", referenceId: inv1.id, note: "Ajustement Inv. Janvier — Eau", movedAt: subDays(now, 15) },
            { organizationId: gadaco.id, productId: pRiz.id, type: "ADJUSTMENT", direction: -1, quantity: 3, referenceType: "INVENTORY", referenceId: inv1.id, note: "Ajustement Inv. Janvier — Riz brisé", movedAt: subDays(now, 15) },
        ]
    })

    // Inventaire DRAFT en cours
    await prisma.inventory.create({
        data: {
            organizationId: gadaco.id, name: "Inventaire Février 2025",
            status: "DRAFT", note: "Comptage en cours — non validé", startedAt: now,
            items: {
                create: [
                    { productId: pCoca.id, expectedQty: 48, countedQty: 48, variance: 0 },
                    { productId: pEau.id, expectedQty: 72, countedQty: 70, variance: -2 },
                    { productId: pJus.id, expectedQty: 0, countedQty: 0, variance: 0 },
                    { productId: pRiz.id, expectedQty: 25, countedQty: 24, variance: -1 },
                    { productId: pHuile.id, expectedQty: 18, countedQty: 18, variance: 0 },
                    { productId: pSavon.id, expectedQty: 30, countedQty: 30, variance: 0 },
                    { productId: pCable.id, expectedQty: 8, countedQty: 8, variance: 0 },
                ]
            },
        },
    })

    console.log("   ✅ Janvier 2025 VALIDATED — 3 ajustements appliqués")
    console.log("   ✅ Février 2025 DRAFT     — comptage en cours\n")

    // ══════════════════════════════════════════════════════════════════════════
    console.log("─".repeat(62))
    console.log("✅ Seeding v5 terminé !\n")
    console.log("   Plans         : FREE · STARTER · PRO · BUSINESS")
    console.log("   Orgs          : Noumtech (PRO annuel) · Gadaco (STARTER mensuel)")
    console.log("   Utilisateurs  : 5 membres + 2 superadmins — Password123!")
    console.log("   Superadmins   : admin@factura.sn · support@factura.sn (pas d'org)")
    console.log("   Stock Gadaco  : 4 bons · 13 mouvements · 2 inventaires")
    console.log("─".repeat(62))
    console.log("\n🗂️  Comptes :")
    console.log("   Noumtech  →  alpha@noumtech.sn (OWNER) · beta@noumtech.sn (ADMIN)")
    console.log("   Gadaco    →  gamma@gadaco.sn (OWNER) · delta@gadaco.sn (ACCOUNTANT)")
    console.log("              mamadi@factura.sn (CASHIER — POS uniquement)")
    console.log("   Admin     →  admin@factura.sn · support@factura.sn (/admin)")
}

main()
    .then(async () => { await prisma.$disconnect() })
    .catch(async (e) => { console.error("❌ Erreur seeding :", e); await prisma.$disconnect(); process.exit(1) })