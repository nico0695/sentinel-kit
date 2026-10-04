#!/usr/bin/env bash
# verify-quickstart.sh <sandbox-dir>
#
# sdd-lite evidence for change e7-f2-h1-user-docs (story [E7.F2.H1], #43).
# NOT product code: it is not linted, not typechecked and not shipped.
#
# Runs the documented quick-start flow (steps V1-V15 of design.md) inside a
# disposable sandbox under the session scratchpad. It never touches the real
# ~/.sentinel, the real npm global prefix or the real ~/.gitconfig, and it
# NEVER invokes a model (decision d-006): the PATH holds only node/npm/npx/git
# plus the sandbox prefix bin, and `claude`/`opencode` must be unresolvable
# before every `sentinel review` or the script aborts with exit 99.
#
# Usage:
#   verify-quickstart.sh <sandbox-dir>
#
# Environment (all optional):
#   VQ_SCRATCH_ROOT  directory the sandbox must live under (default: the
#                    session scratchpad). The sandbox dir is wiped at start.
#   VQ_STEPS         space-separated steps to run (default: all of V4..V15).
#                    V1, V2 and V3 always run: every other step needs them.
#   VQ_SRC_REPO      local repository to clone (default: this repository).
#   VQ_SRC_BRANCH    branch to clone (default: its current branch).
#   VQ_HARNESS_DIR   directory holding the my-review harness files for V11
#                    (harness.md, skills.yaml, output.md, house-rules.md).
#                    Default: the files embedded below (copied from design.md,
#                    "Harness Example"). Later stages point this at files
#                    extracted from the written guide.
#
# Exit status: 0 = every selected step passed, 1 = at least one check failed,
# 99 = safety abort (engine binary resolvable, or sandbox outside scratchpad).
set -euo pipefail

SB_ARG="${1:?usage: verify-quickstart.sh <sandbox-dir>}"

SCRATCH_ROOT="${VQ_SCRATCH_ROOT:-/tmp/claude-0/-home-user-sentinel-kit/ea91228b-6432-5c98-808e-7ad37e07d226/scratchpad}"
STEPS="${VQ_STEPS:-V4 V5 V6 V7 V8 V9 V10 V11 V12 V13 V14 V15}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_REPO="${VQ_SRC_REPO:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)}"
SRC_BRANCH="${VQ_SRC_BRANCH:-$(git -C "$SRC_REPO" rev-parse --abbrev-ref HEAD)}"

abort() { echo "ABORT: $*" >&2; exit 99; }

# ---------------------------------------------------------------- safety ---
SB="$(realpath -m "$SB_ARG")"
SCRATCH_ROOT="$(realpath -m "$SCRATCH_ROOT")"
case "$SB" in
  "$SCRATCH_ROOT"/?*) ;;
  *) abort "sandbox '$SB' is not under the scratchpad '$SCRATCH_ROOT'" ;;
esac

# Real-world snapshots (taken before the environment is isolated, checked in V15).
REAL_HOME="$HOME"
REAL_NPM_PREFIX="$(npm prefix -g 2>/dev/null || true)"
snap_real() {
  {
    if [ -e "$REAL_HOME/.sentinel" ]; then echo "sentinel-home: present"; find "$REAL_HOME/.sentinel" | sort; else echo "sentinel-home: absent"; fi
    if [ -e "$REAL_HOME/.gitconfig" ]; then echo "gitconfig: $(sha256sum < "$REAL_HOME/.gitconfig")"; else echo "gitconfig: absent"; fi
    if [ -n "$REAL_NPM_PREFIX" ] && [ -d "$REAL_NPM_PREFIX" ]; then
      echo "npm-global: $REAL_NPM_PREFIX"
      find "$REAL_NPM_PREFIX/bin" "$REAL_NPM_PREFIX/lib/node_modules" -maxdepth 1 2>/dev/null | sort
    fi
    echo "src-repo-status:"
    git -C "$SRC_REPO" status --porcelain
  }
}

NODE_BIN="$(command -v node)"; NPM_BIN="$(command -v npm)"
NPX_BIN="$(command -v npx)"; GIT_BIN="$(command -v git)"
[ -n "$NODE_BIN" ] && [ -n "$NPM_BIN" ] && [ -n "$NPX_BIN" ] && [ -n "$GIT_BIN" ] || abort "node/npm/npx/git not all resolvable"

