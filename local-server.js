import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api-handler.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    try {
      const handled = await handleApi(request, response, url);
      if (handled !== false) return;
    } catch (error) {
      console.error(error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "server_error" }));
      return;
    }
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(root, requested));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Word Chain Game is running at http://127.0.0.1:${port}`);
});
