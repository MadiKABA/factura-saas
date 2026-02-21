/**
 * Génère un slug valide depuis un nom d'organisation
 * "Noum Tech SN" → "noum-tech-sn"
 */
export function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // supprime les accents
        .replace(/[^a-z0-9\s-]/g, "")   // garde lettres, chiffres, espaces, tirets
        .trim()
        .replace(/\s+/g, "-")            // espaces → tirets
        .replace(/-+/g, "-")             // tirets multiples → un seul
        .slice(0, 50)
}