# Frequently asked questions

## Getting started

Do I need to install anything?

No. Download the HTML file and open it in a browser. There is no installer, no server and no account. The development tools in this repository (Node, Playwright) are only needed to rebuild the file or run the tests.

Which browsers work?

Any current Chrome, Edge, Firefox or Safari. The tool uses IndexedDB, the File API, Blob downloads and SVG, all of which have been standard for years. Internet Explorer is not supported.

Does it work offline?

Yes, entirely. The only network request is for an optional web font, and the interface falls back to system fonts when that fails. You can open the file on a machine with no network connection.

Can I open it on a phone or tablet?

It runs, and the layout adapts to narrow screens, but screening thousands of records is more comfortable on a laptop.

## Data and privacy

Where is my data?

In two places: your browser's storage on this computer (autosave), and any `.slrproj` file you have saved. Nothing is sent anywhere. See the README section on privacy.

If I clear my browser data, do I lose the review?

You lose the autosaved copy. You do not lose any `.slrproj` file you saved. Save one at every milestone.

Can I use the tool in a private or incognito window?

You can, but browser storage is usually unavailable there, so nothing autosaves. The Project tab will warn you. Save a file before closing the window.

I opened the file in a different browser and my review is gone.

Autosave is per browser and per computer. Open your `.slrproj` file from the Project tab.

How big a review can it handle?

The workflow test runs 5,000 records with abstracts; the tables are windowed so the interface stays responsive well beyond that, and deduplication of 5,000 records takes about two seconds. Projects of tens of thousands of records work but the `.slrproj` file grows (about 3 MB for 5,000 records with abstracts), and if the browser has fallen back to localStorage its size limit of roughly 5 MB will be hit; the Project tab tells you which backend is in use.

Is the `.slrproj` file readable outside the tool?

Yes. It is plain JSON with one field per line, documented in [FILE_FORMATS.md](FILE_FORMATS.md). You can read it in any text editor, parse it in Python or R, and keep it under version control.

## Importing

Which export format should I use from each database?

Any the database offers among RIS, BibTeX, NBIB and CSV. RIS is the most consistent across databases. For PubMed use the NBIB (MEDLINE) format. For Scopus and Web of Science, CSV and RIS both work; the CSV column names those databases use are recognised.

Why does the tool ask which database each file came from?

Because the PRISMA 2020 flow diagram lists records identified per source, and that count can only be right if each import is attributed. Import one file per database. If you must combine sources in one file, attribute it to the main one and correct the source counts on the PRISMA Data tab.

My CSV imports zero records.

The header row is probably not recognised. Rename the columns to the names listed in [FILE_FORMATS.md](FILE_FORMATS.md) (at minimum `Title`; `DOI`, `Authors`, `Year` and `Abstract` are strongly recommended) and try again. The CSV template on the Import tab shows the expected layout.

Some records have no DOI. Is that a problem?

No. Deduplication matches those by title (with year and author guards), and screening does not need a DOI. A DOI simply makes matching certain.

## Deduplication

The tool flagged records that are not duplicates.

Raise the similarity threshold (the default is 88 per cent) and run detection again, or unflag them by hand with the checkbox. Very generic titles in a narrow field can exceed 88 per cent similarity while being different papers; the tool warns when a group is unusually large.

The tool missed duplicates I can see.

Lower the threshold, or set the year tolerance to "ignore year" if one database has the online-first year and another the print year. Note that two records with different DOIs are never merged, on the principle that distinct DOIs identify distinct works; if a database has attached the wrong DOI, unflag by hand.

Why does it flag instead of delete?

Because deleting an eligible study by mistake is a worse error than screening a duplicate twice. Review the flagged groups (filter the table to "Flagged duplicates"), then remove them in one confirmed step. The count is written to the PRISMA data and the audit log.

## Screening and agreement

Why can't I see my co-reviewer's decisions?

Blinded mode is on and you have not recorded your own decision on that record yet. That is the intended behaviour: independence has to be engineered, not assumed. Your co-reviewer's decision appears once yours is recorded.

Why is a record showing "Awaiting 2nd"?

Only one reviewer has decided it and two are registered. It becomes a resolved decision when the second reviewer agrees, or a conflict if they disagree.

Why is kappa computed on fewer records than are eligible?

Kappa is only meaningful over records both reviewers have decided. Counting undecided records as agreement would inflate it.

What should I do with "maybe" votes?

Decide before screening, write it in the protocol, and set the option on the Agreement tab to match. Treating maybe as include (the default) is the conservative choice for screening, since maybe advances the record for a closer look. The tool logs whichever you choose.

Can three or more people screen?

Yes. Register them on the Project tab. The Agreement tab reports Cohen's kappa for every pair and Fleiss' kappa across all reviewers. The rule that a record needs two agreeing decisions to advance is unchanged.

## Reporting

The consistency checks say screening is in progress. Is something wrong?

No. Figures downstream of an incomplete stage are expected to be low, so the checks for those figures are suspended until the stage is complete. Finish screening, resolve conflicts, and recalculate.

The diagram's counts do not match my search record.

The search record is what each database said it returned; the identification counts come from the files you actually imported. They differ when an export was truncated (many databases cap exports) or when you searched a database but did not import its results. Reconcile before submission.

How do I get the diagram into my manuscript?

Export SVG for Word (Insert Picture accepts SVG), LaTeX (convert to PDF with Inkscape or `rsvg-convert`) or a journal submission system. Choose print type first if the diagram has two arms. The PNG export is at three times screen resolution for systems that refuse SVG.

Is the checklist the official PRISMA 2020 checklist?

It reproduces the 27 items and their sub-items as published (Page et al., 2021), reworded only where the original wording assumes health interventions, and adds a location field and a justified not-applicable option. Check it against the journal's requirements; some ask for the original PDF form.

## Errors and recovery

The header shows "Storage full".

The browser has hit its storage quota (usually because it fell back to localStorage). Save a `.slrproj` file immediately. Consider a different browser where IndexedDB is available.

The tool says the project file was made by a newer version.

Open it with the latest release from this repository. Files are never migrated backwards.

I made a mistake and want to undo it.

There is no undo button. Open the most recent `.slrproj` file you saved. The audit log tells you exactly what was changed and when, which makes reconstruction straightforward. This is one reason to save at milestones.

Something else went wrong.

Open the file with `?selftest=1` appended to the address and check that all eight checks pass. Then open an issue on GitHub with the browser and version, what you did, and what happened. Do not attach a `.slrproj` containing unpublished data to a public issue; describe the structure instead, or share it privately.
