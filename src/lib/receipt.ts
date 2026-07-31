import { formatCurrency } from './utils';
import { formatPhone } from './phone';
import type { Customer, Transaction } from '../types';

/**
 * Receipts. The POS button said "PROCESS & PRINT" but nothing was ever printed
 * or sent — the customer left with no record of what they paid.
 *
 * Two formats: plain text for WhatsApp (the channel that actually reaches
 * people here) and a narrow HTML page sized for an 80mm thermal roll.
 */

const LINE = '--------------------------------';

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PAYMENT_LABEL: Record<string, string> = {
  cash_usd: 'Cash (USD)',
  ecocash: 'EcoCash',
  card: 'Card'
};

export function receiptText(txn: Transaction, customer?: Customer | null): string {
  const lines: string[] = [];

  lines.push('*MALI WASH* — Ruwa');
  lines.push(formatDate(txn.createdAt));
  lines.push(`Receipt: ${txn.id.slice(0, 8).toUpperCase()}`);
  if (txn.status === 'voided') lines.push('*** VOIDED ***');
  lines.push(LINE);

  for (const item of txn.lineItems) {
    const qty = item.qty > 1 ? ` x${item.qty}` : '';
    lines.push(`${item.description}${qty}`);
    lines.push(`   ${formatCurrency(item.total)}`);
  }

  lines.push(LINE);
  lines.push(`*TOTAL: ${formatCurrency(txn.amount)}*`);
  lines.push(`Paid by: ${PAYMENT_LABEL[txn.paymentMethod] ?? txn.paymentMethod}`);

  if (customer) {
    lines.push(LINE);
    if (txn.pointsEarned > 0) lines.push(`AutoPoints earned: +${txn.pointsEarned}`);
    if (txn.pointsRedeemed > 0) lines.push(`AutoPoints redeemed: -${txn.pointsRedeemed}`);
    lines.push(`Balance: ${customer.pointsBalance} pts`);
    lines.push('');
    lines.push(`Your referral code: *${customer.referralCode}*`);
    lines.push('Share it — you earn points when a friend gets their first wash.');
  }

  lines.push(LINE);
  lines.push('Thank you for choosing Mali Wash!');

  return lines.join('\n');
}

/**
 * Open a print dialog with a receipt sized for an 80mm thermal roll. Written
 * into a hidden iframe rather than window.open so a popup blocker cannot
 * silently swallow it.
 */
export function printReceipt(txn: Transaction, customer?: Customer | null): void {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rows = txn.lineItems.map(item => `
    <tr>
      <td>${esc(item.description)}${item.qty > 1 ? ` &times;${item.qty}` : ''}</td>
      <td class="r">${esc(formatCurrency(item.total))}</td>
    </tr>`).join('');

  const loyalty = customer ? `
    <div class="sec">
      ${txn.pointsEarned > 0 ? `<div class="row"><span>AutoPoints earned</span><span>+${txn.pointsEarned}</span></div>` : ''}
      ${txn.pointsRedeemed > 0 ? `<div class="row"><span>AutoPoints redeemed</span><span>-${txn.pointsRedeemed}</span></div>` : ''}
      <div class="row"><span>Balance</span><span>${customer.pointsBalance} pts</span></div>
      <div class="code">Referral code: <b>${esc(customer.referralCode)}</b></div>
    </div>` : '';

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Receipt ${esc(txn.id.slice(0, 8))}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: ui-monospace, "Courier New", monospace; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 2px; letter-spacing: 1px; }
  .sub { text-align: center; font-size: 11px; margin-bottom: 8px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; padding-left: 8px; }
  .total { display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; font-size: 11px; }
  .sec { margin-top: 6px; }
  .code { margin-top: 6px; text-align: center; border: 1px dashed #000; padding: 4px; }
  .foot { text-align: center; margin-top: 10px; font-size: 11px; }
  .void { text-align: center; font-weight: bold; border: 2px solid #000; padding: 4px; margin: 6px 0; }
</style></head>
<body>
  <h1>MALI WASH</h1>
  <div class="sub">Ruwa, Zimbabwe<br>${formatDate(txn.createdAt)}<br>Receipt ${esc(txn.id.slice(0, 8).toUpperCase())}</div>
  ${txn.status === 'voided' ? '<div class="void">*** VOIDED ***</div>' : ''}
  <hr>
  <table>${rows}</table>
  <hr>
  <div class="total"><span>TOTAL</span><span>${esc(formatCurrency(txn.amount))}</span></div>
  <div class="row"><span>Paid by</span><span>${esc(PAYMENT_LABEL[txn.paymentMethod] ?? txn.paymentMethod)}</span></div>
  ${customer ? `<div class="row"><span>Customer</span><span>${esc(customer.name)}</span></div>
  <div class="row"><span>Phone</span><span>${esc(formatPhone(customer.phone))}</span></div>` : ''}
  ${loyalty}
  <div class="foot">Thank you for choosing Mali Wash!</div>
</body></html>`;

  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    document.body.removeChild(frame);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Leave time for the print dialog to take its snapshot before teardown.
    window.setTimeout(() => {
      if (frame.parentNode) document.body.removeChild(frame);
    }, 1000);
  };
}
