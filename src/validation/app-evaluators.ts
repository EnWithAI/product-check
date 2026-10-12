// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Application evaluators: black-box checks over passive HTTP observations (live, recorded or HAR). They return
 * null when no application observations exist; the engine then reports the control as BLOCKED or NOT_TESTED with
 * the reason recorded for the deployed-web point of presence.
 */
import type { Observation } from "../inspectors/http/observe.js";
import { STARTER_TITLES } from "../inspectors/http/observe.js";
import {
  checked,
  unchecked,
  type EvalContext,
  type Evaluator,
  type FindingDraft,
  type Outcome,
} from "./context.js";

/** Evidence for one observation. */
function obsEv(ctx: EvalContext, o: Observation, summary: string, excerpt: string | null = null): string {
  return ctx.ev.add({
    kind: "http-response",
    pop: "deployed-web",
    strength: ctx.app?.source === "har" ? "imported-report" : "runtime",
    provenance: ctx.app?.source === "live" ? "observed" : "imported",
    locator: `${o.method} ${o.url}`,
    revision: null,
    summary: `${summary} (status ${o.status ?? "none"}${o.timing_ms !== null ? `, ${o.timing_ms} ms` : ""}, observed ${o.requested_at})`,
    excerpt,
    checksum: o.body_sha256,
  });
}

const strengthOf = (ctx: EvalContext) =>
  (ctx.app?.source === "har" ? "imported-report" : "runtime") as "runtime" | "imported-report";
const methodOf = (ctx: EvalContext) =>
  (ctx.app?.source === "har" ? "imported-report" : "passive-http") as "passive-http" | "imported-report";

/** The final landing observation (after redirects), if any. */
function landing(ctx: EvalContext): Observation | null {
  return ctx.app?.observations.filter((o) => o.purpose === "landing").at(-1) ?? null;
}

/** Wraps an evaluator that needs a landing page. */
const withLanding =
  (fn: (ctx: EvalContext, page: Observation) => Outcome | null): Evaluator =>
  (ctx) => {
    if (!ctx.app) return null;
    const page = landing(ctx);
    if (!page) return unchecked("NOT_TESTED", "No landing-page observation was recorded.");
    return fn(ctx, page);
  };

/** True for loopback development servers, where HTTPS is normally terminated elsewhere. */
export const isLoopback = (url: string): boolean =>
  /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?(\/|$)/i.test(url);

const ok2xx = (o: Observation | null | undefined): boolean =>
  !!o && o.status !== null && o.status >= 200 && o.status < 300;

/** One finding for an application-level weakness. */
function appFinding(
  ctx: EvalContext,
  o: Observation,
  fingerprint: string,
  actual: string,
  evidence: string[],
  extra: Partial<FindingDraft> = {}
): FindingDraft {
  const origin = new URL(o.url).origin;
  return {
    fingerprint: `${origin}|${fingerprint}`,
    location: o.url,
    actual,
    evidence,
    epistemic: "fact",
    confidence: ctx.app?.source === "har" ? "MEDIUM" : "HIGH",
    reproducibility: "single-observation",
    reproduction: [`curl -sSI ${o.url}`],
    ...extra,
  };
}

/** Header-presence check shared by several controls. */
function headerCheck(
  ctx: EvalContext,
  page: Observation,
  name: string,
  test: (value: string | undefined, page: Observation) => "PASS" | "PARTIAL" | "FAIL",
  describe: (value: string | undefined) => string,
  title: string
): Outcome {
  const value = page.headers[name];
  const status = test(value, page);
  const id = obsEv(ctx, page, `${name}: ${value === undefined ? "(absent)" : value.slice(0, 200)}`);
  const actual = describe(value);
  if (status === "PASS")
    return checked(
      "PASS",
      actual,
      methodOf(ctx),
      strengthOf(ctx),
      [id],
      [],
      [`curl -sSI ${page.url} | grep -i ${name}`]
    );
  return checked(
    status,
    actual,
    methodOf(ctx),
    strengthOf(ctx),
    [id],
    [
      appFinding(ctx, page, name, actual, [id], {
        title,
        ...(status === "PARTIAL" ? { severity: "P3" as const } : {}),
      }),
    ],
    [`curl -sSI ${page.url} | grep -i ${name}`]
  );
}

