#!/usr/bin/env bash
# Tests for publish-bitbucket.sh and publish-attempt.sh, plus check-live.sh against a local
# server. No network and no secrets: the "Bitbucket" repositories are local bare repositories.
#
# Usage: bash scripts/test-publish.sh   (or npm run test:publish)
#        TEST_PUBLISH_VERBOSE=1 also prints the output of passing cases.
set -euo pipefail

scripts="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
publish="$scripts/publish-bitbucket.sh"
check_live="$scripts/check-live.sh"
sub=screenshot-editor
sha1=1111111111111111111111111111111111111111
sha2=2222222222222222222222222222222222222222
repo_name=hkalant/portfolio

work="$(mktemp -d "${TMPDIR:-/tmp}/test-publish.XXXXXX")"
trap 'rm -rf "$work"' EXIT

# Nothing from the caller's environment may leak in: no real Bitbucket settings or token.
unset BITBUCKET_TOKEN BITBUCKET_WORKSPACE BITBUCKET_PAGES_BRANCH BITBUCKET_GIT_USERNAME \
  BITBUCKET_REMOTE_URL SITE_SUBFOLDER PUBLISH_RETRY_DELAY GIT_CONFIG_COUNT \
  CHECK_LIVE_ORIGIN CHECK_LIVE_TIMEOUT CHECK_LIVE_INTERVAL GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
export GITHUB_STEP_SUMMARY="$work/step-summary.md"
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}" no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"

# Ignore the machine's git config and use one that breaks any deploy relying on it: commit
# signing that always fails, hooks that reject every commit and push, an odd default branch.
# publish-attempt.sh has to override all of it.
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="$work/hostile-gitconfig"
mkdir -p "$work/hostile-hooks" "$work/remotes" "$work/logs"
for hook in pre-commit commit-msg pre-push reference-transaction; do
  cat > "$work/hostile-hooks/$hook" << 'HOOK'
#!/bin/sh
# Bare repositories stand in for Bitbucket, which runs no such hooks.
[ "$(git rev-parse --is-bare-repository)" = true ] && exit 0
echo "hostile $(basename "$0") hook ran" >&2
exit 1
HOOK
  chmod +x "$work/hostile-hooks/$hook"
done
cat > "$GIT_CONFIG_GLOBAL" << EOF
[commit]
	gpgsign = true
[gpg]
	program = false
[core]
	hooksPath = $work/hostile-hooks
[init]
	defaultBranch = trunk
EOF

# git for setting up fixtures, as the owner of the site repository would.
tgit() {
  GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Site Owner" -c user.email=owner@example.com \
    -c commit.gpgsign=false -c init.defaultBranch=main "$@"
}

# make_site <dir> <base path>: a small stand-in for `next build` output.
make_site() {
  local dir="$1" base="$2"
  mkdir -p "$dir/_next/static/chunks/app/[slug]" "$dir/_next/static/build-1" "$dir/editor"
  # The [slug] chunk is referenced %-escaped, as webpack builds of dynamic routes do.
  cat > "$dir/index.html" << EOF
<!DOCTYPE html><html><head><link rel="stylesheet" href="$base/_next/static/chunks/app.css"/><script src="$base/_next/static/chunks/app.js" async=""></script><script src="$base/_next/static/chunks/app/%5Bslug%5D/page.js" async=""></script></head><body><a href="$base/editor/">Open the editor</a><script>self.__next_f.push([1,"\"$base/_next/static/chunks/app.js\""])</script></body></html>
EOF
  printf 'console.log("slug");\n' > "$dir/_next/static/chunks/app/[slug]/page.js"
  cat > "$dir/editor/index.html" << EOF
<!DOCTYPE html><html><head><link rel="stylesheet" href="$base/_next/static/chunks/app.css"/><script src="$base/_next/static/chunks/editor.js" async=""></script></head><body>Editor</body></html>
EOF
  printf 'console.log("app");\n' > "$dir/_next/static/chunks/app.js"
  printf 'console.log("editor");\n' > "$dir/_next/static/chunks/editor.js"
  printf 'body{margin:0}\n' > "$dir/_next/static/chunks/app.css"
  printf 'self.__BUILD_MANIFEST={};\n' > "$dir/_next/static/build-1/_buildManifest.js"
  printf '0:{"tree":true}\n' > "$dir/__next._tree.txt"
  printf '0:{"page":"home"}\n' > "$dir/index.txt"
  printf '0:{"page":"editor"}\n' > "$dir/editor/index.txt"
  printf '<!DOCTYPE html><title>404</title>\n' > "$dir/404.html"
}

# new_remote <name> [HEAD branch]: an empty bare repository; prints its path.
new_remote() {
  local dir="$work/remotes/$1.git"
  tgit init --quiet --bare --initial-branch="${2:-main}" "$dir"
  printf '%s\n' "$dir"
}

