import { Resend } from 'resend';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let resendClient: Resend | null | undefined;

function getResend(): Resend | null {
  if (resendClient !== undefined) return resendClient;
  const key = env.RESEND_API_KEY?.trim();
  if (!env.RESEND_ENABLED || !key) {
    resendClient = null;
    return null;
  }
  resendClient = new Resend(key);
  return resendClient;
}

export class EmailNotifier {
  public async sendBookingConfirmation(input: {
    email: string;
    startIso: string;
    endIso: string;
    meetLink?: string | null;
    details?: string;
  }): Promise<void> {
    const startLocal = new Date(input.startIso).toLocaleString();
    const endLocal = new Date(input.endIso).toLocaleString();
    const detailsLine = input.details ? `\n\n${input.details}` : '';
    const meetLine = input.meetLink
      ? `Join link: ${input.meetLink}`
      : 'Meeting link will be shared separately.';
    const resend = getResend();
    if (!resend) {
      logger.warn('Resend is disabled or RESEND_API_KEY is missing; skip booking confirmation email');
      return;
    }
    await resend.emails.send({
      from: 'Orion Path <noreply@orionpath.ai>',
      to: [input.email],
      subject: 'Your Orion Path consultation is confirmed',
      text: `Your consultation is confirmed.\n\nStart: ${startLocal}\nEnd: ${endLocal}\n${meetLine}${detailsLine}`,
      html: `<p>Your consultation is confirmed.</p><p><strong>Start:</strong> ${startLocal}<br/><strong>End:</strong> ${endLocal}</p><p>${meetLine}</p><p>${input.details ?? ''}</p>`,
    });
  }
}

