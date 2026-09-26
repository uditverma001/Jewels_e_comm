import { publicEnv } from '@/env';
import { formatMinor } from '@/server/money';
import type { EmailMessage } from './types';

/**
 * Transactional templates.
 *
 * Deliberately plain HTML with inline styles: email clients ignore stylesheets,
 * and a build step for emails is not worth its maintenance cost at this volume.
 * Every value interpolated here is escaped, because order data contains
 * customer-supplied names.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#faf8f5;font-family:Georgia,'Times New Roman',serif;color:#2a2622">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ece6dd">
        <tr><td style="padding:32px 32px 8px;text-align:center;letter-spacing:.32em;font-size:13px;text-transform:uppercase;color:#8a7a63">
          ${escapeHtml(publicEnv.storeName)}
        </td></tr>
        <tr><td style="padding:8px 32px 0"><h1 style="margin:0;font-size:24px;font-weight:400">${escapeHtml(heading)}</h1></td></tr>
        <tr><td style="padding:16px 32px 32px;font-size:15px;line-height:1.6;font-family:Helvetica,Arial,sans-serif">${bodyHtml}</td></tr>
      </table>
      <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#9a9086;font-family:Helvetica,Arial,sans-serif">
        You are receiving this because an account or order exists at ${escapeHtml(publicEnv.appUrl)}.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#2a2622;color:#ffffff;padding:13px 28px;text-decoration:none;font-size:13px;letter-spacing:.14em;text-transform:uppercase">${escapeHtml(label)}</a></p>`;
}

export function verificationEmail(params: {
  to: string;
  firstName: string;
  verifyUrl: string;
}): EmailMessage {
  const body = `
    <p>Hello ${escapeHtml(params.firstName)},</p>
    <p>Confirm your email address to finish setting up your ${escapeHtml(publicEnv.storeName)} account.</p>
    ${button(params.verifyUrl, 'Verify email')}
    <p style="color:#6d655c;font-size:13px">This link expires in 24 hours. If you did not create an account, you can ignore this message.</p>`;

  return {
    to: params.to,
    subject: `Verify your ${publicEnv.storeName} account`,
    html: layout('Verify your email', body),
    text: `Hello ${params.firstName},\n\nConfirm your email address to finish setting up your account:\n${params.verifyUrl}\n\nThis link expires in 24 hours.`,
  };
}

export function passwordResetEmail(params: {
  to: string;
  firstName: string;
  resetUrl: string;
}): EmailMessage {
  const body = `
    <p>Hello ${escapeHtml(params.firstName)},</p>
    <p>We received a request to reset your password. This link can be used once.</p>
    ${button(params.resetUrl, 'Reset password')}
    <p style="color:#6d655c;font-size:13px">This link expires in 1 hour. If you did not request a reset, no action is needed — your password has not changed.</p>`;

  return {
    to: params.to,
    subject: `Reset your ${publicEnv.storeName} password`,
    html: layout('Reset your password', body),
    text: `Hello ${params.firstName},\n\nReset your password using this one-time link:\n${params.resetUrl}\n\nThis link expires in 1 hour. If you did not request it, no action is needed.`,
  };
}

export interface OrderEmailLine {
  name: string;
  variantLabel: string;
  quantity: number;
  lineTotalMinor: number;
  /**
   * What is being cut into this piece.
   *
   * In the email because it is the customer's durable record of a decision
   * they cannot take back — an engraved piece is non-returnable, so "what did
   * I actually ask for?" needs an answer that does not depend on them still
   * being signed in.
   */
  engravingText?: string | null;
}

