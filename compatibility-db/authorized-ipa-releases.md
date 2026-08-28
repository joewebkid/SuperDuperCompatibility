# Authorised IPA releases

This catalogue may link an IPA only when its copyright owner or an authorised
distributor has explicitly permitted public distribution. The IPA binary is
uploaded as a **GitHub Release asset**, never committed to the repository or
the GitHub Pages build.

## Publish a release

1. Verify the archive's distribution permission and keep the supporting record.
2. Calculate its checksum:

   ```powershell
   Get-FileHash .\Game.ipa -Algorithm SHA256
   ```

3. Create a release tag using `ipa/<bundle-id>/<version>` and upload the IPA as
   a release asset. GitHub's release UI is suitable; the equivalent CLI command
   is:

   ```powershell
   gh release create ipa/com.example.game/1.0.0 .\Game.ipa --title "Game 1.0.0"
   ```

4. Add `ipaRelease` to that version's `data/games/<bundle-id>/<version>.json`:

   ```json
   "ipaRelease": {
     "url": "https://github.com/joewebkid/SuperDuperCompatibility/releases/download/ipa/com.example.game/1.0.0/Game.ipa",
     "fileName": "Game.ipa",
     "sha256": "64-character lowercase SHA-256",
     "rightsHolder": "Name of the copyright owner or authorised distributor",
     "authorizationNote": "Why this exact archive may be publicly distributed."
   }
   ```

5. Run `node compatibility-db/scripts/validate.mjs`, commit the metadata and
   let the Pages workflow publish the download card.

Never upload encrypted, decrypted, re-signed or otherwise unauthorised IPA
archives. Do not include personal save files, Apple account data or private
logs in a release.
