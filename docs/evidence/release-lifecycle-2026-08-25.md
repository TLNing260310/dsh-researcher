# alpha.7 release lifecycle and Windows CI finding

## Purpose

This record separates three facts that must not be collapsed into one claim:

1. the alpha.7 release artifact was byte-bound to a clean Git commit and its installer lifecycle worked in an isolated Windows acceptance environment;
2. the first post-release GitHub Actions matrix was not green;
3. the CI failure was a Windows path-alias expectation in a test, not evidence that the installer or Quickstart identity check accepted the wrong project.

## Immutable release inputs

| Item | Value |
|---|---|
| Source commit | `78ab474e011b5c1a8eead5752562ada29b3989c9` |
| Tag | `v0.8.0-alpha.7` |
| Tarball | `dsh-researcher-0.8.0-alpha.7.tgz` |
| Tarball SHA-256 | `4985043cb369a8448b5ba55174bf3dfeecc04d56e6141120e935f8ab00e4b69a` |
| Manifest SHA-256 | `40e14c9ccae759599ae3756bbff10e44374a6fca32072d244858a0d8b00c9d45` |
| Package entries | `188` |

The tarball hash matched `package-manifest.json`; the manifest hash was listed in `SHA256SUMS`.

## Isolated artifact acceptance

The exact local tarball was executed through `npm exec --offline` with a fresh `DSH_HOME` outside the repository and explicit exact DSH `0.1.0-rc.7` package metadata.

| Check | Result |
|---|---|
| install dry-run | PASS; fresh `DSH_HOME` remained absent |
| install | PASS; both presets installed and an absent-state snapshot was created |
| manual backup | PASS; both user marker files were content-hashed into the snapshot |
| force upgrade | PASS; automatic backup preceded replacement |
| exact rollback | PASS; both marker files were restored |
| uninstall dry-run | PASS; targets and markers remained present |
| uninstall | PASS; both managed targets became absent and both markers remained in the backup |
| uninstall rollback | PASS; both targets and marker contents were restored |
| lifecycle lock cleanup | PASS; no lock remained after completed operations |
| packaged Quickstart | PASS; review artifacts were generated outside the repository with `canonical_changes: 0` |

This is filesystem-level acceptance inside the documented boundary. It does not prove OS-level transactions, resistance to a malicious local administrator, unknown DSH compatibility, model outcome value or Live E1 conformance.

## GitHub Actions finding

The first alpha.7 push run was [GitHub Actions run 32771311076](https://github.com/TLNing260310/dsh-researcher/actions/runs/32771311076).

- Ubuntu / Node 22.12.0: PASS.
- Ubuntu / Node 24.x: PASS.
- Windows / Node 22.12.0: 237/238 tests PASS; one Quickstart assertion failed.
- Windows / Node 24.x: 237/238 tests PASS; the same assertion failed.

The manifest correctly recorded the native canonical path such as `C:\Users\runneradmin\...`; the test expected the runner-provided 8.3 alias such as `C:\Users\RUNNER~1\...`. Production already used `fs.realpathSync.native` plus device/inode binding. The alpha.8 hotfix changes the test expectation to the same native canonicalization and makes no Goal Governor or Researcher runtime change.

No model, remote API or Live E1 call was used to diagnose or fix this CI issue.
