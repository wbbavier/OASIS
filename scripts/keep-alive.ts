/**
 * keep-alive.ts
 *
 * Pings Supabase to prevent the free-tier database from pausing after 7 days
 * of inactivity. Run this via GitHub Actions on a cron schedule (every 5 days).
 *
 * Usage: npx ts-node scripts/keep-alive.ts
 *
 * Implemented in Phase 0 post-deploy as a GitHub Actions workflow.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function ping() {
  const start = Date.now();
  const { error } = await supabase.rpc("now" as never);
  const elapsed = Date.now() - start;

  if (error && error.code !== "PGRST202") {
    console.error(`Supabase ping failed (${elapsed}ms):`, error.message);
    process.exit(1);
  }

  console.log(`Supabase ping OK (${elapsed}ms) — ${new Date().toISOString()}`);
}

ping();
