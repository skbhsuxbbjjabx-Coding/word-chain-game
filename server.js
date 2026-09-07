import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const queues = new Map([[2, []], [3, []], [4, []]]);
const tickets = new Map();
const matches = new Map();
const rooms = new Map();

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

function makeCode(prefix = "") {
  return `${prefix}${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

function makeMatch(players) {
  const match = {
    id: randomUUID(),
    roomCode: makeCode("P"),
    players,
    events: [],
    nextInitial: "음",
    createdAt: Date.now()
  };
  matches.set(match.id, match);
  return match;
}

function tryMatch(size) {
  const queue = queues.get(size);
  while (queue && queue.length >= size) {
    const ids = queue.splice(0, size);
    const players = ids.map((id) => ({ id, nickname: tickets.get(id).nickname }));
    const match = makeMatch(players);
    ids.forEach((id, index) => {
      const ticket = tickets.get(id);
      ticket.status = "matched";
      ticket.matchId = match.id;
      ticket.selfIndex = index;
    });
  }
}

async function handleApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/matchmaking/join") {
    const body = await readJson(request);
    const size = Number(body.size);
    if (![2, 3, 4].includes(size) || !String(body.nickname || "").trim()) return sendJson(response, 400, { error: "invalid_match_request" });
    const ticketId = randomUUID();
    tickets.set(ticketId, { id: ticketId, nickname: String(body.nickname).trim().slice(0, 12), size, status: "waiting", createdAt: Date.now() });
    queues.get(size).push(ticketId);
    tryMatch(size);
    return sendJson(response, 200, { ticket: ticketId, size });
  }

  if (request.method === "GET" && url.pathname === "/api/matchmaking/status") {
    const ticket = tickets.get(url.searchParams.get("ticket"));
    if (!ticket) return sendJson(response, 404, { error: "ticket_not_found" });
    const queue = queues.get(ticket.size) || [];
    if (ticket.status === "matched") {
      const match = matches.get(ticket.matchId);
      return sendJson(response, 200, { status: "matched", matchId: match.id, roomCode: match.roomCode, playerId: ticket.id, selfIndex: ticket.selfIndex, players: match.players.map((player) => player.nickname) });
    }
    return sendJson(response, 200, { status: "waiting", size: ticket.size, waiting: queue.length, position: Math.max(1, queue.indexOf(ticket.id) + 1) });
  }

  if (request.method === "POST" && url.pathname === "/api/matchmaking/cancel") {
    const body = await readJson(request);
    const ticket = tickets.get(body.ticket);
    if (ticket && ticket.status === "waiting") {
      queues.get(ticket.size).splice(queues.get(ticket.size).indexOf(ticket.id), 1);
      tickets.delete(ticket.id);
    }
    return sendJson(response, 200, { ok: true });
  }

  const eventsMatch = url.pathname.match(/^\/api\/matches\/([^/]+)\/events$/);
  if (request.method === "GET" && eventsMatch) {
    const match = matches.get(eventsMatch[1]);
    if (!match) return sendJson(response, 404, { error: "match_not_found" });
    const after = Number(url.searchParams.get("after") || 0);
    return sendJson(response, 200, { events: match.events.slice(after), cursor: match.events.length });
  }

  const wordMatch = url.pathname.match(/^\/api\/matches\/([^/]+)\/word$/);
  if (request.method === "POST" && wordMatch) {
    const match = matches.get(wordMatch[1]);
    if (!match) return sendJson(response, 404, { error: "match_not_found" });
    const body = await readJson(request);
    const player = match.players[match.events.length % match.players.length];
    if (player.id !== body.playerId) return sendJson(response, 409, { error: "not_your_turn" });
    const word = String(body.word || "").trim().replace(/\s+/g, "");
    if (!word || match.events.some((event) => event.word === word) || word === "마음") return sendJson(response, 422, { error: "invalid_word" });
    const event = { playerId: player.id, nickname: player.nickname, word, note: String(body.note || ""), nextInitial: [...word].at(-1), createdAt: Date.now() };
    match.events.push(event);
    match.nextInitial = event.nextInitial;
    return sendJson(response, 200, { ok: true, event, cursor: match.events.length });
  }

  if (request.method === "GET" && url.pathname === "/api/dictionary/lookup") {
    const word = String(url.searchParams.get("word") || "").trim().replace(/\s+/g, "");
    const apiKey = process.env.KDICT_API_KEY;
    if (!word) return sendJson(response, 400, { error: "word_required" });
    if (!apiKey) return sendJson(response, 200, { configured: false, provider: "krdict" });
    const apiUrl = new URL("https://krdict.korean.go.kr/api/search");
    apiUrl.searchParams.set("key", apiKey);
    apiUrl.searchParams.set("q", word);
    apiUrl.searchParams.set("part", "word");
    apiUrl.searchParams.set("num", "100");
    const apiResponse = await fetch(apiUrl);
    const xml = await apiResponse.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
    const exact = items.find((item) => (item.match(/<word>([\s\S]*?)<\/word>/)?.[1] || "").trim() === word);
    const definitions = exact ? [...exact.matchAll(/<definition>([\s\S]*?)<\/definition>/g)].map((match) => match[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean) : [];
    return sendJson(response, 200, { configured: true, provider: "krdict", valid: Boolean(exact), definition: definitions[0] || "", sourceUrl: "https://krdict.korean.go.kr" });
  }

  const timeoutMatch = url.pathname.match(/^\/api\/matches\/([^/]+)\/timeout$/);
  if (request.method === "POST" && timeoutMatch) {
    const match = matches.get(timeoutMatch[1]);
    if (!match) return sendJson(response, 404, { error: "match_not_found" });
    const body = await readJson(request);
    const player = match.players[match.events.length % match.players.length];
    if (player.id !== body.playerId) return sendJson(response, 409, { error: "not_your_turn" });
    match.events.push({ playerId: player.id, nickname: player.nickname, timeout: true, word: "", nextInitial: match.nextInitial, createdAt: Date.now() });
    return sendJson(response, 200, { ok: true, cursor: match.events.length });
  }

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(request);
    const code = makeCode("F");
    const room = { code, size: [2, 3, 4].includes(Number(body.size)) ? Number(body.size) : 2, players: [{ id: randomUUID(), nickname: String(body.nickname || "단어수집가").trim().slice(0, 12) }], started: false };
    rooms.set(code, room);
    return sendJson(response, 200, { code, size: room.size, players: room.players });
  }

  if (request.method === "POST" && url.pathname === "/api/rooms/join") {
    const body = await readJson(request);
    const room = rooms.get(String(body.code || "").trim().toUpperCase());
    if (!room) return sendJson(response, 404, { error: "room_not_found" });
    if (room.players.length >= room.size) return sendJson(response, 409, { error: "room_full" });
    room.players.push({ id: randomUUID(), nickname: String(body.nickname || "플레이어").trim().slice(0, 12) });
    if (room.players.length >= room.size) { room.started = true; room.match = makeMatch(room.players); }
    return sendJson(response, 200, { code: room.code, size: room.size, players: room.players, started: room.started, matchId: room.match?.id || null });
  }

  return false;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    try {
      const handled = await handleApi(request, response, url);
      if (handled !== false) return;
    } catch (error) {
      console.error(error);
      return sendJson(response, 500, { error: "server_error" });
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