# seed <bare> <branch> <path=content>...: commits these files as the tip of <branch>.
seed() {
  seed_to "$1" "$2" "refs/heads/$2" "${@:3}"
}
# seed_to <bare> <branch> <ref> <path=content>...: the same commit, pushed to <ref> instead.
seed_to() {
  local bare="$1" branch="$2" ref="$3" tmp spec path
  shift 3
  tmp="$(mktemp -d "$work/seed.XXXXXX")"
  tgit init --quiet "$tmp"
  if tgit -C "$bare" rev-parse --verify --quiet "refs/heads/$branch" > /dev/null; then
    tgit -C "$tmp" fetch --quiet "$bare" "refs/heads/$branch"
    tgit -C "$tmp" checkout --quiet -B "$branch" FETCH_HEAD
  else
    tgit -C "$tmp" symbolic-ref HEAD "refs/heads/$branch"
  fi
  for spec in "$@"; do
    path="${spec%%=*}"
    mkdir -p "$tmp/$(dirname "$path")"
    printf '%s\n' "${spec#*=}" > "$tmp/$path"
  done
  tgit -C "$tmp" add --all --force
  tgit -C "$tmp" commit --quiet -m "Owner commit on $branch"
  tgit -C "$tmp" push --quiet "$bare" "HEAD:$ref"
  rm -rf "$tmp"
}

# Every ref and HEAD of a repository, to prove that a refused run changed nothing.
snapshot() {
  git -C "$1" for-each-ref --format='%(objectname) %(refname)'
  git -C "$1" symbolic-ref HEAD
}

# run_publish <bare> <site> [NAME=value...]: the output goes to the case log and $last_output.
last_output="$work/last-output"
run_publish() {
  local bare="$1" site="$2" rc=0
  shift 2
  env BITBUCKET_REMOTE_URL="file://$bare" PUBLISH_RETRY_DELAY=0 GITHUB_SHA="$sha1" \
    GITHUB_REPOSITORY="$repo_name" "$@" bash "$publish" "$site" > "$last_output" 2>&1 || rc=$?
  sed 's/^/    | /' "$last_output"
  return "$rc"
}

fail() {
  echo "ASSERTION FAILED: $*"
  return 1
}
assert_eq() { # assert_eq <actual> <expected> <what>
  [ "$1" = "$2" ] || fail "$3: expected [$2], got [$1]"
}
assert_output_contains() {
  grep -qF -- "$1" "$last_output" || fail "output does not contain [$1]"
}
# assert_blob <bare> <rev> <path> <expected content>
assert_blob() {
  local actual
  actual="$(git -C "$1" cat-file blob "$2:$3")" || fail "$3 is missing at $2"
  assert_eq "$actual" "$4" "content of $3 at $2"
}
assert_missing() { # assert_missing <bare> <rev> <path>
  if git -C "$1" cat-file -e "$2:$3" 2> /dev/null; then
    fail "$3 should not exist at $2"
  fi
}
# Every commit in <old>..<new> touches only <sub>/ (all of <new> when <old> is empty).
assert_only_subfolder_changed() {
  local bare="$1" old="$2" new="$3" changed outside
  if [ -n "$old" ]; then
    git -C "$bare" merge-base --is-ancestor "$old" "$new" || fail "$new does not fast-forward $old"
    changed="$(git -C "$bare" log --format= --name-only --no-renames "$old..$new")"
  else
    changed="$(git -C "$bare" log --format= --name-only --no-renames "$new")"
  fi
  [ -n "$changed" ] || fail "no paths changed in $old..$new"
  outside="$(printf '%s\n' "$changed" | sed '/^$/d' | grep -v "^$sub/" || true)"
  [ -z "$outside" ] || fail "paths outside $sub/ changed: $outside"
}
# The deployed tree under <sub>/ is exactly the site plus version.json (and kept extras).
assert_site_deployed() { # assert_site_deployed <bare> <rev> <site> [extra path...]
  local bare="$1" rev="$2" site="$3" expected actual
  shift 3
  expected="$( (
    cd "$site" && find . -type f | sed "s|^\./|$sub/|"
    echo "$sub/version.json"
    for extra in "$@"; do echo "$extra"; done
  ) | LC_ALL=C sort -u)"
  actual="$(git -C "$bare" ls-tree -r --name-only "$rev" -- "$sub/" | LC_ALL=C sort)"
  assert_eq "$actual" "$expected" "files under $sub/ at $rev"
  local file
  while IFS= read -r file; do
    git -C "$bare" cat-file blob "$rev:$sub/$file" | cmp -s - "$site/$file" || fail "$sub/$file differs from the site"
  done < <(cd "$site" && find . -type f | sed 's|^\./||')
}
commit_count() { git -C "$1" rev-list --count "$2"; }

