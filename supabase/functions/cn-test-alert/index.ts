import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";
import webpush from "npm:web-push@3.6.7";

type PushRow = {
  id: string;
  subscription: unknown;
};

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
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ||
    "BLJY86NOSu88VTst9J2xXpl6j340y7i2KQhV7bqCTRep7pXK9UQMMa9iAX_G8WPoTyR_Eq6E7w-TYhjl9GEF6Nw";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "supabase_env_missing" }, 500);
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return json({
      ok: true,
      delivered: 0,
      error: "vapid_secrets_missing",
      message: "Set VAPID_PRIVATE_KEY in Supabase Edge Function secrets.",
    });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from("cn_push_subscriptions")
    .select("id,subscription")
    .eq("active", true);

  if (error) {
    return json({ error: error.message }, 500);
  }

  const result = await sendWebPushes(supabase, data || [], {
    title: "Geoweather test alert",
    body: "Geoweather_CN web push test alert.",
    tag: "geoweather-cn-test",
    url: "/Geoweather_CN/",
  });

  return json({ ok: true, ...result });
});

async function sendWebPushes(
  supabase: ReturnType<typeof createClient>,
  rows: PushRow[],
  payload: Record<string, string>,
) {
  let delivered = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await webpush.sendNotification(row.subscription as webpush.PushSubscription, JSON.stringify(payload));
      delivered += 1;
    } catch (error) {
      failed += 1;
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : 0;

      if (statusCode === 404 || statusCode === 410) {
        await supabase
          .from("cn_push_subscriptions")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    }
  }

  return { delivered, failed, subscriptions: rows.length };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
