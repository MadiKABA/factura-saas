// src/app/(dashboard)/[orgSlug]/stock/[batchId]/stock-batch-detail-wrapper.tsx
"use client"
import dynamic from "next/dynamic"
import type { ComponentProps } from "react"

const StockBatchDetailClient = dynamic(() => import("./stock-batch-detail-client"), {
    ssr: false,
    loading: () => (
        <div className="p-8 flex items-center justify-center min-h-[400px]">
            <div className="h-8 w-8 rounded-full border-2 border-zinc-200 border-t-zinc-600 animate-spin" />
        </div>
    ),
})

type Props = ComponentProps<typeof StockBatchDetailClient>
export default function StockBatchDetailWrapper(props: Props) {
    return <StockBatchDetailClient {...props} />
}