# --- Fixtures shared by the cases -----------------------------------------------------------
site="$work/site"
make_site "$site" "/$sub"
site_v2="$work/site-v2"
make_site "$site_v2" "/$sub"
printf 'console.log("app v2");\n' > "$site_v2/_next/static/chunks/app.js"
rm "$site_v2/_next/static/chunks/editor.js"
printf 'console.log("editor v2");\n' > "$site_v2/_next/static/chunks/editor-v2.js"
cat > "$site_v2/editor/index.html" << EOF
<!DOCTYPE html><html><head><link rel="stylesheet" href="/$sub/_next/static/chunks/app.css"/><script src="/$sub/_next/static/chunks/editor-v2.js" async=""></script></head><body>Editor v2</body></html>
EOF
site_no_base="$work/site-no-base"
make_site "$site_no_base" ""
site_bad_file="$work/site-bad-file"
make_site "$site_bad_file" "/$sub"
mkdir -p "$site_bad_file/editor/nested"
printf 'gitdir: nowhere\n' > "$site_bad_file/editor/nested/.git"
version_json="{\"sha\":\"$sha1\",\"repo\":\"$repo_name\"}"
owner_files=("index.html=<h1>Portfolio</h1>" "README.md=# My portfolio" "projects/other-app/index.html=<p>Another app</p>")

# --- Cases ----------------------------------------------------------------------------------
case_empty_remote() {
  local bare tip
  bare="$(new_remote empty)"
  run_publish "$bare" "$site"
  tip="$(git -C "$bare" rev-parse refs/heads/main)"
  assert_eq "$(commit_count "$bare" "$tip")" 1 "commits on main"
  assert_only_subfolder_changed "$bare" "" "$tip"
  assert_site_deployed "$bare" "$tip" "$site"
  assert_blob "$bare" "$tip" "$sub/version.json" "$version_json"
  assert_eq "$(git -C "$bare" log -1 --format='%an <%ae>|%s' "$tip")" \
    "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>|Deploy $sub from $repo_name@${sha1:0:7}" \
    "author and message"
  assert_eq "$(git -C "$bare" for-each-ref --format='%(refname)')" refs/heads/main "branches"
}

case_root_untouched() {
  local bare before tip spec
  bare="$(new_remote with-root)"
  seed "$bare" main "${owner_files[@]}"
  before="$(git -C "$bare" rev-parse refs/heads/main)"
  run_publish "$bare" "$site"
  tip="$(git -C "$bare" rev-parse refs/heads/main)"
  assert_eq "$(git -C "$bare" rev-parse "$tip^")" "$before" "parent of the deploy commit"
  assert_only_subfolder_changed "$bare" "$before" "$tip"
  for spec in "${owner_files[@]}"; do
    assert_blob "$bare" "$tip" "${spec%%=*}" "${spec#*=}"
    assert_eq "$(git -C "$bare" rev-parse "$tip:${spec%%=*}")" "$(git -C "$bare" rev-parse "$before:${spec%%=*}")" "blob of ${spec%%=*}"
  done
  assert_eq "$(git -C "$bare" ls-tree -r --name-only "$tip" | grep -cv "^$sub/")" "${#owner_files[@]}" "number of files outside $sub/"
  assert_site_deployed "$bare" "$tip" "$site"
}

case_stale_subfolder() {
  local bare before tip
  bare="$(new_remote stale)"
  seed "$bare" main "README.md=# My portfolio" \
    "$sub/stale.html=old page" "$sub/old-dir/data.txt=old data" \
    "$sub/_next/old-build/_buildManifest.js=old manifest" \
    "$sub/_next/static/old.js=old chunk" "$sub/_next/static/chunks/app.js=old app"
  before="$(git -C "$bare" rev-parse refs/heads/main)"
  run_publish "$bare" "$site_v2"
  tip="$(git -C "$bare" rev-parse refs/heads/main)"
  assert_only_subfolder_changed "$bare" "$before" "$tip"
  assert_missing "$bare" "$tip" "$sub/stale.html"
  assert_missing "$bare" "$tip" "$sub/old-dir/data.txt"
  assert_missing "$bare" "$tip" "$sub/_next/old-build/_buildManifest.js"
  assert_blob "$bare" "$tip" "$sub/_next/static/old.js" "old chunk"
  assert_blob "$bare" "$tip" "$sub/_next/static/chunks/app.js" 'console.log("app v2");'
  assert_blob "$bare" "$tip" "README.md" "# My portfolio"
  assert_site_deployed "$bare" "$tip" "$site_v2" "$sub/_next/static/old.js"
}

