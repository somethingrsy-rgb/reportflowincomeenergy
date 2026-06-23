const admin = require("firebase-admin");
const crypto = require("crypto");

const ALLOWED_ORIGIN = "https://mafraincomeenergy.netlify.app";
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || "https://reportflowincomeenergy-default-rtdb.asia-southeast1.firebasedatabase.app";
const STATE_PATH = "/directorQueue/v1/state";

function getServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing one of FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars"
    );
  }
  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
    databaseURL: DATABASE_URL,
  });
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

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

// 이 함수는 "관리자 전용" 동작(다음 호출, 리셋, 부재중 설정 등)을 실제로 저장하는
// 유일한 통로다. 브라우저에서 직접 Firebase 주소로 쓰기 요청을 보내는 게 아니라,
// 여기로 토큰과 함께 요청을 보내야 하고, 토큰이 가짜이거나 만료됐으면 거부된다.
// firebase-admin은 Database 규칙(auth != null)을 무시하고 바로 쓸 수 있는 권한을
// 가지고 있으므로, 진짜 검증은 이 함수의 verifyToken()이 전부 책임진다.
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
