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
    throw new Error("Missing one of FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars");
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

// admin-write.js와 동일한 토큰 검증 로직
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

// 국장님이 "부재중"으로 전환될 때 호출되는 함수.
// state.deputyFcmToken (관리자 화면에서 등록한 대리 수신자 기기)에게
// 부재 사유를 담은 푸시 알림을 보낸다.
// 관리자 토큰 검증 후 실행 — 토큰 없이는 호출 불가
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });

  try {
    const body = JSON.parse(event.body || "{}");

    // 관리자 토큰 검증
    if (!verifyToken(body.token)) {
      return json(401, { ok: false, error: "관리자 인증이 유효하지 않거나 만료되었습니다." });
    }

    const ref = admin.database().ref(STATE_PATH);
    const snap = await ref.get();
    const state = snap.val() || {};
    const deputyToken = state.deputyFcmToken;

    if (!deputyToken) {
      return json(200, { ok: true, skipped: "no-deputy-token" });
    }

    const ds = state.directorStatus || {};
    const reason = ds.reason || "사유 미지정";
    const memoSuffix = ds.memo ? ` (${ds.memo})` : "";

    const title = "국장실 보고대기 - 부재중 알림";
    const notifBody = `국장님이 현재 부재중입니다. 사유: ${reason}${memoSuffix}. 대리 확인 부탁드립니다.`;

    await admin.messaging().send({
      token: deputyToken,
      notification: { title, body: notifBody },
      android: {
        priority: "high",
        notification: {
          priority: "max",
          defaultSound: true,
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
      },
      webpush: {
        headers: {
          Urgency: "high",
        },
        notification: {
          title,
          body: notifBody,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          requireInteraction: true,
        },
        fcmOptions: {
          link: "https://mafraincomeenergy.netlify.app/",
        },
      },
      data: {
        title,
        body: notifBody,
        type: "deputy-alert",
        reason,
      },
    });

    return json(200, { ok: true, sent: true });
  } catch (error) {
    console.error("notify-deputy error", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
