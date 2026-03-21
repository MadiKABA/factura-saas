// src/app/(dashboard)/[orgSlug]/products/categories/_components/emoji-picker.tsx
// Picker emoji groupé par catégorie — pour la sélection d'icône de catégorie produit

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
    {
        label: "Alimentation",
        emojis: ["🥩", "🍗", "🐟", "🦐", "🥚", "🧀", "🥛", "🧈", "🍞", "🥐", "🍚", "🌾", "🌽", "🫘", "🥜", "🌿", "🥦", "🥕", "🧅", "🧄", "🍅", "🫑", "🥬", "🥒", "🍆", "🥑", "🍋", "🍊", "🍌", "🍓", "🍎", "🍇", "🫐", "🍑", "🍒", "🥭", "🍍", "🥝", "🍈"],
    },
    {
        label: "Boissons",
        emojis: ["💧", "🥤", "🧃", "🧋", "☕", "🍵", "🍶", "🥛", "🍺", "🍻", "🥂", "🍷", "🍾", "🧊", "🫗"],
    },
    {
        label: "Snacks & Sucreries",
        emojis: ["🍫", "🍬", "🍭", "🍮", "🍰", "🎂", "🧁", "🍩", "🍪", "🍿", "🥨", "🥐", "🥞", "🧇", "🍦", "🍧", "🍨", "🍡", "🧆"],
    },
    {
        label: "Plats cuisinés",
        emojis: ["🍔", "🍟", "🌭", "🌮", "🌯", "🥙", "🧆", "🥗", "🥘", "🍲", "🥣", "🍱", "🍜", "🍝", "🍛", "🍣", "🍤", "🍙", "🍘", "🥟", "🦪"],
    },
    {
        label: "Hygiène & Beauté",
        emojis: ["🧴", "🧼", "🪥", "🧻", "🪒", "💊", "💉", "🩺", "🩹", "🧪", "🌡️", "💆", "💅", "🪮", "🪞", "🛁", "🚿"],
    },
    {
        label: "Maison & Entretien",
        emojis: ["🏠", "🪣", "🧹", "🧺", "🪟", "🛋️", "🛏️", "🪑", "🚪", "🪤", "🔑", "💡", "🕯️", "🧯", "🪜", "🧰", "🔧", "🪛", "🔩"],
    },
    {
        label: "Vêtements & Mode",
        emojis: ["👕", "👗", "👖", "🧥", "🧤", "🧣", "🧢", "👒", "👔", "👗", "👟", "👠", "👜", "👝", "🎒", "💍", "⌚", "💎"],
    },
    {
        label: "Électronique",
        emojis: ["📱", "💻", "🖥️", "⌨️", "🖱️", "🖨️", "📷", "📸", "📺", "📻", "🎮", "🕹️", "🎧", "🎙️", "📡", "🔋", "🔌", "💾", "📀"],
    },
    {
        label: "Papeterie & Bureau",
        emojis: ["📝", "✏️", "🖊️", "🖋️", "📌", "📎", "🗂️", "📁", "📂", "📋", "📊", "📈", "📉", "📒", "📓", "📔", "📕", "📗", "📘", "📙", "📚", "🗒️", "🗓️", "✂️", "📐", "📏", "🖇️"],
    },
    {
        label: "Sport & Loisirs",
        emojis: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🥊", "🥋", "🎿", "⛷️", "🏊", "🚴", "🤸", "🏋️", "⛳", "🎯", "🎣", "🤿", "🎽", "🏆", "🥇", "🥈", "🥉"],
    },
    {
        label: "Animaux",
        emojis: ["🐕", "🐈", "🐓", "🐄", "🐖", "🐑", "🐐", "🐇", "🐠", "🦜", "🐢", "🐹", "🦎", "🐾", "🦮", "🐕‍🦺"],
    },
    {
        label: "Transport",
        emojis: ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🚚", "🚛", "🚜", "🏍️", "🛵", "🚲", "✈️", "🚂", "⛵", "🛺", "🛻"],
    },
    {
        label: "Services",
        emojis: ["🔨", "⚙️", "🪚", "🔧", "🪛", "🛠️", "🧲", "⛽", "🧱", "🪟", "🚧", "💈", "✂️", "🧵", "🪡", "🧶", "🎨", "🖼️", "📦", "🏪", "🏬", "🏭", "🏥", "🏦", "🏨", "🏫"],
    },
    {
        label: "Divers",
        emojis: ["⭐", "❤️", "💛", "💚", "💙", "💜", "🔥", "✨", "🎁", "🎀", "🎊", "🎉", "🏷️", "💰", "💳", "📣", "🔔", "📢", "⚠️", "✅", "❌", "🔴", "🟡", "🟢", "🔵", "⚫", "⬜"],
    },
]

type Props = {
    value: string
    onChange: (emoji: string) => void
}

export default function EmojiPicker({ value, onChange }: Props) {
    return (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
            <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
                {EMOJI_GROUPS.map(group => (
                    <div key={group.label} className="px-3 pt-3 pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                            {group.label}
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {group.emojis.map(emoji => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => onChange(emoji)}
                                    className={`
                    text-xl h-9 w-9 flex items-center justify-center rounded-lg transition-all
                    hover:bg-zinc-100 active:scale-90
                    ${value === emoji
                                            ? "bg-zinc-900 ring-2 ring-zinc-900 ring-offset-1 scale-110"
                                            : "bg-transparent"
                                        }
                  `}
                                    title={emoji}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}