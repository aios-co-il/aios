// AIO-147 branching pilot: second trivial function to check new functions deploy to preview branches.
Deno.serve(
  () =>
    new Response(JSON.stringify({ ok: true, name: "pong" }), {
      headers: { "Content-Type": "application/json" },
    }),
);
