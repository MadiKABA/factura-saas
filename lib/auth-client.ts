// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react"
import { organizationClient } from "better-auth/client/plugins"
import { phoneNumberClient } from "better-auth/client/plugins"
import { emailOTPClient } from "better-auth/client/plugins"   // ← ajouté
import { env } from "@/lib/env"

export const authClient = createAuthClient({
    baseURL: env.NEXT_PUBLIC_APP_URL,
    plugins: [
        organizationClient(),
        phoneNumberClient(),
        emailOTPClient(),   // ← expose authClient.emailOtp.*
    ],
})

export const {
    signIn,
    signOut,
    signUp,
    useSession,
    useActiveOrganization,
} = authClient