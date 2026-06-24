const crypto = require("crypto");
const { json } = require("./_config");

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7일

// 길이가 다른 문자열을 비교할 때도 처리 시간이 일정하도록 맞춰서
// PIN을 한 글자씩 추측하는 타이밍 공격을 막는다.
function safeEquals(a, b) {
  const bufA = Buffer.from(String(a).padEnd(64, "\0"));
  const bufB = Buffer.from(String(b).padEnd(64, "\0"));
  return crypto.timingSafeEqual(bufA, bufB);
}

// 이 함수는 브라우저(클라이언트)에서 입력한 PIN을 서버에서 직접 확인한다.
// PIN은 Netlify 환경변수(ADMIN_PIN)에만 저장되고, 코드 어디에도 적히지 않는다.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });

  const ADMIN_PIN = process.env.ADMIN_PIN;
  const ADMIN_PIN_SECRET = process.env.ADMIN_PIN_SECRET || ADMIN_PIN;

  if (!ADMIN_PIN) {
    return json(500, {
      ok: false,
      error: "서버에 ADMIN_PIN 환경변수가 설정되어 있지 않습니다. Netlify 환경변수를 확인하세요.",
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "잘못된 요청 형식입니다." });
  }

  const pin = String(body.pin ?? "");

  if (!safeEquals(pin, ADMIN_PIN)) {
    return json(401, { ok: false, error: "PIN이 올바르지 않습니다." });
  }

  // PIN이 맞으면, 정해진 시간 동안만 유효한 서명된 토큰을 발급한다.
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const signature = crypto
    .createHmac("sha256", ADMIN_PIN_SECRET)
    .update(String(expiresAt))
    .digest("hex");
  const token = `${expiresAt}.${signature}`;

  return json(200, { ok: true, token, expiresAt });
};
