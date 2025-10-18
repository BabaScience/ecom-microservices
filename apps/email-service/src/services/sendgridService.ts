import sgMail from '@sendgrid/mail';
import { logger } from '@repo/shared';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface EmailData {
  to: string;
  template: EmailTemplate;
  data?: any;
}

export class SendGridService {
  private isInitialized = false;
  
  constructor() {
    this.initialize();
  }
  
  private initialize(): void {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      logger.warn('SENDGRID_API_KEY not found, email service will be disabled');
      return;
    }
    
    sgMail.setApiKey(apiKey);
    this.isInitialized = true;
    logger.info('SendGrid service initialized');
  }
  
  async sendEmail(emailData: EmailData): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SendGrid service not initialized - missing API key');
    }
    
    const { to, template, data } = emailData;
    
    try {
      const msg = {
        to,
        from: process.env.FROM_EMAIL || 'noreply@ecommerce.com',
        subject: template.subject,
        text: template.text,
        html: template.html,
        // Add dynamic template data if provided
        ...(data && { dynamicTemplateData: data })
      };
      
      await sgMail.send(msg);
      
      logger.info('Email sent successfully', { 
        to, 
        subject: template.subject 
      });
      
    } catch (error) {
      logger.error('Failed to send email', { 
        to, 
        subject: template.subject,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  async sendBulkEmails(emailDataList: EmailData[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SendGrid service not initialized - missing API key');
    }
    
    const messages = emailDataList.map(emailData => ({
      to: emailData.to,
      from: process.env.FROM_EMAIL || 'noreply@ecommerce.com',
      subject: emailData.template.subject,
      text: emailData.template.text,
      html: emailData.template.html,
      ...(emailData.data && { dynamicTemplateData: emailData.data })
    }));
    
    try {
      await sgMail.send(messages);
      
      logger.info('Bulk emails sent successfully', { 
        count: emailDataList.length 
      });
      
    } catch (error) {
      logger.error('Failed to send bulk emails', { 
        count: emailDataList.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  isServiceAvailable(): boolean {
    return this.isInitialized;
  }
}

export const sendGridService = new SendGridService();
