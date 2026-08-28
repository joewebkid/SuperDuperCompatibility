const issueTemplate = "https://github.com/joewebkid/SuperDuperCompatibility/issues/new?template=android-compatibility-report.yml";
const dataRoot = new URL("data/", import.meta.url);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stars(rating) {
  return Number.isInteger(rating) ? `${"★".repeat(rating)}${"☆".repeat(5 - rating)}` : "—";
}

function statusLabel(status) {
  return {
    unknown: "Untested",
    partial: "Major issues",
    verified: "Verified",
    issues: "Small issues",
    blocked: "Blocked",
  }[status] ?? "Untested";
}

async function json(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function rows(items) {
  return items.map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${value}</td></tr>`).join("");
}

function reportCard(record) {
  const milestones = Object.entries(record.milestones ?? {})
    .map(([name, status]) => `<li><span>${escapeHtml(name)}</span><strong class="status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</strong></li>`)
    .join("");
  const deviceRows = (record.testedOn ?? []).map((test) => `<li>${escapeHtml(test.device ?? "Android device")}${test.appBuild ? ` · ${escapeHtml(test.appBuild)}` : ""}</li>`).join("");
  const profile = record.recommendedProfile ? `<p><strong>Recommended profile:</strong> <code>${escapeHtml(record.recommendedProfile)}</code></p>` : "";
  return `
    <article class="report-card">
      <div class="report-card-title"><div><h3>Super Duper Android report</h3><p class="muted">${escapeHtml(record.version)} · updated ${escapeHtml(record.updated)}</p></div><strong class="rating">${stars(record.androidRating)}</strong></div>
      <p><span class="status ${escapeHtml(record.overallStatus)}">${escapeHtml(statusLabel(record.overallStatus))}</span></p>
      ${record.notes ? `<p>${escapeHtml(record.notes)}</p>` : ""}
      ${profile}
      ${milestones ? `<h4>Milestones</h4><ul class="milestones">${milestones}</ul>` : ""}
      ${deviceRows ? `<h4>Tested on</h4><ul class="plain-list">${deviceRows}</ul>` : ""}
    </article>`;
}

function sourceReferenceTable(reports) {
  if (reports.length === 0) return "<p class=\"empty-section\">No Android touchHLE reference reports were imported for this app.</p>";
  return `<div class="report-table-wrap"><table class="report-table"><thead><tr><th>Version</th><th>touchHLE build</th><th>GPU</th><th>Rating</th><th>Reported</th><th>Remarks</th></tr></thead><tbody>${reports.map((report) => `<tr><td>${escapeHtml(report.version || "—")}</td><td>${escapeHtml(report.emulatorVersion || "—")}</td><td>${escapeHtml(report.gpu || "—")}</td><td class="rating">${stars(report.rating)}</td><td>${escapeHtml(report.reported?.slice(0, 10) || "—")}</td><td>${escapeHtml(report.remarks || "—")}</td></tr>`).join("")}</tbody></table></div>`;
}

function sourceVersionsTable(versions) {
  if (versions.length === 0) return "<p class=\"empty-section\">No source version metadata is available.</p>";
  return `<div class="report-table-wrap"><table class="report-table"><thead><tr><th>Version</th><th>Display name</th><th>Bundle identifier</th><th>Minimum iOS</th><th>Best Android reference rating</th><th>Last Android reference</th></tr></thead><tbody>${versions.map((version) => `<tr><td>${escapeHtml(version.version || "—")}</td><td>${escapeHtml(version.displayName || "—")}</td><td><code>${escapeHtml(version.bundleId || "—")}</code></td><td>${escapeHtml(version.minimumIosVersion || "—")}</td><td class="rating">${stars(version.androidReferenceBestRating)}</td><td>${escapeHtml(version.androidReferenceLastUpdated?.slice(0, 10) || "—")}</td></tr>`).join("")}</tbody></table></div>`;
}

function screenshotGallery(records) {
  const screenshots = records.flatMap((record) => (record.screenshots ?? []).map((screenshot) => ({ ...screenshot, version: record.version })));
  if (screenshots.length === 0) return "<p class=\"empty-section\">No approved Super Duper screenshots yet.</p>";
  return `<div class="screenshot-grid">${screenshots.map((screenshot) => `<figure><a href="${escapeHtml(screenshot.url)}"><img src="${escapeHtml(screenshot.url)}" alt="${escapeHtml(screenshot.alt || "Super Duper compatibility screenshot")}" loading="lazy"></a><figcaption>${escapeHtml(screenshot.caption || `Version ${screenshot.version}`)}</figcaption></figure>`).join("")}</div>`;
}

function ipaReleaseCard(record) {
  const release = record.ipaRelease;
  if (!release) return "";
  return `
    <article class="ipa-release-card">
      <div><p class="section-kicker">AUTHORISED IPA</p><h3>${escapeHtml(release.fileName)}</h3></div>
      <a class="primary-action" href="${escapeHtml(release.url)}">Download authorised IPA</a>
      <p>This archive is published by or with permission from <strong>${escapeHtml(release.rightsHolder)}</strong>.</p>
      <p>${escapeHtml(release.authorizationNote)}</p>
      <p class="hash"><strong>SHA-256</strong><code>${escapeHtml(release.sha256)}</code></p>
    </article>`;
}

async function load() {
  const target = document.querySelector("#game");
  try {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) throw new Error("No app was selected.");
    const index = await json(new URL("index.json", dataRoot));
    const app = index.apps?.find((item) => item.id === id);
    if (!app) throw new Error("The selected app does not exist in this catalogue.");

    const [sourceRecord, ...androidRecords] = await Promise.all([
      app.record ? json(new URL(app.record, dataRoot)) : Promise.resolve(null),
      ...(app.android?.records ?? []).map((record) => json(new URL(record, dataRoot))),
    ]);
    const defaultVersion = sourceRecord?.versions?.[0]?.version ?? androidRecords[0]?.version ?? "";
    const submitUrl = `${issueTemplate}&title=${encodeURIComponent(`[Android report]: ${app.title}${defaultVersion ? ` ${defaultVersion}` : ""}`)}`;
    document.title = `${app.title} · Super Duper Compatibility`;

    const facts = rows([
      ["App name", escapeHtml(app.title)],
      ["Release year", escapeHtml(app.releaseYear || "—")],
      ["Developer / Publisher", escapeHtml(app.developerPublisher || "—")],
      ["Genres", escapeHtml((app.genres ?? []).join(", ") || "—")],
      ["Super Duper Android result", `<span class="status ${escapeHtml(app.android?.overallStatus ?? "unknown")}">${escapeHtml(statusLabel(app.android?.overallStatus))}</span> ${app.android?.bestRating ? `<span class="rating">${stars(app.android.bestRating)}</span>` : ""}`],
      ["Last Super Duper update", escapeHtml(app.android?.lastUpdated || "—")],
    ]);
    const sourceBlock = sourceRecord ? `
      <section class="content-section">
        <div class="section-heading"><div><p class="section-kicker">SOURCE METADATA</p><h2>Versions</h2></div><a href="${escapeHtml(sourceRecord.source.appUrl)}">Open source AppDB page ↗</a></div>
        ${sourceVersionsTable(sourceRecord.versions)}
      </section>
      <section class="content-section">
        <div class="section-heading"><div><p class="section-kicker">REFERENCE ONLY</p><h2>touchHLE Android reports</h2></div></div>
        <p class="muted">Imported from touchHLE AppDB under CC BY 4.0. These are not Super Duper test results. Source screenshots are intentionally not mirrored.</p>
        ${sourceReferenceTable(sourceRecord.androidReferenceReports)}
      </section>` : "";
    const ipaReleases = androidRecords.filter((record) => record.ipaRelease);

    target.innerHTML = `
      <header class="game-hero">
        <p class="eyebrow">SUPER DUPER · ANDROID</p>
        <div class="game-hero-row"><div><h1>${escapeHtml(app.title)}</h1><p class="muted">${escapeHtml(app.developerPublisher || "Unknown developer / publisher")}</p></div><a class="primary-action" href="${submitUrl}">Submit Android report</a></div>
        <table class="facts-table"><tbody>${facts}</tbody></table>
      </header>
      <section class="content-section">
        <div class="section-heading"><div><p class="section-kicker">VERIFIED HERE</p><h2>Super Duper Android reports</h2></div></div>
        ${androidRecords.length ? `<div class="report-cards">${androidRecords.map(reportCard).join("")}</div>` : "<p class=\"empty-section\">Untested on Super Duper. Submit the first Android report for this app.</p>"}
      </section>
      ${ipaReleases.length ? `<section class="content-section"><div class="section-heading"><div><p class="section-kicker">OFFICIAL OR AUTHORISED</p><h2>IPA downloads</h2></div></div><p class="muted">Verify the SHA-256 hash after downloading. Only archives whose distribution rights are documented are listed here.</p><div class="report-cards">${ipaReleases.map(ipaReleaseCard).join("")}</div></section>` : ""}
      <section class="content-section">
        <div class="section-heading"><div><p class="section-kicker">COMMUNITY MEDIA</p><h2>Screenshots</h2></div><a href="${submitUrl}">Add screenshot ↗</a></div>
        <p class="muted">Use the report form to upload your own screenshot. It is shown here only after review.</p>
        ${screenshotGallery(androidRecords)}
      </section>
      ${sourceBlock}`;
  } catch (error) {
    target.innerHTML = `<div class="error-state"><h1>Compatibility record unavailable</h1><p>${escapeHtml(error.message)}</p><a href="../">Return to the catalogue</a></div>`;
    console.error(error);
  }
}

load();
