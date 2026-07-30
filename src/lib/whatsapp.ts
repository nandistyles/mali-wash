// Stub for WhatsApp API Integration
// In a real implementation, this would make backend requests to keep secrets safe,
// or use a secure proxy. For this client-only demo (since backend is out of scope 
// unless we build an express server), we stub the calls.

export async function sendWhatsAppMessage(phone: string, message: string) {
  const token = import.meta.env.VITE_WHATSAPP_API_TOKEN;
  const phoneId = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    console.log(`[WhatsApp Stub] Would send to ${phone}: ${message}`);
    console.log('Configure VITE_WHATSAPP_API_TOKEN and VITE_WHATSAPP_PHONE_NUMBER_ID in .env to enable real sending.');
    return;
  }

  // Example implementation of actual Cloud API call (needs proxy usually to avoid CORS):
  /*
  const url = `https://graph.facebook.com/v17.0/\${phoneId}/messages`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer \${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone, // must be formatted correctly for WhatsApp
        type: "text",
        text: { body: message }
      })
    });
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error);
  }
  */
}

export async function sendBookingConfirmation(phone: string, name: string, time: string, service: string) {
  const msg = `Hi \${name}, your booking for a \${service} at \${time} is confirmed! See you at Mali Wash.`;
  await sendWhatsAppMessage(phone, msg);
}

export async function sendReferralCode(phone: string, name: string, code: string) {
  const msg = `Hi \${name}! Share your Mali Wash referral code \${code} with friends. When they get their first wash, you earn bonus points!`;
  await sendWhatsAppMessage(phone, msg);
}
