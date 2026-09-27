# Publishing this repository

Steps to put the Workbench on GitHub, serve it from GitHub Pages, and cut a citable release. Ten minutes end to end.

## 1. Replace the placeholders

The repository refers to its own address in a few places. Replace `USERNAME` with your GitHub user or organisation name (and `slr-workbench` if you choose a different repository name) in:

- `README.md` (badge URLs, the Pages URL in Quick start)
- `package.json` (`homepage`, `repository`, `bugs`)
- `CITATION.cff` (`repository-code`, `url`)
- `.github/ISSUE_TEMPLATE/config.yml`

A single command does it on macOS or Linux:

```bash
grep -rl USERNAME README.md package.json CITATION.cff .github | xargs sed -i '' 's/USERNAME/your-github-name/g'   # macOS
grep -rl USERNAME README.md package.json CITATION.cff .github | xargs sed -i 's/USERNAME/your-github-name/g'      # Linux
```

Also check `CITATION.cff` for your ORCID and affiliation, and `LICENSE` for the copyright line.

## 2. Create the repository and push

On GitHub, create an empty repository named `slr-workbench` (public, no README, no licence, no `.gitignore`; this repository already has them). Then, from the folder containing this file's parent directory:

```bash
cd slr-workbench
git init -b main
git add .
git commit -m "SLR Workbench v2.0.0"
git remote add origin https://github.com/your-github-name/slr-workbench.git
git push -u origin main
```

`node_modules/` and `test/output/` are ignored by `.gitignore` and will not be pushed.

## 3. Turn on continuous integration

Nothing to do. The workflow in `.github/workflows/ci.yml` runs on every push and pull request: it installs Node and a headless Chromium, rebuilds `index.html` from `src/`, fails if the rebuilt file differs from the committed one, and runs the three test suites. The badge at the top of the README turns green once the first run passes. You can watch it under the repository's Actions tab.

## 4. Serve the application from GitHub Pages

Two options.

Option A, from the branch (simplest). In the repository go to Settings, Pages, and under "Build and deployment" choose Source: "Deploy from a branch", Branch: `main`, folder `/ (root)`. Save. Within a minute the application is live at `https://your-github-name.github.io/slr-workbench/` because `index.html` sits at the repository root. Delete `.github/workflows/pages.yml` if you take this route, since it is not needed.

Option B, from the workflow. In Settings, Pages, choose Source: "GitHub Actions". The workflow in `.github/workflows/pages.yml` deploys the repository root on every push to `main`. This route lets you add a build step later without changing how Pages is configured.

Either way, users who prefer a local file can still download `dist/SLR_Workbench_v2.0.0.html`.

## 5. Cut a release

A release gives users a stable download and gives the paper a fixed version to cite.

```bash
git tag -a v2.0.0 -m "SLR Workbench v2.0.0"
git push origin v2.0.0
```

Then on GitHub go to Releases, "Draft a new release", choose tag `v2.0.0`, title it "SLR Workbench v2.0.0", paste the relevant section of `CHANGELOG.md` as the description, and attach `dist/SLR_Workbench_v2.0.0.html` as a release asset so that people can download the file without cloning.

## 6. Get a DOI (recommended for the paper)

Zenodo archives GitHub releases and mints a DOI for each. Sign in to zenodo.org with GitHub, enable the `slr-workbench` repository under "GitHub" in your Zenodo settings, then publish a release (or re-publish v2.0.0). Zenodo creates a versioned DOI and a concept DOI that always resolves to the latest version. Put the concept DOI in `CITATION.cff` under `doi`, in the README badge, and in the paper's data availability statement.

## 7. Keep the paper and the repository aligned

The paper quotes performance figures from `npm run bench`, screenshots from `npm run screenshots -- --docs`, and the PRISMA example from `npm run figure -- --docs`. If the code changes in a way that alters any of these, rerun the script and update both the repository images and the manuscript figure so the two never drift apart.

## Making a subsequent release

1. Edit the parts under `src/`.
2. Bump `APP_VERSION` in `src/03_core.js` and `version` in `package.json` and `CITATION.cff` together.
3. Add a section to `CHANGELOG.md`.
4. `npm test` (this rebuilds `index.html` and the `dist/` file).
5. Commit source and built files together, tag, push, draft the release, attach the new `dist/` file.

If a change alters the project file structure, increment `SCHEMA_VERSION` in `src/03_core.js`, add a migration branch to `migrateState`, and add a case to the self-test that opens a file of the previous version.
