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

export async function sendResetPasswordOtpEmail({
  to,
  otp,
}: {
  to: string
  otp: string
}) {
  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject: `Ton code de réinitialisation — ${otp}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:20px;font-weight:700;color:#111;margin-bottom:8px">
          Réinitialisation de mot de passe
        </h2>
        <p style="color:#555;font-size:14px;margin-bottom:24px">
          Tu as demandé à réinitialiser ton mot de passe. Voici ton code :
        </p>

        <div style="background:#f5f5f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
          <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#111">
            ${otp}
          </span>
        </div>

        <p style="color:#888;font-size:13px;margin-bottom:8px">
          ⏱ Ce code expire dans <strong>5 minutes</strong>.
        </p>
        <p style="color:#888;font-size:13px;">
          Si tu n'as pas fait cette demande, ignore cet email.
        </p>
      </div>
    `,
  })
}

