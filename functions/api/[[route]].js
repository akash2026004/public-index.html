export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  // Simple free password protection via URL token
  if (!env.ACCESS_TOKEN || token !== env.ACCESS_TOKEN) {
    return new Response("Unauthorized: invalid token", { status: 401 });
  }

  // 1. Upload file to R2
  if (url.pathname === "/api/upload" && request.method === "PUT") {
    const rawName = url.searchParams.get("name") || "file";
    const safeName = `${Date.now()}-${rawName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await env.MEDIA_BUCKET.put(safeName, request.body, {
      httpMetadata: { contentType: request.headers.get("Content-Type") || "application/octet-stream" }
    });
    return new Response(JSON.stringify({ ok: true, key: safeName }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // 2. List uploaded files
  if (url.pathname === "/api/list" && request.method === "GET") {
    const listed = await env.MEDIA_BUCKET.list({ limit: 500 });
    const items = listed.objects.map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded }));
    return new Response(JSON.stringify(items), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // 3. View / Download a file
  if (url.pathname === "/api/file" && request.method === "GET") {
    const key = url.searchParams.get("key");
    if (!key) return new Response("Missing key", { status: 400 });
    const object = await env.MEDIA_BUCKET.get(key);
    if (!object) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
  }

  return new Response("Not found", { status: 404 });
}
