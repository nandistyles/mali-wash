import { normalisePhone } from './phone';

/**
 * WhatsApp service (platform spec 4.3). One module, every business behind it.
 *
 * Two delivery paths, deliberately:
 *
 *   deep link  — opens WhatsApp on the attendant's device with the message
 *                prefilled and the recipient set. No backend, no credentials,
 *                no CORS, no per-message cost, and it works from a phone with
 *                no data plan beyond WhatsApp itself. The attendant taps send.
 *
 *   cloud API  — automatic, unattended sending. Needs a server-side proxy: the
 *                Cloud API rejects browser origins, and shipping the token to
 *                the client would publish it in the bundle.
 *
 * The previous version had only a stub of the second path, so nothing was ever
 * sent by any route. The deep link is what makes WhatsApp actually usable on
 * day one; the Cloud API becomes worthwhile at the volume where tapping send
 * stops being reasonable.
 */

const CLOUD_API_PROXY = import.meta.env.VITE_WHATSAPP_PROXY_URL;

// Secrets never belong in a Vite variable: every VITE_* value is readable in
// the browser bundle. The proxy owns the Cloud API token and phone-number id.
export const isCloudApiConfigured = Boolean(CLOUD_API_PROXY);

/**
 * Build a wa.me link. Returns null for an unusable number rather than opening
 * WhatsApp on a broken thread.
 */
export function buildWhatsAppLink(phone: string, message: string): string | null {
  const normalised = normalisePhone(phone);
  if (!normalised) return null;
  // wa.me wants digits only, no leading +.
  return `https://wa.me/${normalised.slice(1)}?text=${encodeURIComponent(message)}`;
}

/**
 * Open WhatsApp with the message prefilled. Returns false when the number is
 * unusable so the caller can tell the attendant instead of failing silently.
 */
export function openWhatsApp(phone: string, message: string): boolean {
  const link = buildWhatsAppLink(phone, message);
  if (!link) return false;
  window.open(link, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * Send without user interaction, via a server-side proxy. Degrades to logging
 * the intent when unconfigured — never throws, so a messaging outage can never
 * take down the till.
 */
export async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  const normalised = normalisePhone(phone);
  if (!normalised) {
    console.warn(`[WhatsApp] Not a valid Zimbabwean number, skipping: ${phone}`);
    return false;
  }

  if (!isCloudApiConfigured) {
    console.log(`[WhatsApp] Would send to ${normalised}: ${message}`);
    return false;
  }

  try {
    const res = await fetch(CLOUD_API_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalised.slice(1),
        type: 'text',
        text: { body: message }
      })
    });
    if (!res.ok) {
      console.error(`[WhatsApp] Proxy responded ${res.status}`);
      return false;
    }
    return true;
  } catch (error) {
    // Offline is the normal case here, not an exception worth surfacing.
    console.warn('[WhatsApp] Send failed, continuing:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

export function bookingConfirmationText(name: string, time: string, service: string): string {
  return `Hi ${name}, your booking for a ${service} at ${time} is confirmed! See you at Mali Wash.`;
}

export function referralShareText(name: string, code: string, rewardPoints: number): string {
  return [
    `Hi ${name}! Here's my Mali Wash referral code: ${code}`,
    ``,
    `Give it when you get your first wash and I earn ${rewardPoints} AutoPoints.`,
    `AutoPoints work across everything Mali — wash, parts, tracking.`
  ].join('\n');
}

export async function sendBookingConfirmation(phone: string, name: string, time: string, service: string) {
  await sendWhatsAppMessage(phone, bookingConfirmationText(name, time, service));
}

export async function sendReferralCode(phone: string, name: string, code: string, rewardPoints: number) {
  await sendWhatsAppMessage(phone, referralShareText(name, code, rewardPoints));
}
