const validBundle = /^(?:[A-Za-z0-9_-]+\.)+[A-Za-z0-9_-]+$/;

export function knownGames(records) {
  const byTitle = new Map();
  for (const record of records) {
    if (!record.title || !validBundle.test(record.bundleId ?? "") || /^\d+(?:\.\d+)+$/.test(record.bundleId)) continue;
    const key = record.title.trim().toLocaleLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, { title: record.title.trim(), records: [] });
    byTitle.get(key).records.push(record);
  }
  return byTitle;
}

export function suggestedBundles(games, title) {
  const matches = games.get(title.trim().toLocaleLowerCase())?.records ?? [];
  return [...new Map(matches.map((record) => [record.bundleId.toLowerCase(), record.bundleId])).values()];
}

export function suggestedIdentity(games, title) {
  const matches = games.get(title.trim().toLocaleLowerCase())?.records ?? [];
  const bundles = suggestedBundles(games, title);
  if (bundles.length !== 1) return null;
  const versions = [...new Set(matches.map((record) => record.version).filter(Boolean))];
  return { bundle: matches[0].bundleId, version: versions.length === 1 ? versions[0] : "" };
}
