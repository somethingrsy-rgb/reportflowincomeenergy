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

    const isUrgentRequest = payload.type === "urgent-request";
    if (isUrgentRequest) {
      const booking = (state.bookings || []).find(b => String(b.id) === String(payload.bookingId));
      if (!booking || booking.status !== "WAITING" || !booking.urgentRequested || booking.isUrgent) {
        return json(409, { ok: false, error: "승인 대기 중인 긴급 요청이 없습니다." });
      }
      // Use the saved request, not client-supplied notification content.
      payload = booking;
    }
    const department = payload.department || "";
    const reporterName = payload.reporterName || "";
    const title = payload.title || "";

    const APP_URL = process.env.ALLOWED_ORIGIN || "https://mafraincomeenergy.netlify.app";
    const notifTitle = isUrgentRequest ? "국장실 보고대기 - 긴급 처리 요청" : "국장실 보고대기 - 신규 등록";
    const titleSuffix = title ? ` (${title})` : "";
    let notifBody;
    if (reporterName) {
      notifBody = `${department ? department + " " : ""}${reporterName}님이 신규 등록했습니다.${titleSuffix}`;
    } else if (department) {
      notifBody = `${department}에서 신규 등록이 접수되었습니다.${titleSuffix}`;
    } else {
      notifBody = "신규 등록이 접수되었습니다.";
    }

    if (isUrgentRequest) {
      notifBody = `${department ? department + " " : ""}${reporterName}님이 긴급 처리를 요청했습니다.${titleSuffix} 관리자 화면에서 승인 여부를 확인해 주세요.`;
    }

    await admin.messaging().send({
      token: adminToken,
      notification: { title: notifTitle, body: notifBody },
      android: { priority: "high" },
      webpush: {
        // Browser/PWA tokens use Web Push priority, not android.priority.
        headers: { Urgency: "high" },
        notification: {
          title: notifTitle,
          body: notifBody,
          icon: "/icons/icon-192.png",
          badge: "/icons/notification-badge.png",
          requireInteraction: true,
          silent: false,
          vibrate: [200, 100, 200],
        },
        fcmOptions: { link: APP_URL },
      },
      data: { title: notifTitle, body: notifBody, type: isUrgentRequest ? "urgent-request" : "new-registration", requestKey: isUrgentRequest ? `${payload.id}:${payload.urgentRequestedAt || 0}` : "" },
    });

    return json(200, { ok: true, sent: true });
  } catch (error) {
    console.error("notify-admin error", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
