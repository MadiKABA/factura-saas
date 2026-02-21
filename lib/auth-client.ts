// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react"
import { organizationClient } from "better-auth/client/plugins"
import { phoneNumberClient } from "better-auth/client/plugins"
import { twoFactorClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_APP_URL!,
    plugins: [
        organizationClient(),
        phoneNumberClient(),
        twoFactorClient(),
    ],
})

// Exports nommés pour usage direct dans les composants
export const {
    signIn,
    signOut,
    signUp,
    useSession,
    useActiveOrganization,
} = authClient