export function orderConfirmationEmail(params: {
  to: string;
  firstName: string;
  orderNumber: string;
  orderUrl: string;
  lines: OrderEmailLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  giftWrap?: boolean;
  giftMessage?: string | null;
}): EmailMessage {
  const rows = params.lines
    .map(
      (line) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0ebe4">
          ${escapeHtml(line.name)}<br>
          <span style="color:#8a7a63;font-size:13px">${escapeHtml(line.variantLabel)} · Qty ${line.quantity}</span>${
            line.engravingText
              ? `<br><span style="color:#6d655c;font-size:13px">Engraved: <em>${escapeHtml(line.engravingText)}</em></span>`
              : ''
          }
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #f0ebe4;text-align:right;white-space:nowrap">${formatMinor(line.lineTotalMinor)}</td>
      </tr>`,
    )
    .join('');

  const hasEngraving = params.lines.some((line) => line.engravingText);

  /*
   * The dispatch expectation. `content/pages.ts` tells customers that
   * "the product page says so before you buy, and your confirmation email
   * repeats the expected date" — this is the half of that promise the email
   * owes. Stated as a window rather than a date because dispatch is what we
   * control; the courier's leg is quoted on the product page against a PIN
   * code.
   */
  const dispatchNote = hasEngraving
    ? '<p style="color:#6d655c;font-size:13px">One or more pieces are being engraved by hand, so this order dispatches in <strong>7–10 working days</strong> rather than the usual two. Engraved pieces cannot be returned.</p>'
    : '<p style="color:#6d655c;font-size:13px">We dispatch within two working days, insured and signature-on-delivery.</p>';

  const giftNote = params.giftWrap
    ? `<p style="color:#6d655c;font-size:13px">Wrapped as a gift — no prices are included in the parcel.${
        params.giftMessage
          ? ` Your card reads: <em>${escapeHtml(params.giftMessage)}</em>`
          : ' No card message was added.'
      }</p>`
    : '';

  const totalsRow = (label: string, amount: number, strong = false) =>
    `<tr>
      <td style="padding:4px 0;${strong ? 'font-weight:700;padding-top:12px' : 'color:#6d655c'}">${escapeHtml(label)}</td>
      <td style="padding:4px 0;text-align:right;${strong ? 'font-weight:700;padding-top:12px' : ''}">${formatMinor(amount)}</td>
    </tr>`;

  const body = `
    <p>Hello ${escapeHtml(params.firstName)},</p>
    <p>Thank you for your order. We have received your payment and are preparing your pieces.</p>
    <p style="font-size:13px;color:#6d655c;letter-spacing:.1em;text-transform:uppercase">Order ${escapeHtml(params.orderNumber)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">${rows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${totalsRow('Subtotal', params.subtotalMinor)}
      ${params.discountMinor > 0 ? totalsRow('Discount', -params.discountMinor) : ''}
      ${totalsRow('GST', params.taxMinor)}
      ${totalsRow('Shipping', params.shippingMinor)}
      ${totalsRow('Total', params.totalMinor, true)}
    </table>
    ${giftNote}
    ${dispatchNote}
    ${button(params.orderUrl, 'View your order')}`;

  const textLines = params.lines
    .map((l) => `  ${l.name} (${l.variantLabel}) x${l.quantity} — ${formatMinor(l.lineTotalMinor)}`)
    .join('\n');

  return {
    to: params.to,
    subject: `Order ${params.orderNumber} confirmed`,
    html: layout('Your order is confirmed', body),
    text: `Hello ${params.firstName},\n\nThank you for your order ${params.orderNumber}.\n\n${textLines}\n\nSubtotal: ${formatMinor(params.subtotalMinor)}\nDiscount: -${formatMinor(params.discountMinor)}\nGST: ${formatMinor(params.taxMinor)}\nShipping: ${formatMinor(params.shippingMinor)}\nTotal: ${formatMinor(params.totalMinor)}\n\nView your order: ${params.orderUrl}`,
  };
}

export function orderStatusEmail(params: {
  to: string;
  firstName: string;
  orderNumber: string;
  orderUrl: string;
  headline: string;
  message: string;
  trackingUrl?: string | null;
}): EmailMessage {
  const body = `
    <p>Hello ${escapeHtml(params.firstName)},</p>
    <p>${escapeHtml(params.message)}</p>
    <p style="font-size:13px;color:#6d655c;letter-spacing:.1em;text-transform:uppercase">Order ${escapeHtml(params.orderNumber)}</p>
    ${button(params.trackingUrl || params.orderUrl, params.trackingUrl ? 'Track your parcel' : 'View your order')}`;

  return {
    to: params.to,
    subject: `${params.headline} — order ${params.orderNumber}`,
    html: layout(params.headline, body),
    text: `Hello ${params.firstName},\n\n${params.message}\n\nOrder ${params.orderNumber}: ${params.trackingUrl || params.orderUrl}`,
  };
}

export function backInStockEmail(params: {
  to: string;
  productName: string;
  variantLabel: string;
  productUrl: string;
}): EmailMessage {
  const piece = `${params.productName}${
    params.variantLabel && params.variantLabel !== 'Default' ? ` — ${params.variantLabel}` : ''
  }`;

  const body = `
    <p>Good news.</p>
    <p><strong>${escapeHtml(piece)}</strong> is available again.</p>
    ${button(params.productUrl, 'View the piece')}
    <p style="color:#6d655c;font-size:13px">We hold nothing in reserve, so it is first come, first served. You asked to hear about this one piece — this is the only email you will get about it.</p>`;

  return {
    to: params.to,
    subject: `${piece} is back in stock`,
    html: layout('Back in stock', body),
    text: `${piece} is available again.\n\n${params.productUrl}\n\nWe hold nothing in reserve, so it is first come, first served.`,
  };
}
