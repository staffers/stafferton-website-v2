// Cloudflare Pages Function: functions/api/contact.js

export async function onRequestPost(context) {
  const { request } = context;
  const headers = { "Content-Type": "application/json" };

  try {
    const body = await request.json();
    const { name, email, company, message } = body;

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers });
    }

    const emailBody = [
      "New enquiry via stafferton.site contact form",
      "",
      "Name:    " + name,
      "Email:   " + email,
      "Company: " + (company || "Not provided"),
      "",
      "Message:",
      message,
      "",
      "---",
      "Sent via stafferton.site/contact"
    ].join("\n");

    const payload = {
      personalizations: [{
        to: [{ email: "hello@stafferton.digital", name: "Stafferton Digital" }],
        reply_to: { email: email, name: name }
      }],
      from: { email: "noreply@stafferton.site", name: "Stafferton Website" },
      subject: "New enquiry from " + name,
      content: [{ type: "text/plain", value: emailBody }]
    };

    const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.status === 202 || res.status === 200) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }
    const errText = await res.text();
    console.error("MailChannels error:", res.status, errText);
    return new Response(JSON.stringify({ error: "Mail failed", detail: errText }), { status: 500, headers });

  } catch (err) {
    console.error("Worker error:", err);
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
