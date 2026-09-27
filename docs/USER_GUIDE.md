# SLR Workbench user guide

This guide walks through the application tab by tab, then describes the workflow for a two-reviewer team. It assumes you have opened `index.html` (or the file from `dist/`) in a browser.

## Before you start

The application runs entirely in your browser. Two things follow from that.

First, your work is autosaved to the browser's own storage a second or so after every change, and restored when you reopen the same file in the same browser on the same computer. That is a convenience, not a backup. Save a `.slrproj` file from the Project tab at every milestone.

Second, each reviewer works in their own copy. There is no shared server. Reviewers exchange `.slrproj` files and merge them; the Project tab explains how, and so does the section on two-reviewer workflow below.

The header shows the review title, a save indicator (green when saved, gold when there are unsaved changes, red if saving failed), and buttons to open and save project files.

## Project

Review details. Give the review a title; it appears in the header and in the names of every exported file. Choose the review type and the question framework (PICO, PECO, PCC, SPIDER, PIRD, PICo, or none). State the review question. Record the registration identifier (PROSPERO, OSF or another register) and the date of the last search. All of these are reported in PRISMA 2020 items 4, 5, 6 and 24a.

Reviewers. Two reviewers are registered by default because a systematic review is expected to have two independent screeners. Rename them, change their initials, or add more. Removing a reviewer who has recorded decisions deletes those decisions and changes every agreement statistic; the tool asks for confirmation and suggests keeping the reviewer instead.

Screening as. Choose which reviewer you are. Every decision on the Screening tab and every resolution on the Agreement tab is attributed to this reviewer in the audit log.

Blinded screening. When enabled, a reviewer cannot see a co-reviewer's decision on a record until their own decision on that record is recorded. Turn it on before independent screening begins; the setting itself is logged.

Project file. Save `.slrproj` writes the whole review (records, decisions, reviewers, settings, checklist, audit log) to a JSON file. Open `.slrproj` replaces the review on screen with one from a file, after warning about unsaved changes. Merge co-reviewer file folds another file's decisions into the current review without overwriting any decision already made. New empty project clears everything after confirmation.

Storage. Shows which browser storage backend is in use: IndexedDB (no practical size limit), localStorage (a limit of roughly 5 MB, which a few thousand records with abstracts can exceed), or none (a private window or blocked storage, in which case nothing autosaves and the tool warns you to save a file before closing). You can turn autosave off, save to the browser now, or clear the browser copy.

## Import & Deduplication

Import. Drop citation files onto the drop zone, or click it to browse. One export per database is the rule: the tool asks which database each file came from, and that attribution is what lets the Identification box in the flow diagram list sources separately with their counts. Supported formats are RIS (`.ris`, and `.txt` in RIS layout), BibTeX (`.bib`), NBIB/MEDLINE (`.nbib`), CSV and TSV. Format is detected from the extension, then from the content if the extension is ambiguous. The fields read from each format are listed in [FILE_FORMATS.md](FILE_FORMATS.md).

Load 400-record sample fills the project with synthetic records, including 60 planted near-duplicates, so you can try every part of the tool. CSV template and RIS template download minimal files showing the layout the importers expect.

Duplicate detection. Choose a strategy: DOI then blocked fuzzy title (recommended), DOI only, or fuzzy title only. Set the title similarity threshold (88 per cent by default; raise it if too many distinct papers are grouped, lower it if obvious duplicates are missed) and the year tolerance (plus or minus one year by default, because databases disagree about online-first and print dates). Run detection. The tool reports how many records were flagged, in how many groups, by which method, how many candidate pairs it compared, and the size of the largest group. A group of more than six records is called out because it usually means a title so generic that the threshold should be raised for that project.

Nothing is deleted by detection. Flagged records are marked in the table with a badge showing the match score; the kept record in each group is marked "kept". Use the checkbox in each row to flag or unflag by hand. The Records table can be filtered to flagged duplicates, unique records, or a single source, and searched by title, author or DOI. When you are satisfied, Remove flagged duplicates deletes the flagged records after confirmation and writes the count to the PRISMA data as duplicates removed. Export CSV writes every record with its duplicate status and group.

