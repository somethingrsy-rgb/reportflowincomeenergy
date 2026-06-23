const admin = require("firebase-admin");

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
      "Access-Control-Allow-Origin": "https://mafraincomeenergy.netlify.app",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

// 일반 사용자가 긴급 보고를 신청할 때 관리자(대리 수신자)에게 알림을 보내는 함수
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });

  try {
    const body = JSON.parse(event.body || "{}");
    const { bookingId, department, reporterName, urgentReason } = body;

    if (!bookingId || !urgentReason) {
      return json(400, { ok: false, error: "bookingId and urgentReason are required" });
    }

    const ref = admin.database().ref(STATE_PATH);
    const snap = await ref.get();
    const state = snap.val() || {};

    // 관리자(대리 수신자) 토큰에 알림 전송
    const deputyToken = state.deputyFcmToken;

    const title = "🚨 긴급 보고 신청";
    const notifBody = `[${department || "미지정"}] ${reporterName || "알 수 없음"}님이 긴급 보고를 요청했습니다.`;

    if (deputyToken) {
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
          type: "urgent-request",
          bookingId: String(bookingId),
          urgentReason: urgentReason,
        },
      });
    }

    return json(200, { ok: true, sent: !!deputyToken });
  } catch (error) {
    console.error("notify-urgent-request error", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
