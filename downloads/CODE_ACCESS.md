# Code and data access

## Public, no login

- Interactive site: https://mohamedsamirx.github.io/rl-final-project-site/
- Public site source: https://github.com/mohamedsamirx/rl-final-project-site
- V49 data bundle: `website/../v49_data.json` in the public site repository
- V49 event CSV, verification JSON, provenance JSON: `downloads/` on the public site
- Slides and A1 poster: `downloads/` on the public site

## Research repository

The scientific simulator, LP implementation, inverse-optimization scripts,
tests, and full experiment artifacts are in:

https://github.com/mohamedsamirx/RL_Final_Project

That repository is **private**. Course reviewers who need the research code
must be invited as collaborators by the owner. The website labels this link as
private and does not imply that it is publicly readable.

**Before submission:** the owner should invite the instructor and any authorized
graders as read-only collaborators on `RL_Final_Project`. GitHub usernames are
required for that invitation. No public release of the research repository is
required by the course instructions.

## Why the split

The public repository contains only the built static website and final
public-facing PDFs/CSVs. The private research repository contains the full
development history, experiment provenance, and code used to produce the
results. This keeps the public artifact small and avoids exposing intermediate
research state. A cleaned public scientific-code release would require a
separate review of data-sharing and licensing constraints.
