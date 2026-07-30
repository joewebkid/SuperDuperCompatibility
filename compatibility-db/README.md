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
