// prisma/seed.ts
import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { createAuthClient } from "better-auth/client"

// ─── Prisma v7 : adapter obligatoire ─────────────────────────────────────────
const adapter = new PrismaPg({
    connectionString: process.env.DIRECT_URL!,
})
const prisma = new PrismaClient({ adapter })

// ─── Hash compatible Better-Auth ─────────────────────────────────────────────
// Better-Auth utilise son propre wrapper autour de scrypt (pas argon2)
// Il faut importer exactement la même fonction qu'il utilise en interne
import { hashPassword } from "better-auth/crypto"

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log("🌱 Démarrage du seeding...\n")

    // ────────────────────────────────────────────────────────────────────────────
    // 1. PLANS
    // ────────────────────────────────────────────────────────────────────────────

    console.log("📦 Création des plans...")

    const planFree = await prisma.plan.upsert({
        where: { name: "FREE" },
        update: {},
        create: {
            name: "FREE",
            priceMonthly: 0,
            priceYearly: 0,
            maxInvoices: 5,
            maxExpenses: 10,
            maxUsers: 1,
            maxProducts: 10,
        },
    })

    const planStarter = await prisma.plan.upsert({
        where: { name: "STARTER" },
        update: {},
        create: {
            name: "STARTER",
            priceMonthly: 9.99,
            priceYearly: 99.0,
            maxInvoices: 50,
            maxExpenses: 100,
            maxUsers: 3,
            maxProducts: 50,
        },
    })

    const planPro = await prisma.plan.upsert({
        where: { name: "PRO" },
        update: {},
        create: {
            name: "PRO",
            priceMonthly: 29.99,
            priceYearly: 299.0,
            maxInvoices: null,
            maxExpenses: null,
            maxUsers: 10,
            maxProducts: null,
        },
    })

    console.log(`   ✅ FREE    — 0€/mois`)
    console.log(`   ✅ STARTER — 9.99€/mois`)
    console.log(`   ✅ PRO     — 29.99€/mois\n`)

    // ────────────────────────────────────────────────────────────────────────────
    // 2. USERS + ACCOUNTS (credential)
    // ────────────────────────────────────────────────────────────────────────────

    console.log("👤 Création des utilisateurs + accounts credential...")

    // hashPassword de better-auth/crypto produit un hash au format exact
    // que Better-Auth attend lors du login — pas argon2, pas bcrypt, mais scrypt
    const passwordHash = await hashPassword("Password123!")

    async function createUserWithCredentials({
        email,
        name,
        phoneNumber,
        emailVerified,
        phoneNumberVerified,
    }: {
        email: string
        name: string
        phoneNumber: string
        emailVerified: boolean
        phoneNumberVerified: boolean
    }) {
        const user = await prisma.user.upsert({
            where: { email },
            update: {},
            create: {
                email,
                name,
                password: passwordHash,
                emailVerified,
                phoneNumber,
                phoneNumberVerified,
            },
        })

        // Better-Auth cherche Account avec providerId="credential" et accountId=userId
        await prisma.account.upsert({
            where: {
                providerId_accountId: {
                    providerId: "credential",
                    accountId: user.id,
                },
            },
            update: { password: passwordHash },
            create: {
                accountId: user.id,
                providerId: "credential",
                userId: user.id,
                password: passwordHash,
            },
        })

        return user
    }

    const userAlpha = await createUserWithCredentials({
        email: "alpha@noumtech.sn",
        name: "Alpha Diallo",
        phoneNumber: "+221771000001",
        emailVerified: true,
        phoneNumberVerified: true,
    })

    const beta = await createUserWithCredentials({
        email: "beta@noumtech.sn",
        name: "Beta Ndiaye",
        phoneNumber: "+221771000002",
        emailVerified: true,
        phoneNumberVerified: false,
    })

    const gamma = await createUserWithCredentials({
        email: "gamma@gadaco.sn",
        name: "Gamma Sow",
        phoneNumber: "+221771000003",
        emailVerified: true,
        phoneNumberVerified: true,
    })

    const delta = await createUserWithCredentials({
        email: "delta@gadaco.sn",
        name: "Delta Ba",
        phoneNumber: "+221771000004",
        emailVerified: false,
        phoneNumberVerified: false,
    })

    console.log(`   ✅ ${userAlpha.name} — hash scrypt Better-Auth`)
    console.log(`   ✅ ${beta.name} — hash scrypt Better-Auth`)
    console.log(`   ✅ ${gamma.name} — hash scrypt Better-Auth`)
    console.log(`   ✅ ${delta.name} — hash scrypt Better-Auth\n`)

    // ────────────────────────────────────────────────────────────────────────────
    // 3. ORGANISATIONS
    // ────────────────────────────────────────────────────────────────────────────

    console.log("🏢 Création des organisations...")

    const noumtech = await prisma.organization.upsert({
        where: { slug: "noumtech" },
        update: {},
        create: {
            name: "Noumtech",
            slug: "noumtech",
            defaultCurrency: "XOF",
            email: "contact@noumtech.sn",
            phone: "+221338001000",
            address: "Dakar, Plateau, Rue 10",
            website: "https://noumtech.sn",
            taxId: "SN-2024-NOUM-001",
        },
    })

    const gadaco = await prisma.organization.upsert({
        where: { slug: "gadaco" },
        update: {},
        create: {
            name: "Gadaco",
            slug: "gadaco",
            defaultCurrency: "XOF",
            email: "info@gadaco.sn",
            phone: "+221338002000",
            address: "Dakar, Almadies, Villa 42",
            website: "https://gadaco.sn",
            taxId: "SN-2024-GADA-002",
        },
    })

    console.log(`   ✅ ${noumtech.name} (slug: ${noumtech.slug})`)
    console.log(`   ✅ ${gadaco.name} (slug: ${gadaco.slug})\n`)

    // ────────────────────────────────────────────────────────────────────────────
    // 4. MEMBERSHIPS
    // ────────────────────────────────────────────────────────────────────────────

    console.log("🔗 Création des memberships...")

    const memberships = [
        { userId: userAlpha.id, organizationId: noumtech.id, role: "OWNER" as const },
        { userId: beta.id, organizationId: noumtech.id, role: "ADMIN" as const },
        { userId: gamma.id, organizationId: gadaco.id, role: "OWNER" as const },
        { userId: delta.id, organizationId: gadaco.id, role: "ACCOUNTANT" as const },
        { userId: beta.id, organizationId: gadaco.id, role: "MEMBER" as const },
    ]

    for (const m of memberships) {
        await prisma.membership.upsert({
            where: {
                userId_organizationId: {
                    userId: m.userId,
                    organizationId: m.organizationId,
                },
            },
            update: {},
            create: m,
        })
    }

    console.log(`   ✅ Noumtech → Alpha (OWNER), Beta (ADMIN)`)
    console.log(`   ✅ Gadaco   → Gamma (OWNER), Delta (ACCOUNTANT), Beta (MEMBER)\n`)

    // ────────────────────────────────────────────────────────────────────────────
    // 5. SUBSCRIPTIONS
    // ────────────────────────────────────────────────────────────────────────────

    console.log("💳 Création des abonnements...")

    const oneYearFromNow = new Date()
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)

    const sixMonthsFromNow = new Date()
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)

    await prisma.subscription.upsert({
        where: { organizationId: noumtech.id },
        update: {},
        create: {
            organizationId: noumtech.id,
            planId: planPro.id,
            status: "ACTIVE",
            currentPeriodEnd: oneYearFromNow,
            cancelAtPeriodEnd: false,
        },
    })

    await prisma.subscription.upsert({
        where: { organizationId: gadaco.id },
        update: {},
        create: {
            organizationId: gadaco.id,
            planId: planStarter.id,
            status: "ACTIVE",
            currentPeriodEnd: sixMonthsFromNow,
            cancelAtPeriodEnd: false,
        },
    })

    console.log(`   ✅ Noumtech → PRO`)
    console.log(`   ✅ Gadaco   → STARTER\n`)

    // ────────────────────────────────────────────────────────────────────────────
    // 6. TAX RATES
    // ────────────────────────────────────────────────────────────────────────────

    console.log("🧾 Création des taux de TVA...")

    await prisma.taxRate.createMany({
        skipDuplicates: true,
        data: [
            { organizationId: noumtech.id, name: "TVA 18%", rate: 18.0, isDefault: true },
            { organizationId: noumtech.id, name: "Exonéré", rate: 0.0, isDefault: false },
            { organizationId: gadaco.id, name: "TVA 18%", rate: 18.0, isDefault: true },
            { organizationId: gadaco.id, name: "TVA réduite 9%", rate: 9.0, isDefault: false },
            { organizationId: gadaco.id, name: "Exonéré", rate: 0.0, isDefault: false },
        ],
    })

    console.log(`   ✅ Noumtech → TVA 18%, Exonéré`)
    console.log(`   ✅ Gadaco   → TVA 18%, TVA réduite 9%, Exonéré\n`)

    // ────────────────────────────────────────────────────────────────────────────
    // 7. CURRENCIES
    // ────────────────────────────────────────────────────────────────────────────

    console.log("💱 Création des devises...")

    await prisma.currency.createMany({
        skipDuplicates: true,
        data: [
            { code: "XOF", name: "Franc CFA BCEAO", symbol: "FCFA" },
            { code: "USD", name: "Dollar américain", symbol: "$" },
            { code: "EUR", name: "Euro", symbol: "€" },
            { code: "GBP", name: "Livre sterling", symbol: "£" },
            { code: "MAD", name: "Dirham marocain", symbol: "MAD" },
            { code: "NGN", name: "Naira nigérian", symbol: "₦" },
            { code: "GHS", name: "Cedi ghanéen", symbol: "₵" },
        ],
    })

    console.log(`   ✅ XOF, USD, EUR, GBP, MAD, NGN, GHS\n`)

    // ────────────────────────────────────────────────────────────────────────────
    // RÉCAPITULATIF
    // ────────────────────────────────────────────────────────────────────────────

    console.log("─".repeat(55))
    console.log("✅ Seeding terminé avec succès !\n")
    console.log("📋 Résumé :")
    console.log(`   Plans         : FREE · STARTER · PRO`)
    console.log(`   Organisations : Noumtech · Gadaco`)
    console.log(`   Utilisateurs  : Alpha · Beta · Gamma · Delta`)
    console.log(`   Mot de passe  : Password123! (tous les users)`)
    console.log("─".repeat(55))
    console.log("\n🗂️  Structure des accès :")
    console.log("   Noumtech  →  alpha@noumtech.sn (OWNER)")
    console.log("             →  beta@noumtech.sn  (ADMIN)")
    console.log("   Gadaco    →  gamma@gadaco.sn   (OWNER)")
    console.log("             →  delta@gadaco.sn   (ACCOUNTANT)")
    console.log("             →  beta@noumtech.sn  (MEMBER) ← multi-org")
    console.log("")
}

main()
    .then(async () => { await prisma.$disconnect() })
    .catch(async (e) => {
        console.error("❌ Erreur lors du seeding :", e)
        await prisma.$disconnect()
        process.exit(1)
    })