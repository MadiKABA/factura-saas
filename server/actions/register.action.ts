// src/server/actions/register.action.ts
"use server"
import { prisma } from "@/server/db"
import { auth } from "@/server/auth"
import { headers } from "next/headers"
import { registerSchema } from "@/lib/validations/register.schema"
import type { RegisterInput } from "@/lib/validations/register.schema"

type RegisterSuccess = { success: true; redirectTo: string }
type RegisterError = { success: false; error: string; field?: keyof RegisterInput }
type RegisterResult = RegisterSuccess | RegisterError

export async function registerAction(input: RegisterInput): Promise<RegisterResult> {
    const parsed = registerSchema.safeParse(input)
    if (!parsed.success) {
        const firstError = parsed.error.issues[0]
        return {
            success: false,
            error: firstError?.message ?? "Données invalides",
            field: firstError?.path[0] as keyof RegisterInput,
        }
    }

    const { name, email, password, phoneNumber, orgName, orgSlug, orgAddress } = parsed.data

    // Slug unique
    const existingOrg = await prisma.organization.findUnique({ where: { slug: orgSlug } })
    if (existingOrg) {
        return { success: false, error: "Ce nom d'organisation est déjà utilisé", field: "orgSlug" }
    }

    // Email unique
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
        return { success: false, error: "Un compte existe déjà avec cet email", field: "email" }
    }

    // Téléphone unique si fourni
    if (phoneNumber) {
        const existingPhone = await prisma.user.findUnique({ where: { phoneNumber } })
        if (existingPhone) {
            return { success: false, error: "Ce numéro est déjà utilisé", field: "phoneNumber" }
        }
    }

    // Plan FREE
    const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } })
    if (!freePlan) {
        return { success: false, error: "Configuration serveur manquante (plan FREE introuvable)" }
    }

    // Créer le user via Better-Auth (gère hash + Account credential)
    const signUpResult = await auth.api.signUpEmail({
        body: { name, email, password },
        headers: await headers(),
    })

    if (!signUpResult?.user) {
        return { success: false, error: "Erreur lors de la création du compte" }
    }

    const userId = signUpResult.user.id

    // Ajouter le téléphone si fourni
    // Better-Auth signUpEmail ne prend pas phoneNumber en paramètre
    if (phoneNumber) {
        await prisma.user.update({
            where: { id: userId },
            data: { phoneNumber },
        })
    }

    // Transaction atomique : org + membership OWNER + subscription FREE
    try {
        await prisma.$transaction(async (tx) => {
            const org = await tx.organization.create({
                data: {
                    name: orgName,
                    slug: orgSlug,
                    defaultCurrency: "XOF",
                    address: orgAddress ?? null,
                },
            })

            await tx.membership.create({
                data: { userId, organizationId: org.id, role: "OWNER" },
            })

            const oneYearFromNow = new Date()
            oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)

            await tx.subscription.create({
                data: {
                    organizationId: org.id,
                    planId: freePlan.id,
                    status: "ACTIVE",
                    currentPeriodEnd: oneYearFromNow,
                    cancelAtPeriodEnd: false,
                },
            })
        })
    } catch (err) {
        // Nettoyage si la transaction échoue — pas de user orphelin
        await prisma.user.delete({ where: { id: userId } }).catch(() => { })
        console.error("Erreur transaction register:", err)
        return { success: false, error: "Erreur lors de la création de l'organisation" }
    }

    return { success: true, redirectTo: `/${orgSlug}` }
}