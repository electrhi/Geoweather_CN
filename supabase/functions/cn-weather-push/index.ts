import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";
import webpush from "npm:web-push@3.6.7";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

  if (!supabaseUrl || !serviceKey) return json({ error: "supabase_env_missing" }, 500);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (body.action === "public-key") {
    if (!publicKey) return json({ error: "vapid_not_configured" }, 503);
    return json({ publicKey });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  if (body.action === "subscribe") {
    const endpoint = String(body.endpoint || "");
    const p256dh = String(body.keys?.p256dh || "");
    const auth = String(body.keys?.auth || "");
    const userId = body.user_id ? String(body.user_id).slice(0, 128) : null;

    if (!endpoint || !p256dh || !auth) return json({ error: "invalid_subscription" }, 400);

    const { error } = await supabase.from("cn_weather_push_subscriptions").upsert({
      endpoint,
      p256dh,
      auth,
      user_id: userId,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === "unsubscribe") {
    const endpoint = String(body.endpoint || "");
    if (!endpoint) return json({ error: "endpoint_required" }, 400);

    const { error } = await supabase
      .from("cn_weather_push_subscriptions")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("endpoint", endpoint);

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === "broadcast") {
    const authorization = req.headers.get("authorization") || "";
    if (authorization !== `Bearer ${serviceKey}`) return json({ error: "forbidden" }, 403);
    if (!publicKey || !privateKey) return json({ error: "vapid_not_configured" }, 503);

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const { data: subscriptions, error } = await supabase
      .from("cn_weather_push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("active", true);

    if (error) return json({ error: error.message }, 500);

    const payload = JSON.stringify({
      title: body.payload?.title || "충남권 온열질환 알림",
      body: body.payload?.body || "체감온도 단계가 상승했습니다.",
      url: body.payload?.url || "./",
      data: body.payload || {},
    });

    let sent = 0;
    let disabled = 0;

    for (const subscription of subscriptions || []) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload, { TTL: 900 });
        sent += 1;
      } catch (pushError: any) {
        const statusCode = Number(pushError?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("cn_weather_push_subscriptions")
            .update({ active: false, updated_at: new Date().toISOString() })
            .eq("id", subscription.id);
          disabled += 1;
        } else {
          console.error("push failed", statusCode, pushError?.message);
        }
      }
    }

    return json({ ok: true, sent, disabled });
  }

  return json({ error: "unknown_action" }, 400);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
