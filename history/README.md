# history/ — Development process audit trail

Strict, lightweight record of **how** sentinel gets built: decisions, deviations, authorship,
and context of every iteration. It is the memory of the process, kept separate from the product
(`src/`), the specification (`docs/`), and the sdd-lite runtime (`sdd-lite/`).

> Language: entries are written in **English**, like everything persisted in this repository
> (see "Language policy" in `CLAUDE.md`). Chat with the user may happen in Spanish; the audit
> trail does not.

## Rules

1. **One entry per work session**, in `entries/`, named
   `YYYY-MM-DD-Snn-<slug>.md` (`Snn` = incremental session number).
   If a session spans several tasks/stories, they go as sections inside the same entry.
2. The entry is generated/updated with the **`history-log`** skill before closing:
   end of session, end of story, or any STOP — whichever comes first.
3. Every non-trivial decision carries **explicit authorship**:
   - `user` — decided by the user on their own initiative.
   - `claude` — autonomous decision (level A of the protocol), with its rationale.
   - `claude→user` — Claude presented alternatives with a recommendation; the user decided (level B).
4. **Deviations** (from plan, PRD, backlog, or assumptions) are always recorded, even when
   resolved on the spot.
5. Every new entry adds its row to `INDEX.md` (newest first).
6. Entries are **committed** — uncommitted history does not exist (remote environments are
   ephemeral).
7. sdd-lite content is never duplicated: **link** to `sdd-lite/openspec/changes/<change>/`.
8. Keep it lean: aim for ~1 screen per entry. Fine detail → link to the artifact that has it.

## Structure

```
history/
├── README.md      # this file
├── TEMPLATE.md    # entry template
├── INDEX.md       # chronological index (1 line per entry)
└── entries/       # the entries
```
