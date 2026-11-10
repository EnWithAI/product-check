// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Safe YAML (and JSON) reading for the operational importers (docs/operational-imports.md): YAML 1.2 core schema,
 * unique keys, at most 100 alias expansions, no custom tags, 10 MiB per file. Any document error is an input error.
 */
import { parseAllDocuments } from "yaml";
import { inputError } from "../errors.js";
/** Largest YAML input accepted, in bytes. */
export const MAX_YAML_BYTES = 10 * 1024 * 1024;
/** Parses every document in a YAML or JSON text into plain values. */
export function readYaml(text, source) {
    if (Buffer.byteLength(text, "utf8") > MAX_YAML_BYTES)
        throw inputError(`${source} is larger than 10 MiB; YAML inputs are limited to 10 MiB.`);
    const fail = () => {
        throw inputError(`${source} is not valid YAML (or uses more than 100 aliases or duplicate keys).`);
    };
    try {
        const docs = parseAllDocuments(text, {
            schema: "core",
            version: "1.2",
            uniqueKeys: true,
            prettyErrors: false,
            customTags: [],
        });
        if (!Array.isArray(docs))
            return fail();
        const out = [];
        for (const doc of docs) {
            if (doc.errors.length > 0)
                return fail();
            out.push(doc.toJS({ maxAliasCount: 100 }));
        }
        return out;
    }
    catch {
        return fail();
    }
}