The four summary cards show records imported, flagged duplicates, unique records (the population carried into screening), and how many records carry a DOI.

## Screening

Stage. Title screening, abstract screening, or full-text eligibility. A record is eligible at a stage only if its effective decision at the previous stage was include or maybe. The effective decision is the resolved decision if a conflict has been settled, otherwise the unanimous decision when the required number of reviewers agree (two when two or more are registered, one otherwise). A record with decisions from fewer reviewers than required shows as "Awaiting 2nd"; one with disagreeing decisions shows as "Conflict".

Show. Filter to records awaiting your decision (the default), all eligible records, those decided by you, those in conflict, or those resolved as include or exclude. Search filters by title, abstract or keyword.

Each row shows the record's title, first author, year and venue, and the start of its abstract; the co-reviewers' decisions (or "hidden" while blinded and you have not decided); the effective decision badge; your decision buttons (Include, Maybe, Exclude, and Clear once you have decided); and, when you exclude, a field for the reason. Reasons you type are added to the project's list so they can be reused, and at the full-text stage they are tallied into the flow diagram.

Recording a new decision on a record whose conflict had been resolved clears the resolution, so a changed mind is never masked by an old settlement.

The summary cards show records eligible at this stage, how many you have decided, how many are resolved include, and how many are in conflict. When you have decided every record at a stage, the empty list says so and offers to take you to the conflict queue if there is one. Export decisions writes every reviewer's decision at every stage, with the effective outcome and reason, as CSV.

## Agreement

Cards show records eligible at the selected stage, how many have been double-screened, and how many conflicts are outstanding at that stage.

Inter-rater reliability. For each pair of reviewers the tool computes Cohen's kappa over the records both have decided at that stage; records awaiting a second decision are excluded rather than counted as agreement. It reports kappa with its standard error and 95 per cent confidence interval, the observed and expected agreement, the number of records, and the full contingency table. When three or more reviewers are registered it adds Fleiss' kappa over records decided by all of them. A "maybe" vote can be treated as an inclusion (the default, because maybe advances a record), as an exclusion, or as a category of its own; the choice changes the statistic, so it is explicit and logged. The descriptors shown (slight, fair, moderate, substantial, almost perfect) are Landis and Koch's conventional bands; report the value, not only the word.

Conflict queue. Every record whose reviewers disagree at any stage, with each reviewer's vote. Resolve it as include or exclude, or clear a resolution. Resolutions are attributed to the reviewer selected under "Screening as" and logged. Export conflicts writes the queue as CSV.

## Search Record

One row per database: the database, the search string exactly as run, any filters or limits, the date searched, the number retrieved, and the number carried into screening. Totals are shown. Export as CSV, as a LaTeX table, or as Markdown. This is the record PRISMA-S asks for and that journals increasingly want as a supplementary file.

The counts here are your record of what each database returned. The Identification figures on the PRISMA Data tab are taken from the files you actually imported, so the two will differ if an export was truncated. That difference is worth reconciling before submission.

## PRISMA Data

Every figure in the flow diagram lives here. Fields with a plain border are derived from your records; fields with a gold border have been overridden by hand. Clearing a field returns it to the derived value.

Recalculate from records rederives every derivable figure from the decisions, discarding overrides for those fields, and tallies the full-text exclusion reasons from the reasons recorded during screening. Clear all overrides does what it says.

Identification, databases and registers. One row per source with its count, filled from your imports and editable. Below it, the three "removed before screening" figures: duplicates (filled when you remove flagged duplicates), records marked ineligible by automation tools, and records removed for other reasons.

