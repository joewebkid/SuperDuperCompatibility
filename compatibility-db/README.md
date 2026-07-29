# Compatibility data format

- `data/index.json` is the small index downloaded by clients and the web site.
- `data/games/<bundle-id>/<version>.json` records one testable game version.
- `data/profiles/<profile-id>.json` contains a reusable recommended profile.
- `schema/game-report.schema.json` documents the game-record format.

Each record is version-specific. Do not infer that an untested IPA revision has
the same result. Use `unknown`, `partial`, `verified`, `issues`, or `blocked`
for a milestone and explain non-obvious results in `notes`.

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
