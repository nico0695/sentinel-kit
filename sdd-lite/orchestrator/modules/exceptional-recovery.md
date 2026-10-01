# SDDL Exceptional Recovery

Load this module only when normal resume cannot safely reconcile persisted evidence, or after a material runtime incident. It does not replace the normal resume algorithm in `SDDL-RUNTIME.md`.

Resolve package paths relative to the package root supplied by the active wrapper/config; resolve `./sdd-lite/` paths relative to the consuming project root.

## Triggers

- more than one plausible active change and the user did not identify one
- `state.yaml` contradicts an owning artifact or repo reality materially
- a required owning artifact is missing and more than one recovery route is plausible
- wrong working directory, accidental mutation, unexpected worker write, confusing environment state, or another material runtime incident
- compaction or lost context makes the approved scope/route unverifiable from the normal evidence ladder

## Recovery Procedure

1. Stop routing and all writes.
2. Freeze the current filesystem and git evidence with read-only checks; do not clean, reset, stash, or overwrite anything.
3. Read `state.yaml`, relevant owner-artifact digests, and only the conflicting sections needed to name the mismatch.
4. Classify the condition:
   - `recoverable`: one owner stage and route are unambiguous
   - `decision-required`: multiple safe interpretations remain
   - `incident`: an unexpected mutation or boundary violation occurred
5. For `recoverable`, route back to the owning stage with the contradiction and evidence in its handoff. Do not repair the artifact inline.
6. For `decision-required`, present the competing interpretations and their evidence, then wait.
7. For `incident`, report what changed, distrust affected outputs, and use a fresh worker on the mapped profile (`sddl-reviewer` or `sddl-explorer`) for any required audit or review.
8. Persist only a decision/checkpoint that existing contracts already allow. Do not invent schema fields or a new artifact type.
9. Return to normal runtime routing only after active change, route, scope, and next action are explainable from persisted evidence.

## Boundaries

- Never use recovery to bypass an approval, reopen scope silently, or erase conflicting history.
- Never reinterpret a valid `blocked` result as an incident merely to keep progressing.
- Preserve existing escalation recommendations until a fresh complexity decision supersedes them.
