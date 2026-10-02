import { knownGames, suggestedIdentity } from "./report-lookup.mjs";

const form = document.querySelector("#report-form");
const result = document.querySelector("#report-result");
const params = new URLSearchParams(location.search);
const aliases = {
  game: ["game", "new_app_name", "display_name"],
  bundle: ["bundle", "bundle_identifier"],
  version: ["version", "version_number"],
  rating: ["rating"],
  device: ["device", "operating_system"],
  emulator: ["emulator", "touchhle_version"],
  notes: ["notes", "remarks"],
};
for (const [field, names] of Object.entries(aliases)) {
  const value = names.map((name) => params.get(name)).find(Boolean);
  if (value) form.elements.namedItem(field).value = value;
}

fetch(new URL("./data/android-index.json", import.meta.url))
  .then((response) => response.ok ? response.json() : Promise.reject(new Error("catalogue unavailable")))
  .then((index) => {
    const games = knownGames(index.records ?? []);
    const suggestions = document.querySelector("#known-games");
    let autoBundle = "";
    let autoVersion = "";
    for (const { title } of games.values()) {
      const option = document.createElement("option");
      option.value = title;
      suggestions.append(option);
    }
    form.elements.namedItem("game").addEventListener("change", () => {
      const identity = suggestedIdentity(games, form.elements.namedItem("game").value);
      const bundle = form.elements.namedItem("bundle");
      const version = form.elements.namedItem("version");
      if (!identity) {
        if (autoBundle && bundle.value === autoBundle) bundle.value = "";
        if (autoVersion && version.value === autoVersion) version.value = "";
        autoBundle = autoVersion = "";
        return;
      }
      if (!bundle.value || bundle.value === autoBundle) {
        bundle.value = autoBundle = identity.bundle;
      }
      if (!version.value || version.value === autoVersion) {
        version.value = autoVersion = identity.version;
      }
    });
  })
  .catch(() => { /* The manual form remains usable when the catalogue is offline. */ });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const screenshot = form.elements.namedItem("screenshot").files[0];
  if (screenshot && screenshot.size > 5 * 1024 * 1024) {
    result.textContent = "Скриншот больше 5 МБ.";
    return;
  }
  button.disabled = true;
  result.textContent = "Отправляем отчёт…";
  try {
    const response = await fetch("https://superduper.188-120-224-148.sslip.io/api/compatibility-reports", {
      method: "POST", body: new FormData(form),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Не удалось отправить отчёт");
    const link = document.createElement("a");
    link.href = data.pullRequestUrl;
    link.textContent = "Открыть черновой Pull Request";
    link.rel = "noopener noreferrer";
    result.replaceChildren(document.createTextNode("Отчёт принят. После проверки он появится в базе. "), link);
    form.reset();
  } catch (error) {
    result.textContent = error instanceof Error ? error.message : "Не удалось отправить отчёт";
  } finally {
    button.disabled = false;
  }
});
