// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * A local stand-in "deployment" of the SYNTHETIC Vibe Notes demo app, listening on 127.0.0.1 only. It reproduces
 * the behaviour of the baseline (weak) or remediated build so Product Check's passive probe and the demo app's
 * tests have something real to talk to. It is not a real product and holds no real data.
 *
 *   node serve.mjs [--version baseline|remediated] [--port 4785]
 */
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

export const PORT = 4785;

/** Starts the server; resolves with a close() function. */
export function startServer(version = "baseline", port = PORT) {
  const fixed = version === "remediated";
  const users = new Map();
  const notes = new Map();
  let nextId = 1;
  const security = fixed
    ? {
        "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
      }
    : { "x-powered-by": "Next.js" };
  const page = (title, body) =>
    `<!doctype html><html${fixed ? ' lang="en"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body>${body}</body></html>`;
  const send = (res, status, body, type = "text/html; charset=utf-8", extra = {}) => {
    res.writeHead(status, { "content-type": type, ...security, ...extra });
    res.end(body);
  };
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj), "application/json");
  const readBody = (req) =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        try {
          resolve(JSON.parse(data || "{}"));
        } catch {
          resolve({});
        }
      });
    });
  const userOf = (req) => users.get((req.headers.authorization ?? "").replace(/^Bearer /, "")) ?? null;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const path = url.pathname;
    if (req.method === "GET" && path === "/") {
      return send(
        res,
        200,
        page(
          fixed ? "Vibe Notes: private notes with AI summaries" : "Create Next App",
          `<main><img src="/hero.png"${fixed ? ' alt="A notebook with highlighted notes"' : ""}><h1>Vibe Notes</h1>${fixed ? '<footer><a href="/privacy">Privacy</a></footer>' : ""}</main>`
        ),
        "text/html; charset=utf-8",
        { "set-cookie": fixed ? "session=demo; Path=/; HttpOnly; SameSite=Lax" : "session=demo; Path=/" }
      );
    }
    if (path === "/robots.txt") return send(res, 200, "User-agent: *\nAllow: /\n", "text/plain");
    if (path === "/.well-known/security.txt")
      return fixed
        ? send(res, 200, "Contact: mailto:security@vibenotes-demo.example\n", "text/plain")
        : send(res, 404, page("404", "Not found"));
    if (path === "/privacy")
      return fixed
        ? send(res, 200, page("Privacy | Vibe Notes", "<p>How we handle your notes.</p>"))
        : send(res, 404, page("404", "Not found"));
    if (path === "/.env" && !fixed)
      return send(
        res,
        200,
        "NEXT_PUBLIC_SUPABASE_URL=https://vibenotesdemo.supabase.example\nSTRIPE_SECRET_KEY=(synthetic)\n",
        "text/plain"
      );
    if (path.startsWith("/.env") || path.startsWith("/.git")) return send(res, 404, page("404", "Not found"));
    if (path === "/api/signup" && req.method === "POST") {
      const { email } = await readBody(req);
      const token = `t${users.size + 1}`;
      users.set(token, { id: `u${users.size + 1}`, email });
      return json(res, 201, { token });
    }
    if (path === "/api/notes" && req.method === "POST") {
      const user = userOf(req);
      if (!user) return json(res, 401, { error: "unauthorized" });
      const id = String(nextId++);
      notes.set(id, { owner: user.id, text: (await readBody(req)).text });
      return json(res, 201, { id });
    }
    const m = /^\/api\/notes\/([^/]+)$/.exec(path);
    if (m) {
      const user = userOf(req);
      const note = notes.get(m[1]);
      if (fixed && !user) return json(res, 401, { error: "unauthorized" });
      if (!note) return json(res, 404, { error: "not found" });
      if (fixed && note.owner !== user.id) return json(res, 403, { error: "forbidden" });
      if (req.method === "DELETE") {
        notes.delete(m[1]);
        return json(res, 204, {});
      }
      return json(res, 200, note);
    }
    // The baseline build answers every unknown path with the app shell (a "soft 404").
    return fixed
      ? send(res, 404, page("Page not found | Vibe Notes", "<p>Page not found.</p>"))
      : send(res, 200, page("Create Next App", "<main></main>"));
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({ close: () => new Promise((r) => server.close(() => r())) })
    );
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv.includes("--version")
    ? process.argv[process.argv.indexOf("--version") + 1]
    : "baseline";
  const port = process.argv.includes("--port")
    ? Number(process.argv[process.argv.indexOf("--port") + 1])
    : PORT;
  await startServer(version, port);
  console.log(`Synthetic Vibe Notes (${version}) on http://127.0.0.1:${port} — Ctrl+C to stop`);
}
