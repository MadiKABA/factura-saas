// src/app/(dashboard)/[orgSlug]/pos/layout.tsx
// Layout dédié au POS — supprime le padding et overflow du parent
// Le composant POSClient gère lui-même son layout fixed plein écran

export default function POSLayout({ children }: { children: React.ReactNode }) {
    return (
        // Neutralise les classes du wrapper parent (overflow-y-auto, padding, etc.)
        // Le POS est rendu en position:fixed par le client — ce wrapper est transparent
        <div className="h-full w-full p-0 m-0 overflow-hidden">
            {children}
        </div>
    )
}