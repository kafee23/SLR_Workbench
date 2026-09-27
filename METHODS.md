# Methods

How the Workbench computes what it computes, stated precisely enough to be paraphrased in the methods section of a review or checked by a reviewer. Section references point to the source under `src/`.

## 1. Record normalisation

Before any matching, each record's DOI is lower-cased and stripped of a `https://doi.org/` or `https://dx.doi.org/` prefix. Titles are normalised for comparison (not for display) by lower-casing, replacing typographic quotes with plain ones, replacing `&` and the word `and` with a single ` and `, removing every character other than ASCII letters, digits and spaces, and collapsing runs of whitespace. The first author's surname is taken as the text before the first comma in the first author (or the last word if there is no comma), lower-cased with non-letters removed. (`normaliseRecord` in `03_core.js`; `normTitle`, `firstAuthorSurname` in `04_import.js`.)

## 2. Duplicate detection

Detection runs in three phases and never deletes anything. (`Dedup.run` in `04_import.js`.)

Phase 1, DOI. Records with identical normalised DOIs are joined into the same group. This is the only merge the tool makes without a similarity test.

Phase 2, blocking. Comparing every pair of records is quadratic: 5,000 records would require 12,497,500 comparisons. Instead each record is assigned up to five blocking keys, and only pairs that share at least one key are compared:

- the first ten characters of the normalised title with spaces removed;
- the last ten characters;
- the ten characters centred on the midpoint;
- a signature made of the record's three longest words of more than four letters, sorted;
- the first author's surname joined with the year, where both exist.

Three positional keys give resilience to the common forms of drift: a leading article added or dropped, a truncated end, a changed subtitle. Blocks with more than 400 members are skipped as evidence of a degenerate key rather than a cluster of duplicates. Each candidate pair is generated once.

Phase 3, comparison. A candidate pair is skipped if the two records already share a group, if their years differ by more than the year tolerance (default plus or minus one year; the check is bypassed when either year is missing), or if both carry a DOI and the DOIs differ, since distinct DOIs identify distinct works. Otherwise the similarity of the two normalised titles is computed as

similarity = 1 - d / max(|a|, |b|)

where d is the Levenshtein edit distance. The pair is a match if similarity is at least the threshold (default 88 per cent).

Bounded edit distance. Because a pair only matters if its distance is at most D = floor(max(|a|,|b|) x (1 - threshold)), the distance is computed with a banded two-row dynamic programme that only visits cells within D of the diagonal and abandons the pair as soon as the minimum of a row exceeds D. The function returns the exact distance when it is at most D and the value D + 1 otherwise. It is verified in the self-test against a full-matrix implementation over 4,500 random pairs and five different bounds, with zero mismatches. Unlike some tools, it never substitutes an approximate distance for long titles. (`boundedLev`, `titleSimilarity` in `04_import.js`.)

Grouping and the chaining guard. Matches are accumulated in a union-find structure. Because union-find is transitive, A matching B and B matching C would place A and C in one group even where A and C are dissimilar, and on large sets such chains grow into large false groups. The tool therefore lets a record join a group only if it also matches the group's representative (the current root). Merges refused for this reason are counted and logged.

Choosing the kept record. Within each group the record with the highest score, where a DOI counts 4, an abstract 2 and a venue 1, with the longer title breaking ties, is kept and the others are flagged as duplicates. Flagged records remain in the project, visibly marked, until the user removes them; the removal is confirmed, counted into the PRISMA figure for duplicates removed, and logged.

Reported performance. On a 4,500-title synthetic corpus with 500 planted duplicates (half without a DOI, a third upper-cased, a third repunctuated), three seeded runs recalled every planted duplicate, flagged three to thirteen further records whose titles differed from another by a single word, and compared about 639,000 candidate pairs in about two seconds. Run `npm run bench` to reproduce on your own machine.

Suggested methods wording. "Records were deduplicated in SLR Workbench v2.0.0 by exact DOI match followed by fuzzy title matching (Levenshtein similarity of at least 88 per cent on normalised titles, restricted to candidate pairs sharing a blocking key, with a publication-year tolerance of one year). Flagged groups were inspected manually before removal."

## 3. Screening decisions

Each record holds one decision per reviewer per stage: include, maybe or exclude. The effective decision at a stage is:

1. the resolved decision, if a conflict at that stage has been resolved on the Agreement tab;
2. otherwise "pending" if no reviewer has decided;
3. otherwise "conflict" if the recorded decisions are not all the same;
4. otherwise the unanimous decision if at least the required number of reviewers have recorded it, where the required number is 2 when two or more reviewers are registered and 1 otherwise;
5. otherwise "partial" (awaiting a second decision).

A record is eligible at the abstract stage only if its effective title decision is include or maybe, and eligible at the full-text stage only if both its title and abstract decisions are include or maybe. Recording a new decision on a record whose conflict was resolved clears the resolution. (`effectiveDecision`, `Screen.eligible` in `05_screen.js`.)

Blinded mode hides co-reviewers' decisions on a record until the current reviewer has recorded their own. The setting and every decision, reason, and resolution are written to the audit log with the acting reviewer's name.

## 4. Agreement statistics

Both statistics are computed at a chosen stage over the records eligible at that stage. (`Agreement` in `05_screen.js`.)

Treatment of "maybe". A maybe vote is mapped, at the user's choice, to include (the default, since a maybe advances a record to the next stage), to exclude, or kept as a third category. The choice is displayed and logged. With two categories the contingency table is 2 x 2; with three it is 3 x 3.

