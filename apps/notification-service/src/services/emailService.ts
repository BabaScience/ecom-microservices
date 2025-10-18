import { Resend } from 'resend';
import { logger } from '@repo/shared';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<string> {
  try {
    const result = await resend.emails.send({
      from: `${process.env.FROM_NAME || 'Ecommerce Platform'} <${process.env.FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      text
    });

    if (result.error) {
      throw new Error(`Resend API error: ${result.error.message}`);
    }

    logger.info('Email sent successfully', { 
      emailId: result.data?.id, 
      to, 
      subject 
    });

    return result.data?.id || 'unknown';
  } catch (error) {
    logger.error('Failed to send email', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      to,
      subject 
    });
    throw error;
  }
}

export async function sendOrderConfirmationEmail(data: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<string> {
  return sendEmail(data);
}

export async function sendOrderStatusUpdateEmail(data: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<string> {
  return sendEmail(data);
}

export async function sendWelcomeEmail(data: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<string> {
  return sendEmail(data);
}