case_redeploy_is_noop() {
  local bare first tip
  bare="$(new_remote redeploy)"
  seed "$bare" main "${owner_files[@]}"
  run_publish "$bare" "$site"
  first="$(git -C "$bare" rev-parse refs/heads/main)"
  run_publish "$bare" "$site"
  assert_output_contains "No changes to deploy"
  assert_eq "$(git -C "$bare" rev-parse refs/heads/main)" "$first" "main after the same deploy again"
  # A new commit of the app with identical output changes only version.json.
  run_publish "$bare" "$site" GITHUB_SHA="$sha2"
  tip="$(git -C "$bare" rev-parse refs/heads/main)"
  assert_eq "$(git -C "$bare" rev-parse "$tip^")" "$first" "parent of the second deploy"
  assert_eq "$(git -C "$bare" diff --name-only "$first" "$tip")" "$sub/version.json" "paths changed by the second deploy"
  assert_blob "$bare" "$tip" "$sub/version.json" "{\"sha\":\"$sha2\",\"repo\":\"$repo_name\"}"
}

case_default_branch_detected() {
  local bare main_before pages_before tip
  bare="$(new_remote pages-default pages)"
  seed "$bare" pages "index.html=<h1>Served from pages</h1>"
  seed "$bare" main "main-only.txt=not served"
  main_before="$(git -C "$bare" rev-parse refs/heads/main)"
  pages_before="$(git -C "$bare" rev-parse refs/heads/pages)"
  run_publish "$bare" "$site"
  assert_output_contains "Publishing to: pages"
  tip="$(git -C "$bare" rev-parse refs/heads/pages)"
  assert_eq "$(git -C "$bare" rev-parse refs/heads/main)" "$main_before" "main (not the default branch)"
  assert_only_subfolder_changed "$bare" "$pages_before" "$tip"
  assert_site_deployed "$bare" "$tip" "$site"
  assert_blob "$bare" "$tip" index.html "<h1>Served from pages</h1>"
}

case_branch_override() {
  local bare before pages_before tip
  bare="$(new_remote pages-override pages)"
  seed "$bare" pages "index.html=<h1>Old site</h1>"
  seed "$bare" main "index.html=<h1>Served from main</h1>"
  before="$(snapshot "$bare")"
  if run_publish "$bare" "$site" BITBUCKET_PAGES_BRANCH="bad..name"; then
    fail "an invalid BITBUCKET_PAGES_BRANCH was accepted"
  fi
  assert_eq "$(snapshot "$bare")" "$before" "remote after an invalid branch name"
  pages_before="$(git -C "$bare" rev-parse refs/heads/pages)"
  run_publish "$bare" "$site" BITBUCKET_PAGES_BRANCH=main
  assert_output_contains "Publishing to: main"
  assert_eq "$(git -C "$bare" rev-parse refs/heads/pages)" "$pages_before" "pages (not the chosen branch)"
  tip="$(git -C "$bare" rev-parse refs/heads/main)"
  assert_only_subfolder_changed "$bare" "$tip^" "$tip"
  assert_site_deployed "$bare" "$tip" "$site"
}

case_gitignore_does_not_drop_files() {
  local bare before tip
  bare="$(new_remote gitignore)"
  seed "$bare" main ".gitignore=_next
*.txt
version.json" "index.html=<h1>Portfolio</h1>"
  before="$(git -C "$bare" rev-parse refs/heads/main)"
  run_publish "$bare" "$site"
  tip="$(git -C "$bare" rev-parse refs/heads/main)"
  assert_only_subfolder_changed "$bare" "$before" "$tip"
  assert_site_deployed "$bare" "$tip" "$site"
  assert_blob "$bare" "$tip" .gitignore "_next
*.txt
version.json"
}

case_bad_subfolder_refused() { # case_bad_subfolder_refused <value>
  local bare before
  bare="$(new_remote "bad-sub-$(printf '%s' "$1" | od -An -tx1 | tr -d ' \n')")"
  seed "$bare" main "${owner_files[@]}" "$sub/index.html=current app"
  before="$(snapshot "$bare")"
  if run_publish "$bare" "$site" SITE_SUBFOLDER="$1"; then
    fail "SITE_SUBFOLDER='$1' was accepted"
  fi
  assert_output_contains "SITE_SUBFOLDER must be"
  assert_eq "$(snapshot "$bare")" "$before" "remote after SITE_SUBFOLDER='$1'"
}

case_site_without_base_path_refused() {
  local bare before
  bare="$(new_remote no-base)"
  seed "$bare" main "${owner_files[@]}"
  before="$(snapshot "$bare")"
  if run_publish "$bare" "$site_no_base"; then
    fail "a site built without the base path was accepted"
  fi
  assert_output_contains "does not reference \"/$sub/_next/\""
  # A site built for another subfolder is refused too.
  if run_publish "$bare" "$site" SITE_SUBFOLDER=other-app; then
    fail "a site built for /$sub was accepted for other-app/"
  fi
  assert_output_contains 'does not reference "/other-app/_next/"'
  assert_eq "$(snapshot "$bare")" "$before" "remote after the refused sites"
}

