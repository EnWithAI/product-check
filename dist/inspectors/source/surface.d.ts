import { type RepoFacts } from "./facts.js";
export type SurfaceKind = "page" | "endpoint" | "entity" | "config" | "integration" | "auth-boundary" | "test";
/** One element of the product surface. */
export interface SurfaceItem {
    kind: SurfaceKind;
    /** Route path, entity name, variable name, package name or test title. */
    name: string;
    /** HTTP method for endpoints (`ANY` when the handler dispatches on method itself); null otherwise. */
    method: string | null;
    /** Grouping area: first meaningful route segment, or the entity/integration category. */
    area: string;
    /** Short human-readable detail (fields, category, matcher, how it was recognised). */
    detail: string;
    path: string;
    line: number | null;
    excerpt: string | null;
    certainty: "observed" | "inferred";
    /** Endpoints and pages whose source references a session or auth helper (inference). */
    auth_hint: boolean;
}
/** Everything derived about the surface. */
export interface ProductSurface {
    items: SurfaceItem[];
    /** Notes about what could not be determined (for the spec's uncertainties). */
    notes: string[];
}
/** The grouping area of a URL path: first static segment after an optional `api` prefix. */
export declare function areaOf(route: string): string;
/** Derives the product surface. */
export declare function deriveSurface(facts: RepoFacts): ProductSurface;
