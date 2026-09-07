import { handleApi } from "../api-handler.js";

function createResponseBridge() {
  const headers = new Headers();
  let status = 200;
  let body = "";
  return {
    writeHead(nextStatus, values = {}) {
      status = nextStatus;
      for (const [key, value] of Object.entries(values)) headers.set(key, value);
    },
    setHeader(key, value) { headers.set(key, value); },
    end(value = "") { body = value; },
    toResponse() { return new Response(body, { status, headers }); }
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    let body;

    if (request.method !== "GET" && request.method !== "HEAD") {
      const rawBody = await request.text();
      if (rawBody) {
        try { body = JSON.parse(rawBody); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
      } else {
        body = {};
      }
    }

    const requestBridge = {
      method: request.method,
      url: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(request.headers.entries()),
      body
    };
    const responseBridge = createResponseBridge();

    try {
      const handled = await handleApi(requestBridge, responseBridge, url);
      if (handled === false) return Response.json({ error: "api_route_not_found" }, { status: 404 });
      return responseBridge.toResponse();
    } catch (error) {
      console.error("Vercel function error", error);
      return Response.json({ error: "server_error" }, { status: 500 });
    }
  }
};
