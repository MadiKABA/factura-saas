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
  const appName = "Factura";
  const accentColor = "#000000"; // Noir pur pour un look moderne

  await resend.emails.send({
    from: `${appName} <${env.RESEND_FROM_EMAIL}>`,
    to,
    subject: `${otp} est votre code de vérification Factura`,
    html: `
      <div style="background-color:#f8fafc;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:440px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);border:1px solid #e2e8f0;">
          
          <div style="padding:32px 32px 0 32px;">
             <div style="font-size:22px; font-weight:800; color:${accentColor}; letter-spacing:-0.025em; display:flex; items-center:center;">
               <span style="background:${accentColor}; color:#fff; padding:2px 8px; border-radius:6px; margin-right:8px;">F</span>
               ${appName}
             </div>
          </div>

          <div style="padding:32px;">
            <h2 style="font-size:18px;font-weight:600;color:#0f172a;margin:0 0 10px 0;">
              Réinitialisation de mot de passe
            </h2>
            <p style="color:#64748b;font-size:14px;line-height:22px;margin:0 0 24px 0;">
              Vous avez demandé un code pour modifier votre mot de passe. Utilisez le code sécurisé ci-dessous :
            </p>

            <div style="background-color:#f1f5f9;border-radius:8px;padding:24px;text-align:center;border:1px dotted #cbd5e1;">
              <div style="font-family:'SF Mono',Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:12px;color:#0f172a;margin:0; padding-left:12px;">
                ${otp}
              </div>
            </div>

            <p style="margin-top:20px; color:#94a3b8;font-size:12px;text-align:center;">
              Ce code est valable pendant <strong>5 minutes</strong>.
            </p>

            <div style="margin-top:32px;padding-top:20px;border-top:1px solid #f1f5f9;">
              <p style="color:#94a3b8;font-size:12px;line-height:16px;margin:0;">
                Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email. Pour votre sécurité, ne partagez jamais ce code.
              </p>
            </div>
          </div>
        </div>
        
        <div style="text-align:center;margin-top:20px;">
          <p style="color:#94a3b8;font-size:11px;margin:0;text-transform:uppercase;letter-spacing:1px;">
            &copy; ${new Date().getFullYear()} Factura Inc.
          </p>
        </div>
      </div>
    `,
  })
}

