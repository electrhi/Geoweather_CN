import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

type Region = { id: string; display_name: string; kma_nx: number; kma_ny: number };
type KmaItem = { category: string; obsrValue: string; baseDate: string; baseTime: string };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HEAT_LEVELS = [
  { id: "danger", min: 38, label: "폭염중대경보", message: "긴급조치 작업 외 옥외작업 중지" },
  { id: "warning", min: 35, label: "폭염경보", message: "14~17시 옥외작업 중지" },
  { id: "caution", min: 33, label: "폭염주의", message: "작업시간대 조정 또는 옥외작업 단축" },
] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const kmaServiceKey = Deno.env.get("KMA_SERVICE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "supabase_env_missing" }, 500);
  if (!kmaServiceKey) return json({ ok: false, error: "kma_service_key_missing" }, 200);

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: regions, error: regionError } = await supabase
    .from("cn_weather_regions")
    .select("id,display_name,kma_nx,kma_ny")
    .eq("active", true)
    .order("sort_order");

  if (regionError) return json({ error: regionError.message }, 500);

  const base = getKmaBaseTime(new Date());
  const results = [];

  for (const region of regions as Region[]) {
    const reading = await fetchKmaReading(kmaServiceKey, base.baseDate, base.baseTime, region);
    if (!reading.ok) {
      results.push({ region_id: region.id, ok: false, error: reading.error });
      continue;
    }

    const apparent = calculateSummerApparentTemperature(reading.temperature_c, reading.humidity_pct);
    const heat = classifyHeat(apparent);
    const observedAt = toKstIso(reading.baseDate, reading.baseTime);

    const { data: previous } = await supabase
      .from("cn_weather_readings")
      .select("heat_level,apparent_temp_c")
      .eq("region_id", region.id)
      .maybeSingle();

    const { error: upsertError } = await supabase.from("cn_weather_readings").upsert({
      region_id: region.id,
      temperature_c: reading.temperature_c,
      humidity_pct: reading.humidity_pct,
      wind_ms: reading.wind_ms,
      apparent_temp_c: apparent,
      heat_level: heat.id,
      heat_message: heat.message,
      observed_at: observedAt,
      source: "kma_ultra_srt_ncst",
      raw: reading.raw,
      updated_at: new Date().toISOString(),
    }, { onConflict: "region_id" });

    if (upsertError) {
      results.push({ region_id: region.id, ok: false, error: upsertError.message });
      continue;
    }

    const previousLevel = previous?.heat_level ?? "normal";
    const escalated = severity(heat.id) > severity(previousLevel);

    if (escalated && severity(heat.id) > 0) {
      const message = `${region.display_name} 체감온도 ${apparent.toFixed(1)}℃ · ${heat.message}`;
      await supabase.from("cn_weather_alert_events").insert({
        region_id: region.id,
        alert_type: "heat",
        heat_level: heat.id,
        apparent_temp_c: apparent,
        message,
      });

      await sendPush(supabaseUrl, serviceKey, {
        title: `[${heat.label}] ${region.display_name}`,
        body: message,
        region_id: region.id,
        heat_level: heat.id,
        apparent_temp_c: apparent,
      });
    }

    results.push({ region_id: region.id, ok: true, apparent_temp_c: apparent, heat_level: heat.id, escalated });
  }

  return json({ ok: true, base, results });
});

async function sendPush(supabaseUrl: string, serviceKey: string, payload: Record<string, unknown>) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/cn-weather-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ action: "broadcast", payload }),
    });
  } catch (error) {
    console.error("push broadcast failed", error);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function getKmaBaseTime(now: Date) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCMinutes(kst.getUTCMinutes() - 45);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  return { baseDate: `${yyyy}${mm}${dd}`, baseTime: `${hh}00` };
}

async function fetchKmaReading(key: string, baseDate: string, baseTime: string, region: Region) {
  const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst");
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(region.kma_nx));
  url.searchParams.set("ny", String(region.kma_ny));

  try {
    const response = await fetch(url);
    const data = await response.json();
    const items = data?.response?.body?.items?.item as KmaItem[] | undefined;
    if (!response.ok || !Array.isArray(items)) {
      return { ok: false as const, error: data?.response?.header?.resultMsg ?? "kma_response_invalid" };
    }

    const byCategory = Object.fromEntries(items.map((item) => [item.category, item]));
    const temperature = numberValue(byCategory.T1H?.obsrValue);
    const humidity = numberValue(byCategory.REH?.obsrValue);
    const wind = numberValue(byCategory.WSD?.obsrValue);
    if (temperature === null || humidity === null || wind === null) {
      return { ok: false as const, error: "kma_required_categories_missing" };
    }

    return {
      ok: true as const,
      temperature_c: temperature,
      humidity_pct: humidity,
      wind_ms: wind,
      baseDate,
      baseTime,
      raw: data,
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "kma_fetch_failed" };
  }
}

function numberValue(value: string | undefined) {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// 기상청 여름철 체감온도: Stull 습구온도 근사식 + 기상청 보정식
function calculateSummerApparentTemperature(tempC: number, humidity: number) {
  const rh = Math.min(100, Math.max(0, humidity));
  const wetBulb =
    tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035;

  const apparent =
    -0.2442 +
    0.55399 * wetBulb +
    0.45535 * tempC -
    0.0022 * wetBulb * wetBulb +
    0.00278 * wetBulb * tempC +
    3.0;

  return Math.round(apparent * 10) / 10;
}

function classifyHeat(apparent: number) {
  const matched = HEAT_LEVELS.find((level) => apparent >= level.min);
  return matched ?? { id: "normal", label: "정상", message: "기본 폭염예방수칙 준수" };
}

function severity(level: string | null | undefined) {
  return ({ normal: 0, interest: 0, caution: 1, warning: 2, danger: 3 } as Record<string, number>)[level ?? "normal"] ?? 0;
}

function toKstIso(baseDate: string, baseTime: string) {
  const y = Number(baseDate.slice(0, 4));
  const m = Number(baseDate.slice(4, 6)) - 1;
  const d = Number(baseDate.slice(6, 8));
  const h = Number(baseTime.slice(0, 2));
  return new Date(Date.UTC(y, m, d, h - 9, 0, 0)).toISOString();
}
