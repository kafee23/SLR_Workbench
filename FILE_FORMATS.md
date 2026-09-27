# File formats

What the Workbench reads, what it writes, and the structure of its project file.

## Import formats

Format is detected from the file extension (`.ris`, `.bib`/`.bibtex`, `.nbib`, `.csv`, `.tsv`) and, for `.txt` or an unrecognised extension, from the first 2,000 characters of content (a leading `@type{`, a `PMID-` line, a `TY  -` line, or tab characters). Every record is normalised to the same internal shape after parsing, and the DOI is lower-cased with any `https://doi.org/` or `https://dx.doi.org/` prefix removed so that the same paper from different databases matches on DOI.

### RIS

| Field | RIS tags read |
|---|---|
| Record boundary | `TY` starts a record, `ER` ends it |
| Title | `TI`, `T1`, `CT` (continuation lines are joined) |
| Authors | `AU`, `A1`, `A2` (joined with `; `) |
| Year | first four-digit number in `PY`, `Y1`, or `DA` |
| Journal or venue | `JO`, `JF`, `JA`, `T2`, `BT` (first found) |
| DOI | `DO` |
| Abstract | `AB`, `N2` (continuation lines are joined) |
| Keywords | `KW` (joined with `; `) |
| Volume, issue | `VL`, `IS` |
| Pages | `SP` and `EP` joined with a hyphen |
| URL | `UR`, `L1` |
| Publisher | `PB` |
| Type | the `TY` value |

A record needs a title or a DOI to be kept.

### BibTeX

Entries are located by `@type{key,` and fields by `name = {value}`, `name = "value"` or bare values. Nested braces one level deep are handled and all braces are stripped from values. Fields read: `title`, `author` (split on ` and `, joined with `; `), `year`, `journal` or `booktitle` or `journaltitle`, `doi`, `abstract`, `keywords`, `volume`, `number` (as issue), `pages` (double hyphen normalised to a single hyphen), `url`, `publisher`. The entry type is kept.

### NBIB (PubMed MEDLINE)

Records are separated by blank lines and must begin with `PMID-`. Tags are `XX  - value` with indented continuation lines joined. Fields read: `TI` (a trailing full stop is removed), `AU`, `DP` (year), `JT` or `TA`, the DOI from whichever `AID` or `LID` line carries `[doi]`, `AB`, `MH` or `OT` as keywords, `VI`, `IP`, `PG`, `PT` as type.

### CSV and TSV

A proper delimited-text parser: quoted fields may contain the delimiter, doubled quotes and line breaks. A UTF-8 byte-order mark is ignored. The first row is the header, matched case-insensitively. For each internal field the importer tries an exact header match from the list below, then a header that contains the name.

| Internal field | Header names tried, in order |
|---|---|
| title | title, document title, article title, ti |
| authors | authors, author, author full names, au |
| year | year, publication year, py, date (first four digits) |
| journal | source title, journal, publication title, journal name, so |
| doi | doi, di |
| abstract | abstract, ab |
| keywords | author keywords, keywords, index keywords, de |
| volume | volume, vl |
| issue | issue, is |
| pages | pages, page start, bp |
| url | url, link, doi link |
| publisher | publisher, pu |
| type | document type, publication type, type |

Scopus, Web of Science and Dimensions CSV exports are covered by these names. For any other layout, rename the header row to match. Rows with neither title nor DOI are dropped.

## Internal record

Every record carries these fields after import (see `normaliseRecord` in `src/03_core.js`):

```
id, title, authors, year, journal, doi, abstract, keywords, volume, issue, pages,
publisher, url, type, dbSource, importBatch, importedAt,
isDuplicate, dupGroup, dupScore, dupMethod,
decisions: { title: {reviewerId: 'include'|'maybe'|'exclude'}, abstract: {...}, fulltext: {...} },
resolved:  { title: null|'include'|'exclude', abstract: ..., fulltext: ... },
exclusionReason: { title: '', abstract: '', fulltext: '' },
studyId, notes
```

`dbSource` is the database the file was attributed to at import, and `importBatch` identifies the file. Decisions are keyed by reviewer ID so that merging two files never confuses one reviewer's work with another's.

