import "server-only";
import nodemailer from "nodemailer";

// Decision #23 (progress.md): Gmail SMTP for today's build, not a
// transactional provider with a verified custom domain. Named limitation:
// every email shows the real Gmail account as sender, never
// proposals@koyatalent.com - see progress.md for the full reasoning and
// what a real deployment would use instead.
function transporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

export interface SendResult {
  success: boolean;
  detail: string | null;
}

interface SendMailArgs {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  displayName?: string;
  cc?: string;
}

export async function sendMail({ to, subject, html, replyTo, displayName, cc }: SendMailArgs): Promise<SendResult> {
  try {
    const from = displayName ? `"${displayName}" <${process.env.GMAIL_USER}>` : process.env.GMAIL_USER;

    await transporter().sendMail({
      from,
      to,
      subject,
      html,
      replyTo,
      cc,
    });

    return { success: true, detail: null };
  } catch (err) {
    // Never let a failed send look like a silent success (PRD scenario #7) -
    // callers are responsible for writing this result to delivery_log /
    // notifications and surfacing it in the UI.
    const detail = err instanceof Error ? err.message : "Unknown email send failure";
    return { success: false, detail };
  }
}

export function approvalRequestedEmail(params: {
  proposalId: string;
  clientName: string;
  companyName: string;
  salespersonName: string;
  appUrl: string;
}) {
  return {
    subject: `Approval needed: proposal for ${params.companyName}`,
    html: `
      <p>A new proposal is ready for your review.</p>
      <p><strong>Client:</strong> ${params.clientName} (${params.companyName})<br/>
      <strong>Submitted by:</strong> ${params.salespersonName}</p>
      <p><a href="${params.appUrl}/approvals/${params.proposalId}">Review the proposal</a></p>
    `,
  };
}

export function approvedEmail(params: { proposalId: string; companyName: string; appUrl: string }) {
  return {
    subject: `Approved: proposal for ${params.companyName}`,
    html: `
      <p>Your proposal for <strong>${params.companyName}</strong> has been approved.</p>
      <p>The client verification email and delivery pipeline have been triggered automatically.</p>
      <p><a href="${params.appUrl}/dashboard/${params.proposalId}">View the proposal</a></p>
    `,
  };
}

export function rejectedEmail(params: {
  proposalId: string;
  companyName: string;
  note: string;
  appUrl: string;
}) {
  return {
    subject: `Changes requested: proposal for ${params.companyName}`,
    html: `
      <p>Your proposal for <strong>${params.companyName}</strong> was sent back for changes.</p>
      <p><strong>Approver's note:</strong></p>
      <blockquote>${params.note}</blockquote>
      <p><a href="${params.appUrl}/dashboard/${params.proposalId}">Revise the proposal</a></p>
    `,
  };
}

// Decision #41/#42 (progress.md): reminds the SALESPERSON, never the
// client, to check in and update client_response_status - sent every 3 days
// by the Vercel Cron job while it stays "pending".
export function clientResponseReminderEmail(params: { proposalId: string; companyName: string; appUrl: string }) {
  return {
    subject: `Reminder: check in on ${params.companyName}`,
    html: `
      <p>The proposal for <strong>${params.companyName}</strong> was delivered and is still marked "pending" - checking in with the client and updating its status helps keep the pipeline accurate.</p>
      <p><a href="${params.appUrl}/dashboard/${params.proposalId}">Update the status</a></p>
    `,
  };
}

export function generationCompleteEmail(params: {
  proposalId: string;
  companyName: string;
  appUrl: string;
}) {
  return {
    subject: `Draft ready: proposal for ${params.companyName}`,
    html: `
      <p>Your proposal draft for <strong>${params.companyName}</strong> has finished generating.</p>
      <p><a href="${params.appUrl}/dashboard/${params.proposalId}">Review it now</a></p>
    `,
  };
}

export function clientVerificationEmail(params: { companyName: string; code: string; appUrl: string; proposalId: string }) {
  return {
    subject: `Access code for your proposal from Koya Talent`,
    html: `
      <p>Hi,</p>
      <p>Use this code to view your proposal from Koya Talent:</p>
      <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${params.code}</p>
      <p><a href="${params.appUrl}/proposal/${params.proposalId}/access">Enter your code here</a></p>
      <p>This code expires in 7 days.</p>
    `,
  };
}

export function clientDeliveryEmail(params: {
  clientName: string;
  companyName: string;
  salespersonName: string;
  proposalId: string;
  appUrl: string;
}) {
  return {
    subject: `Proposal for ${params.companyName}`,
    html: `
      <p>Hi ${params.clientName},</p>
      <p>Thanks again for taking the time to speak with us. Based on our conversation, we have put together a customized proposal for your review.</p>
      <p>You can view the proposal here: <a href="${params.appUrl}/proposal/${params.proposalId}/access">${params.appUrl}/proposal/${params.proposalId}/access</a></p>
      <p>This document outlines the project scope, timeline, pricing details, and recommended approach.</p>
      <p>If you have any questions or would like to make adjustments, feel free to reach out. We are happy to iterate with you.</p>
      <p>Looking forward to hearing your thoughts.</p>
      <p>Best regards,<br/>${params.salespersonName}<br/>Koya Talent</p>
    `,
  };
}

