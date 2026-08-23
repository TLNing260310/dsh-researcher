# Security Policy

`dsh-researcher` intentionally enforces read-only research and host-owned goal completion. A bypass of either boundary is treated as a security issue, not a normal feature request.

## Supported versions

This project is currently alpha. Only the latest tagged prerelease receives security fixes.

| Version | Supported |
|---|---|
| `0.8.0-alpha.x` | Yes |
| `<=0.5.3` | No |

## Report privately

Use GitHub's private [Report a vulnerability](https://github.com/TLNing260310/dsh-researcher/security/advisories/new) form. Do not include exploit details in a public Issue or Discussion.

Include, when available:

- dsh-researcher, DSH, Node.js and OS versions;
- installation method and active preset;
- the `research_doctor` certificate;
- the smallest reproduction and affected boundary;
- whether project files, external paths, verifier evidence, human approval or goal terminal state were affected.

The maintainer will acknowledge a report as soon as practical, reproduce it before assigning severity, and coordinate disclosure after a fix is available. No bounty or response-time SLA is currently offered.

## Security boundaries

Please report any way to:

- write through the certified Researcher preset;
- read outside the selected project root through a confined read tool;
- bypass `research_doctor` or retain a SAFE capability after environment drift;
- forge, reorder or mismatch verifier evidence while still reaching DONE;
- let model-authored text or a model-facing generic goal tool complete a governed goal;
- replace a frozen contract, cognition state or verifier registry without detection;
- make an invalid experiment appear causally supported.

Prompt quality, a poor research conclusion, or a badly chosen human-approved Goal Contract may be important bugs, but they are not automatically security vulnerabilities unless they cross an authority boundary.
