# Quick start

Install sentinel, register a repository and review your first branch.

## 1. Before you start

You need:

- Node 22 or newer
- git
- one engine CLI, installed and logged in: Claude Code (`claude`) or OpenCode (`opencode`)

Check your Node version:

```bash
node --version
```

## 2. Install

Download sentinel:

```bash
git clone https://github.com/nico0695/sentinel-kit.git
```

Go into the folder:

```bash
cd sentinel-kit
```

Install its dependencies:

```bash
npm ci
```

Build it:

```bash
npm run build
```

Install the `sentinel` command:

```bash
npm install -g .
```

Check that it works:

```bash
sentinel --help
```

The command is also installed as `snt`. Three review types (called harnesses) come with it: `quick`, `pr-review` and `security`.

Keep the `sentinel-kit` folder where it is: the installed command runs from it.

## 3. Add a repository

Register the repository you want to review:

```bash
sentinel repo add <url>
```

Replace `<url>` with the https or ssh address of your repository, for example `https://github.com/acme/widget.git`. Do not put a token or password in the address (see [Credentials](privacy.md)).

sentinel runs git without a prompt. For a private repository, git must already be able to clone it with stored credentials or an SSH key. If `repo add` fails, check the address and your access.

sentinel names the repository `<owner/repo>` after the last two parts of the address: `acme/widget` in the example. It prints that name and `registered`.

sentinel keeps its own copy of the repository in `~/.sentinel/clones/`. Set `SENTINEL_HOME` to use another folder instead of `~/.sentinel`.

To pick a default harness, add `--harness <name>` the first time you add the repository. Adding the same repository again prints `already-registered` and changes nothing.

List your repositories:

```bash
sentinel repo list
```

Each line shows the name, the address, the base branch and the default harness (`-` when there is none).

## 4. Review a branch

```bash
sentinel review <owner/repo> <branch> --type quick
```

Replace `<owner/repo>` with a name from `sentinel repo list` and `<branch>` with the branch to review. sentinel compares it with the repository's base branch.

`--type` picks the harness. Without it, sentinel uses the repository's default harness, and stops with an error that names `--type` if there is none.

`sentinel review` works on sentinel's copy of the repository, downloaded at `repo add`; it does not pick up changes pushed later.

The result is printed as `key` and `value` lines. Read these:

- `state`: `ok` when the review finished with a verdict
- `verdict`: the engine's decision, or `-` when there is none
- `runDir`: the folder with the details of this review

## 5. Read the result

List the reviews of a repository, oldest first:

```bash
sentinel runs list <owner/repo>
```

Each line starts with the repository name, followed by the review id. Show one review:

```bash
sentinel runs show <owner/repo> <id>
```

Replace `<id>` with an id from the list.

Every review that started keeps a `runDir` folder. The engine's answer is in `result.md`, when the engine gave one. [What sentinel sends and stores](privacy.md) lists the other files.

If `state` is not `ok` or `ambiguous`, `failureStage` and `failureMessage` give a short reason. For example, `engine-error` at stage `engine` usually means the engine could not run: check that its CLI is installed and logged in.

`ambiguous` means the engine answered but sentinel found no verdict line. Both fields show `-`: read `result.md`.

If sentinel cannot start a review at all, for example when `--type` is missing, it prints one line and keeps no run folder.

## 6. Choose the engine

Claude Code is the default. OpenCode needs a model id. Set it first:

```bash
export SENTINEL_OPENCODE_MODEL=<provider/model>
```

Replace `<provider/model>` with a model id, for example `anthropic/claude-sonnet-4`. Without it, sentinel asks you to set `SENTINEL_OPENCODE_MODEL` and does not start the review.

Then add `--engine opencode`:

```bash
sentinel review <owner/repo> <branch> --type quick --engine opencode
```

To make OpenCode the default, put this line in `~/.sentinel/config.yaml` (create the file if it does not exist):

```yaml
defaultEngine: opencode
```

`--engine` overrides the default for a single review.

## 7. Interactive mode

Run `sentinel` with no arguments in a terminal:

```bash
sentinel
```

It asks you to pick a repository, a branch and a harness, asks you to confirm, then runs the review and shows the result.

It needs a terminal. In scripts and CI, use `sentinel review` instead. `sentinel review --help` lists its exit codes.

## Next steps

- [Build your own harness](build-your-own-harness.md)
- [What sentinel sends and stores](privacy.md)