const PC_C_01: Evaluator = (ctx) => {
  if (!ctx.app) return null;
  const hops = ctx.app.observations.filter((o) => o.purpose === "landing");
  const page = hops.at(-1);
  if (!page) return unchecked("NOT_TESTED", "No landing-page observation was recorded.");
  const ids = hops.map((o) =>
    obsEv(ctx, o, `landing request${o.redirect_location ? ` → ${o.redirect_location}` : ""}`)
  );
  const https = page.url.startsWith("https://") || isLoopback(page.url);
  if (ok2xx(page) && https)
    return checked(
      "PASS",
      `Entry page answered ${page.status}${isLoopback(page.url) ? " (local development server; HTTPS not assessed)" : " over HTTPS"}.`,
      methodOf(ctx),
      strengthOf(ctx),
      ids,
      [],
      [`curl -sSL -o /dev/null -w '%{http_code}' ${page.url}`]
    );
  const actual = page.error
    ? `Request failed: ${page.error}.`
    : !https && ok2xx(page)
      ? "Entry page is served over plain HTTP."
      : `Entry page answered ${page.status ?? "nothing"}.`;
  return checked("FAIL", actual, methodOf(ctx), strengthOf(ctx), ids, [
    appFinding(ctx, page, "reachability", actual, ids, {
      title: page.error
        ? "Application unreachable"
        : https
          ? `Entry page returns ${page.status ?? "an error"}`
          : "Application served over plain HTTP",
    }),
  ]);
};

const PC_C_02: Evaluator = withLanding((ctx, page) => {
  if (!page.html) return unchecked("NOT_TESTED", "The landing response was not HTML.");
  const id = obsEv(ctx, page, `<html lang>: ${page.html.lang ?? "(absent)"}`);
  if (page.html.lang)
    return checked("PASS", `lang="${page.html.lang}".`, methodOf(ctx), strengthOf(ctx), [id]);
  return checked(
    "FAIL",
    "The served page has no lang attribute.",
    methodOf(ctx),
    strengthOf(ctx),
    [id],
    [
      appFinding(ctx, page, "lang", "Served <html> has no lang attribute.", [id], {
        title: "Served page does not declare its language",
      }),
    ]
  );
});

const PC_C_03: Evaluator = withLanding((ctx, page) => {
  if (!page.html) return unchecked("NOT_TESTED", "The landing response was not HTML.");
  const id = obsEv(ctx, page, `viewport meta: ${page.html.has_viewport ? "present" : "absent"}`);
  if (page.html.has_viewport)
    return checked("PASS", "Viewport meta tag present.", methodOf(ctx), strengthOf(ctx), [id]);
  return checked(
    "FAIL",
    "No viewport meta tag on the served page.",
    methodOf(ctx),
    strengthOf(ctx),
    [id],
    [
      appFinding(ctx, page, "viewport", "No viewport meta tag.", [id], {
        title: "Served page is not configured for mobile",
      }),
    ]
  );
});

const PC_C_04: Evaluator = withLanding((ctx, page) => {
  if (!page.html) return unchecked("NOT_TESTED", "The landing response was not HTML.");
  if (page.html.img_total === 0)
    return unchecked(
      "NOT_TESTED",
      "The served landing page has no <img> elements (client-rendered images are not observed)."
    );
  const id = obsEv(ctx, page, `${page.html.img_missing_alt} of ${page.html.img_total} <img> without alt`);
  if (page.html.img_missing_alt === 0)
    return checked(
      "PASS",
      `All ${page.html.img_total} served image(s) have alt (landing page only).`,
      methodOf(ctx),
      strengthOf(ctx),
      [id]
    );
  return checked(
    "FAIL",
    `${page.html.img_missing_alt} of ${page.html.img_total} served image(s) lack alt (landing page only).`,
    methodOf(ctx),
    strengthOf(ctx),
    [id],
    [
      appFinding(ctx, page, "img-alt", `${page.html.img_missing_alt} image(s) without alt.`, [id], {
        title: "Served images lack text alternatives",
      }),
    ]
  );
});

const PC_C_05: Evaluator = withLanding((ctx, page) => {
  if (!page.html) return unchecked("NOT_TESTED", "The landing response was not HTML.");
  const title = page.html.title;
  const id = obsEv(ctx, page, `<title>: ${title ?? "(absent)"}`);
  if (!title)
    return checked(
      "FAIL",
      "The entry page has no title.",
      methodOf(ctx),
      strengthOf(ctx),
      [id],
      [appFinding(ctx, page, "title", "No <title>.", [id], { title: "Entry page has no title" })]
    );
  if (STARTER_TITLES.includes(title.toLowerCase())) {
    return checked(
      "FAIL",
      `The title is a starter-template default ("${title}").`,
      methodOf(ctx),
      strengthOf(ctx),
      [id],
      [
        appFinding(ctx, page, "title", `Starter-template title "${title}".`, [id], {
          title: "Entry page still has the starter-template title",
        }),
      ]
    );
  }
  return checked("PASS", `Title: "${title}".`, methodOf(ctx), strengthOf(ctx), [id]);
});

