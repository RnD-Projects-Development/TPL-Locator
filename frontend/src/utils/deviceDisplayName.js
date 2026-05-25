/** Locator/sticker label shown under serial number on list cards. */
export function deviceDisplayName(device) {
  const sn = String(device?.sn || device?.id || "").trim();
  const name = String(device?.name || "").trim();
  if (name) return name;

  const assigned = String(device?.assigned_name || "").trim();
  if (assigned && assigned !== sn) return assigned;

  return "No name";
}
