const crypto = require("crypto");
const { admin, json } = require("./_config");

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7일

const MAX_ATTEMPTS = 5;           // 이 횟수만큼 틀리면 잠금
const LOCKOUT_MS = 1000 * 60 * 15; // 잠금 지속 시간 (15분)
const ATTEMPTS_PATH = "/security/adminPinAttempts";

// 길이가 다른 문자열을 비교할 때도 처리 시간이 일정하도록 맞춰서
// PIN을 한 글자씩 추측하는 타이밍 공격을 막는다.
function safeEquals(a, b) {
  const bufA = Buffer.from(String(a).padEnd(64, "\0"));
  const bufB = Buffer.from(String(b).padEnd(64, "\0"));
  return crypto.timingSafeEqual(bufA, bufB);
}

// IP 주소를 그대로 Firebase 경로 키로 쓸 수 없으므로(점, 콜론 등 금지 문자 포함)
// 안전한 키로 변환한다. 실제 IP를 그대로 저장하지 않기 위해 해시를 사용한다.
function ipToKey(ip) {
  return crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 32);
}

function getClientIp(event) {
  const forwarded = event.headers["x-forwarded-for"] || event.headers["X-Forwarded-For"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return event.headers["client-ip"] || "unknown";
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
  const ipKey = ipToKey(getClientIp(event));
  const attemptRef = admin.database().ref(`${ATTEMPTS_PATH}/${ipKey}`);

  // 1) 현재 잠금 상태인지 먼저 확인
  const snapshot = await attemptRef.once("value");
  const record = snapshot.val() || { count: 0, lockedUntil: 0 };

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMin = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return json(429, {
      ok: false,
      error: `PIN을 너무 많이 틀렸습니다. ${remainingMin}분 후 다시 시도해 주세요.`,
    });
  }

  // 2) PIN 검증
  if (!safeEquals(pin, ADMIN_PIN)) {
    const nextCount = (record.lockedUntil && Date.now() >= record.lockedUntil ? 0 : record.count) + 1;
    const update = { count: nextCount, lastAttemptAt: Date.now() };
    if (nextCount >= MAX_ATTEMPTS) {
      update.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    await attemptRef.set(update);

    if (update.lockedUntil) {
      return json(429, {
        ok: false,
        error: `PIN을 ${MAX_ATTEMPTS}회 틀려 15분간 잠겼습니다.`,
      });
    }
    return json(401, {
      ok: false,
      error: `PIN이 올바르지 않습니다. (${nextCount}/${MAX_ATTEMPTS}회 실패)`,
    });
  }

  // 3) 성공하면 실패 기록 초기화
  await attemptRef.remove();

  // PIN이 맞으면, 정해진 시간 동안만 유효한 서명된 토큰을 발급한다.
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const signature = crypto
    .createHmac("sha256", ADMIN_PIN_SECRET)
    .update(String(expiresAt))
    .digest("hex");
  const token = `${expiresAt}.${signature}`;

  return json(200, { ok: true, token, expiresAt });
};