# The deploy keeps the old <sub>/_next/static/, so only a check of the site folder itself can
# tell that a site is incomplete. Each of these would otherwise replace a working app.
case_incomplete_site_refused() {
  local bare before partial
  bare="$(new_remote incomplete)"
  seed "$bare" main "${owner_files[@]}"
  run_publish "$bare" "$site"
  before="$(snapshot "$bare")"

  # Only an index.html, no _next/static/ at all.
  partial="$work/site-index-only"
  mkdir -p "$partial"
  printf '<script src="/%s/_next/static/chunks/b2.js"></script>\n' "$sub" > "$partial/index.html"
  if run_publish "$bare" "$partial"; then
    fail "a site without _next/static/ was published"
  fi
  assert_output_contains "_next/static/ is missing or empty"

  # out/editor/ given instead of out/: its index.html has the base path too.
  if run_publish "$bare" "$site/editor"; then
    fail "the editor/ subfolder of a site was published as the whole site"
  fi
  assert_output_contains "_next/static/ is missing or empty"

  # A chunk the HTML loads is missing.
  partial="$work/site-missing-chunk"
  cp -R "$site" "$partial"
  rm "$partial/_next/static/chunks/editor.js"
  if run_publish "$bare" "$partial"; then
    fail "a site missing a chunk its HTML loads was published"
  fi
  assert_output_contains "path(s) that are not in it, such as: /$sub/_next/static/chunks/editor.js"

  # A page the HTML links to is missing.
  partial="$work/site-missing-page"
  cp -R "$site" "$partial"
  rm -r "$partial/editor"
  if run_publish "$bare" "$partial"; then
    fail "a site missing a page its HTML links to was published"
  fi
  assert_output_contains "path(s) that are not in it, such as: /$sub/editor/"

  assert_eq "$(snapshot "$bare")" "$before" "remote after the refused incomplete sites"
  # None of it was retried: the site folder is checked once, before any attempt.
  if grep -qF "Publish attempt" "$last_output"; then
    fail "an incomplete site reached a publish attempt"
  fi
}

case_untrackable_file_refused() {
  local bare before
  bare="$(new_remote untrackable)"
  seed "$bare" main "${owner_files[@]}"
  before="$(snapshot "$bare")"
  if run_publish "$bare" "$site_bad_file"; then
    fail "a site with a file git cannot track was published"
  fi
  assert_output_contains "Verification failed: these site files are not tracked"
  assert_eq "$(snapshot "$bare")" "$before" "remote after the failed verification"
}

case_missing_remote_fails() {
  if run_publish "$work/remotes/does-not-exist.git" "$site"; then
    fail "publishing to a missing repository succeeded"
  fi
  assert_output_contains "Publish attempt 3 of 3"
  assert_output_contains "Publishing failed after 3 attempts"
  [ ! -e "$work/remotes/does-not-exist.git" ] || fail "the missing repository was created"
}

# Step 2 of an attempt: when looking up the branch fails for a real reason (git exits 128 on
# an auth or network error), the attempt must fail, not take the repository for empty and
# start a new branch. A git wrapper fails that lookup only; everything else works.
case_branch_lookup_error_fails() {
  local real_git shim bare before name
  real_git="$(command -v git)"
  shim="$work/lookup-error-bin"
  mkdir -p "$shim"
  cat > "$shim/git" << EOF
#!/bin/sh
if [ "\$1" = ls-remote ]; then
  case " \$* " in
    *" --symref "*) ;;
    *)
      echo "fatal: unable to access the remote: The requested URL returned error: 403 (simulated)" >&2
      exit 128
      ;;
  esac
fi
exec "$real_git" "\$@"
EOF
  chmod +x "$shim/git"
  # With main, and empty: the empty one is where a wrong "no such branch" would push.
  for name in lookup-error-main lookup-error-empty; do
    bare="$(new_remote "$name")"
    if [ "$name" = lookup-error-main ]; then
      seed "$bare" main "${owner_files[@]}"
    fi
    before="$(snapshot "$bare")"
    if run_publish "$bare" "$site" PATH="$shim:$PATH"; then
      fail "a failed branch lookup was taken for a missing branch ($name)"
    fi
    assert_output_contains "Could not list branches of the remote (git exit code 128)"
    assert_output_contains "Publishing failed after 3 attempts"
    assert_eq "$(snapshot "$bare")" "$before" "remote after failed branch lookups ($name)"
  done
}