const PC_C_06: Evaluator = (ctx) => {
  const o = ctx.app?.observations.find((x) => x.purpose === "not-found");
  if (!ctx.app) return null;
  if (!o || o.status === null)
    return unchecked(
      "NOT_TESTED",
      o?.error ? `Not-found probe failed: ${o.error}` : "No not-found probe was recorded."
    );
  const id = obsEv(ctx, o, "request for a path that does not exist");
  if (o.status === 404 || o.status === 410)
    return checked(
      "PASS",
      `Unknown path answered ${o.status}.`,
      methodOf(ctx),
      strengthOf(ctx),
      [id],
      [],
      [`curl -s -o /dev/null -w '%{http_code}' ${o.url}`]
    );
  return checked(
    "FAIL",
    `Unknown path answered ${o.status} instead of 404.`,
    methodOf(ctx),
    strengthOf(ctx),
    [id],
    [
      appFinding(ctx, o, "soft-404", `Unknown path answered ${o.status}.`, [id], {
        title: `Unknown URLs answer ${o.status} (soft 404)`,
      }),
    ],
    [`curl -s -o /dev/null -w '%{http_code}' ${o.url}`]
  );
};

const PC_C_07: Evaluator = withLanding((ctx, page) => {
  if (page.timing_ms === null || !ok2xx(page))
    return unchecked("NOT_TESTED", "No successful timed landing response.");
  const id = obsEv(ctx, page, `entry page response time ${page.timing_ms} ms (single sample)`);
  if (page.timing_ms <= 2500)
    return checked(
      "PASS",
      `${page.timing_ms} ms (single sample; network conditions of the scanning machine apply).`,
      methodOf(ctx),
      strengthOf(ctx),
      [id]
    );
  return checked(
    page.timing_ms > 5000 ? "FAIL" : "PARTIAL",
    `${page.timing_ms} ms (single sample).`,
    methodOf(ctx),
    strengthOf(ctx),
    [id],
    [
      appFinding(ctx, page, "latency", `Entry page took ${page.timing_ms} ms.`, [id], {
        title: "Entry page responds slowly",
        confidence: "LOW",
        ...(page.timing_ms > 5000 ? {} : { severity: "P3" as const }),
      }),
    ]
  );
});

const PC_S_04: Evaluator = withLanding((ctx, page) => {
  if (isLoopback(page.url))
    return unchecked(
      "NOT_TESTED",
      "Local development server: HTTPS and HSTS are set by the production edge and cannot be assessed on a loopback origin."
    );
  if (!page.url.startsWith("https://")) {
    const id = obsEv(ctx, page, "entry page served over HTTP");
    return checked(
      "FAIL",
      "The application is served over plain HTTP.",
      methodOf(ctx),
      strengthOf(ctx),
      [id],
      [appFinding(ctx, page, "https", "Served over plain HTTP.", [id], { title: "HTTPS not enforced" })]
    );
  }
  const hsts = page.headers["strict-transport-security"];
  const maxAge = Number(/max-age=(\d+)/i.exec(hsts ?? "")?.[1] ?? "0");
  const http = ctx.app?.observations.find((o) => o.purpose === "http-redirect");
  const ids = [obsEv(ctx, page, `strict-transport-security: ${hsts ?? "(absent)"}`)];
  let redirects: boolean | null = null;
  if (http && http.status !== null) {
    ids.push(obsEv(ctx, http, `plain-HTTP request → ${http.redirect_location ?? "(no redirect)"}`));
    redirects =
      http.status >= 300 && http.status < 400 && (http.redirect_location ?? "").startsWith("https://");
  }
  const hstsOk = maxAge >= 15552000;
  if (hstsOk && redirects !== false)
    return checked(
      "PASS",
      `HSTS max-age=${maxAge}${redirects ? "; HTTP redirects to HTTPS" : ""}.`,
      methodOf(ctx),
      strengthOf(ctx),
      ids
    );
  const problems = [
    hstsOk ? null : hsts ? `HSTS max-age too short (${maxAge})` : "no Strict-Transport-Security header",
    redirects === false ? "plain HTTP does not redirect to HTTPS" : null,
  ]
    .filter(Boolean)
    .join("; ");
  return checked(hstsOk || redirects ? "PARTIAL" : "FAIL", problems, methodOf(ctx), strengthOf(ctx), ids, [
    appFinding(ctx, page, "hsts", problems, ids, { title: "HTTPS is not fully enforced" }),
  ]);
});

