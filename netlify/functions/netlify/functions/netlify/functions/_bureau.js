const LEGACY_BUREAU_ID = "income-energy";

function normalizeBureauId(value) {
  const id = String(value || LEGACY_BUREAU_ID).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(id)) {
    throw new Error("Invalid bureauId");
  }
  return id;
}

function getBureauId(body = {}) {
  return normalizeBureauId(body.bureauId || LEGACY_BUREAU_ID);
}

function getPaths(bureauId) {
  const id = normalizeBureauId(bureauId);
  if (id === LEGACY_BUREAU_ID) {
    return {
      statePath: "/directorQueue/v1/state",
      historyPath: "/directorQueue/v1/history",
      attemptsPath: "/security/adminPinAttempts"
    };
  }
  const base = `/directorQueues/${id}/v1`;
  return {
    statePath: `${base}/state`,
    historyPath: `${base}/history`,
    attemptsPath: `/security/adminPinAttempts/${id}`
  };
}

function parseBureauAdminConfig() {
  const raw = process.env.BUREAU_ADMIN_CONFIG_JSON || "{}";
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getAdminCredentials(bureauId) {
  const id = normalizeBureauId(bureauId);
  if (id === LEGACY_BUREAU_ID) {
    const pin = process.env.ADMIN_PIN || "";
    return { pin, secret: process.env.ADMIN_PIN_SECRET || pin };
  }

  const config = parseBureauAdminConfig()[id] || {};
  const pin = String(config.pin || "");
  return { pin, secret: String(config.secret || pin) };
}

function getBureauAppUrl(bureauId) {
  const origin = String(process.env.ALLOWED_ORIGIN || "https://mafraincomeenergy.netlify.app").replace(/\/$/, "");
  const id = normalizeBureauId(bureauId);
  return id === LEGACY_BUREAU_ID ? `${origin}/` : `${origin}/b/${encodeURIComponent(id)}`;
}

module.exports = {
  LEGACY_BUREAU_ID,
  normalizeBureauId,
  getBureauId,
  getPaths,
  getAdminCredentials,
  getBureauAppUrl
};
