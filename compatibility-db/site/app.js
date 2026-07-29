const labels = {
  unknown: "не проверено",
  partial: "частично работает",
  verified: "проверено",
  issues: "есть проблемы",
  blocked: "заблокировано",
};

const filters = ["all", "verified", "partial", "issues", "blocked", "unknown"];
let selectedStatus = "all";
let games = [];

const search = document.querySelector("#search");
const filtersNode = document.querySelector("#filters");
const gamesNode = document.querySelector("#games");
const countNode = document.querySelector("#count");
const emptyNode = document.querySelector("#empty");

function textFor(status) {
  return status === "all" ? "все" : labels[status];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderFilters() {
  filtersNode.replaceChildren(...filters.map((status) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = textFor(status);
    button.className = status === selectedStatus ? "selected" : "";
    button.addEventListener("click", () => {
      selectedStatus = status;
      renderFilters();
      renderGames();
    });
    return button;
  }));
}

function gameCard(game) {
  const card = document.createElement("article");
  card.className = "game-card";
  const profile = game.recommendedProfile
    ? `<p class="profile">Рекомендуемый профиль: <code>${escapeHtml(game.recommendedProfile)}</code></p>`
    : "";
  card.innerHTML = `
    <div class="card-topline">
      <span class="badge ${escapeHtml(game.overallStatus)}">${escapeHtml(labels[game.overallStatus])}</span>
      <span class="version">v${escapeHtml(game.latestVersion)}</span>
    </div>
    <h3>${escapeHtml(game.title)}</h3>
    <p class="bundle-id">${escapeHtml(game.bundleId)}</p>
    ${profile}
    <a href="data/${encodeURI(game.record)}">Открыть запись JSON</a>
  `;
  return card;
}

function renderGames() {
  const query = search.value.trim().toLocaleLowerCase();
  const matching = games.filter((game) => {
    const searchable = `${game.title} ${game.bundleId} ${game.latestVersion}`.toLocaleLowerCase();
    return (selectedStatus === "all" || game.overallStatus === selectedStatus) && searchable.includes(query);
  });
  gamesNode.replaceChildren(...matching.map(gameCard));
  countNode.textContent = `${matching.length} из ${games.length}`;
  emptyNode.hidden = matching.length !== 0;
}

async function load() {
  try {
    const response = await fetch("data/index.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const database = await response.json();
    games = database.games ?? [];
    renderFilters();
    renderGames();
  } catch (error) {
    gamesNode.textContent = "Не удалось загрузить базу совместимости.";
    console.error(error);
  }
}

search.addEventListener("input", renderGames);
load();
