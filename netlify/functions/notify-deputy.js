const admin = require("firebase-admin");

const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || "https://ryuso-af2f2-default-rtdb.firebaseio.com";
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
      "Access-Control-Allow-Origin": "https://mafraincomeenergy.netlify.app",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

// 국장님이 "부재중"으로 전환될 때 호출되는 함수.
// state.deputyFcmToken (관리자 화면에서 등록한 대리 수신자 기기)에게
// 부재 사유를 담은 푸시 알림을 보낸다.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });

  try {
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
    const body = `국장님이 현재 부재중입니다. 사유: ${reason}${memoSuffix}. 대리 확인 부탁드립니다.`;

    await admin.messaging().send({
      token: deputyToken,
      notification: { title, body },
      webpush: {
        notification: {
          title,
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          requireInteraction: true,
        },
        fcmOptions: {
          link: "https://reportflowincomeenergy-git.netlify.app/",
        },
      },
      data: {
        title,
        body,
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
