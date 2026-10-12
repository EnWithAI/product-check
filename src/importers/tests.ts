// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Imports test results the user already produced: JUnit XML (Jest/Vitest/Playwright/pytest/Go reporters) and
 * Jest/Vitest JSON. Product Check never runs a repository's tests itself (that would execute untrusted code);
 * imported results are evidence of an execution that happened elsewhere.
 */
import { inputError } from "../errors.js";

export type CaseStatus = "passed" | "failed" | "skipped";

/** One executed test case. */
export interface TestCase {
  name: string;
  file: string | null;
  status: CaseStatus;
}

/** A parsed results file. */
export interface TestRun {
  source: string;
  format: "junit" | "jest-json";
  cases: TestCase[];
  sha256: string;
}

/** Decodes XML entities in attribute values. */
function xmlDecode(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Reads an attribute from a tag's attribute string. */
function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(attrs);
  return m ? xmlDecode(m[2] ?? m[3] ?? "") : null;
}

/** Parses JUnit XML: <testcase> elements anywhere (inside <testsuite> or directly under <testsuites>). */
export function parseJUnit(xml: string, source: string, sha: string): TestRun {
  if (!/<testsuites?\b/.test(xml))
    throw inputError(`${source} does not look like JUnit XML (no <testsuite(s)>).`);
  const cases: TestCase[] = [];
  const suites = [...xml.matchAll(/<testsuite\b([^>]*?)\/?>/g)].map((m) => ({
    index: m.index ?? 0,
    file: attr(m[1] ?? "", "file") ?? attr(m[1] ?? "", "name"),
  }));
  for (const tc of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attrs = tc[1] ?? "";
    const inner = tc[3] ?? "";
    const name = attr(attrs, "name") ?? "(unnamed)";
    const classname = attr(attrs, "classname");
    const suiteFile = suites.filter((x) => x.index < (tc.index ?? 0)).at(-1)?.file ?? null;
    const failed = /<(failure|error)\b/.test(inner) || attr(attrs, "failure") !== null;
    const status: CaseStatus = failed ? "failed" : /<skipped\b/.test(inner) ? "skipped" : "passed";
    const prefix = classname && classname !== "test" && !name.startsWith(classname) ? `${classname} › ` : "";
    cases.push({ name: `${prefix}${name}`, file: attr(attrs, "file") ?? suiteFile, status });
    if (cases.length > 100_000) throw inputError(`${source}: more than 100,000 test cases.`);
  }
  return { source, format: "junit", cases, sha256: sha };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Parses Jest/Vitest JSON reporter output. */
export function parseJestJson(data: unknown, source: string, sha: string): TestRun {
  if (!isObj(data) || !Array.isArray(data["testResults"]))
    throw inputError(`${source} is not Jest/Vitest JSON (missing testResults).`);
  const cases: TestCase[] = [];
  for (const file of data["testResults"]) {
    if (!isObj(file)) continue;
    const path = typeof file["name"] === "string" ? file["name"] : null;
    const assertions = Array.isArray(file["assertionResults"]) ? file["assertionResults"] : [];
    for (const a of assertions) {
      if (!isObj(a)) continue;
      const status = a["status"] === "passed" ? "passed" : a["status"] === "failed" ? "failed" : "skipped";
      const name =
        typeof a["fullName"] === "string"
          ? a["fullName"]
          : typeof a["title"] === "string"
            ? a["title"]
            : "(unnamed)";
      cases.push({ name, file: path, status });
    }
    if (assertions.length === 0 && file["status"] === "failed")
      cases.push({ name: "(suite failed to run)", file: path, status: "failed" });
  }
  return { source, format: "jest-json", cases, sha256: sha };
}

/** Detects the format and parses a results file. */
export function parseTestResults(text: string, source: string, sha: string): TestRun {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) return parseJUnit(text, source, sha);
  try {
    return parseJestJson(JSON.parse(text), source, sha);
  } catch (error) {
    if ((error as Error).name === "ProductCheckError") throw error;
    throw inputError(`${source} is neither JUnit XML nor Jest/Vitest JSON.`);
  }
}

/** True for cases that look like end-to-end tests (by file path or name). */
export function isEndToEnd(c: TestCase): boolean {
  return /(^|[/\\._-])(e2e|playwright|cypress|journeys?|acceptance)([/\\._-]|$)/i.test(
    `${c.file ?? ""} ${c.name}`
  );
}

/** Counts by status. */
export function tally(cases: TestCase[]): Record<CaseStatus, number> {
  const out: Record<CaseStatus, number> = { passed: 0, failed: 0, skipped: 0 };
  for (const c of cases) out[c.status]++;
  return out;
}
