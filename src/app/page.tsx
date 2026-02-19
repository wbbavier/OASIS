import { supabase } from "@/lib/supabase";

async function checkDatabaseConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    // A minimal round-trip: fetch the server timestamp.
    // This works on any Supabase project without requiring any tables.
    const { error } = await supabase.rpc("now" as never);

    // Supabase returns a "function not found" error for `now()` called via rpc,
    // but the HTTP round-trip itself succeeds — which is all we need to confirm
    // the project URL and anon key are valid. A network/auth failure throws instead.
    if (error && error.code === "PGRST202") {
      // Function not found is expected — connection is alive
      return { ok: true, message: "Database reachable" };
    }
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true, message: "Database reachable" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message };
  }
}

export default async function HomePage() {
  const db = await checkDatabaseConnection();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-stone-100">
          OASIS
        </h1>
        <p className="mt-2 text-stone-400 text-lg">
          A weekly turn-based civilization simulation
        </p>
      </div>

      <div
        className={`flex items-center gap-3 rounded-lg border px-6 py-4 ${
          db.ok
            ? "border-emerald-700 bg-emerald-950 text-emerald-300"
            : "border-red-700 bg-red-950 text-red-300"
        }`}
      >
        <span className="text-xl">{db.ok ? "✓" : "✗"}</span>
        <div>
          <p className="font-semibold">
            {db.ok ? "Database connected" : "Database error"}
          </p>
          <p className="text-sm opacity-75">{db.message}</p>
        </div>
      </div>

      <p className="text-stone-600 text-sm">Phase 0 skeleton — {new Date().toISOString().split("T")[0]}</p>
    </main>
  );
}
