// src/server/actions/forgot-password.action.ts
"use server"
import { prisma } from "@/server/db"
import { auth } from "@/server/auth"
import { headers } from "next/headers"
import { hashPassword } from "better-auth/crypto"
import { sendResetPasswordOtpEmail } from "@/lib/email/resend"
import { sendSms } from "@/lib/sms"
import { env } from "@/lib/env"

// ─── Génère un OTP numérique à 6 chiffres ─────────────────────────────────────
function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

// ─── Préfixe d'identifier pour distinguer nos OTP reset ──────────────────────
// On gère la Verification table directement pour contourner le bug
// d'identifier mismatch du plugin emailOTP de Better-Auth
const RESET_PREFIX = "pw-reset:"

// ══════════════════════════════════════════════════════════════════════════════
// ACTION 1 — Envoyer l'OTP
// ══════════════════════════════════════════════════════════════════════════════

type SendOtpResult =
    | { success: true }
    | { success: false; error: string }

export async function sendResetOtpAction(
    method: "email" | "phone",
    identifier: string  // email ou phoneNumber complet
): Promise<SendOtpResult> {

    // 1. Vérifier que l'utilisateur existe
    let user: { id: string; email: string; name: string | null } | null = null

    if (method === "email") {
        user = await prisma.user.findUnique({
            where: { email: identifier },
            select: { id: true, email: true, name: true },
        })
    } else {
        user = await prisma.user.findUnique({
            where: { phoneNumber: identifier },
            select: { id: true, email: true, name: true },
        })
    }

    // Réponse volontairement identique si l'utilisateur n'existe pas
    // → évite l'énumération des comptes (user enumeration)
    if (!user) {
        return { success: true }
    }

    // 2. Supprimer les anciens OTP reset pour cet identifiant
    await prisma.verification.deleteMany({
        where: { identifier: `${RESET_PREFIX}${identifier}` },
    })

    // 3. Créer le nouvel OTP
    const otp = generateOtp()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

    await prisma.verification.create({
        data: {
            identifier: `${RESET_PREFIX}${identifier}`,
            value: otp,
            expiresAt,
        },
    })

    // 4. Envoyer le code
    try {
        if (method === "email") {
            await sendResetPasswordOtpEmail({ to: identifier, otp })
        } else {
            await sendSms({
                to: identifier,
                body: `Ton code de réinitialisation ${env.NEXT_PUBLIC_APP_NAME} : ${otp}. Valable 5 minutes.`,
            })
        }
    } catch (err) {
        console.error("Erreur envoi OTP reset:", err)
        // On supprime l'OTP si l'envoi échoue
        await prisma.verification.deleteMany({
            where: { identifier: `${RESET_PREFIX}${identifier}` },
        })
        return { success: false, error: "Impossible d'envoyer le code. Réessaie." }
    }

    return { success: true }
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTION 2 — Vérifier l'OTP et réinitialiser le mot de passe
// ══════════════════════════════════════════════════════════════════════════════

type ResetPasswordResult =
    | { success: true }
    | { success: false; error: string; expired?: boolean }

export async function resetPasswordAction(
    method: "email" | "phone",
    identifier: string,
    otp: string,
    newPassword: string
): Promise<ResetPasswordResult> {

    // 1. Récupérer l'OTP en base
    const verification = await prisma.verification.findFirst({
        where: { identifier: `${RESET_PREFIX}${identifier}` },
    })

    if (!verification) {
        return { success: false, error: "Code invalide ou expiré.", expired: true }
    }

    // 2. Vérifier expiration
    if (verification.expiresAt < new Date()) {
        await prisma.verification.delete({ where: { id: verification.id } })
        return { success: false, error: "Ce code a expiré. Demande un nouveau code.", expired: true }
    }

    // 3. Vérifier le code
    if (verification.value !== otp) {
        return { success: false, error: "Code incorrect." }
    }

    // 4. Retrouver l'utilisateur
    let user: { id: string } | null = null

    if (method === "email") {
        user = await prisma.user.findUnique({
            where: { email: identifier },
            select: { id: true },
        })
    } else {
        user = await prisma.user.findUnique({
            where: { phoneNumber: identifier },
            select: { id: true },
        })
    }

    if (!user) {
        return { success: false, error: "Compte introuvable." }
    }

    // 5. Hasher le nouveau mot de passe avec better-auth/crypto
    const hashedPassword = await hashPassword(newPassword)

    // 6. Mettre à jour le mot de passe dans User + Account credential
    await prisma.$transaction([
        // Update User.password (fallback)
        prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        }),
        // Update Account credential — c'est ici que Better-Auth lit le mot de passe
        prisma.account.updateMany({
            where: {
                userId: user.id,
                providerId: "credential",
            },
            data: { password: hashedPassword },
        }),
        // Supprimer l'OTP utilisé
        prisma.verification.delete({ where: { id: verification.id } }),
    ])

    // 7. Révoquer toutes les sessions existantes (sécurité)
    await prisma.session.deleteMany({ where: { userId: user.id } })

    return { success: true }
}