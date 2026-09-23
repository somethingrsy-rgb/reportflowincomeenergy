const { admin, json } = require("./_config");
const { getBureauId, getPaths, getBureauAppUrl } = require("./_bureau");

// 국장님이 "부재중"으로 전환될 때 호출되는 함수.
// state.deputyFcmToken (관리자 화면에서 등록한 대리 수신자 기기)에게
// 부재 사유를 담은 푸시 알림을 보낸다.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });

  let requestBody = {};
  try { requestBody = JSON.parse(event.body || "{}"); } catch { requestBody = {}; }
  let bureauId;
  let paths;
  try { bureauId = getBureauId(requestBody); paths = getPaths(bureauId); } catch { return json(400, { ok: false, error: "국 식별값이 올바르지 않습니다." }); }

  try {
    const ref = admin.database().ref(paths.statePath);
    const snap = await ref.get();
    const state = snap.val() || {};
    const deputyToken = state.deputyFcmToken;

    if (!deputyToken) {
      return json(200, { ok: true, skipped: "no-deputy-token" });
    }

    const ds = state.directorStatus || {};
    const reason = ds.reason || "사유 미지정";
    const memoSuffix = ds.memo ? ` (${ds.memo})` : "";

    const APP_URL = getBureauAppUrl(bureauId);
    const title = "국장실 보고대기 - 부재중 알림";
    const body = `국장님이 현재 부재중입니다. 사유: ${reason}${memoSuffix}. 대리 확인 부탁드립니다.`;

    await admin.messaging().send({
      token: deputyToken,
      android: { priority: "high" },
      webpush: {
        headers: { Urgency: "high", TTL: "300" },
        notification: {
          title: title,
          body: body,
          icon: "/icons/icon-192.png",
          badge: "/icons/notification-badge.png",
          tag: `director-away-${Date.now()}`,
          requireInteraction: true,
          vibrate: [250, 120, 250],
        },
        fcmOptions: { link: APP_URL },
      },
      data: { title, body, type: "deputy-alert", reason },
    });

    return json(200, { ok: true, sent: true });
  } catch (error) {
    console.error("notify-deputy error", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
