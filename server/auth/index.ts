// src/server/auth/index.ts
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { organization } from "better-auth/plugins"
import { phoneNumber } from "better-auth/plugins"
import { nextCookies } from "better-auth/next-js"
import { Resend } from "resend"
import { prisma } from "@/server/db"
import { env } from "@/lib/env"

const resend = new Resend(env.RESEND_API_KEY)

export const auth = betterAuth({
    // ─── Base ────────────────────────────────────────────────
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,

    // ─── Database ────────────────────────────────────────────
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),

    // ─── Email + Mot de passe ────────────────────────────────
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        minPasswordLength: 8,
        maxPasswordLength: 128,

        sendResetPassword: async ({ user, url }) => {
            await resend.emails.send({
                from: `${env.NEXT_PUBLIC_APP_NAME} <noreply@monapp.com>`,
                to: user.email,
                subject: "Réinitialisation de mot de passe",
                html: `
          <p>Bonjour ${user.name ?? ""},</p>
          <p>Clique sur ce lien pour réinitialiser ton mot de passe :</p>
          <a href="${url}">${url}</a>
          <p>Ce lien expire dans 1 heure.</p>
        `,
            })
        },
    },

    // ─── Vérification email ──────────────────────────────────
    emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
            await resend.emails.send({
                from: `${env.NEXT_PUBLIC_APP_NAME} <noreply@monapp.com>`,
                to: user.email,
                subject: "Vérifie ton adresse email",
                html: `
          <p>Bonjour ${user.name ?? ""},</p>
          <p>Clique sur ce lien pour vérifier ton adresse email :</p>
          <a href="${url}">${url}</a>
          <p>Ce lien expire dans 24 heures.</p>
        `,
            })
        },
        sendOnSignUp: true,
        expiresIn: 60 * 60 * 24, // 24h
    },

    // ─── Social Providers ────────────────────────────────────
    socialProviders: {
        google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
    },

    // ─── Session ─────────────────────────────────────────────
    session: {
        expiresIn: 60 * 60 * 24 * 7,   // 7 jours
        updateAge: 60 * 60 * 24,        // rafraîchit si > 1 jour
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60,               // cache cookie 5 min
        },
    },

    // ─── Plugins ─────────────────────────────────────────────
    plugins: [
        // Multi-tenant organisations
        // ... reste du code
        organization({
            allowUserToCreateOrganization: true,
            organizationLimit: 5,
            sendInvitationEmail: async (data) => {
                // En 2026, Better-Auth peut encapsuler l'URL ou vous demander de la construire
                // Si 'url' n'est pas directement dans 'data', on la récupère souvent ainsi :
                const invitationUrl = (data as any).url || `${env.BETTER_AUTH_URL}/accept-invitation/${data.invitation.id}`;

                await resend.emails.send({
                    from: `${env.NEXT_PUBLIC_APP_NAME} <noreply@monapp.com>`,
                    to: data.email,
                    subject: `Invitation à rejoindre ${data.organization.name}`,
                    html: `
                <p>${data.inviter.user.name} t'invite à rejoindre <strong>${data.organization.name}</strong>.</p>
                <a href="${invitationUrl}">Accepter l'invitation</a>
            `,
                })
            },
        }),
        // ...

        // Téléphone + OTP SMS
        phoneNumber({
            sendOTP: async ({ phoneNumber, code }) => {
                // Intègre ton provider SMS ici (Twilio, Orange SMS, etc.)
                console.log(`OTP pour ${phoneNumber}: ${code}`)
                // Exemple avec Twilio :
                // await twilioClient.messages.create({
                //   body: `Ton code de vérification : ${code}`,
                //   from: process.env.TWILIO_PHONE,
                //   to: phoneNumber,
                // })
            },
            otpLength: 6,
            expiresIn: 300, // 5 minutes
        }),
        // ⚠️ nextCookies DOIT être le DERNIER plugin
        nextCookies(),
    ],
})

// Type exporté pour usage côté client
export type Auth = typeof auth