rm -rf "$SB"
mkdir -p "$SB"/{log,shim,prefix,home,help,origin,seed,userhome,npm-cache}
snap_real > "$SB/real-before.txt"

ln -s "$NODE_BIN" "$SB/shim/node"
ln -s "$NPM_BIN" "$SB/shim/npm"
ln -s "$NPX_BIN" "$SB/shim/npx"
ln -s "$GIT_BIN" "$SB/shim/git"

# ------------------------------------------------------------ environment ---
export HOME="$SB/userhome"
export PATH="$SB/prefix/bin:$SB/shim:/usr/bin:/bin"
export SENTINEL_HOME="$SB/home"
export npm_config_prefix="$SB/prefix"
export npm_config_cache="$SB/npm-cache"
export GIT_CONFIG_GLOBAL="$SB/gitconfig"
export GIT_CONFIG_NOSYSTEM=1
export GIT_TERMINAL_PROMPT=0
unset NODE_PATH SENTINEL_OPENCODE_MODEL XDG_CONFIG_HOME || true
hash -r

cat > "$GIT_CONFIG_GLOBAL" <<'EOF'
[user]
	name = Sandbox User
	email = sandbox@example.invalid
[init]
	defaultBranch = main
[commit]
	gpgsign = false
EOF

# --------------------------------------------------------------- helpers ---
LOG="$SB/log"
TRANSCRIPT="$LOG/transcript.txt"
: > "$TRANSCRIPT"
FAILS=0; CHECKS=0
RESULTS=()
CUR_STEP=""

say() { echo "$*" | tee -a "$TRANSCRIPT"; }

