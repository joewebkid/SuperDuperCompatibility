import { knownGames, suggestedBundles, suggestedIdentity } from "./report-lookup.mjs";
import { acceptedReport } from "./report-submission.mjs";

const form = document.querySelector("#report-form");
const result = document.querySelector("#report-result");
const params = new URLSearchParams(location.search);
const aliases = {
  game: ["game", "new_app_name", "display_name"],
  bundle: ["bundle", "bundle_identifier"],
  version: ["version", "version_number"],
  ipaSha256: ["ipaSha256", "ipa_sha256"],
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
    const bundleSuggestions = document.querySelector("#known-bundles");
    const gameHint = document.querySelector("#game-hint");
    let autoBundle = "";
    let autoVersion = "";
    for (const { title } of games.values()) {
      const option = document.createElement("option");
      option.value = title;
      suggestions.append(option);
    }
    form.elements.namedItem("game").addEventListener("change", () => {
      const title = form.elements.namedItem("game").value;
      const bundles = suggestedBundles(games, title);
      bundleSuggestions.replaceChildren(...bundles.map((value) => {
        const option = document.createElement("option");
        option.value = value;
        return option;
      }));
      gameHint.textContent = bundles.length > 1
        ? `У этой игры несколько Bundle ID: ${bundles.length <= 4 ? bundles.join(" или ") : `${bundles.length} вариантов`}. Выбери ID своей IPA; версия не подставляется.`
        : "Выбери игру из подсказок — Bundle ID заполнится автоматически, если он есть в базе. Сверь версию со своей IPA.";
      const identity = suggestedIdentity(games, title);
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch("https://superduper.188-120-224-148.sslip.io/api/compatibility-reports", {
      method: "POST", body: new FormData(form), signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    const accepted = acceptedReport(response.ok, data);
    const link = document.createElement("a");
    link.href = accepted.url;
    link.textContent = "Открыть Pull Request";
    link.rel = "noopener noreferrer";
    result.replaceChildren(document.createTextNode(accepted.duplicate
      ? "Этот отчёт уже принят; повторная отправка не создала новую заявку. "
      : "Отчёт принят. После проверки он появится в базе. "), link);
    form.reset();
  } catch (error) {
    const reason = controller.signal.aborted
      ? "Сервер не ответил за 90 секунд."
      : error instanceof Error ? error.message : "Не удалось отправить отчёт.";
    result.textContent = `${reason} Поля и скриншот остались в форме. Можно отправить ещё раз: сервер проверит, не создан ли уже Pull Request для этого отчёта.`;
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
  }
});
