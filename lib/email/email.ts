// src/lib/email.ts
// ─── Service email — notifications abonnement ────────────────────────────────
// Compatible Resend (recommandé) ou Nodemailer SMTP

type EmailPayload = {
    to: string
    subject: string
    html: string
}

// ─── Envoi via Resend (recommandé — 3000 emails/mois gratuits) ───────────────
async function sendViaResend(payload: EmailPayload): Promise<boolean> {
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: process.env.EMAIL_FROM ?? "Factura <noreply@factura.sn>",
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
        }),
    })
    if (!res.ok) {
        const err = await res.text()
        console.error("[Email] Resend error:", err)
        return false
    }
    return true
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
    try {
        return await sendViaResend(payload)
    } catch (err) {
        console.error("[Email] sendEmail failed:", err)
        return false
    }
}

// ─── Templates ────────────────────────────────────────────────────────────────
const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  max-width: 560px; margin: 0 auto; padding: 0;
`
const btnStyle = `
  display: inline-block; background: #18181b; color: #fff;
  text-decoration: none; padding: 12px 24px;
  border-radius: 12px; font-weight: 700; font-size: 14px; margin-top: 16px;
`

export function buildExpiryWarningEmail(params: {
    orgName: string
    planName: string
    expiryDate: string // "15 janvier 2025"
    renewUrl: string
    contactEmail?: string
}): EmailPayload {
    const { orgName, planName, expiryDate, renewUrl } = params
    return {
        to: params.contactEmail ?? "",
        subject: `⚠️ Votre abonnement ${planName} expire le ${expiryDate}`,
        html: `
<div style="${baseStyle}">
  <div style="background:#18181b;padding:24px 32px;border-radius:16px 16px 0 0;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;text-transform:uppercase;letter-spacing:2px;">Factura</p>
    <h1 style="color:#fff;font-size:22px;font-weight:900;margin:8px 0 0;">Votre abonnement expire bientôt</h1>
  </div>
  <div style="background:#f4f4f5;padding:28px 32px;">
    <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Bonjour,<br><br>
      L'abonnement <strong>${planName}</strong> de <strong>${orgName}</strong> arrive à expiration le
      <strong style="color:#dc2626;">${expiryDate}</strong>.
    </p>
    <div style="background:#fff;border:2px solid #e4e4e7;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#71717a;">Organisation</p>
      <p style="margin:4px 0 12px;font-size:16px;font-weight:700;color:#18181b;">${orgName}</p>
      <p style="margin:0;font-size:13px;color:#71717a;">Plan actuel</p>
      <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#18181b;">${planName}</p>
    </div>
    <p style="color:#3f3f46;font-size:14px;line-height:1.6;margin:0 0 4px;">
      Sans renouvellement, votre organisation passera en <strong>mode lecture seule</strong>
      7 jours après l'expiration. Vos données seront conservées.
    </p>
    <a href="${renewUrl}" style="${btnStyle}">Renouveler mon abonnement →</a>
    <p style="color:#a1a1aa;font-size:12px;margin-top:24px;line-height:1.5;">
      Vous recevez cet email car vous êtes administrateur de ${orgName} sur Factura.<br>
      Des questions ? Répondez directement à cet email.
    </p>
  </div>
  <div style="background:#e4e4e7;padding:16px 32px;border-radius:0 0 16px 16px;text-align:center;">
    <p style="color:#a1a1aa;font-size:11px;margin:0;">© Factura · Dakar, Sénégal</p>
  </div>
</div>`,
    }
}

export function buildSuspendedEmail(params: {
    orgName: string
    planName: string
    renewUrl: string
    contactEmail?: string
}): EmailPayload {
    const { orgName, planName, renewUrl } = params
    return {
        to: params.contactEmail ?? "",
        subject: `🔒 Accès suspendu — ${orgName} est en mode lecture seule`,
        html: `
<div style="${baseStyle}">
  <div style="background:#7f1d1d;padding:24px 32px;border-radius:16px 16px 0 0;">
    <p style="color:#fca5a5;font-size:12px;margin:0;text-transform:uppercase;letter-spacing:2px;">Factura</p>
    <h1 style="color:#fff;font-size:22px;font-weight:900;margin:8px 0 0;">Votre organisation est suspendue</h1>
  </div>
  <div style="background:#f4f4f5;padding:28px 32px;">
    <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 16px;">
      L'abonnement <strong>${planName}</strong> de <strong>${orgName}</strong> a expiré.
      Votre organisation est maintenant en <strong style="color:#dc2626;">mode lecture seule</strong>.
    </p>
    <div style="background:#fef2f2;border:2px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;color:#991b1b;font-weight:600;">Ce que vous ne pouvez plus faire :</p>
      <ul style="margin:8px 0 0;padding-left:20px;color:#7f1d1d;font-size:13px;line-height:2;">
        <li>Créer de nouvelles ventes</li>
        <li>Ajouter des produits</li>
        <li>Émettre des factures</li>
        <li>Gérer le stock</li>
      </ul>
    </div>
    <p style="color:#3f3f46;font-size:14px;margin:0 0 4px;">
      Vos données sont <strong>intactes</strong> et accessibles en lecture. Renouvelez pour reprendre toutes les fonctionnalités.
    </p>
    <a href="${renewUrl}" style="${btnStyle}background:#dc2626;">Réactiver mon abonnement →</a>
    <p style="color:#a1a1aa;font-size:12px;margin-top:24px;line-height:1.5;">
      Sans renouvellement sous 30 jours, votre compte sera archivé. Contactez-nous si vous avez besoin d'aide.
    </p>
  </div>
  <div style="background:#e4e4e7;padding:16px 32px;border-radius:0 0 16px 16px;text-align:center;">
    <p style="color:#a1a1aa;font-size:11px;margin:0;">© Factura · Dakar, Sénégal</p>
  </div>
</div>`,
    }
}