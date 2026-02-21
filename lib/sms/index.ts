// src/lib/sms/index.ts
import { env } from "@/lib/env"

interface SendSmsParams {
    to: string
    body: string
}

// ─── Dev : log dans la console ────────────────────────────────────────────────
async function sendSmsDev({ to, body }: SendSmsParams): Promise<void> {
    console.log("\n📱 [SMS DEV] ─────────────────────────────")
    console.log(`   À       : ${to}`)
    console.log(`   Message : ${body}`)
    console.log("──────────────────────────────────────────\n")
}

// ─── Prod : Twilio REST API ───────────────────────────────────────────────────
async function sendSmsTwilio({ to, body }: SendSmsParams): Promise<void> {
    const accountSid = env.TWILIO_ACCOUNT_SID
    const authToken = env.TWILIO_AUTH_TOKEN
    const from = env.TWILIO_PHONE_NUMBER

    // Guard : variables obligatoires en prod
    if (!accountSid || !authToken || !from) {
        throw new Error(
            "Variables Twilio manquantes (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)"
        )
    }

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64")

    // ✅ from est garanti string ici — URLSearchParams accepte Record<string, string>
    const params = new URLSearchParams({
        To: to,
        From: from,
        Body: body,
    })

    const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        }
    )

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(
            `Twilio error ${response.status}: ${(error as { message?: string }).message ?? response.statusText}`
        )
    }
}

// ─── Export principal ─────────────────────────────────────────────────────────
export async function sendSms({ to, body }: SendSmsParams): Promise<void> {
    const isDev = process.env.NODE_ENV === "development"
    const twilioConfigured =
        !!process.env.TWILIO_ACCOUNT_SID &&
        !!process.env.TWILIO_AUTH_TOKEN &&
        !!process.env.TWILIO_PHONE_NUMBER

    if (isDev && !twilioConfigured) {
        return sendSmsDev({ to, body })
    }

    return sendSmsTwilio({ to, body })
}