# Changelog

All notable changes to the SLR Workbench are recorded here. The format follows Keep a Changelog and the project uses semantic versioning: a major version for changes that alter the project file schema or remove a feature, a minor version for new features, a patch for fixes.

## [2.0.0] - 2026-09-27

A rewrite of the earlier "Advanced SLR Tool" (referred to as version 1 below). Project files from version 1 open and are migrated.

### Added

- Persistence: autosave to IndexedDB with a localStorage fallback and a visible save state; a portable `.slrproj` project file with save, open and co-reviewer merge; migration of version 1 files with their decisions preserved under a placeholder reviewer.
- Reviewer register with per-reviewer, per-stage decisions; blinded screening mode; a conflict queue with attributed resolution.
- Agreement statistics: Cohen's kappa with standard error, 95 per cent confidence interval and contingency table; Fleiss' kappa for three or more reviewers; explicit treatment of "maybe" votes.
- Append-only audit log of every change with timestamp, actor and detail, filterable and exportable as CSV.
- Search Record tab for the PRISMA-S style record of searches, with CSV, LaTeX and Markdown export.
- Parsers for BibTeX and NBIB/MEDLINE alongside RIS and CSV/TSV, with multi-line continuation, braced BibTeX values and quoted CSV fields handled; every import attributed to a named database.
- PRISMA 2020 counts derived from the recorded decisions with logged overrides and arithmetic consistency checks; explicit distinction between records, reports and studies.
- The second PRISMA 2020 identification arm (other methods) in the data model and the flow diagram.
- Print type size for the flow diagram so a two-arm diagram remains legible at journal width.
- The official 27-item PRISMA 2020 checklist with sub-items (42 rows), discipline-neutral wording, a location field and a justified not-applicable option; CSV and Word-compatible export.
- Analytics drawn as SVG (screening cascade, publications by year, records by database, venues, keywords) with SVG and PNG export.
- Built-in self-test at `?selftest=1` covering the edit distance, kappa arithmetic, blocking recall, DOI normalisation, JSON round trip and file migration.
- Virtualised record and screening tables.

### Changed

- Deduplication now runs a DOI pass and then a blocked fuzzy title pass: candidate pairs are generated from title prefix, suffix and midpoint keys, a long-word signature, and first author plus year, instead of comparing every pair. On 5,000 records this compares about 639,000 pairs rather than 12,497,500.
- Title similarity uses a banded two-row Levenshtein with early abandonment that returns the exact distance whenever it is within the threshold.
- Duplicate groups are formed with union-find but a record joins a group only if it also matches the group's representative, which prevents transitive chaining.
- Flow diagram boxes are measured from their content before layout instead of using fixed coordinates.
- Chart.js, SheetJS and the datalabels plugin were removed; the application has no external JavaScript dependency and works with no network connection. The only external reference is an optional web-font stylesheet with a system-font fallback.
- Checklist, default title and default exclusion reasons no longer presume a field of study.

### Fixed

- Version 1 returned a fabricated edit distance (length difference plus ten) for any title over 300 characters, so long titles were never compared honestly.
- Version 1 lost all work on page refresh because nothing was persisted.
- Version 1 rendered every record row into the document, which made the tables unusable at a few thousand records.
- The other-methods arm's arrow now enters the included box vertically with a visible arrowhead; counts of the form "(n = 0)" no longer wrap across lines; SVG dimensions are integers so PNG export parses them reliably.

## [1.x]

The original single-file "Advanced SLR Tool": import and deduplication, single-reviewer screening, a database table, PRISMA data with a single-arm diagram, Chart.js analytics and a checklist. Not versioned; superseded by 2.0.0.
