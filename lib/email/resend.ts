import { Resend } from "resend"
import { env } from "@/lib/env"

export const resend = new Resend(env.RESEND_API_KEY)

export const FROM = `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`

// ─── Templates email ──────────────────────────────────────────────────────────

export async function sendVerificationEmail({
    to,
    name,
    url,
}: {
    to: string
    name: string | null
    url: string
}) {
    return resend.emails.send({
        from: FROM,
        to,
        subject: "Confirme ton adresse email",
        html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2>Bienvenue${name ? ` ${name}` : ""} 👋</h2>
        <p>Clique sur le bouton ci-dessous pour confirmer ton adresse email.</p>
        <a href="${url}" style="
          display: inline-block;
          background: #000;
          color: #fff;
          padding: 12px 24px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          margin: 16px 0;
        ">Confirmer mon email</a>
        <p style="color: #888; font-size: 13px;">
          Ce lien expire dans 24h. Si tu n'as pas créé de compte, ignore cet email.
        </p>
      </div>
    `,
    })
}

export async function sendResetPasswordEmail({
    to,
    name,
    url,
}: {
    to: string
    name: string | null
    url: string
}) {
    return resend.emails.send({
        from: FROM,
        to,
        subject: "Réinitialisation de ton mot de passe",
        html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2>Réinitialisation du mot de passe</h2>
        <p>Bonjour${name ? ` ${name}` : ""},</p>
        <p>Tu as demandé à réinitialiser ton mot de passe. Clique ci-dessous :</p>
        <a href="${url}" style="
          display: inline-block;
          background: #000;
          color: #fff;
          padding: 12px 24px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          margin: 16px 0;
        ">Réinitialiser mon mot de passe</a>
        <p style="color: #888; font-size: 13px;">
          Ce lien expire dans 1h. Si tu n'es pas à l'origine de cette demande, ignore cet email.
        </p>
      </div>
    `,
    })
}

export async function sendOrgInvitationEmail({
    to,
    inviterName,
    orgName,
    url,
}: {
    to: string
    inviterName: string
    orgName: string
    url: string
}) {
    return resend.emails.send({
        from: FROM,
        to,
        subject: `Invitation à rejoindre ${orgName}`,
        html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2>Tu as été invité(e) 🎉</h2>
        <p><strong>${inviterName}</strong> t'invite à rejoindre <strong>${orgName}</strong>.</p>
        <a href="${url}" style="
          display: inline-block;
          background: #000;
          color: #fff;
          padding: 12px 24px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          margin: 16px 0;
        ">Accepter l'invitation</a>
        <p style="color: #888; font-size: 13px;">
          Ce lien expire dans 48h.
        </p>
      </div>
    `,
    })
}