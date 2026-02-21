// src/server/auth/index.ts
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { organization } from "better-auth/plugins"
import { phoneNumber } from "better-auth/plugins"
import { emailOTP } from "better-auth/plugins"       // ← ajouté pour reset par email OTP
import { nextCookies } from "better-auth/next-js"
import { prisma } from "@/server/db"
import { env } from "@/lib/env"
import { sendResetPasswordOtpEmail } from "@/lib/email/resend"
import { sendSms } from "@/lib/sms"

export const auth = betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,

    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),

    rateLimit: {
        enabled: true,
        window: 60,
        max: 20,
        customRules: {
            "/phone-number/send-otp": { window: 300, max: 1 },
            "/sign-in/email": { window: 60, max: 5 },
            "/email-otp/request-password-reset": { window: 300, max: 3 },
            "/phone-number/request-password-reset": { window: 300, max: 1 },
        },
    },

    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        // Reset par lien désactivé — on utilise OTP à la place
        sendResetPassword: async () => { },
    },

    socialProviders: {
        google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            scopes: ["openid", "email", "profile"],
        },
    },

    session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
        cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    plugins: [
        organization({
            allowUserToCreateOrganization: true,
            organizationLimit: 5,
        }),

        // ── Plugin OTP email ──────────────────────────────────────────────────────
        // Gère : reset password par email via code OTP à 6 chiffres
        emailOTP({
            async sendVerificationOTP({ email, otp, type }) {
                if (type === "forget-password") {
                    await sendResetPasswordOtpEmail({ to: email, otp })
                }
                // sign-in et email-verification gérés ailleurs si besoin
            },
            otpLength: 6,
            expiresIn: 300, // 5 minutes
        }),

        // ── Plugin téléphone ──────────────────────────────────────────────────────
        // Gère : login OTP + reset password par SMS
        phoneNumber({
            otpLength: 6,
            expiresIn: 300,
            allowedAttempts: 3,

            sendOTP: async ({ phoneNumber, code }) => {
                await sendSms({
                    to: phoneNumber,
                    body: `Ton code ${env.NEXT_PUBLIC_APP_NAME} : ${code}. Valable 5 minutes.`,
                })
            },

            signUpOnVerification: {
                getTempEmail: (phone) => {
                    const digits = phone.replace(/\D/g, "")
                    return `phone-${digits}@temp.${env.NEXT_PUBLIC_APP_URL.replace(/https?:\/\//, "")}`
                },
                getTempName: (phone) => phone,
            },
        }),

        // ⚠️ Toujours en dernier
        nextCookies(),
    ],
})

export type Auth = typeof auth