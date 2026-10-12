// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The passive HTTP probe against a local server: GET only, fixed paths, request budget, same-origin redirects,
 * exposure probe only when authorized, errors recorded as observations, and the full CLI flow over the network.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXPOSURE_PATHS, probe } from "../src/inspectors/http/fetch.js";
import { cli, NOW, readJson, tempFiles } from "./helpers.js";
import type { Results } from "../src/types.js";
import { join } from "node:path";

let server: Server;
let origin = "";
const seen: { method: string; url: string; headers: IncomingMessage["headers"]; body: number }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = 0;
    req.on("data", (c: Buffer) => (body += c.length));
    req.on("end", () => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });
      if (req.url === "/") return res.writeHead(302, { location: "/home" }).end();
      if (req.url === "/home") {
        res.writeHead(200, {
          "content-type": "text/html",
          "x-powered-by": "Express",
          "set-cookie": "sid=secretvalue; Path=/",
        });
        return res.end(
          '<html><head><title>Create Next App</title></head><body><img src=a><a href="https://evil.example/privacy">p</a></body></html>'
        );
      }
      if (req.url === "/away") return res.writeHead(302, { location: "https://elsewhere.invalid/" }).end();
      if (req.url === "/.env") return res.writeHead(200, { "content-type": "text/plain" }).end("SECRET=1\n");
      if (req.url === "/slow") return setTimeout(() => res.end("late"), 3000);
      res.writeHead(404, { "content-type": "text/plain" }).end("nope");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("passive probe", () => {
  it("sends only bodiless GETs without credentials and follows same-origin redirects", async () => {
    seen.length = 0;
    const result = await probe({
      url: `${origin}/`,
      maxRequests: 12,
      timeoutMs: 2000,
      exposureProbe: false,
      now: () => NOW,
    });
    expect(
      seen.every((r) => r.method === "GET" && r.body === 0 && !r.headers.cookie && !r.headers.authorization)
    ).toBe(true);
    expect(seen.map((r) => r.url)).toEqual([
      "/",
      "/home",
      expect.stringMatching(/^\/product-check-not-found-/),
      "/robots.txt",
      "/.well-known/security.txt",
    ]);
    // the privacy link points to another origin, so it is not requested; /privacy is not guessed either
    expect(result.requests).toBe(5);
    const landing = result.observations.filter((o) => o.purpose === "landing").at(-1);
    expect(landing?.status).toBe(200);
    expect(landing?.headers["set-cookie"]).toBe("sid=[REDACTED]; Path=/");
    expect(JSON.stringify(result)).not.toContain("secretvalue");
    expect(result.observations.some((o) => o.purpose.startsWith("exposure:"))).toBe(false);
  });

  it("never follows a redirect to another origin", async () => {
    seen.length = 0;
    const result = await probe({
      url: `${origin}/away`,
      maxRequests: 12,
      timeoutMs: 2000,
      exposureProbe: false,
      now: () => NOW,
    });
    expect(result.observations[0]?.redirect_location).toBe("https://elsewhere.invalid/");
    expect(result.observations.filter((o) => o.purpose === "landing")).toHaveLength(1);
  });

  it("probes sensitive paths only when authorized and honours the request budget", async () => {
    const result = await probe({
      url: `${origin}/`,
      maxRequests: 7,
      timeoutMs: 2000,
      exposureProbe: true,
      now: () => NOW,
    });
    expect(result.requests).toBe(7);
    expect(result.skipped.length).toBe(EXPOSURE_PATHS.length - 2);
    const env = result.observations.find((o) => o.purpose === "exposure:/.env");
    expect(env?.exposure).toEqual({ looks_sensitive: true, signature: "env-assignments" });
  });

  it("records timeouts and refused connections as errors instead of failing", async () => {
    const slow = await probe({
      url: `${origin}/slow`,
      maxRequests: 1,
      timeoutMs: 500,
      exposureProbe: false,
      now: () => NOW,
    });
    expect(slow.observations[0]?.status).toBeNull();
    expect(slow.observations[0]?.error).toMatch(/Timeout|Abort/);
    const refused = await probe({
      url: "http://127.0.0.1:9/",
      maxRequests: 1,
      timeoutMs: 1000,
      exposureProbe: false,
      now: () => NOW,
    });
    expect(refused.observations[0]?.error).toBeTruthy();
  });

  it("CLI: an authorized live scan evaluates application controls and records observations", async () => {
    const dir = tempFiles({});
    const r = await cli(
      [
        "run",
        "--url",
        `${origin}/`,
        "--authorize",
        "passive-http,exposure-probe",
        "--stage",
        "PRE_LAUNCH",
        "--record-observations",
        "obs.json",
        "--out-dir",
        "out",
        "--quiet",
      ],
      dir
    );
    expect(r.code, r.stderr).toBe(0);
    const results = readJson<Results>(join(dir, "out/product-check-results.json"));
    expect(results.run.network.used).toBe(true);
    expect(results.run.mode_effective).toBe("APPLICATION");
    const status = (id: string) => results.validations.find((v) => v.control_id === id)?.status;
    expect(status("PC-S-09")).toBe("FAIL");
    expect(status("PC-C-05")).toBe("FAIL");
    expect(status("PC-S-10")).toBe("FAIL");
    expect(status("PC-S-01")).toBe("BLOCKED");
    expect(results.contract.authorization.attestation?.authorized_by).toBe("local CLI user");
    expect(readJson<{ kind: string }>(join(dir, "obs.json")).kind).toBe("observations");
    // A run against an unreachable origin is PARTIAL, not a crash.
    const down = await cli(
      ["run", "--url", "http://127.0.0.1:9/", "--authorize", "passive-http", "--json", "--quiet"],
      dir
    );
    expect(down.code).toBe(0);
    const d = JSON.parse(down.stdout) as Results;
    expect(d.run.status).toBe("PARTIAL");
    expect(d.validations.find((v) => v.control_id === "PC-C-01")?.status).toBe("FAIL");
  });
});
