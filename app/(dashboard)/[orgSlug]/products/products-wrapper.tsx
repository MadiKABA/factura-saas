// src/app/(dashboard)/[orgSlug]/products/products-wrapper.tsx
"use client"
import dynamic from "next/dynamic"
import type { ComponentProps } from "react"

// Charger ProductsClient uniquement côté client
// → évite le mismatch d'IDs Radix UI entre SSR et hydration
const ProductsClient = dynamic(() => import("./products-client"), {
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

type ProductsClientProps = ComponentProps<typeof ProductsClient>

export default function ProductsWrapper(props: ProductsClientProps) {
    return <ProductsClient {...props} />
}