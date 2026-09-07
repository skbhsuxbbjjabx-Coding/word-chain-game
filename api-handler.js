import { randomUUID } from "node:crypto";

const queues = new Map([[2, []], [3, []], [4, []]]);
const tickets = new Map();
const matches = new Map();
const rooms = new Map();
const START_WORDS = ["마음", "사랑", "나무", "음악", "게임", "하늘", "바다", "친구", "학교", "사과", "영화", "수박"];
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redisCommand(command, args = []) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const response = await fetch(REDIS_URL, { method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify([command, ...args]) });
  if (!response.ok) throw new Error(`redis_${response.status}`);
  const payload = await response.json();
  return payload.result;
}

async function getSharedJson(key) {
  const stored = await redisCommand("GET", [key]);
  return stored ? JSON.parse(stored) : null;
}

async function setSharedJson(key, value) {
  const stored = await redisCommand("SET", [key, JSON.stringify(value), "EX", "3600"]);
  return stored;
}

const roomKey = (code) => `word-chain:room:${code}`;
const matchKey = (id) => `word-chain:match:${id}`;
async function getRoom(code) { return (await getSharedJson(roomKey(code))) || rooms.get(code) || null; }
async function saveRoom(room) { rooms.set(room.code, room); return setSharedJson(roomKey(room.code), room); }
async function getMatch(id) { return (await getSharedJson(matchKey(id))) || matches.get(id) || null; }
async function saveMatch(match) { matches.set(match.id, match); return setSharedJson(matchKey(match.id), match); }

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  if (request.body !== undefined) {
    if (typeof request.body === "string") {
      try { return Promise.resolve(request.body ? JSON.parse(request.body) : {}); } catch (error) { return Promise.reject(error); }
    }
    return Promise.resolve(request.body || {});
  }
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

