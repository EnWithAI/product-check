#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Executable entry point for the `product-check` command. Delegates to run() and sets the exit code.
 * Honors SOURCE_DATE_EPOCH (the reproducible-builds convention) as a fixed clock, so examples are byte-stable.
 */
import { run } from "./run.js";
const epoch = process.env["SOURCE_DATE_EPOCH"];
const fixed = epoch !== undefined && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000) : null;
const code = await run(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    cwd: process.cwd(),
    ...(fixed ? { now: () => fixed } : {}),
});
process.exitCode = code;