case_rejected_push_is_retried() {
  local bare before tip
  bare="$(new_remote flaky)"
  seed "$bare" main "${owner_files[@]}"
  # Reject the first push, as when someone else pushed in between. (hooks/ only exists when
  # git has templates, so create it.)
  mkdir -p "$bare/hooks"
  cat > "$bare/hooks/pre-receive" << EOF
#!/bin/sh
if [ ! -e "$bare/rejected-once" ]; then
  touch "$bare/rejected-once"
  echo "rejected for the test" >&2
  exit 1
fi
EOF
  chmod +x "$bare/hooks/pre-receive"
  git -C "$bare" config core.hooksPath "$bare/hooks"
  before="$(git -C "$bare" rev-parse refs/heads/main)"
  run_publish "$bare" "$site"
  assert_output_contains "Publish attempt 1 of 3 failed"
  assert_output_contains "attempt 2 of 3"
  tip="$(git -C "$bare" rev-parse refs/heads/main)"
  assert_eq "$(git -C "$bare" rev-parse "$tip^")" "$before" "parent of the single deploy commit"
  assert_only_subfolder_changed "$bare" "$before" "$tip"
}

case_concurrent_owner_push_is_kept() {
  local bare before owner_tip tip real_git shim
  bare="$(new_remote race)"
  seed "$bare" main "${owner_files[@]}"
  before="$(git -C "$bare" rev-parse refs/heads/main)"
  # The owner's next commit, made in advance and parked outside refs/heads.
  seed_to "$bare" main refs/owner/next "news.md=Pushed by the owner during the deploy"
  owner_tip="$(git -C "$bare" rev-parse refs/owner/next)"
  # A git wrapper that lands the owner's commit just before the deploy's first push, as if
  # the owner pushed between the deploy's fetch and its push.
  real_git="$(command -v git)"
  shim="$work/race-bin"
  mkdir -p "$shim"
  cat > "$shim/git" << EOF
#!/bin/sh
if [ "\$1" = push ] && [ ! -e "$work/race-done" ]; then
  touch "$work/race-done"
  "$real_git" -C "$bare" update-ref refs/heads/main "$owner_tip" "$before"
fi
exec "$real_git" "\$@"
EOF
  chmod +x "$shim/git"
  run_publish "$bare" "$site" PATH="$shim:$PATH"
  assert_output_contains "Publish attempt 1 of 3 failed"
  tip="$(git -C "$bare" rev-parse refs/heads/main)"
  assert_eq "$(git -C "$bare" rev-parse "$tip^")" "$owner_tip" "parent of the deploy commit (the owner's commit)"
  assert_blob "$bare" "$tip" news.md "Pushed by the owner during the deploy"
  assert_only_subfolder_changed "$bare" "$owner_tip" "$tip"
  assert_site_deployed "$bare" "$tip" "$site"
}

free_port() {
  node -e 'const s = require("net").createServer(); s.listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); });'
}
wait_for_url() { # wait_for_url <url>: any HTTP answer will do
  local tries=0
  until curl --silent --output /dev/null "$1"; do
    tries=$((tries + 1))
    [ "$tries" -lt 100 ] || fail "nothing answers at $1"
    sleep 0.1
  done
}

