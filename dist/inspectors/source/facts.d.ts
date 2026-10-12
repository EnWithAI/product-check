import type { RepoFile, RepoSnapshot } from "../../discovery/repo.js";
/** A dependency manifest (npm package.json or Python requirements/pyproject). */
export interface Manifest {
    path: string;
    ecosystem: "npm" | "python";
    deps: Record<string, string>;
    devDeps: Record<string, string>;
    scripts: Record<string, string>;
    engines: string | null;
    text: string;
}
/** A file location with an optional line. */
export interface Loc {
    path: string;
    line: number | null;
    detail: string;
}
/** Everything derived from the repository. */
export interface RepoFacts {
    snapshot: RepoSnapshot;
    manifests: Manifest[];
    /** package.json files that are not valid JSON. */
    malformedManifests: string[];
    lockfiles: string[];
    deps: Map<string, {
        version: string;
        manifest: string;
        dev: boolean;
    }>;
    frameworks: string[];
    testFiles: string[];
    e2eFiles: string[];
    testScripts: Loc[];
    ciFiles: RepoFile[];
    readme: RepoFile | null;
    runtimeDecl: Loc[];
    staticAnalysis: Loc[];
    observability: string[];
    dbDeps: string[];
    migrations: string[];
    authDeps: string[];
    aiDeps: string[];
    aiEvals: string[];
    hosting: string[];
    headerConfig: Loc[];
    notFoundPages: string[];
    privacyPages: string[];
    securityPolicy: string[];
    envFiles: RepoFile[];
    gitignore: RepoFile | null;
    markupFiles: RepoFile[];
    codeFiles: RepoFile[];
    appRouter: boolean;
}
/** 1-based line number of a character index. */
export declare function lineOf(text: string, index: number): number;
/** The text of the given 1-based line. */
export declare function lineText(text: string, line: number): string;
/** Derives repository facts. */
export declare function deriveFacts(snapshot: RepoSnapshot): RepoFacts;
