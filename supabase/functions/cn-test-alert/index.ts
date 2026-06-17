import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const ntfyTopicUrl = Deno.env.get("NTFY_TOPIC_URL");
  if (!ntfyTopicUrl) {
    return json({
      ok: true,
      delivered: false,
      error: "ntfy_topic_url_missing",
      message: "Set NTFY_TOPIC_URL in Supabase Edge Function secrets.",
    });
  }

  let body: { visitor_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const visitor = typeof body.visitor_id === "string" ? body.visitor_id.slice(0, 8) : "unknown";
  const delivered = await sendNtfyAlert(
    ntfyTopicUrl,
    "Geoweather test alert",
    `Geoweather_CN test alert from visitor ${visitor}`,
  );

  return json({ ok: true, delivered });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sendNtfyAlert(topicUrl: string, title: string, message: string) {
  try {
    const response = await fetch(topicUrl, {
      method: "POST",
      headers: {
        "Title": title,
        "Tags": "bell",
        "Priority": "high",
      },
      body: message,
    });

    return response.ok;
  } catch {
    return false;
  }
}
