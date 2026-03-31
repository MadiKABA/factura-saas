// src/app/(dashboard)/[orgSlug]/billing/page.tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/server/auth"
import { prisma } from "@/server/db"
import dynamic from "next/dynamic"

const BillingWrapper = dynamic(() => import("./billing-wrapper"), { ssr: false })

export default async function BillingPage({
    params,
    searchParams,
}: {
    params: Promise<{ orgSlug: string }>
    searchParams: Promise<{ success?: string; error?: string; plan?: string; canceled?: string }>
}) {
    const { orgSlug } = await params
    const sp = await searchParams

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")

    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } })
    if (!org) redirect("/")

    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: org.id } },
    })
    if (!membership || !["OWNER", "ADMIN"].includes(membership.role))
        redirect(`/${orgSlug}`)

    // Charger plans + abonnement en parallèle
    const [plansRaw, subRaw] = await Promise.all([
        prisma.plan.findMany({
            where: { isActive: true },
            orderBy: { displayOrder: "asc" },
        }),
        prisma.subscription.findUnique({
            where: { organizationId: org.id },
            include: {
                plan: true,
                invoices: {
                    orderBy: { createdAt: "desc" },
                    take: 5,
                    select: {
                        id: true, status: true, amountXof: true, billingCycle: true,
                        periodStart: true, periodEnd: true, paidAt: true,
                        paydunyaCheckoutUrl: true, paymentMethod: true, createdAt: true,
                    },
                },
            },
        }),
    ])

    const plans = plansRaw.map(p => ({
        id: p.id,
        name: p.name,
        priceMonthly: Number(p.priceMonthlyXof),
        priceYearly: Number(p.priceYearlyXof),
        maxProducts: p.maxProducts,
        maxSales: p.maxSalesPerMonth,
        maxInvoices: p.maxInvoicesPerMonth,
        maxUsers: p.maxUsers,
        hasStock: p.hasStockModule,
        hasReports: p.hasReportsModule,
        hasApi: p.hasApiAccess,
        description: p.description,
    }))

    const subscription = subRaw ? {
        id: subRaw.id,
        status: subRaw.status,
        billingCycle: subRaw.billingCycle,
        trialEndsAt: subRaw.trialEndsAt,
        currentPeriodEnd: subRaw.currentPeriodEnd,
        cancelAtPeriodEnd: subRaw.cancelAtPeriodEnd,
        canceledAt: subRaw.canceledAt,
        plan: {
            id: subRaw.plan.id,
            name: subRaw.plan.name,
            priceMonthly: Number(subRaw.plan.priceMonthlyXof),
            priceYearly: Number(subRaw.plan.priceYearlyXof),
            hasStock: subRaw.plan.hasStockModule,
            hasReports: subRaw.plan.hasReportsModule,
        },
        recentInvoices: subRaw.invoices.map(i => ({
            ...i,
            amountXof: Number(i.amountXof),
        })),
    } : null

    return (
        <BillingWrapper
            orgSlug={orgSlug}
            plans={plans}
            subscription={subscription}
            initialSuccess={sp.success}
            initialError={sp.error}
            initialPlan={sp.plan}
        />
    )
}