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

// 다음 대기자에게 호출 알림을 보내는 함수.
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
    const state = snap.val() || { bookings: [] };
    const bookings = Array.isArray(state.bookings) ? state.bookings : [];

    const idx = bookings.findIndex((b) => b && b.status === "REPORTING");
    if (idx < 0) return json(200, { ok: true, skipped: "no-reporting" });

    const current = bookings[idx];
    if (!current.fcmToken) return json(200, { ok: true, skipped: "no-fcm-token", reportingId: current.id });

    // 같은 calledAt에 대해 중복 발송 방지
    if (current.pushNotifiedAt && current.pushNotifiedCalledAt === current.calledAt) {
      return json(200, { ok: true, skipped: "already-sent", reportingId: current.id });
    }

    const title = "국장실 보고대기";
    const notifBody = `${current.department || "해당"}팀 차례입니다. 국장실 앞으로 와주세요.`;

    await admin.messaging().send({
      token: current.fcmToken,
      notification: { title, body: notifBody },
      android: {
        priority: "high",
        notification: {
          priority: "max",
          defaultSound: true,
          notificationCount: 1,
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
        bookingId: String(current.id || ""),
        calledAt: String(current.calledAt || ""),
      },
    });

    bookings[idx] = {
      ...current,
      pushNotifiedAt: Date.now(),
      pushNotifiedCalledAt: current.calledAt || null,
    };

    await ref.update({ bookings });

    return json(200, { ok: true, sent: true, reportingId: current.id });
  } catch (error) {
    console.error("send-next-notification error", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
