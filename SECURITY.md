# Security

## Threat model in one paragraph

The SLR Workbench is a static HTML file that runs in the user's browser. It has no server, makes no network requests apart from an optional web-font stylesheet, stores data only in the browser's own storage and in files the user chooses to save, and loads no third-party JavaScript. The attack surface is therefore the browser itself and the content of files the user imports.

## What the application does to stay safe

- All record fields that reach the page are escaped before insertion (`esc()` in `src/03_core.js`), so a crafted title or abstract in a citation export cannot inject markup or script.
- Imported files are parsed as text in the page; nothing is executed or evaluated. (The `eval` calls in `test/` are in the test harness, which is never shipped in `index.html`.)
- Project files are parsed with `JSON.parse` and passed through `migrateState`, which builds a fresh state object from known fields rather than trusting the file's structure.
- Exports are generated as Blobs and downloaded; no data is posted anywhere.
- There is no authentication, session or token to leak, because there is no server.

## What it does not do

The application does not encrypt browser storage or project files. Anyone with access to the user's browser profile or to a saved `.slrproj` can read the records and decisions in it. If a review involves confidential material, keep project files where you would keep any other confidential document, and clear the browser copy (Project tab, "Clear browser copy") on shared machines.

## Reporting a vulnerability

If you find a way to make the application execute injected content, exfiltrate data, or corrupt a project file silently, please report it privately rather than in a public issue. Email abdullahi.chowdhury@adelaide.edu.au with the steps to reproduce, the browser and version, and a minimal file if one is involved. You should receive an acknowledgement within a week. Once a fix is released the report will be credited in the changelog unless you prefer otherwise.

Issues that are not security vulnerabilities (bugs, wrong counts, a parser that rejects a file) belong in the public issue tracker.
