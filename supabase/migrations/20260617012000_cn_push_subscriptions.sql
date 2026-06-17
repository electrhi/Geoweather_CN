create table if not exists public.cn_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  visitor_id text,
  subscription jsonb not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.cn_push_subscriptions enable row level security;
