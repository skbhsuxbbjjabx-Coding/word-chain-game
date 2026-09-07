import { handleApi } from "../server.js";

export default async function handler(request, response) {
  const url = new URL(request.url || "/", `https://${request.headers.host || "localhost"}`);

  try {
    const handled = await handleApi(request, response, url);
    if (handled === false && !response.writableEnded) {
      response.statusCode = 404;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "api_route_not_found" }));
    }
  } catch (error) {
    console.error("Vercel function error", error);
    if (!response.writableEnded) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "server_error" }));
    }
  }
}
