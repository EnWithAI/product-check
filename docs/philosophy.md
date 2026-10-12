# Philosophy

Product Check exists to turn uncertain, often AI-built software into **evidence-backed findings, actionable
engineering blueprints and transparent readiness decisions**. The product outcome is not a pretty score; it is a
truthful, reproducible path from observed software behaviour to trusted engineering action.

## Principles

1. **Evidence before opinion.** Every PASS, PARTIAL or FAIL carries evidence: a file and line, an HTTP response, an
   executed test result or an imported report, each with a checksum. Without evidence a control is `BLOCKED`,
   `NOT_TESTED` or `NOT_APPLICABLE`, always with a reason.
2. **Untested is not passed.** Unchecked controls lower coverage; they never raise a score. A pillar with too little
   evidence gets no score at all.
3. **Three pillars, never averaged.** Customer, Technology and Trust answer different questions. A strong Customer
   score cannot hide a broken Trust pillar, and there is deliberately no composite number.
4. **Hard gates override averages.** An exposed secret, an authorization bypass or a cross-tenant leak blocks
   readiness however good everything else looks.
5. **Black box first.** When a deployed application is available, what users experience is observed before the
   source is used to explain it. Static evidence proves what files contain, not how the product behaves.
6. **Fact, inference, hypothesis.** Each finding says which it is. Pattern matches that need human judgement are
   labelled hypotheses with lower confidence.
7. **Bounded verdicts.** A verdict names the exact revision and origin it applies to and what was not verified. A
   material change invalidates it.
8. **Advise, don't mutate.** Product Check proposes changes and writes work packets. It never edits code, and a fix is
   `VERIFIED` only when a retest observes the control passing, never because someone (or some agent) says it is done.
9. **Safe by default.** Read-only source inspection, no execution of repository code, passive requests only to an
   origin the user explicitly authorizes.
10. **Local-first and independent.** No account, service, telemetry or model call. JSON is the source of truth, so any
    tool (including CrewPE) can consume the results without coupling.

## Who it is for

A solo builder with a vibe-coded app and a GitHub repository; a startup preparing a launch; an engineer asked
"is this safe to put in front of customers?"; an enterprise team that wants a repeatable, explainable baseline.