Cohen's kappa (two reviewers). Only records both reviewers have decided contribute; records awaiting one reviewer are excluded, not counted as agreement. With n such records, observed agreement p_o is the proportion on the diagonal of the contingency table and expected agreement p_e is the sum over categories of (row total / n) x (column total / n). Then

kappa = (p_o - p_e) / (1 - p_e).

The standard error reported is the large-sample approximation

SE = sqrt( p_o (1 - p_o) / ( n (1 - p_e)^2 ) )

and the 95 per cent confidence interval is kappa plus or minus 1.96 SE. This is the simpler of the two standard-error formulas in the literature (Cohen, 1960); the exact variance of Fleiss, Cohen and Everitt (1969) is slightly different and typically a little wider. For reporting, quote kappa, n, the stage, the treatment of maybe votes and how conflicts were resolved. The self-test checks kappa against a hand-computed 2 x 2 (n = 50, p_o = 0.70, p_e = 0.50, kappa = 0.400).

Fleiss' kappa (three or more reviewers). Only records decided by every registered reviewer contribute. With N such records, r reviewers and k categories, n_ij the number of reviewers assigning record i to category j, p_j the proportion of all assignments in category j, and P_i = (sum_j n_ij^2 - r) / (r (r - 1)), the statistic is

kappa = (mean_i P_i - sum_j p_j^2) / (1 - sum_j p_j^2).

The self-test checks that perfect agreement gives kappa = 1.

Descriptors. The tool labels values using Landis and Koch's (1977) bands (below 0.21 slight, to 0.40 fair, to 0.60 moderate, to 0.80 substantial, above 0.80 almost perfect) because readers expect them, and notes that the bands are conventional. Report the value.

## 5. PRISMA 2020 counts

Every figure in the flow diagram is either derived from the records or entered by hand, and the tool shows which. Derived figures (`Prisma.derive` in `06_prisma.js`):

| Figure | Derivation |
|---|---|
| Records identified, per database | the count attributed to each source at import |
| Duplicate records removed | the number of flagged records removed (accumulated), or the number currently flagged if none have been removed yet |
| Records screened | records not flagged as duplicates |
| Records excluded | records whose effective decision is exclude at the title stage, plus those excluded at the abstract stage |
| Reports sought for retrieval and reports assessed | records whose effective abstract decision is include or maybe (the tool cannot know how many were not retrieved; enter that by hand and the two figures separate) |
| Reports excluded | records excluded at the full-text stage, with reasons tallied from the recorded exclusion reasons |
| Reports of included studies | records included at the full-text stage |
| Studies included | distinct study identifiers among included records, plus included records not yet linked to a study |

Records marked ineligible by automation tools, records removed for other reasons, reports not retrieved, and the other-methods arm's figures are entered by hand. Any derived figure may be overridden; the override is stored separately from the derivation and the audit log records both the new value and the derived value it replaced, so the provenance of every number in the diagram is recoverable.

Consistency checks (`Prisma.checks`):

- identified minus (duplicates + automation + other) = screened
- screened minus excluded = sought
- sought minus not retrieved = assessed
- sum of exclusion reasons = reports excluded
- assessed minus excluded, plus the other arm's assessed minus excluded, = reports of included studies
- studies do not exceed reports

While any screening stage is incomplete the checks downstream of it are suspended and the tool reports progress instead, because those figures are expected to be low. Unresolved conflicts are flagged because records in conflict contribute to no figure.

## 6. The flow diagram

The diagram is generated as SVG from the PRISMA data. Boxes are measured from their wrapped text before layout so rows align and content never overflows; the other-methods arm is added when enabled; and the print type option scales all type by 1.4 so a two-arm diagram remains legible at journal column widths. PNG export rasterises the same SVG at three times screen resolution. (`Diagram` in `06_prisma.js`.)

## 7. Audit log

Every state change passes through a single function that records a timestamp, the acting reviewer (or "system" for automatic actions such as migration), an action category and a description, then marks the project dirty and schedules an autosave. The log is append-only from the user's point of view and is capped at 4,000 entries; when trimmed, a system entry records how many were dropped. It is exported as CSV. (`mutate`, `logAudit` in `03_core.js`.)

## 8. Persistence

State is serialised to JSON and written to IndexedDB about 1.4 seconds after the last change (debounced), falling back to localStorage where IndexedDB is unavailable and to no autosave where neither is. A quota error is surfaced immediately with advice to save a project file. The `.slrproj` file is the same JSON. On load, files are migrated forward by schema version; version 1 files from the predecessor tool have their flat decisions attributed to a placeholder reviewer rather than discarded. (`Store`, `migrateState` in `03_core.js`.)

## References for the statistics

- Cohen, J. (1960). A coefficient of agreement for nominal scales. *Educational and Psychological Measurement*, 20(1), 37 to 46.
- Fleiss, J. L. (1971). Measuring nominal scale agreement among many raters. *Psychological Bulletin*, 76(5), 378 to 382.
- Fleiss, J. L., Cohen, J., and Everitt, B. S. (1969). Large sample standard errors of kappa and weighted kappa. *Psychological Bulletin*, 72(5), 323 to 327.
- Landis, J. R., and Koch, G. G. (1977). The measurement of observer agreement for categorical data. *Biometrics*, 33(1), 159 to 174.
- Levenshtein, V. I. (1966). Binary codes capable of correcting deletions, insertions, and reversals. *Soviet Physics Doklady*, 10(8), 707 to 710.
- Page, M. J., et al. (2021). The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. *BMJ*, 372, n71.
- Rethlefsen, M. L., et al. (2021). PRISMA-S: an extension to the PRISMA statement for reporting literature searches in systematic reviews. *Systematic Reviews*, 10, 39.