function makeMatch(players, roomCode = null) {
  const startWord = START_WORDS[Math.floor(Math.random() * START_WORDS.length)];
  const match = {
    id: randomUUID(),
    roomCode: roomCode || makeCode("P"),
    players,
    events: [],
    leftPlayers: [],
    startWord,
    nextInitial: [...startWord].at(-1),
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

export async function handleApi(request, response, url) {
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
      const match = await getMatch(ticket.matchId);
      if (!match) return sendJson(response, 404, { error: "match_not_found" });
      return sendJson(response, 200, { status: "matched", matchId: match.id, roomCode: match.roomCode, startWord: match.startWord, playerId: ticket.id, selfIndex: ticket.selfIndex, players: match.players.map((player) => player.nickname) });
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
    const match = await getMatch(eventsMatch[1]);
    if (!match) return sendJson(response, 404, { error: "match_not_found" });
    const after = Number(url.searchParams.get("after") || 0);
    return sendJson(response, 200, { events: match.events.slice(after), cursor: match.events.length });
  }

  const leaveMatch = url.pathname.match(/^\/api\/matches\/([^/]+)\/leave$/);
  if (request.method === "POST" && leaveMatch) {
    const match = await getMatch(leaveMatch[1]);
    if (!match) return sendJson(response, 404, { error: "match_not_found" });
    const body = await readJson(request);
    const player = match.players.find((candidate) => candidate.id === body.playerId);
    if (!player) return sendJson(response, 403, { error: "not_in_match" });
    if (!match.leftPlayers.includes(player.id)) {
      match.leftPlayers.push(player.id);
      match.events.push({ playerId: player.id, nickname: player.nickname, leave: true, word: "", nextInitial: match.nextInitial, createdAt: Date.now() });
      await saveMatch(match);
    }
    return sendJson(response, 200, { ok: true, cursor: match.events.length });
  }

  const wordMatch = url.pathname.match(/^\/api\/matches\/([^/]+)\/word$/);
  if (request.method === "POST" && wordMatch) {
    const match = await getMatch(wordMatch[1]);
    if (!match) return sendJson(response, 404, { error: "match_not_found" });
    const body = await readJson(request);
    const player = match.players[match.events.length % match.players.length];
    if (player.id !== body.playerId) return sendJson(response, 409, { error: "not_your_turn" });
    const word = String(body.word || "").trim().replace(/\s+/g, "");
    if (!word || match.events.some((event) => event.word === word) || word === match.startWord) return sendJson(response, 422, { error: "invalid_word" });
    const event = { playerId: player.id, nickname: player.nickname, word, note: String(body.note || ""), nextInitial: [...word].at(-1), createdAt: Date.now() };
    match.events.push(event);
    match.nextInitial = event.nextInitial;
    await saveMatch(match);
    return sendJson(response, 200, { ok: true, event, cursor: match.events.length });
  }

  const timeoutMatch = url.pathname.match(/^\/api\/matches\/([^/]+)\/timeout$/);
  if (request.method === "POST" && timeoutMatch) {
    const match = await getMatch(timeoutMatch[1]);
    if (!match) return sendJson(response, 404, { error: "match_not_found" });
    const body = await readJson(request);
    const player = match.players[match.events.length % match.players.length];
    if (player.id !== body.playerId) return sendJson(response, 409, { error: "not_your_turn" });
    match.events.push({ playerId: player.id, nickname: player.nickname, timeout: true, word: "", nextInitial: match.nextInitial, createdAt: Date.now() });
    await saveMatch(match);
    return sendJson(response, 200, { ok: true, cursor: match.events.length });
  }

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(request);
    const code = makeCode();
    const playerId = randomUUID();
    const room = { code, size: [2, 3, 4].includes(Number(body.size)) ? Number(body.size) : 2, players: [{ id: playerId, nickname: String(body.nickname || "단어수집가").trim().slice(0, 12) }], started: false };
    await saveRoom(room);
    return sendJson(response, 200, { code, size: room.size, playerId, players: room.players.map((player) => player.nickname), started: false });
  }

  if (request.method === "GET" && url.pathname === "/api/rooms/status") {
    const code = String(url.searchParams.get("code") || "").trim().toUpperCase();
    const room = await getRoom(code);
    const playerId = String(url.searchParams.get("playerId") || "");
    if (!room) return sendJson(response, 404, { error: "room_not_found" });
    if (!room.players.some((player) => player.id === playerId)) return sendJson(response, 403, { error: "not_in_room" });
    if (!room.started) return sendJson(response, 200, { status: "waiting", code: room.code, size: room.size, players: room.players.map((player) => player.nickname) });
    const match = await getMatch(room.match.id) || room.match;
    const playerIndex = match.players.findIndex((player) => player.id === playerId);
    return sendJson(response, 200, { status: "matched", code: room.code, size: room.size, matchId: match.id, startWord: match.startWord, playerId, selfIndex: playerIndex, players: match.players.map((player) => player.nickname) });
  }

  if (request.method === "POST" && url.pathname === "/api/rooms/join") {
    const body = await readJson(request);
    const room = await getRoom(String(body.code || "").trim().toUpperCase());
    if (!room) return sendJson(response, 404, { error: "room_not_found" });
    if (room.players.length >= room.size) return sendJson(response, 409, { error: "room_full" });
    const playerId = randomUUID();
    room.players.push({ id: playerId, nickname: String(body.nickname || "플레이어").trim().slice(0, 12) });
    if (room.players.length >= room.size) {
      room.started = true;
      room.match = makeMatch(room.players, room.code);
      await saveMatch(room.match);
    }
    await saveRoom(room);
    const playerIndex = room.started ? room.match.players.findIndex((player) => player.id === playerId) : -1;
    return sendJson(response, 200, { code: room.code, size: room.size, playerId, players: room.players.map((player) => player.nickname), started: room.started, matchId: room.match?.id || null, startWord: room.match?.startWord || null, selfIndex: playerIndex });
  }

  return false;
}
