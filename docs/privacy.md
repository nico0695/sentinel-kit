# What sentinel sends and stores

Know what leaves your machine during a review and what stays on your disk.

## 1. What is sent

For each review, sentinel builds one prompt and hands it to the engine you chose (Claude Code or OpenCode). The prompt holds, in this order:

- the harness instructions
- the skills the harness lists
- the answer format, when the harness has one
- the diff of the branch against its base branch
- the output of check commands configured for the repository, if any (these docs do not cover them)

The engine CLI sends the prompt to its model provider, under that tool's own account and settings. sentinel does not talk to the provider itself.

```mermaid
flowchart LR
  A[Temporary copy of the branch] --> B[Prompt: harness + diff]
  B --> C[Engine CLI]
  A -. reads files .-> C
  C <--> D[Model provider]
  B --> E[Run folder on disk]
  C --> E
```

## 2. What the engine can read

The engine runs inside a temporary copy of the branch you are reviewing, so it can read the files there, not only the diff. sentinel removes that copy when the review ends.

- OpenCode: sentinel's OpenCode settings deny file edits, shell commands and web fetches.
- Claude Code: it runs with your own Claude Code permission settings. sentinel adds no limits of its own. Because it runs inside the reviewed branch, settings stored in that branch can apply too.

## 3. What stays on your disk

sentinel keeps these under your sentinel folder (`~/.sentinel`, see the [Quick start](quick-start.md)):

- `~/.sentinel/clones/`: sentinel's copy of each repository you registered, in full.
- `~/.sentinel/runs/`: one folder per review, the `runDir` that the review prints.
- `~/.sentinel/worktrees/`: the temporary copy of a branch, only left behind when you stop a review (for example with Ctrl+C) or sentinel cannot remove it.

Every review that started keeps its folder, whatever its outcome, until you delete it. What the folder holds depends on how far the review got:

- `metadata.json`: the details of the run
- `prompt.md`: the prompt as sent, which includes the diff
- `result.md`: the engine's answer, only when the engine gave one
- `validations/`: the output of those check commands, only when some ran

A review that sentinel refuses to start, for example when `--type` is missing, keeps nothing.

Claude Code also saves each review prompt, diff included, in its own session history on your machine, outside the sentinel folder.

## 4. What sentinel itself sends

Only git traffic: sentinel downloads the repository with git when you add it, and fetches from it when interactive mode lists branches. It makes no other network calls and sends no usage data.

## 5. Credentials

sentinel has no credential store. git uses your own git setup, and the engine uses its own login.

Do not put a token or password in a repository address. sentinel saves the address as you typed it, in its configuration and in its copy of the repository, and `sentinel repo list` prints it.

## Next steps

- [Quick start](quick-start.md)
- [Build your own harness](build-your-own-harness.md)
