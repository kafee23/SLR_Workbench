# Contributing

Thank you for considering a contribution. This document explains how the project is organised, how to make and test a change, and what a good pull request looks like.

## Ways to contribute

- Report a bug or a confusing behaviour. Use the bug report template; include the browser and version, the steps, and what happened. Do not attach a project file containing unpublished data to a public issue.
- Propose a feature. Use the feature request template and say which stage of a review it serves and which PRISMA 2020 item, if any, it supports.
- Improve the documentation. The user guide, FAQ and methods notes live under `docs/`.
- Add a parser for a database export the tool does not read yet, with a fixture under `examples/` and a check in `test/parsers.js`.
- Add a language. The interface strings are in `src/02_body.html` and the script parts; there is no translation framework yet, and a proposal for one would be welcome.

Please open an issue before starting anything large, so that effort is not duplicated and the design can be discussed first.

## Design principles

Pull requests are judged against these, so it is worth knowing them.

1. One file, no server, no external JavaScript dependency. The application must keep working from a local file with no network. Do not add a CDN script or a build-time bundler dependency that changes this.
2. Data stays on the user's machine. No telemetry, no remote calls.
3. Discipline-neutral defaults. Nothing in the checklist, the reasons or the sample data should presume a field.
4. Everything that changes state goes through `mutate()` so that it is logged and autosaved.
5. Nothing is silently destructive. Removal of records requires confirmation and is counted and logged.
6. Numbers that appear in a report must be derivable or visibly overridden.
7. Where a specialist tool already does something well (meta-analysis, reference management), export to it rather than reimplement it.

## Source layout

The shipped file is a concatenation of eight ordered parts under `src/`:

| Part | Contents |
|---|---|
| `01_head.html` | document head, CSS custom properties, all styles |
| `02_body.html` | markup for the header, tab bar, ten tab panels, modal and toast host |
| `03_core.js` | utilities, state model (`blankState`, `normaliseRecord`, `migrateState`), audit (`logAudit`, `mutate`), storage (`Store`), UI helpers (`UI`) |
| `04_import.js` | `VirtualTable`, text normalisation, `boundedLev`, `titleSimilarity`, union-find, `Parse`, `Import`, `Dedup` |
| `05_screen.js` | `Records`, `Reviewers`, decision helpers, `Screen`, `Agreement` |
| `06_prisma.js` | `SearchRec`, `Prisma`, `Diagram` |
| `07_charts.js` | `Chart`, `Analytics`, `buildChecklist`, `Checklist` |
| `08_boot.js` | `Exports`, `Project`, `bootRender`, the boot sequence, `runSelfTest` |

Each script part is wrapped in its own `<script>` element with `'use strict'`. Globals are deliberate: the modules are plain objects on `window` so that the tests and the self-test can drive them, and so that a user can inspect state in the browser console.

Edit the parts, never `index.html` directly; the build overwrites it.

## Making a change

```bash
git clone https://github.com/USERNAME/slr-workbench.git
cd slr-workbench
npm install
npx playwright install chromium     # once
npm run build                        # writes index.html and dist/
npm test                             # self-test, parsers, workflow
```

Open `index.html` in a browser while you work; reload after each build. The self-test at `index.html?selftest=1` is a quick check that the arithmetic still holds.

If your change touches deduplication, run `npm run bench` before and after and include the figures in the pull request. If it touches the interface, run `npm run screenshots -- --docs` and commit the refreshed images only if the change is intentional and visible. If it touches the flow diagram, run `npm run figure -- --docs`.

## Tests

There is no test framework; each script under `test/` opens the built file in headless Chromium with Playwright, drives the application through its globals, prints results and exits non-zero on failure. Continuous integration runs them on every push.

| Script | What it checks |
|---|---|
| `test/selftest.js` | the application's own eight-point self-test |
| `test/parsers.js` | RIS, BibTeX, NBIB and CSV parsing over `examples/`, and cross-format DOI normalisation |
| `test/workflow.js` | a 5,000-record end-to-end run: dedup precision and recall, virtualisation, kappa, conflict resolution, PRISMA derivation, diagram, autosave and reload, every tab, project-file round trip, co-reviewer merge |
| `test/benchmark.js` | deduplication timing and accuracy over seeded runs (`--records`, `--planted`, `--runs`) |

A new feature should come with a check in the most appropriate script, or a new script wired into `npm test`. Fixtures belong in `examples/` and must be synthetic: fictional authors, and DOIs under the `10.1000/` example prefix.

If your machine cannot download a browser, point the tests at an existing Chromium with `CHROMIUM_PATH=/path/to/chrome npm test`.

## Changing the project file

If a change alters what is stored in `.slrproj`:

1. Increment `SCHEMA_VERSION` in `src/03_core.js`.
2. Add a migration branch to `migrateState` that upgrades files of the previous version.
3. Add a check to `runSelfTest` that opens a file of the previous version.
4. Document the new fields in `docs/FILE_FORMATS.md` and the change in `CHANGELOG.md`.

Files must always migrate forward without loss; a user must never be told that their review cannot be opened.

## Pull requests

- One change per pull request, with a clear title and a description that says what changed, why, and how it was tested.
- Rebuild and commit `index.html` and the `dist/` file with the source change; CI fails if they differ from the source.
- Follow the existing style: two-space indentation, single quotes, semicolons, no framework, comments that explain why rather than what.
- Australian spelling in interface text and documentation (organise, colour, licence).
- Update `CHANGELOG.md` under an "Unreleased" heading.
- Be prepared for review comments; they are about the change, not about you.

## Releases

Maintainers cut releases as described in `docs/PUBLISHING.md`: bump `APP_VERSION`, `package.json` and `CITATION.cff` together, move the changelog's Unreleased section under the new version, run `npm test`, commit, tag, and attach the `dist/` file to the GitHub release.

## Code of conduct

This project follows the Contributor Covenant; see `CODE_OF_CONDUCT.md`. Be kind.
