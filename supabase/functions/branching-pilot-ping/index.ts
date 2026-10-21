// AIO-147 branching pilot: trivial function to exercise Supabase preview branches.
Deno.serve(
  () =>
    new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    }),
);
