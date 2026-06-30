const { admin, json, STATE_PATH } = require("./_config");

// 일반 사용자가 새 대기열 예약을 등록했을 때 호출되는 함수.
// state.adminFcmToken (관리자 화면에서 등록한 관리자 기기)에게
// 신규 등록 알림을 보낸다. 등록한 일반 사용자에게는 알림이 가지 않는다.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });

  try {
    const ref = admin.database().ref(STATE_PATH);
    const snap = await ref.get();
    const state = snap.val() || {};
    const adminToken = state.adminFcmToken;

    if (!adminToken) {
      return json(200, { ok: true, skipped: "no-admin-token" });
    }

    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (_) {
      payload = {};
    }

    const department = payload.department || "";
    const reporterName = payload.reporterName || "";
    const title = payload.title || "";

    const APP_URL = process.env.ALLOWED_ORIGIN || "";
    const notifTitle = "국장실 보고대기 - 신규 등록";
    const detail = [department, reporterName].filter(Boolean).join(" / ");
    const notifBody = detail
      ? `${detail}님이 신규 등록했습니다.${title ? ` (${title})` : ""}`
      : "신규 등록이 접수되었습니다.";

    await admin.messaging().send({
      token: adminToken,
      notification: { title: notifTitle, body: notifBody },
      android: { priority: "high" },
      webpush: {
        notification: {
          title: notifTitle,
          body: notifBody,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          requireInteraction: true,
        },
        fcmOptions: { link: APP_URL },
      },
      data: { title: notifTitle, body: notifBody, type: "new-registration" },
    });

    return json(200, { ok: true, sent: true });
  } catch (error) {
    console.error("notify-admin error", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
