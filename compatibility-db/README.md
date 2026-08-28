# Compatibility data format

The catalogue follows the AppDB hierarchy: **app → version → report**.

- `data/index.json` is the Android catalogue index used by the web site.
- `data/source/touchhle/apps/<id>.json` holds imported app metadata, versions
  and Android-only touchHLE reference reports.
- `data/games/<bundle-id>/<version>.json` holds a version-specific Super Duper
  Android test record.
- `data/profiles/<profile-id>.json` contains a reusable recommended profile.
- `schema/game-report.schema.json` documents a Super Duper game record.

Do not infer that an untested IPA revision has the same result. Use `unknown`,
`partial`, `verified`, `issues`, or `blocked` for a milestone and explain
non-obvious results in `notes`. A numeric `androidRating` uses the five-star
AppDB scale and may only be set for a tested Super Duper build.

## Local validation and site build

Requires Node.js 20 or newer:

```sh
node compatibility-db/scripts/validate.mjs
node compatibility-db/scripts/build-pages.mjs
```

The generated static site is written to `compatibility-db/dist/`. GitHub Actions
validates the records and publishes this directory to GitHub Pages.

Published app details use directory-style URLs such as
`/game/?id=touchhle-139`. The legacy `/game.html?id=...` route is retained only
as a redirect so existing links do not break. During the build, reviewed files
from `data/games/` are merged into the published catalogue and into the compact
`data/android-index.json` endpoint consumed by the Android launcher. The source
catalogue remains generated data and does not need to be edited for every test.

## Reporting rules

- Identify a game by its iOS bundle identifier and `CFBundleVersion`.
- Include the Android device/GPU, app build, active profile and observed
  milestones in a contribution.
- Do not upload the IPA, decrypted assets, account tokens, save data, or logs
  containing private paths or personal data.
- To attach a screenshot, use **Submit Android report** in the published
  catalogue. It opens a GitHub Issue form; drag the screenshot into its
  Screenshot field. GitHub hosts the attachment, and a maintainer adds the
  approved URL to the matching report record.
- The Android app can also prepare a report from its in-game menu. It exports
  the captured screenshot through Android MediaStore, copies the Markdown
  report to the clipboard and opens a prefilled GitHub Issue. Contributors use
  their own GitHub account; no maintainer token or repository credential is
  shipped in the APK. If no browser is available, Android's share sheet remains
  available as a fallback.
- Do not add screenshots copied from another compatibility database. Screens
  from an app remain the copyright of that app's rightsholders.

## Importing the touchHLE AppDB catalogue

Run the following command with Node.js 20 or newer:

```sh
node compatibility-db/scripts/import-touchhle.mjs
```

The importer reads public AppDB pages, writes one source record per app, and
keeps only reports whose operating system is Android. It does not download or
mirror source screenshots. Use `--refresh` to refetch cached pages and
`--concurrency=8` to set request parallelism. The resulting data requires the
attribution in [`../ATTRIBUTION.md`](../ATTRIBUTION.md).

## Finding legal test copies

`find-ipaarchive-candidates.mjs` searches the public metadata in Internet
Archive's `ipaarchive` collection for titles from the compatibility catalogue:

```sh
node compatibility-db/scripts/find-ipaarchive-candidates.mjs --limit=12
node compatibility-db/scripts/find-ipaarchive-candidates.mjs --title="Orions"
```

It writes an ignored metadata queue to `.cache/ipaarchive/candidates.json`.
The result only links to archive item pages; it does not download IPA files,
does not publish download links in the catalogue and does not prove that a
candidate is the same application. Before any test, verify `CFBundleIdentifier`
and `CFBundleVersion` from an IPA you are legally entitled to use. Never commit
an IPA, decrypted assets, account data or a game screenshot you do not own.
