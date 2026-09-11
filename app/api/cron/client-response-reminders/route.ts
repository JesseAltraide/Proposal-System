import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientResponseReminderEmail, sendMail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";

const REMINDER_INTERVAL_DAYS = 3;

// Called by Vercel Cron (see vercel.json) - decision #42. Reminds the
// salesperson (never the client) to check in and update
// client_response_status while it's still "pending", every N days since the
// last reminder (or since approval, if none sent yet).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await admin
    .from("proposals")
    .select("id, company_name, created_by, sent_at, last_client_response_reminder_at")
    .eq("status", "sent")
    .eq("client_response_status", "pending")
    .or(`last_client_response_reminder_at.lte.${cutoff},last_client_response_reminder_at.is.null`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The OR above alone doesn't handle "sent_at <= cutoff when no reminder
  // has ever been sent" - filter that case explicitly here.
  const due = (candidates ?? []).filter((p) => {
    const anchor = p.last_client_response_reminder_at ?? p.sent_at;
    return anchor !== null && anchor <= cutoff;
  });

  const results: { proposalId: string; sent: boolean }[] = [];

  for (const proposal of due) {
    const { data: salesperson } = await admin
      .from("profiles")
      .select("id, email")
      .eq("id", proposal.created_by)
      .single();

    if (!salesperson) continue;

    const { subject, html } = clientResponseReminderEmail({
      proposalId: proposal.id,
      companyName: proposal.company_name ?? "",
      appUrl: getAppUrl(),
    });

    const result = await sendMail({ to: salesperson.email, subject, html });

    await admin
      .from("proposals")
      .update({ last_client_response_reminder_at: new Date().toISOString() })
      .eq("id", proposal.id)
      .eq("client_response_status", "pending");

    await admin.from("notifications").insert({
      recipient_user_id: salesperson.id,
      proposal_id: proposal.id,
      event_type: "client_response_reminder",
      status: result.success ? "success" : "failed",
    });

    results.push({ proposalId: proposal.id, sent: result.success });
  }

  return NextResponse.json({ checked: candidates?.length ?? 0, reminded: results.length, results });
}
