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