case_check_live() {
  local live port wrong_port rc
  # This case runs in its own subshell, so this trap stops the servers however the case ends.
  # (server_pids is not local: the trap runs after the function has returned.)
  server_pids=()
  trap 'kill "${server_pids[@]}" 2> /dev/null || true' EXIT
  # The site with icons and a link preview image, named in the home page's head.
  local checked="$work/checked"
  mkdir -p "$checked"
  cp -R "$site/." "$checked/"
  printf '<svg xmlns="http://www.w3.org/2000/svg"/>\n' > "$checked/icon.svg"
  printf 'png\n' > "$checked/icon2.png"
  printf 'png\n' > "$checked/opengraph-image.png"
  local head='<link rel="icon" href="/'"$sub"'/icon.svg?icon.1.svg" sizes="any" type="image/svg+xml"/><link rel="icon" href="/'"$sub"'/icon2.png?icon2.1.png" sizes="32x32" type="image/png"/><meta property="og:image" content="https://example.com/'"$sub"'/opengraph-image.png?og.1.png"/><meta name="twitter:image" content="https://example.com/'"$sub"'/opengraph-image.png?og.1.png"/>'
  sed -i.bak "s#<head>#<head>$head#" "$checked/index.html" && rm "$checked/index.html.bak"
  live="$work/live/$sub"
  mkdir -p "$live"
  cp -R "$checked/." "$live/"
  printf '%s\n' "$version_json" > "$live/version.json"

  # The app's own strict static server stands in for Bitbucket.
  port="$(free_port)"
  node "$scripts/static-server.mjs" --dir "$live" --base "/$sub" --port "$port" > "$work/logs/static-server.log" 2>&1 &
  server_pids+=($!)
  # A host that serves everything except the top index.html as application/octet-stream,
  # and turns link preview bots away.
  wrong_port="$(free_port)"
  node -e '
    const http = require("http"), fs = require("fs"), path = require("path");
    const [root, base, port] = process.argv.slice(1);
    http.createServer((req, res) => {
      if (/facebookexternalhit/.test(req.headers["user-agent"] || "")) { res.writeHead(403); res.end(); return; }
      let rel = decodeURIComponent(req.url.split("?")[0]);
      if (!rel.startsWith(base + "/")) { res.writeHead(404); res.end(); return; }
      rel = rel.slice(base.length + 1);
      if (rel === "" || rel.endsWith("/")) rel += "index.html";
      fs.readFile(path.join(root, rel), (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { "Content-Type": rel === "index.html" ? "text/html" : "application/octet-stream" });
        res.end(data);
      });
    }).listen(Number(port), "127.0.0.1");
  ' "$live" "/$sub" "$wrong_port" > "$work/logs/wrong-type-server.log" 2>&1 &
  server_pids+=($!)
  wait_for_url "http://127.0.0.1:$port/$sub/"
  wait_for_url "http://127.0.0.1:$wrong_port/$sub/"
  local live_env=(CHECK_LIVE_ORIGIN="http://127.0.0.1:$port" CHECK_LIVE_TIMEOUT=2 CHECK_LIVE_INTERVAL=1 GITHUB_SHA="$sha1")

  # Everything in place: exit 0, and a summary with the URL and the results.
  : > "$GITHUB_STEP_SUMMARY"
  rc=0
  env "${live_env[@]}" bash "$check_live" "$checked" > "$last_output" 2>&1 || rc=$?
  sed 's/^/    | /' "$last_output"
  assert_eq "$rc" 0 "exit code for a complete site"
  assert_output_contains "All required checks passed"
  grep -qF "Live URL: http://127.0.0.1:$port/$sub/" "$GITHUB_STEP_SUMMARY" || fail "summary has no live URL"
  grep -qF "| Static files | PASS | all 4 " "$GITHUB_STEP_SUMMARY" || fail "summary does not list 4 static files"
  for row in "GET /$sub/icon.svg | PASS | 200 image/svg+xml" "GET /$sub/icon2.png | PASS | 200 image/png" \
    "GET /$sub/opengraph-image.png | PASS | 200 image/png" "GET /$sub/ as a link preview bot | PASS" \
    "GET /$sub/opengraph-image.png as a link preview bot | PASS"; do
    grep -qF "| $row" "$GITHUB_STEP_SUMMARY" || fail "summary has no row: $row"
  done
  if grep -qF "| FAIL |" "$GITHUB_STEP_SUMMARY"; then
    fail "the summary reports a failed check"
  fi

  # Another commit is live: a warning, and exit 0.
  rc=0
  env "${live_env[@]}" GITHUB_SHA="$sha2" bash "$check_live" "$checked" > "$last_output" 2>&1 || rc=$?
  sed 's/^/    | /' "$last_output"
  assert_eq "$rc" 0 "exit code when the new version never shows up"
  assert_output_contains "::warning title=Site not live yet::"

  # A page, CSS and JavaScript with the wrong content type are hard failures.
  rc=0
  env "${live_env[@]}" CHECK_LIVE_ORIGIN="http://127.0.0.1:$wrong_port" bash "$check_live" "$checked" > "$last_output" 2>&1 || rc=$?
  sed 's/^/    | /' "$last_output"
  assert_eq "$rc" 1 "exit code for wrong content types"
  assert_output_contains "PASS  GET /$sub/: 200 text/html"
  assert_output_contains "::error::GET /$sub/editor/: expected 200 text/html, got 200 application/octet-stream"
  assert_output_contains "::error::GET /$sub/_next/static/chunks/app.css: expected text/css, got application/octet-stream"
  assert_output_contains "::error::GET /$sub/_next/static/chunks/app.js: expected a JavaScript content type, got application/octet-stream"
  # Icons with the wrong type, and link preview bots turned away, are warnings only.
  assert_output_contains "::warning::GET /$sub/icon.svg: expected image/svg+xml, got application/octet-stream"
  assert_output_contains "::warning::GET /$sub/ as a link preview bot: expected 200 text/html, got 403"
  assert_output_contains "::warning::GET /$sub/opengraph-image.png as a link preview bot: expected 200 and an image type, got 403"
  if grep -qE "::error::GET /$sub/(icon|opengraph)" "$last_output"; then
    fail "a wrong image type should not fail the check"
  fi

  # A missing chunk is a hard failure.
  rm "$live/_next/static/chunks/app.css"
  rc=0
  env "${live_env[@]}" bash "$check_live" "$checked" > "$last_output" 2>&1 || rc=$?
  sed 's/^/    | /' "$last_output"
  assert_eq "$rc" 1 "exit code when a chunk is missing"
  assert_output_contains "::error::GET /$sub/_next/static/chunks/app.css: expected 200, got 404"

  # A missing icon or link preview image is a hard failure.
  cp "$site/_next/static/chunks/app.css" "$live/_next/static/chunks/app.css"
  rm "$live/icon2.png" "$live/opengraph-image.png"
  rc=0
  env "${live_env[@]}" bash "$check_live" "$checked" > "$last_output" 2>&1 || rc=$?
  sed 's/^/    | /' "$last_output"
  assert_eq "$rc" 1 "exit code when an icon and the preview image are missing"
  assert_output_contains "::error::GET /$sub/icon2.png: expected 200, got 404"
  assert_output_contains "::error::GET /$sub/opengraph-image.png: expected 200, got 404"
  cp "$checked/icon2.png" "$checked/opengraph-image.png" "$live/"

  # A missing page is a hard failure, even when every static file loads.
  rm "$live/editor/index.html"
  : > "$GITHUB_STEP_SUMMARY"
  rc=0
  env "${live_env[@]}" bash "$check_live" "$checked" > "$last_output" 2>&1 || rc=$?
  sed 's/^/    | /' "$last_output"
  assert_eq "$rc" 1 "exit code when a page is missing"
  assert_output_contains "::error::GET /$sub/editor/: expected 200 text/html, got 404"
  grep -qF "| Static files | PASS | all 4 " "$GITHUB_STEP_SUMMARY" || fail "the static files should still pass"
}

