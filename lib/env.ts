// src/lib/env.ts
import { z } from "zod"

const envSchema = z.object({
    DATABASE_URL: z.string().url(),

    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),

    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    RESEND_API_KEY: z.string().startsWith("re_"),

    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_APP_NAME: z.string().min(1),

    NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error("❌ Variables d'environnement invalides :")
    console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2))
    process.exit(1)
}

export const env = parsed.data