// internal/cli/orca_serve.go
//
// Pure command builders for Orca Server (orca-serve) composition on pve-lxc.
// These functions return shell command lists / scripts that later tasks exec
// in the box; they perform no I/O themselves.
//
// Design (approved 2026-08-07, projects/cmux/work/2026-08-07-orca-serve-start-mode):
//   - Claude/Codex config lands under /home/orca via --mirror-local
//     TargetHome=/home/orca (same allowlist/redaction as root mirror).
//   - gh uses the LXC workspace default under /root; orca delegates via a
//     G1 credential helper (sudo -n gh auth git-credential) plus an optional
//     G2 wrapper. Never instruct `gh auth login` as orca.
//   - B1 bridge: system user orca (nologin), sudoers NOPASSWD, home symlinks,
//     npm prefix ~/.local, git safe.directory. Never Environment=HOME=/root
//     (Chromium SIGTRAP).
package cli

import (
	"strings"

	"github.com/karlorz/devsh/internal/mirrorlocal"
)

// BuildWorkspaceGHForOrcaCommands returns commands wiring orca git/gh to the
// workspace root default (/root/.config/gh) without a second gh auth login.
//
// G1: orca's global git config uses root's gh via a sudo -n credential helper
// for github.com and gist.github.com. G2: optional ~/.local/bin/gh wrapper so
// `gh` on orca's PATH behaves like root's gh.
func BuildWorkspaceGHForOrcaCommands() []string {
	return []string{
		`su -s /bin/bash orca -c 'git config --global credential.https://github.com.helper "!sudo -n /usr/bin/gh auth git-credential"'`,
		`su -s /bin/bash orca -c 'git config --global credential.https://gist.github.com.helper "!sudo -n /usr/bin/gh auth git-credential"'`,
		// Optional G2 wrapper: orca `gh` delegates to root's workspace gh.
		`install -d /home/orca/.local/bin`,
		`printf '%s\n' '#!/bin/sh' 'exec sudo -n /usr/bin/gh "$@"' > /home/orca/.local/bin/gh`,
		`chmod 755 /home/orca/.local/bin/gh`,
		`chown orca:orca /home/orca/.local/bin/gh`,
	}
}

// BuildMigrateAgentHomeFromRootCommands returns a script copying the agent
// config allowlist from /root to /home/orca on long-lived boxes already
// mirrored to root. The allowlist is mirrorlocal.DefaultIncludePaths; secrets
// (auth.json etc.) are never copied. Ownership lands on orca:orca.
func BuildMigrateAgentHomeFromRootCommands() []string {
	var b strings.Builder
	b.WriteString("set -e\n")
	b.WriteString("# Migrate agent config allowlist from /root to /home/orca (mirrorlocal DefaultIncludePaths).\n")
	b.WriteString("# skip auth.json and other secret files: never copied.\n")
	b.WriteString("mkdir -p /home/orca\n")
	b.WriteString("for p in \\\n")
	for _, p := range mirrorlocal.DefaultIncludePaths {
		b.WriteString("  " + p + " \\\n")
	}
	b.WriteString("; do\n")
	b.WriteString("  if [ -e \"/root/$p\" ]; then\n")
	b.WriteString("    mkdir -p \"/home/orca/$(dirname \"$p\")\"\n")
	b.WriteString("    cp -a \"/root/$p\" \"/home/orca/$p\"\n")
	b.WriteString("  fi\n")
	b.WriteString("done\n")
	b.WriteString("chown -R orca:orca /home/orca/.claude /home/orca/.codex 2>/dev/null || true\n")
	return []string{b.String()}
}

// BuildOrcaB1EnsureCommands returns idempotent B1 bridge commands: system user
// orca (nologin), passwordless sudoers, traversal perms on /root trees, home
// symlinks, npm prefix ~/.local, and git safe.directory for root-owned repos.
// Never sets HOME=/root for orca (Chromium SIGTRAP).
func BuildOrcaB1EnsureCommands() []string {
	return []string{
		`id orca >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin orca`,
		`echo "orca ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/orca`,
		`chmod 440 /etc/sudoers.d/orca`,
		`chmod 755 /root`,
		`[ -d /root/workspace ] && chmod 755 /root/workspace || true`,
		`[ -d /root/wiki ] && chmod 755 /root/wiki || true`,
		`ln -sfn /root /home/orca/root-home`,
		`ln -sfn /root/workspace /home/orca/workspace`,
		`ln -sfn /root/wiki /home/orca/wiki`,
		`chown -h orca:orca /home/orca/root-home /home/orca/workspace /home/orca/wiki`,
		`su -s /bin/bash orca -c 'mkdir -p "$HOME/.local/bin" "$HOME/.local/lib/node_modules"; npm config set prefix "$HOME/.local"'`,
		`su -s /bin/bash orca -c 'git config --global --add safe.directory /root/workspace; git config --global --add safe.directory /root/wiki; git config --global --add safe.directory /root'`,
	}
}

// BuildAgentMatrixCommand returns a single shell script printing the orca
// detection matrix: CLIs on orca PATH, mirrored config under /home/orca, gh
// via the workspace root default, and agent auth-file presence. It never
// instructs `gh auth login` as orca.
func BuildAgentMatrixCommand() string {
	return `#!/bin/bash
# orca-serve agent detection matrix (run as root).
echo "== orca agent matrix =="
echo "-- binaries on orca PATH --"
for b in claude codex grok gh; do
  if p=$(su -s /bin/bash orca -c "command -v $b" 2>/dev/null); then
    echo "ok   $b: $p"
  else
    echo "miss $b"
  fi
done
echo "-- mirrored config under /home/orca --"
for p in .claude .codex; do
  if [ -e "/home/orca/$p" ]; then
    echo "ok   /home/orca/$p"
  else
    echo "miss /home/orca/$p"
  fi
done
echo "-- gh via workspace root default --"
if [ -f /root/.config/gh/hosts.yml ]; then
  echo "ok   root gh hosts present; orca delegates via sudo -n gh"
  sudo -n /usr/bin/gh auth status 2>&1 | head -5 || true
else
  echo "warn root gh not configured"
fi
echo "-- agent auth files (absent unless device-auth done as orca) --"
for f in /home/orca/.claude/auth.json /home/orca/.codex/auth.json; do
  if [ -e "$f" ]; then
    echo "note $f present"
  else
    echo "ok   $f absent"
  fi
done
`
}
