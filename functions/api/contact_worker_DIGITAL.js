// Cloudflare Pages Function: functions/api/contact.js
// LIVE VERSION - stafferton.digital
// Uses Resend API for email sending

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { "Content-Type": "application/json" };

  try {
    const body = await request.json();
    const { name, email, company, message } = body;

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers });
    }

    const emailBody = [
      "New enquiry via stafferton.digital contact form",
      "",
      "Name:    " + name,
      "Email:   " + email,
      "Company: " + (company || "Not provided"),
      "",
      "Message:",
      message,
      "",
      "---",
      "Sent via stafferton.digital/contact"
    ].join("\n");

    const payload = {
      from: "Stafferton Website <noreply@stafferton.digital>",
      to: ["hello@stafferton.digital"],
      reply_to: email,
      subject: "New enquiry from " + name,
      text: emailBody
    };

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + env.RESEND_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const resBody = await res.json();

    if (res.ok) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }
    console.error("Resend error:", res.status, JSON.stringify(resBody));
    return new Response(JSON.stringify({ error: "Mail failed", detail: resBody }), { status: 500, headers });

  } catch (err) {
    console.error("Worker error:", err.message);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  }});
}
