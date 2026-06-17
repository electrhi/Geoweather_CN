import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ntfyTopicUrl = Deno.env.get("NTFY_TOPIC_URL");

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "supabase_env_missing" }, 500);
  }

  let body: { visitor_id?: string; user_agent?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const visitorId = safeText(body.visitor_id, 80);
  const userAgent = safeText(body.user_agent, 300);
  const shortVisitor = visitorId ? visitorId.slice(0, 8) : "unknown";
  const message = `Geoweather_CN login alert: visitor ${shortVisitor}`;

  const visit = await supabase.from("cn_weather_visit_events").insert({
    user_id: visitorId,
    user_agent: userAgent,
  });

  if (visit.error) {
    return json({ error: visit.error.message }, 500);
  }

  const alert = await supabase.from("cn_weather_alert_events").insert({
    alert_type: "visit",
    user_id: visitorId,
    message,
  });

  if (alert.error) {
    return json({ error: alert.error.message }, 500);
  }

  const delivered = ntfyTopicUrl ? await sendNtfyAlert(ntfyTopicUrl, "Geoweather login", message) : false;
  return json({ ok: true, delivered });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function safeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

async function sendNtfyAlert(topicUrl: string, title: string, message: string) {
  try {
    const response = await fetch(topicUrl, {
      method: "POST",
      headers: {
        "Title": title,
        "Tags": "bell",
        "Priority": "default",
      },
      body: message,
    });

    return response.ok;
  } catch {
    return false;
  }
}
