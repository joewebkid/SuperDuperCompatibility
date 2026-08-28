const labels = {
  all: "All apps",
  unknown: "Untested",
  partial: "Major issues",
  verified: "Verified",
  issues: "Small issues",
  blocked: "Blocked",
};

const filters = ["all", "verified", "issues", "partial", "blocked", "unknown"];
let selectedStatus = "all";
let apps = [];

const search = document.querySelector("#search");
const genreFilter = document.querySelector("#genre-filter");
const developerFilter = document.querySelector("#developer-filter");
const filtersNode = document.querySelector("#filters");
const gamesNode = document.querySelector("#games");
const countNode = document.querySelector("#count");
const emptyNode = document.querySelector("#empty");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusOf(app) {
  return app.android?.overallStatus ?? "unknown";
}

function genresOf(app) {
  return Array.isArray(app.genres) ? app.genres : [];
}

function ratingText(rating) {
  return Number.isInteger(rating) ? `${"★".repeat(rating)}${"☆".repeat(5 - rating)}` : "Untested";
}

function resultMarkup(app) {
  const rating = app.android?.bestRating;
  const status = statusOf(app);
  const reports = app.android?.reportCount ?? 0;
  if (reports === 0) {
    const references = app.reference?.androidReports ?? 0;
    return `<span class="status unknown">Untested</span>${references ? `<small>${references} touchHLE Android reference${references === 1 ? "" : "s"}</small>` : ""}`;
  }
  return `<span class="rating" aria-label="${escapeHtml(rating ? `${rating} of 5 stars` : labels[status])}">${ratingText(rating)}</span><small><span class="status ${escapeHtml(status)}">${escapeHtml(labels[status])}</span> · ${reports} report${reports === 1 ? "" : "s"}</small>`;
}

function renderFilters() {
  filtersNode.replaceChildren(...filters.map((status) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = labels[status];
    button.className = status === selectedStatus ? "selected" : "";
    button.addEventListener("click", () => {
      selectedStatus = status;
      renderFilters();
      renderApps();
    });
    return button;
  }));
}

function renderGenreFilter() {
  const selected = genreFilter.value;
  const genres = [...new Set(apps.flatMap(genresOf))].sort((a, b) => a.localeCompare(b));
  genreFilter.replaceChildren(new Option("All genres", ""), ...genres.map((genre) => new Option(genre, genre)));
  genreFilter.value = genres.includes(selected) ? selected : "";
}

function appRow(app) {
  const row = document.createElement("a");
  row.className = "catalogue-row";
  row.href = `game/?id=${encodeURIComponent(app.id)}`;
  const release = app.releaseYear || "—";
  const publisher = app.developerPublisher || "—";
  const lastUpdated = app.android?.lastUpdated || "—";
  row.innerHTML = `
    <span class="app-cell"><strong>${escapeHtml(app.title)}</strong><small>${app.versions} version${app.versions === 1 ? "" : "s"}</small></span>
    <span data-label="Release">${escapeHtml(release)}</span>
    <span data-label="Developer / Publisher">${escapeHtml(publisher)}</span>
    <span class="result-cell" data-label="Android result">${resultMarkup(app)}</span>
    <span data-label="Last update">${escapeHtml(lastUpdated)}</span>
  `;
  return row;
}

function renderApps() {
  const query = search.value.trim().toLocaleLowerCase();
  const developerQuery = developerFilter.value.trim().toLocaleLowerCase();
  const selectedGenre = genreFilter.value;
  const matching = apps.filter((app) => {
    const searchable = `${app.title} ${app.developerPublisher ?? ""} ${(app.searchTerms ?? []).join(" ")}`.toLocaleLowerCase();
    const developer = (app.developerPublisher ?? "").toLocaleLowerCase();
    return (selectedStatus === "all" || statusOf(app) === selectedStatus) &&
      (!selectedGenre || genresOf(app).includes(selectedGenre)) &&
      developer.includes(developerQuery) && searchable.includes(query);
  });
  gamesNode.replaceChildren(...matching.map(appRow));
  countNode.textContent = `${matching.length.toLocaleString()} of ${apps.length.toLocaleString()} apps`;
  emptyNode.hidden = matching.length !== 0;
}

function renderSummary() {
  const tested = apps.filter((app) => (app.android?.reportCount ?? 0) > 0).length;
  const references = apps.reduce((total, app) => total + (app.reference?.androidReports ?? 0), 0);
  document.querySelector("#app-total").textContent = apps.length.toLocaleString();
  document.querySelector("#tested-total").textContent = tested.toLocaleString();
  document.querySelector("#reference-total").textContent = references.toLocaleString();
}

async function load() {
  try {
    const response = await fetch("data/index.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const database = await response.json();
    apps = database.apps ?? [];
    renderSummary();
    renderFilters();
    renderGenreFilter();
    renderApps();
  } catch (error) {
    gamesNode.textContent = "The compatibility database could not be loaded.";
    console.error(error);
  }
}

search.addEventListener("input", renderApps);
developerFilter.addEventListener("input", renderApps);
genreFilter.addEventListener("change", renderApps);
load();