# --- Runner ---------------------------------------------------------------------------------
passed=0
failed=0
skipped=0
# run_case <description> <function> [args...]: each case runs in a subshell with `set -e`
# active (it is not called from an if or ||, where bash would ignore `set -e`).
run_case() {
  local description="$1" log="$work/logs/case.log" rc
  shift
  set +e
  (
    set -e
    "$@"
  ) > "$log" 2>&1
  rc=$?
  set -e
  if [ "$rc" -eq 0 ]; then
    passed=$((passed + 1))
    echo "PASS: $description"
    if [ "${TEST_PUBLISH_VERBOSE:-}" = 1 ]; then
      sed 's/^/      /' "$log"
    fi
  else
    failed=$((failed + 1))
    echo "FAIL: $description"
    sed 's/^/      /' "$log"
  fi
}

echo "Testing scripts/publish-bitbucket.sh with local bare repositories (no network)"
run_case "empty remote: creates main with only $sub/" case_empty_remote
run_case "remote with a root site: root files byte-identical, only $sub/ changes" case_root_untouched
run_case "stale $sub/: stale files removed, old _next/static kept, new files present" case_stale_subfolder
run_case "same site and SHA again: no new commit; new SHA changes only version.json" case_redeploy_is_noop
run_case "remote default branch 'pages' is detected and used" case_default_branch_detected
run_case "BITBUCKET_PAGES_BRANCH overrides the default branch; invalid names refused" case_branch_override
run_case "root .gitignore with _next, *.txt and version.json does not drop files" case_gitignore_does_not_drop_files
for value in "" "/" ".." "a/b" "My.App" "-x" "$sub/"; do
  run_case "SITE_SUBFOLDER='$value' is refused and the remote is unchanged" case_bad_subfolder_refused "$value"
done
run_case "site built without /$sub/_next/ (or for another folder) is refused" case_site_without_base_path_refused
run_case "incomplete site (no _next/static, out/editor, missing chunk or page) is refused; remote unchanged" case_incomplete_site_refused
run_case "site file git cannot track fails verification; remote unchanged" case_untrackable_file_refused
run_case "missing remote fails after 3 attempts with a non-zero exit" case_missing_remote_fails
run_case "branch lookup error (exit 128) fails every attempt, never taken for an empty repo" case_branch_lookup_error_fails
run_case "rejected push is retried and lands as one fast-forward commit" case_rejected_push_is_retried
run_case "owner pushes during the deploy: no force push, their commit is kept" case_concurrent_owner_push_is_kept
if command -v node > /dev/null && command -v curl > /dev/null; then
  run_case "check-live.sh on local servers: pass, not live yet, wrong types, preview bots, missing chunk, icon, page" case_check_live
else
  skipped=$((skipped + 1))
  echo "SKIP: check-live.sh against a local static server (needs node and curl)"
fi

echo "test-publish: $passed passed, $failed failed, $skipped skipped"
[ "$failed" -eq 0 ]