Screening and eligibility. Records screened and excluded; reports sought for retrieval and not retrieved; reports assessed for eligibility and excluded; studies included and reports of included studies. The tool cannot know how many reports you failed to retrieve, so enter that by hand. A study is the unit of research and a report is a paper describing it, so studies can never exceed reports.

Full-text exclusion reasons. One row per reason with its count. These must sum to reports excluded, and the diagram lists them.

Other methods arm. Tick "Include the other methods arm" to add the second PRISMA 2020 identification arm for citation searching, websites and organisations, with its own sources, reports sought, not retrieved, assessed and excluded.

Consistency checks. The arithmetic a reviewer will run: identification minus removals equals screened; screened minus excluded equals sought; sought minus not retrieved equals assessed; reasons sum to reports excluded; assessed minus excluded (plus the other arm's contribution) equals reports of included studies; studies do not exceed reports. While screening is incomplete the downstream checks are suspended and the tool says so, because those figures are expected to be low. Unresolved conflicts are flagged because records in conflict do not count towards any figure.

## Flow Diagram

The PRISMA 2020 diagram, redrawn from the PRISMA Data tab every time you open the tab. It shows one arm, or two when the other-methods arm is enabled. Boxes size to their content, so long source lists and reason lists fit. Choose screen type or print type; print type is about 40 per cent larger and stays legible when a two-arm diagram is reduced to the width of a journal page. Export as SVG (vector, editable in Inkscape or Illustrator, and what journals prefer) or as PNG at three times screen resolution. Print sends the page to the browser's print dialogue.

## Analytics

Five charts drawn as SVG in the page, so they work offline and export as vector art: the screening cascade (imported, after duplicates, passed title, passed abstract, included), publications by year, records by database, the most frequent venues, and the most frequent author keywords. Choose the population: unique records, all imported records, or included studies only. Each chart exports as SVG or PNG. The cascade is drawn from decisions actually recorded, so it lags the PRISMA Data tab until screening is complete.

## Checklist

The 27 items of PRISMA 2020 with their sub-items, 42 rows in all, grouped by section. For each row record where the item is reported (page or section), tick Reported, or tick n/a and say why. Journals accept a justified n/a; they do not accept a blank. Filter to items not yet reported, reported, or n/a. The progress bar counts applicable items. Export as CSV or as a table that Word opens.

## Audit Log

Every change to the project, newest first: the timestamp, the reviewer it is attributed to, the kind of action (import, dedup, screen, resolve, prisma, project) and a description. Overrides of derived PRISMA figures record the derived value they replaced; deduplication runs record their settings and results; merges record what was matched and added. The log is capped at 4,000 entries, with a note when older entries are trimmed. Export as CSV. It is the raw material for the methods section and for anyone who needs to reproduce what was done.

## Two-reviewer workflow

1. Reviewer A imports every database export, attributing each to its source, runs deduplication, inspects and removes the flagged duplicates, confirms both reviewers are registered, turns blinded mode on, and saves `review_v1.slrproj`.
2. Reviewer A sends that file to Reviewer B.
3. Both open the file, select themselves under "Screening as", and screen the title stage independently. Each saves their own file (`review_A.slrproj`, `review_B.slrproj`).
4. Reviewer A opens `review_A.slrproj` and merges `review_B.slrproj`. The merge report says how many records matched, how many decisions were imported, and how many conflicts surfaced. Nothing either reviewer decided is overwritten.
5. On the Agreement tab, both read the kappa for the title stage. If it is low, the criteria are probably ambiguous; revise them, record the amendment, and re-screen a sample before continuing. Resolve the conflict queue by discussion, recording who resolved each one.
6. Save `review_v2.slrproj` and repeat from step 2 for the abstract stage, then the full-text stage, entering an exclusion reason for every full-text exclusion.
7. Recalculate the PRISMA data, enter reports not retrieved, read the consistency checks, export the diagram and the checklist, and export the audit log.

For three or more reviewers the same pattern applies; the Agreement tab reports Cohen's kappa for every pair and Fleiss' kappa across all of them.
