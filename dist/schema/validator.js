// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * A small JSON Schema 2020-12 validator for the keyword subset Product Check's schemas use, so the CLI can
 * validate artifacts without runtime dependencies. Tests cross-check its verdicts against Ajv on every example
 * and on mutated invalid documents. Unsupported keywords throw at schema-load time instead of being ignored.
 */
import { readdirSync, readFileSync } from "node:fs";
const SUPPORTED = new Set([
    "$schema",
    "$id",
    "$ref",
    "$defs",
    "$comment",
    "title",
    "description",
    "examples",
    "default",
    "deprecated",
    "type",
    "enum",
    "const",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "minItems",
    "maxItems",
    "uniqueItems",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "minLength",
    "maxLength",
    "pattern",
    "format",
    "oneOf",
    "anyOf",
    "allOf",
    "not",
    "if",
    "then",
    "else",
    "minProperties",
    "propertyNames",
    "contains",
]);
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** True for plain objects. */
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** JSON type name of a value, distinguishing integer. */
function typeOf(v) {
    if (v === null)
        return "null";
    if (Array.isArray(v))
        return "array";
    if (typeof v === "number")
        return Number.isInteger(v) ? "integer" : "number";
    return typeof v;
}
/** Deep equality for JSON values. */
function equal(a, b) {
    if (a === b)
        return true;
    if (Array.isArray(a) && Array.isArray(b))
        return a.length === b.length && a.every((x, i) => equal(x, b[i]));
    if (isObj(a) && isObj(b)) {
        const ka = Object.keys(a);
        return ka.length === Object.keys(b).length && ka.every((k) => equal(a[k], b[k]));
    }
    return false;
}
/** A set of schemas addressable by $id (and by file name relative to a shared base). */
export class SchemaRegistry {
    byId = new Map();
    patterns = new Map();
    /** Adds a schema document; it must declare an absolute $id. */
    add(schema) {
        const id = schema["$id"];
        if (typeof id !== "string")
            throw new Error("schema without $id");
        this.check(schema, id);
        this.byId.set(id, schema);
    }
    /** Loads every *.schema.json in a directory. */
    static fromDirectory(dir) {
        const registry = new SchemaRegistry();
        for (const name of readdirSync(dir)
            .filter((n) => n.endsWith(".schema.json"))
            .sort()) {
            registry.add(JSON.parse(readFileSync(new URL(name, dir), "utf8")));
        }
        return registry;
    }
    /** All registered $ids. */
    ids() {
        return [...this.byId.keys()].sort();
    }
    /** Rejects unsupported keywords so nothing is silently ignored. */
    check(schema, where) {
        if (typeof schema === "boolean")
            return;
        if (!isObj(schema))
            throw new Error(`invalid schema at ${where}`);
        for (const [key, value] of Object.entries(schema)) {
            if (!SUPPORTED.has(key))
                throw new Error(`unsupported keyword ${key} at ${where}`);
            if (["properties", "$defs"].includes(key) && isObj(value)) {
                for (const [k, sub] of Object.entries(value))
                    this.check(sub, `${where}/${key}/${k}`);
            }
            else if (["items", "additionalProperties", "not", "if", "then", "else", "propertyNames", "contains"].includes(key)) {
                this.check(value, `${where}/${key}`);
            }
            else if (["oneOf", "anyOf", "allOf"].includes(key) && Array.isArray(value)) {
                value.forEach((sub, i) => this.check(sub, `${where}/${key}/${i}`));
            }
        }
    }
    /** Resolves a $ref relative to the base $id of the document it appears in. */
    resolve(ref, base) {
        const [file, fragment] = ref.split("#", 2);
        const docId = file === "" ? base : new URL(file, base).href;
        const doc = this.byId.get(docId);
        if (doc === undefined)
            throw new Error(`unresolvable $ref ${ref} from ${base}`);
        let node = doc;
        if (fragment) {
            for (const part of fragment.split("/").filter(Boolean)) {
                node = isObj(node)
                    ? node[decodeURIComponent(part.replace(/~1/g, "/").replace(/~0/g, "~"))]
                    : undefined;
            }
        }
        if (node === undefined)
            throw new Error(`unresolvable $ref ${ref}`);
        return { schema: node, base: docId };
    }
    /** Validates an instance against the schema with the given $id. */
    validate(id, instance, maxErrors = 50) {
        const schema = this.byId.get(id);
        if (schema === undefined)
            throw new Error(`unknown schema ${id}`);
        const errors = [];
        this.walk(schema, instance, "", id, errors, maxErrors);
        return errors;
    }
    /** Returns true when the instance matches (without collecting errors beyond the first). */
    matches(schema, instance, base) {
        const errors = [];
        this.walk(schema, instance, "", base, errors, 1);
        return errors.length === 0;
    }
    regex(pattern) {
        let re = this.patterns.get(pattern);
        if (!re) {
            re = new RegExp(pattern, "u");
            this.patterns.set(pattern, re);
        }
        return re;
    }
    walk(schema, value, path, base, errors, max) {
        if (errors.length >= max)
            return;
        const fail = (message) => {
            if (errors.length < max)
                errors.push({ path: path || "/", message });
        };
        if (schema === true)
            return;
        if (schema === false)
            return fail("no value is allowed here");
        const s = schema;
        if (typeof s["$id"] === "string")
            base = s["$id"];
        if (typeof s["$ref"] === "string") {
            const target = this.resolve(s["$ref"], base);
            this.walk(target.schema, value, path, target.base, errors, max);
        }
        if (s["type"] !== undefined) {
            const types = Array.isArray(s["type"]) ? s["type"] : [s["type"]];
            const actual = typeOf(value);
            if (!types.includes(actual) && !(actual === "integer" && types.includes("number"))) {
                return fail(`expected ${types.join(" or ")}, got ${actual}`);
            }
        }
        if (Array.isArray(s["enum"]) && !s["enum"].some((e) => equal(e, value))) {
            fail(`must be one of ${s["enum"].map((e) => JSON.stringify(e)).join(", ")}`);
        }
        if ("const" in s && !equal(s["const"], value))
            fail(`must equal ${JSON.stringify(s["const"])}`);
        if (typeof value === "string") {
            if (typeof s["minLength"] === "number" && [...value].length < s["minLength"])
                fail(`shorter than ${s["minLength"]}`);
            if (typeof s["maxLength"] === "number" && [...value].length > s["maxLength"])
                fail(`longer than ${s["maxLength"]}`);
            if (typeof s["pattern"] === "string" && !this.regex(s["pattern"]).test(value))
                fail(`does not match ${s["pattern"]}`);
            if (s["format"] === "date-time" && !(DATE_TIME.test(value) && !Number.isNaN(Date.parse(value))))
                fail("not a date-time");
            if (s["format"] === "date" && !(DATE.test(value) && !Number.isNaN(Date.parse(value))))
                fail("not a date");
            if (s["format"] === "uri" && !/^[a-z][a-z0-9+.-]*:/i.test(value))
                fail("not a URI");
        }
        if (typeof value === "number") {
            if (typeof s["minimum"] === "number" && value < s["minimum"])
                fail(`below minimum ${s["minimum"]}`);
            if (typeof s["maximum"] === "number" && value > s["maximum"])
                fail(`above maximum ${s["maximum"]}`);
            if (typeof s["exclusiveMinimum"] === "number" && value <= s["exclusiveMinimum"])
                fail(`not above ${s["exclusiveMinimum"]}`);
        }
        if (Array.isArray(value)) {
            if (typeof s["minItems"] === "number" && value.length < s["minItems"])
                fail(`fewer than ${s["minItems"]} items`);
            if (typeof s["maxItems"] === "number" && value.length > s["maxItems"])
                fail(`more than ${s["maxItems"]} items`);
            if (s["uniqueItems"] === true) {
                for (let i = 0; i < value.length; i++) {
                    for (let j = i + 1; j < value.length; j++) {
                        if (equal(value[i], value[j])) {
                            fail(`items ${i} and ${j} are equal`);
                            i = value.length;
                            break;
                        }
                    }
                }
            }
            if (s["items"] !== undefined) {
                value.forEach((item, i) => this.walk(s["items"], item, `${path}/${i}`, base, errors, max));
            }
            if (s["contains"] !== undefined &&
                !value.some((item) => this.matches(s["contains"], item, base))) {
                fail("no item matches contains");
            }
        }
        if (isObj(value)) {
            const props = isObj(s["properties"]) ? s["properties"] : {};
            if (Array.isArray(s["required"])) {
                for (const key of s["required"])
                    if (!(key in value))
                        fail(`missing required property ${key}`);
            }
            if (typeof s["minProperties"] === "number" && Object.keys(value).length < s["minProperties"]) {
                fail(`fewer than ${s["minProperties"]} properties`);
            }
            for (const [key, child] of Object.entries(value)) {
                if (s["propertyNames"] !== undefined)
                    this.walk(s["propertyNames"], key, `${path}/${key}`, base, errors, max);
                if (key in props)
                    this.walk(props[key], child, `${path}/${key}`, base, errors, max);
                else if (s["additionalProperties"] !== undefined) {
                    if (s["additionalProperties"] === false)
                        fail(`unexpected property ${key}`);
                    else
                        this.walk(s["additionalProperties"], child, `${path}/${key}`, base, errors, max);
                }
            }
        }
        if (Array.isArray(s["allOf"]))
            for (const sub of s["allOf"])
                this.walk(sub, value, path, base, errors, max);
        if (Array.isArray(s["anyOf"]) &&
            !s["anyOf"].some((sub) => this.matches(sub, value, base))) {
            fail("does not match any allowed shape (anyOf)");
        }
        if (Array.isArray(s["oneOf"])) {
            const n = s["oneOf"].filter((sub) => this.matches(sub, value, base)).length;
            if (n !== 1)
                fail(`must match exactly one shape (oneOf), matched ${n}`);
        }
        if (s["not"] !== undefined && this.matches(s["not"], value, base))
            fail("matches a forbidden shape (not)");
        if (s["if"] !== undefined) {
            const branch = this.matches(s["if"], value, base) ? s["then"] : s["else"];
            if (branch !== undefined)
                this.walk(branch, value, path, base, errors, max);
        }
    }
}
