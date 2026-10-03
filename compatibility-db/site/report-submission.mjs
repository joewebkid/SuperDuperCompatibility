export function acceptedReport(ok, data) {
  if (!ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : "Не удалось отправить отчёт.");
  }
  const url = data?.pullRequestUrl;
  if (typeof url !== "string" || !/^https:\/\/github\.com\/joewebkid\/SuperDuperCompatibility\/pull\/[1-9]\d*$/.test(url)) {
    throw new Error("Сервер не подтвердил ссылку на Pull Request.");
  }
  return { url, duplicate: data.duplicate === true };
}