## The `.slrproj` project file

A `.slrproj` file is UTF-8 JSON containing the complete application state. It is human-readable and diff-friendly (one field per line). Schema version 2 has this top-level structure:

```json
{
  "schemaVersion": 2,
  "appVersion": "2.0.0",
  "project": {
    "id": "...", "title": "...", "reviewType": "systematic", "framework": "PICO",
    "question": "...", "registration": "...", "lastSearchDate": "2026-09-15",
    "created": "ISO-8601", "modified": "ISO-8601"
  },
  "reviewers": [ { "id": "...", "name": "Reviewer A", "initials": "RA", "colour": "#2a7f7f" } ],
  "activeReviewerId": "...",
  "blinded": true,
  "records": [ ...records as above... ],
  "sources": [ { "id": "...", "name": "Scopus", "count": 1842 } ],
  "otherSources": [ { "id": "...", "name": "Citation searching", "count": 58 } ],
  "reasons": [ { "id": "...", "reason": "Wrong population", "count": 61 } ],
  "searchRows": [ { "id": "...", "db": "...", "query": "...", "filters": "...", "date": "...", "retrieved": 0, "selected": 0 } ],
  "prisma": { "overrides": { "notRetrieved": 14 }, "showOtherArm": false },
  "checklist": [ { "id": "chk_1", "section": "TITLE", "no": "1", "item": "Title", "desc": "...", "done": false, "na": false, "location": "", "note": "" } ],
  "audit": [ { "id": "...", "at": "ISO-8601", "actor": "Reviewer A", "action": "screen", "detail": "..." } ],
  "settings": { "dupThreshold": 88, "dupStrategy": "hybrid", "dupYearGuard": 1, "autosave": true },
  "meta": { "lastSavedAt": "ISO-8601", "lastDedupAt": "ISO-8601" }
}
```

`prisma.overrides` holds only the figures a user has typed over a derived value; every other count is recomputed from `records` on load. Audit `action` values are `import`, `dedup`, `screen`, `resolve`, `prisma`, `project`.

Version 1 files (from the earlier "Advanced SLR Tool", which stored flat `screenTitle`, `screenAbstract` and `screenFulltext` strings without reviewer attribution) are migrated on open: their decisions are attributed to a placeholder reviewer named "Imported (v1)" so nothing is lost, and the migration is recorded in the audit log. A file with a `schemaVersion` higher than the application supports is refused with a message rather than misread.

Because the file is the durable copy of the review, treat it like a manuscript: keep dated copies at milestones (the default file name carries the date) and keep it with the review's other materials.

## Merging project files

"Merge co-reviewer file" reads a second `.slrproj` and, for each of its records, finds the matching record in the open project by internal ID, then by DOI, then by normalised title. For each stage, decisions by reviewers not already recorded on the matching record are copied in; existing decisions are never overwritten. Exclusion reasons fill only empty fields. Records with no match are added. Reviewers not already registered are added. The merge is logged with counts of records matched and added, decisions imported, reviewers added, and conflicts surfaced.

## Exports

| Export | Where | Format |
|---|---|---|
| Project file | Project tab, header | `.slrproj` (JSON, see above) |
| Records | Import tab | CSV: ID, title, authors, year, journal, DOI, source, keywords, volume, issue, pages, duplicate flag, group, match score, abstract |
| Screening decisions | Screening tab | CSV: one row per unique record, one column per reviewer per stage, plus effective outcome and reason per stage |
| Conflicts | Agreement tab | CSV: stage, record, each reviewer's decision, resolution |
| Search record | Search Record tab | CSV; LaTeX `table` environment; Markdown table |
| Flow diagram | Flow Diagram tab | SVG (vector) or PNG at three times screen resolution; screen or print type size |
| Charts | Analytics tab | SVG or PNG per chart |
| Checklist | Checklist tab | CSV; a `.doc` HTML table that Microsoft Word opens |
| Audit log | Audit Log tab | CSV: timestamp, actor, action, detail |
| Import templates | Import tab | Minimal CSV and RIS files showing the expected layout |

All CSV exports are UTF-8 with a byte-order mark so that Excel opens them with the right encoding, and fields containing commas, quotes or line breaks are quoted.
