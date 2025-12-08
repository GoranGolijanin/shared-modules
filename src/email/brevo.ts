import * as Brevo from '@getbrevo/brevo';
import dotenv from 'dotenv';

// Load .env from shared-modules root (works when run from project root)
dotenv.config();

const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY || ''
);

export interface EmailOptions {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const sendSmtpEmail = new Brevo.SendSmtpEmail();

  sendSmtpEmail.subject = options.subject;
  sendSmtpEmail.htmlContent = options.htmlContent;
  sendSmtpEmail.textContent = options.textContent;
  sendSmtpEmail.sender = {
    name: process.env.EMAIL_FROM_NAME || 'App',
    email: process.env.EMAIL_FROM_ADDRESS || 'noreply@example.com',
  };
  sendSmtpEmail.to = [{ email: options.to }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  appUrl: string
): Promise<boolean> {
  const verificationUrl = `${appUrl}/verify-email?token=${token}`;

  return sendEmail({
    to: email,
    subject: 'Verify your email address',
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2563eb;">Verify Your Email</h1>
            <p>Thank you for registering! Please click the button below to verify your email address:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}"
                 style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Verify Email
              </a>
            </p>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
            </p>
          </div>
        </body>
      </html>
    `,
    textContent: `Verify your email by visiting: ${verificationUrl}`,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  appUrl: string
): Promise<boolean> {
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  return sendEmail({
    to: email,
    subject: 'Reset your password',
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2563eb;">Reset Your Password</h1>
            <p>You requested to reset your password. Click the button below to create a new password:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}"
                 style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Reset Password
              </a>
            </p>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetUrl}</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
            </p>
          </div>
        </body>
      </html>
    `,
    textContent: `Reset your password by visiting: ${resetUrl}`,
  });
}