const PC_S_05: Evaluator = withLanding((ctx, page) => {
  const csp = page.headers["content-security-policy"] ?? page.html?.meta_csp ?? undefined;
  return headerCheck(
    ctx,
    { ...page, headers: { ...page.headers, "content-security-policy": csp as string } },
    "content-security-policy",
    (v) =>
      v === undefined
        ? "FAIL"
        : /script-src[^;]*'unsafe-inline'/.test(v) && !/'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(v)
          ? "PARTIAL"
          : "PASS",
    (v) =>
      v === undefined
        ? "No Content-Security-Policy header or meta tag."
        : /'unsafe-inline'/.test(v)
          ? "CSP present but allows inline scripts."
          : "Content-Security-Policy present.",
    "No Content Security Policy"
  );
});

const PC_S_06: Evaluator = withLanding((ctx, page) =>
  headerCheck(
    ctx,
    page,
    "x-frame-options",
    (v, p) =>
      /frame-ancestors/.test(p.headers["content-security-policy"] ?? "") ||
      /^(deny|sameorigin)$/i.test((v ?? "").trim())
        ? "PASS"
        : "FAIL",
    (v) =>
      v
        ? `X-Frame-Options: ${v}.`
        : /frame-ancestors/.test(page.headers["content-security-policy"] ?? "")
          ? "CSP frame-ancestors present."
          : "No X-Frame-Options and no CSP frame-ancestors.",
    "Pages can be framed by other sites (clickjacking)"
  )
);

const PC_S_07: Evaluator = withLanding((ctx, page) =>
  headerCheck(
    ctx,
    page,
    "x-content-type-options",
    (v) => (/nosniff/i.test(v ?? "") ? "PASS" : "FAIL"),
    (v) => (v ? `X-Content-Type-Options: ${v}.` : "No X-Content-Type-Options header."),
    "MIME sniffing not disabled"
  )
);

const PC_S_08: Evaluator = (ctx) => {
  if (!ctx.app) return null;
  const withCookies = ctx.app.observations.filter((o) => o.headers["set-cookie"] !== undefined);
  if (withCookies.length === 0)
    return unchecked(
      "NOT_TESTED",
      "No cookies were set on passive, unauthenticated requests; authenticated flows were not exercised."
    );
  const problems: string[] = [];
  const ids: string[] = [];
  for (const o of withCookies) {
    ids.push(obsEv(ctx, o, "set-cookie attributes (values redacted)", o.headers["set-cookie"] ?? null));
    for (const cookie of (o.headers["set-cookie"] ?? "").split("\n")) {
      const name = cookie.split("=")[0] ?? "";
      const missing = [
        /;\s*secure/i.test(cookie) || !o.url.startsWith("https://") ? null : "Secure",
        /;\s*samesite=/i.test(cookie) ? null : "SameSite",
        /sess|auth|token|sid/i.test(name) && !/;\s*httponly/i.test(cookie) ? "HttpOnly" : null,
      ].filter(Boolean);
      if (missing.length > 0) problems.push(`${name} missing ${missing.join(", ")}`);
    }
  }
  const page = withCookies[0] as Observation;
  if (problems.length === 0)
    return checked(
      "PASS",
      "All observed cookies have the expected attributes.",
      methodOf(ctx),
      strengthOf(ctx),
      ids
    );
  return checked("FAIL", problems.join("; "), methodOf(ctx), strengthOf(ctx), ids, [
    appFinding(ctx, page, "cookies", problems.join("; "), ids, { title: "Cookies lack security attributes" }),
  ]);
};

