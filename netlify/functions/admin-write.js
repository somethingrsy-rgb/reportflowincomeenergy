const crypto = require("crypto");
const { admin, json, STATE_PATH } = require("./_config");

// verify-pin.js가 발급한 토큰이 진짜이고(서명이 맞고) 아직 만료되지 않았는지 확인한다.
function verifyToken(token) {
  const ADMIN_PIN = process.env.ADMIN_PIN;
  const ADMIN_PIN_SECRET = process.env.ADMIN_PIN_SECRET || ADMIN_PIN;
  if (!ADMIN_PIN_SECRET || !token || typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expiresAtStr, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || Date.now() > expiresAt) return false;

  const expectedSignature = crypto
    .createHmac("sha256", ADMIN_PIN_SECRET)
    .update(expiresAtStr)
    .digest("hex");

  if (signature.length !== expectedSignature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

// 관리자 전용 동작(다음 호출, 리셋, 부재중 설정 등)을 실제로 저장하는 유일한 통로.
// 토큰이 가짜이거나 만료됐으면 거부된다.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "잘못된 요청 형식입니다." });
  }

  const { token, nextState } = body;

  if (!verifyToken(token)) {
    return json(401, { ok: false, error: "관리자 인증이 유효하지 않거나 만료되었습니다." });
  }

  if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
    return json(400, { ok: false, error: "저장할 데이터 형식이 올바르지 않습니다." });
  }

  try {
    await admin.database().ref(STATE_PATH).set(nextState);
    return json(200, { ok: true });
  } catch (error) {
    console.error("admin-write error:", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