want() { case " $STEPS " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

assert_no_engine() {
  hash -r
  if command -v claude >/dev/null 2>&1 || command -v opencode >/dev/null 2>&1; then
    abort "engine binary resolvable on PATH ($(command -v claude || true) $(command -v opencode || true)); refusing to run a review (d-006)"
  fi
  say "[engine-absence] ok: claude=<unresolved> opencode=<unresolved> PATH=$PATH"
}

# run <name> <cmd...>: run a command, capture rc/stdout/stderr, never abort.
RC=0; OUT=""; ERR=""
run() {
  local name="$1"; shift
  local base="$LOG/$name"
  set +e
  "$@" > "$base.out" 2> "$base.err"
  RC=$?
  set -e
  OUT="$base.out"; ERR="$base.err"
  echo "$RC" > "$base.rc"
  {
    echo "--- [$CUR_STEP/$name] \$ $*"
    echo "exit: $RC"
    if [ -s "$OUT" ]; then echo "stdout:"; sed 's/^/  | /' "$OUT"; fi
    if [ -s "$ERR" ]; then echo "stderr:"; sed 's/^/  | /' "$ERR"; fi
  } | tee -a "$TRANSCRIPT" >/dev/null
  # Echo compactly to the console too.
  echo "[$CUR_STEP/$name] exit=$RC"
}

# review <name> <args...>: `sentinel review` with the engine-absence guard.
review() {
  local name="$1"; shift
  assert_no_engine
  run "$name" sentinel review "$@"
}

# check <label> <condition...>: record PASS/FAIL, never abort.
check() {
  local label="$1"; shift
  CHECKS=$((CHECKS + 1))
  if "$@"; then
    RESULTS+=("PASS $CUR_STEP $label"); say "  PASS $CUR_STEP: $label"
  else
    FAILS=$((FAILS + 1)); RESULTS+=("FAIL $CUR_STEP $label"); say "  FAIL $CUR_STEP: $label"
  fi
}

step() { CUR_STEP="$1"; say ""; say "=== $1: $2"; }

field_of() { awk -F'\t' -v k="$1" '$1 == k { print $2 }' "$2"; }
rc_is() { [ "$RC" -eq "$1" ]; }
has() { grep -qF -- "$1" "$2"; }
count_runs() { { find "$SENTINEL_HOME/runs" -mindepth 2 -maxdepth 2 -type d 2>/dev/null || true; } | wc -l | tr -d ' '; }

# ------------------------------------------------------------- V1: origin ---
make_origin() { # <owner> <repo>
  local owner="$1" repo="$2"
  local seed="$SB/seed/$owner-$repo" bare="$SB/origin/$owner/$repo.git"
  mkdir -p "$SB/origin/$owner"
  git init -q -b main "$seed"
  (
    cd "$seed"
    printf '# %s\n\nA tiny throwaway project.\n' "$repo" > README.md
    mkdir src
    printf 'export const name = "world";\n' > src/name.js
    git add -A && git commit -q -m "initial commit"
    git checkout -q -b feature/greeting
    printf 'import { name } from "./name.js";\n\nexport function greet() {\n  return `hello ${name}`;\n}\n' > src/greeting.js
    git add -A && git commit -q -m "add greeting"
    git checkout -q main
  )
  git init -q --bare -b main "$bare"
  git -C "$seed" push -q "file://$bare" main feature/greeting
}

step V1 "throwaway bare origin(s) with main + feature/greeting"
make_origin acme widget
WIDGET_URL="file://$SB/origin/acme/widget.git"
run V1-branches git -C "$SB/origin/acme/widget.git" branch --list
check "origin has exactly two branches (main, feature/greeting)" \
  bash -c "[ \"\$(grep -c . '$OUT')\" -eq 2 ] && grep -q 'feature/greeting' '$OUT' && grep -q 'main' '$OUT'"

# ------------------------------------------------------------- V2: install ---
step V2 "install: clone, npm ci, npm run build, npm install -g ."
CLONE="$SB/sentinel-kit"
run V2-clone git clone --no-hardlinks --branch "$SRC_BRANCH" "$SRC_REPO" "$CLONE"
check "clone of $SRC_BRANCH succeeded" rc_is 0
SRC_HEAD="$(git -C "$SRC_REPO" rev-parse HEAD)"
CLONE_HEAD="$(git -C "$CLONE" rev-parse HEAD)"
say "source HEAD=$SRC_HEAD clone HEAD=$CLONE_HEAD"
check "clone HEAD equals source branch HEAD" [ "$SRC_HEAD" = "$CLONE_HEAD" ]
cd "$CLONE"
run V2-node-version node --version
say "node: $(cat "$OUT")"
run V2-npm-ci npm ci
check "npm ci exit 0" rc_is 0
run V2-build npm run build
check "npm run build exit 0" rc_is 0
run V2-install-g npm install -g .
check "npm install -g . exit 0" rc_is 0
check "sentinel is in the sandbox prefix bin" [ -e "$SB/prefix/bin/sentinel" ]
check "snt is in the sandbox prefix bin" [ -e "$SB/prefix/bin/snt" ]
hash -r
check "sentinel resolves inside the sandbox prefix" [ "$(command -v sentinel)" = "$SB/prefix/bin/sentinel" ]
run V2-help sentinel --help
check "sentinel --help exit 0" rc_is 0
cd "$SB"

# ----------------------------------------------------------- V3: help texts ---
step V3 "save --help texts for the AC-7 diff"
save_help() { # <file-stem> <args...>
  local stem="$1"; shift
  run "V3-$stem" sentinel "$@" --help
  cp "$OUT" "$SB/help/$stem.txt"
  check "help saved: sentinel $* --help" rc_is 0
}
save_help repo repo
save_help repo-add repo add
save_help repo-list repo list
save_help review review
save_help runs runs
save_help runs-list runs list
save_help runs-show runs show
run V3-root sentinel --help
cp "$OUT" "$SB/help/root.txt"
check "help saved: sentinel --help" rc_is 0

# ------------------------------------------------------- V4: repo add x2 ---
if want V4; then
  step V4 "repo add (twice)"
  run V4-add1 sentinel repo add "$WIDGET_URL"
  check "first add exit 0" rc_is 0
  check "first add prints acme/widget<TAB>registered" \
    bash -c "awk -F'\t' '\$1==\"acme/widget\" && \$2==\"registered\"{f=1} END{exit !f}' '$OUT'"
  REG_SUM1="$(sha256sum "$SENTINEL_HOME/repos.yaml" | cut -d' ' -f1)"
  check "managed copy exists under clones/acme/widget" [ -e "$SENTINEL_HOME/clones/acme/widget" ]
  run V4-add2 sentinel repo add "$WIDGET_URL"
  check "second add exit 0" rc_is 0
  check "second add prints already-registered" has "already-registered" "$OUT"
  REG_SUM2="$(sha256sum "$SENTINEL_HOME/repos.yaml" | cut -d' ' -f1)"
  check "repos.yaml unchanged by the second add" [ "$REG_SUM1" = "$REG_SUM2" ]
fi

# ------------------------------------------------------------ V5: repo list ---
if want V5; then
  step V5 "repo list"
  run V5-list sentinel repo list
  check "repo list exit 0" rc_is 0
  check "exactly one line, naming acme/widget" \
    bash -c "[ \"\$(grep -c . '$OUT')\" -eq 1 ] && grep -q '^acme/widget' '$OUT'"
fi

# ---------------------------------------------- V6: review without --type ---
if want V6; then
  step V6 "review without --type and without a default harness"
  RUNS_BEFORE="$(count_runs)"
  review V6-notype acme/widget feature/greeting
  check "exit 1" rc_is 1
  check "message names --type" has "--type" "$ERR"
  check "no new run persisted" [ "$(count_runs)" = "$RUNS_BEFORE" ]
fi

# ------------------------------------------------------- V7: review quick ---
if want V7; then
  step V7 "review --type quick (engine absent)"
  review V7-quick acme/widget feature/greeting --type quick
  check "exit 2" rc_is 2
  check "state engine-error" bash -c "[ \"\$(awk -F'\t' '\$1==\"state\"{print \$2}' '$OUT')\" = engine-error ]"
  check "failureStage engine" bash -c "[ \"\$(awk -F'\t' '\$1==\"failureStage\"{print \$2}' '$OUT')\" = engine ]"
  check "engine claude-code (default)" bash -c "[ \"\$(awk -F'\t' '\$1==\"engine\"{print \$2}' '$OUT')\" = claude-code ]"
  V7_RUNDIR="$(field_of runDir "$OUT")"
  say "runDir: $V7_RUNDIR"
  check "runDir has metadata.json" [ -f "$V7_RUNDIR/metadata.json" ]
  check "runDir has prompt.md" [ -f "$V7_RUNDIR/prompt.md" ]
  check "no result.md (engine never answered)" [ ! -e "$V7_RUNDIR/result.md" ]
  say "runDir listing:"; ls -la "$V7_RUNDIR" | sed 's/^/  | /' | tee -a "$TRANSCRIPT" >/dev/null
fi

# ----------------------------------------------- V8: opencode model var ---
if want V8; then
  step V8 "--engine opencode without, then with, SENTINEL_OPENCODE_MODEL"
  RUNS_BEFORE="$(count_runs)"
  review V8-nomodel acme/widget feature/greeting --type quick --engine opencode
  say "V8 OBSERVED exit code without SENTINEL_OPENCODE_MODEL: $RC"
  echo "$RC" > "$LOG/V8-observed-exit-code"
  check "message names SENTINEL_OPENCODE_MODEL" bash -c "grep -qF SENTINEL_OPENCODE_MODEL '$ERR' '$OUT'"
  check "no new run persisted (pre-run error)" [ "$(count_runs)" = "$RUNS_BEFORE" ]
  assert_no_engine
  run V8-withmodel env SENTINEL_OPENCODE_MODEL=anthropic/claude-sonnet-4 sentinel review acme/widget feature/greeting --type quick --engine opencode
  check "exit 2" rc_is 2
  check "engine opencode" bash -c "[ \"\$(awk -F'\t' '\$1==\"engine\"{print \$2}' '$OUT')\" = opencode ]"
  check "state engine-error" bash -c "[ \"\$(awk -F'\t' '\$1==\"state\"{print \$2}' '$OUT')\" = engine-error ]"
  check "failureStage engine" bash -c "[ \"\$(awk -F'\t' '\$1==\"failureStage\"{print \$2}' '$OUT')\" = engine ]"
fi

# ------------------------------------------- V9: defaultEngine in config ---
if want V9; then
  step V9 "config.yaml defaultEngine: opencode, review without --engine"
  printf 'defaultEngine: opencode\n' > "$SENTINEL_HOME/config.yaml"
  assert_no_engine
  run V9-config env SENTINEL_OPENCODE_MODEL=anthropic/claude-sonnet-4 sentinel review acme/widget feature/greeting --type quick
  check "engine opencode picked up from config.yaml" bash -c "[ \"\$(awk -F'\t' '\$1==\"engine\"{print \$2}' '$OUT')\" = opencode ]"
  check "state engine-error" bash -c "[ \"\$(awk -F'\t' '\$1==\"state\"{print \$2}' '$OUT')\" = engine-error ]"
  rm -f "$SENTINEL_HOME/config.yaml"
  check "config.yaml removed after the step" [ ! -e "$SENTINEL_HOME/config.yaml" ]
fi

# ------------------------------------------------- V10: runs list / show ---
if want V10; then
  step V10 "runs list / runs show"
  run V10-list sentinel runs list acme/widget
  check "runs list exit 0" rc_is 0
  EXPECT_RUNS="$(count_runs)"
  check "one line per persisted run ($EXPECT_RUNS)" bash -c "[ \"\$(grep -c . '$OUT')\" -eq $EXPECT_RUNS ]"
  check "every line names acme/widget" bash -c "! grep -v '^acme/widget' '$OUT' | grep -q ."
  RUN_ID="$(awk -F'\t' 'NR==1{print $2}' "$OUT")"
  say "first run id: $RUN_ID"
  run V10-show sentinel runs show acme/widget "$RUN_ID"
  check "runs show exit 0" rc_is 0
  check "block has state engine-error" bash -c "[ \"\$(awk -F'\t' '\$1==\"state\"{print \$2}' '$OUT')\" = engine-error ]"
  say "runs show block keys: $(cut -f1 "$OUT" | tr '\n' ' ')"
fi

# ------------------------------------------- V11: the my-review harness ---
HARNESS_SRC="${VQ_HARNESS_DIR:-}"
write_example_harness() {
  local dest="$1" skills="$SENTINEL_HOME/skills"
  mkdir -p "$dest" "$skills"
  if [ -n "$HARNESS_SRC" ]; then
    cp "$HARNESS_SRC/harness.md" "$dest/harness.md"
    cp "$HARNESS_SRC/skills.yaml" "$dest/skills.yaml"
    cp "$HARNESS_SRC/output.md" "$dest/output.md"
    cp "$HARNESS_SRC/house-rules.md" "$skills/house-rules.md"
    return
  fi
  cat > "$dest/harness.md" <<'EOF'
## Role

You review a pull request diff for this team. Report only problems that would
block a safe merge: bugs, missing error handling, and changes that break the
house rules below.

Review only the lines in the diff. Name the file and line for every finding.
EOF
  cat > "$dest/skills.yaml" <<'EOF'
skills:
  - house-rules
EOF
  cat > "$skills/house-rules.md" <<'EOF'
# House rules

- Code that can fail reports a clear error; no empty catch blocks.
- No passwords, tokens or keys in code, config or tests.
- New behavior comes with a test in the same change.
EOF
  cat > "$dest/output.md" <<'EOF'
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
EOF
}

if want V11; then
  step V11 "my-review harness: accepted, reaches stage engine, prompt.md carries it"
  write_example_harness "$SENTINEL_HOME/harnesses/my-review"
  review V11-myreview acme/widget feature/greeting --type my-review
  check "exit 2 (engine absent)" rc_is 2
  check "state engine-error" bash -c "[ \"\$(awk -F'\t' '\$1==\"state\"{print \$2}' '$OUT')\" = engine-error ]"
  check "failureStage engine (not harness)" bash -c "[ \"\$(awk -F'\t' '\$1==\"failureStage\"{print \$2}' '$OUT')\" = engine ]"
  check "harness my-review" bash -c "[ \"\$(awk -F'\t' '\$1==\"harness\"{print \$2}' '$OUT')\" = my-review ]"
  V11_DIR="$(field_of runDir "$OUT")"
  P="$V11_DIR/prompt.md"
  check "prompt.md has the harness text" has "You review a pull request diff for this team." "$P"
  check "prompt.md has <skill name=\"house-rules\">" has '<skill name="house-rules">' "$P"
  check "prompt.md has the skill text" has "no empty catch blocks" "$P"
  check "prompt.md has <output-contract>" has "<output-contract>" "$P"
  check "prompt.md has the last-line rule" has "The last line of your answer must be exactly one of these" "$P"
  check "prompt.md has the diff" has "src/greeting.js" "$P"
fi

# --------------------------------------- V12: defaultHarness (two routes) ---
if want V12; then
  step V12 "default harness via repos.yaml and via repo add --harness"
  [ -d "$SENTINEL_HOME/harnesses/my-review" ] || write_example_harness "$SENTINEL_HOME/harnesses/my-review"
  say "repos.yaml before edit:"; sed 's/^/  | /' "$SENTINEL_HOME/repos.yaml" | tee -a "$TRANSCRIPT" >/dev/null
  # Add `defaultHarness: my-review` under the acme/widget entry (repos.yaml is a map keyed by
  # alias; entries are indented two spaces). This is the edit the guide asks the user to make.
  sed -i '/^acme\/widget:[[:space:]]*$/a\  defaultHarness: my-review' "$SENTINEL_HOME/repos.yaml"
  check "repos.yaml has defaultHarness under acme/widget" \
    bash -c "awk '/^acme\\/widget:/{f=1;next} /^[^ ]/{f=0} f && /^  defaultHarness: my-review\$/{ok=1} END{exit !ok}' '$SENTINEL_HOME/repos.yaml'"
  say "repos.yaml after edit:"; sed 's/^/  | /' "$SENTINEL_HOME/repos.yaml" | tee -a "$TRANSCRIPT" >/dev/null
  review V12-default-widget acme/widget feature/greeting
  check "widget: harness my-review without --type" bash -c "[ \"\$(awk -F'\t' '\$1==\"harness\"{print \$2}' '$OUT')\" = my-review ]"
  check "widget: failureStage engine" bash -c "[ \"\$(awk -F'\t' '\$1==\"failureStage\"{print \$2}' '$OUT')\" = engine ]"

  make_origin acme gizmo
  run V12-add-gizmo sentinel repo add --harness my-review "file://$SB/origin/acme/gizmo.git"
  check "gizmo add exit 0" rc_is 0
  review V12-default-gizmo acme/gizmo feature/greeting
  check "gizmo: harness my-review without --type" bash -c "[ \"\$(awk -F'\t' '\$1==\"harness\"{print \$2}' '$OUT')\" = my-review ]"
  check "gizmo: failureStage engine" bash -c "[ \"\$(awk -F'\t' '\$1==\"failureStage\"{print \$2}' '$OUT')\" = engine ]"
fi

# ----------------------------------------- V13: broken / misspelled harness ---
if want V13; then
  step V13 "one broken harness folder, then a misspelled --type"
  mkdir -p "$SENTINEL_HOME/harnesses/broken"
  review V13-broken acme/widget feature/greeting --type quick
  check "exit 2" rc_is 2
  check "state validation-failed" bash -c "[ \"\$(awk -F'\t' '\$1==\"state\"{print \$2}' '$OUT')\" = validation-failed ]"
  check "failureStage harness" bash -c "[ \"\$(awk -F'\t' '\$1==\"failureStage\"{print \$2}' '$OUT')\" = harness ]"
  check "failure message mentions harness.md" bash -c "field=\$(awk -F'\t' '\$1==\"failureMessage\"{print \$2}' '$OUT'); [[ \$field == *harness.md* ]]"
  rm -rf "$SENTINEL_HOME/harnesses/broken"
  check "broken folder removed" [ ! -e "$SENTINEL_HOME/harnesses/broken" ]
  review V13-typo acme/widget feature/greeting --type my-reveiw
  say "V13 misspelled --type: exit=$RC"
  check "message Harness not found: my-reveiw" bash -c "grep -qF 'Harness not found: my-reveiw' '$OUT' '$ERR'"
  check "state validation-failed" bash -c "[ \"\$(awk -F'\t' '\$1==\"state\"{print \$2}' '$OUT')\" = validation-failed ]"
fi

# --------------------------------------------- V14: bare sentinel, no TTY ---
if want V14; then
  step V14 "bare sentinel without a terminal"
  run V14-bare sentinel < /dev/null
  check "exit 1" rc_is 1
  check "guidance on stderr" bash -c "[ -s '$ERR' ]"
  check "nothing on stdout" bash -c "[ ! -s '$OUT' ]"
fi

# ----------------------------------------------------------- V15: isolation ---
if want V15; then
  step V15 "isolation: real home, git config, npm prefix and source repo untouched"
  snap_real > "$SB/real-after.txt"
  check "real ~/.sentinel, ~/.gitconfig, npm global prefix and source repo status unchanged" \
    diff -u "$SB/real-before.txt" "$SB/real-after.txt"
  check "no engine binary ever resolvable (transcript has no ABORT)" bash -c "! grep -q '^ABORT' '$TRANSCRIPT'"
  check "engine-absence asserted before reviews ($(grep -c '^\[engine-absence\] ok' "$TRANSCRIPT"))" \
    bash -c "[ \"\$(grep -c '^\[engine-absence\] ok' '$TRANSCRIPT')\" -ge 1 ]"
fi

# ---------------------------------------------------------------- summary ---
say ""
say "=== SUMMARY (sandbox: $SB)"
for r in "${RESULTS[@]}"; do say "$r"; done
say "checks: $CHECKS  failed: $FAILS"
if [ "$FAILS" -ne 0 ]; then exit 1; fi
exit 0
