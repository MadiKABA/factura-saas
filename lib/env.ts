import { z } from "zod"

const server = z.object({
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),

    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    RESEND_API_KEY: z.string().startsWith("re_"),
    RESEND_FROM_EMAIL: z.string().email(),
    RESEND_FROM_NAME: z.string().min(1),

    TWILIO_ACCOUNT_SID: z.string().startsWith("AC").optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),

    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
})

const client = z.object({
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_APP_NAME: z.string().min(1),
})

// Validation côté serveur ou client
const isServer = typeof window === "undefined"

const mergedSchema = isServer ? server.merge(client) : client
const processEnv = isServer
    ? process.env
    : {
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    }

const parsed = mergedSchema.safeParse(processEnv)

if (!parsed.success) {
    console.error("❌ Variables d'environnement invalides :")
    console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2))
    // On ne crash pas le navigateur, seulement le serveur au démarrage
    if (isServer) process.exit(1)
}

export const env = (isServer ? parsed.data : processEnv) as z.infer<typeof server> & z.infer<typeof client>