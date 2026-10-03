# Build your own harness

Write your own review instructions and run them with `sentinel review --type`.

## 1. How a harness works

A harness is a folder of review instructions. The folder name is the value you pass to `--type`. Your harnesses live in `~/.sentinel/harnesses/<name>/`, inside your sentinel folder (`~/.sentinel`, see the [Quick start](quick-start.md)).

| File | Required | What it holds |
|---|---|---|
| `harness.md` | yes | What the reviewer should do |
| `output.md` | no | The format of the answer. Without it, nothing asks for a verdict, and the review usually ends `ambiguous` |
| `skills.yaml` | no | A list of skills to add to the instructions |

A skill is a short markdown file with extra rules. Yours go in `~/.sentinel/skills/<name>.md`. Two skills come with sentinel: `code-quality` and `security`.

If a harness or a skill has the same name as one that comes with sentinel, yours is used.

sentinel sends `harness.md`, then the skills, then `output.md`, then the diff.

This guide builds a harness called `my-review`.

## 2. Create the folders

Create the harness folder:

```bash
mkdir -p ~/.sentinel/harnesses/my-review
```

Create the skills folder:

```bash
mkdir -p ~/.sentinel/skills
```

## 3. Write the instructions

Save this as `~/.sentinel/harnesses/my-review/harness.md`:

```markdown
## Role

You review a pull request diff for this team. Report only problems that would
block a safe merge: bugs, missing error handling, and changes that break the
house rules below.

Review only the lines in the diff. Name the file and line for every finding.
```

## 4. Add a skill

Save this as `~/.sentinel/skills/house-rules.md`:

```markdown
# House rules

- Code that can fail reports a clear error; no empty catch blocks.
- No passwords, tokens or keys in code, config or tests.
- New behavior comes with a test in the same change.
```

Then list it. Save this as `~/.sentinel/harnesses/my-review/skills.yaml`:

```yaml
skills:
  - house-rules
```

The file name without `.md` is the skill's name. If `skills.yaml` exists, it must contain a `skills:` list, and every name in it must match a skill file, or the harness is broken (see section 7).

## 5. Ask for a verdict

Save this as `~/.sentinel/harnesses/my-review/output.md`:

```markdown
## Answer format

List each finding on its own line:

- <file>:<line> — what is wrong and how to fix it.

If there are no findings, write: No findings.

The last line of your answer must be exactly one of these, alone, with
nothing after it and no formatting:

    VERDICT: approve
    VERDICT: request-changes
    VERDICT: comment

Use request-changes if any finding blocks the merge, comment if all findings
are minor, and approve if there are none.
```

sentinel looks for the verdict at the end of the answer, so keep it last. It must be one of `VERDICT: approve`, `VERDICT: request-changes` or `VERDICT: comment`, in lowercase, on a line of its own, with no formatting. The review prints the result as `verdict`.

## 6. Use it

Run a review with your harness:

```bash
sentinel review <owner/repo> <branch> --type my-review
```

The placeholders are explained in the [Quick start](quick-start.md).

To make it the default for a repository, add `--harness my-review` the first time you run `sentinel repo add <url>`. For a repository you already added, open `~/.sentinel/repos.yaml`. Each repository has an entry named after it. Add one line to that entry:

```yaml
acme/widget:
  url: https://github.com/acme/widget.git
  baseBranch: main
  defaultHarness: my-review # add this line, keep the existing lines
```

After that, `sentinel review <owner/repo> <branch>` uses `my-review` without `--type`.

## 7. Check it is picked up

Run `sentinel` in a terminal, then pick a repository and a branch. `my-review` is in the list of harnesses. Press Ctrl+C to leave: sentinel prints "Review cancelled — nothing was run." and stops. If `my-review` is not in the list, check the folder name and that it holds `harness.md`.

Every review loads every harness, yours and the ones that come with sentinel. One broken folder, for example one without `harness.md`, stops all reviews. They end with `state validation-failed`, `failureStage harness` and a `failureMessage` that names the problem, such as `Missing required harness.md in harness "broken"`. Fix the folder or delete it.

If you misspell the name after `--type`, the review ends the same way with `Harness not found: <name>`.

## Next steps

- [Quick start](quick-start.md)
- [What sentinel sends and stores](privacy.md)