const PC_S_09: Evaluator = (ctx) => {
  if (!ctx.app) return null;
  const probes = ctx.app.observations.filter((o) => o.purpose.startsWith("exposure:"));
  if (probes.length === 0) {
    return unchecked(
      "NOT_TESTED",
      ctx.exposureAuthorized
        ? "Exposure probe authorized but no probe results were recorded."
        : "Exposure probe not authorized (add the exposure-probe action to probe /.env and /.git paths)."
    );
  }
  const ids = probes.map((o) =>
    obsEv(
      ctx,
      o,
      `exposure probe ${new URL(o.url).pathname}: ${o.exposure?.looks_sensitive ? `SENSITIVE CONTENT (${o.exposure.signature ?? ""})` : "not exposed"}`
    )
  );
  const exposed = probes.filter((o) => o.exposure?.looks_sensitive);
  if (exposed.length === 0)
    return checked(
      "PASS",
      `${probes.length} sensitive path(s) probed; none served sensitive content.`,
      "exposure-probe",
      strengthOf(ctx),
      ids
    );
  const findings = exposed.map((o) =>
    appFinding(
      ctx,
      o,
      `exposed:${new URL(o.url).pathname}`,
      `${new URL(o.url).pathname} is publicly served and looks like ${o.exposure?.signature ?? "sensitive content"}. Content was not stored.`,
      [ids[probes.indexOf(o)] as string],
      {
        title: `Sensitive file publicly served: ${new URL(o.url).pathname}`,
        reproduction: [`curl -s -o /dev/null -w '%{http_code}' ${o.url}`],
      }
    )
  );
  return checked(
    "FAIL",
    `${exposed.length} sensitive file(s) publicly served.`,
    "exposure-probe",
    strengthOf(ctx),
    ids,
    findings
  );
};

const PC_S_10: Evaluator = withLanding((ctx, page) => {
  const powered = page.headers["x-powered-by"];
  const server = page.headers["server"];
  const id = obsEv(ctx, page, `x-powered-by: ${powered ?? "(absent)"}; server: ${server ?? "(absent)"}`);
  const problems = [
    powered ? `X-Powered-By: ${powered}` : null,
    server && /\d+\.\d+/.test(server) ? `Server: ${server}` : null,
  ].filter(Boolean) as string[];
  if (problems.length === 0)
    return checked("PASS", "No stack or version disclosure in headers.", methodOf(ctx), strengthOf(ctx), [
      id,
    ]);
  return checked(
    "FAIL",
    problems.join("; "),
    methodOf(ctx),
    strengthOf(ctx),
    [id],
    [appFinding(ctx, page, "disclosure", problems.join("; "), [id], { title: "Server advertises its stack" })]
  );
});

const PC_S_12: Evaluator = (ctx) => {
  if (!ctx.app) return null;
  if (ctx.contract.product.handles_personal_data === false)
    return unchecked("NOT_APPLICABLE", "The contract declares that no personal data is handled.");
  const page = landing(ctx);
  const privacy = ctx.app.observations.find((o) => o.purpose === "privacy");
  const ids: string[] = [];
  if (page?.html)
    ids.push(obsEv(ctx, page, `privacy link on entry page: ${page.html.privacy_link ?? "(none)"}`));
  if (privacy) ids.push(obsEv(ctx, privacy, `privacy page request`));
  if (ids.length === 0) return unchecked("NOT_TESTED", "No HTML entry page or privacy request was observed.");
  if (ok2xx(privacy) && !/not.?found/i.test(privacy?.html?.title ?? ""))
    return checked(
      "PASS",
      `Privacy notice reachable at ${privacy?.url ?? ""}.`,
      methodOf(ctx),
      strengthOf(ctx),
      ids
    );
  if (page?.html?.privacy_link && !privacy)
    return checked(
      "PARTIAL",
      `Entry page links to ${page.html.privacy_link} (not requested).`,
      methodOf(ctx),
      strengthOf(ctx),
      ids,
      [
        appFinding(ctx, page, "privacy-unverified", "Privacy link present but not verified.", ids, {
          severity: "P3",
          title: "Privacy link not verified",
        }),
      ]
    );
  return checked(
    "FAIL",
    "No privacy link on the entry page and no privacy page found.",
    methodOf(ctx),
    strengthOf(ctx),
    ids,
    [
      appFinding(ctx, page ?? (privacy as Observation), "privacy", "No reachable privacy notice.", ids, {
        title: "No privacy notice reachable",
      }),
    ]
  );
};

/** Application evaluators by control ID. */
export const APP_EVALUATORS: Record<string, Evaluator> = {
  "PC-C-01": PC_C_01,
  "PC-C-02": PC_C_02,
  "PC-C-03": PC_C_03,
  "PC-C-04": PC_C_04,
  "PC-C-05": PC_C_05,
  "PC-C-06": PC_C_06,
  "PC-C-07": PC_C_07,
  "PC-S-04": PC_S_04,
  "PC-S-05": PC_S_05,
  "PC-S-06": PC_S_06,
  "PC-S-07": PC_S_07,
  "PC-S-08": PC_S_08,
  "PC-S-09": PC_S_09,
  "PC-S-10": PC_S_10,
  "PC-S-12": PC_S_12,
};
