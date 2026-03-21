// src/app/(dashboard)/[orgSlug]/sales/sales-wrapper.tsx
"use client"
import dynamic from "next/dynamic"
import type { ComponentProps } from "react"

const SalesClient = dynamic(() => import("./sales-client"), {
    ssr: false,
    loading: () => (
        <div className="p-8 flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center gap-3 text-zinc-400">
                <div className="h-8 w-8 rounded-full border-2 border-zinc-200 border-t-zinc-600 animate-spin" />
                <p className="text-sm">Chargement…</p>
            </div>
        </div>
    ),
})

type Props = ComponentProps<typeof SalesClient>

export default function SalesWrapper(props: Props) {
    return <SalesClient {...props} />
}