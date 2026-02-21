// src/hooks/use-auth.ts
"use client"
import { useSession } from "@/lib/auth-client"

export function useAuth() {
    const { data: session, isPending, error } = useSession()

    return {
        user: session?.user ?? null,
        isLoading: isPending,
        isAuthenticated: !!session,
        error,
    }
}