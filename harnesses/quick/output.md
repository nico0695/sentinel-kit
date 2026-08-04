## Verdict

The first non-empty line of your response MUST be exactly one of:

    VERDICT: approve
    VERDICT: request-changes
    VERDICT: comment

No other text, whitespace, or formatting may precede the verdict line. The verdict value must be lowercase and match one of the three allowed values exactly.

Verdict selection rules:
- If ANY finding has [SEV: blocker]: VERDICT MUST be `request-changes`.
- If ANY finding has [SEV: major] and none has [SEV: blocker]: VERDICT MUST be `request-changes`.
- If findings exist but all are minor or nit: use `comment`.
- If no findings: use `approve`.

The verdict is deterministic based on the highest severity finding. You do not have discretion to approve when blocker or major findings are present.

## Findings

After the verdict line, list each finding in this format:

    [SEV: <level>] <file>:<line> — <summary>
    <explanation>

Where:
- `<level>` is one of: `blocker`, `major`, `minor`, `nit`
- `<file>` is the path relative to the repository root
- `<line>` is the line number in the diff where the issue occurs (use the first relevant line if the issue spans multiple lines)
- `<summary>` is a one-line description of the issue (max ~120 characters)
- `<explanation>` is 1-3 sentences providing context, evidence, or a suggested fix

Separate each finding with a blank line. Order findings from highest to lowest severity.

Severity definitions:
- **blocker**: correctness bug, data loss risk, or security vulnerability that must be fixed before merge. The code will produce wrong results, crash, or expose sensitive data.
- **major**: significant design flaw, missing required behavior, or a pattern that will cause substantial maintenance burden. Not an immediate correctness issue, but serious enough to warrant changes before merge.
- **minor**: improvement that would meaningfully benefit the code quality but is not blocking. Safe to merge without, but worth addressing.
- **nit**: style, naming, or trivial preference. Safe to ignore. Will not affect correctness or maintainability in practice.

If there are no findings, omit this section entirely and proceed directly to the summary.

## Summary

After all findings (or immediately after the verdict if there are none), provide a brief summary paragraph of 2-4 sentences. Cover the overall quality of the change, any cross-cutting observations, and -- when applicable -- what the author did well. The summary must not introduce new findings or contradict the severity of findings listed above.

## Ambiguity Rule

If the verdict line is missing, contains a value other than the three allowed values, or the response contains contradictory verdicts (e.g., both `approve` and `request-changes` appear): the run is classified as `ambiguous`. An ambiguous run is still persisted in history but marked as untrusted and does not map to a GitHub review action.
