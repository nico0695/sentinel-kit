# SDDL Closeout Runtime

Load this module only after final `sddl-qa-review` sets a change to `completed` and the combined closeout offer is unresolved.

Resolve package paths relative to the package root supplied by the active wrapper/config; resolve `./sdd-lite/` paths relative to the consuming project root.

## Combined Offer

Present once:

> Change `{change-name}` is completed (QA: `{verdict}`).
>
> 1. Draft the delivery (commit / PR / ticket) — `sddl-delivery`
> 2. Archive it — `sddl-archive`
> 3. Both, delivery first (recommended)
> 4. Neither, leave it in `changes/`

## Rules

- This is one routing offer, not two prompts and not a new checkpoint type.
- It bypasses no confirmation: delivery still raises `delivery_gate`; archive still raises `archive_review`.
- For `both`, run delivery first so `delivery-report.md` is created inside the active change and archived with it.
- Record the answer as a decision. Do not repeat a resolved offer, including `neither`.
- Declining one action never blocks the other or the user's next request.
- Archiving first remains safe because later delivery may read the archived change.
- Direct delivery, named archive, and accumulation cleanup requests route from `SDDL-RUNTIME.md` without loading this module.
