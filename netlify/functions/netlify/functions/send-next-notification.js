const { admin, json } = require("./_config");
const { getBureauId, getPaths, getBureauAppUrl } = require("./_bureau");

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
    const state = snap.val() || { bookings: [] };
    const bookings = Array.isArray(state.bookings) ? state.bookings : [];

    const idx = bookings.findIndex((b) => b && b.status === "REPORTING");
    if (idx < 0) return json(200, { ok: true, skipped: "no-reporting", currentSent: false, preCallSent: false });

    const current = bookings[idx];
    const APP_URL = getBureauAppUrl(bureauId);
    let currentSent = false;
    let currentSkipped = null;
    let preCallSent = false;
    let preCallSkipped = null;

    // 1) 현재 호출된 팀: "지금 입장하세요"
    if (!current.fcmToken) {
      currentSkipped = "no-fcm-token";
    } else if (current.pushNotifiedAt && current.pushNotifiedCalledAt === current.calledAt) {
      currentSkipped = "already-sent";
    } else {
      const title = "국장실 보고대기";
      const body = `${current.department || "해당"}팀 차례입니다. 국장실 앞으로 와주세요.`;
      await admin.messaging().send({
        token: current.fcmToken,
        android: { priority: "high" },
        webpush: {
          headers: { Urgency: "high", TTL: "300" },
          notification: {
            title,
            body,
            icon: "/icons/icon-192.png",
            badge: "/icons/notification-badge.png",
            tag: `report-call-${String(current.id || "")}-${String(current.calledAt || "")}`,
            requireInteraction: true,
            vibrate: [250, 120, 250],
          },
          fcmOptions: { link: APP_URL },
        },
        data: {
          title,
          body,
          bookingId: String(current.id || ""),
          calledAt: String(current.calledAt || ""),
          type: "report-call",
          tag: `report-call-${String(current.id || "")}-${String(current.calledAt || "")}`,
          url: APP_URL,
        },
      });
      currentSent = true;
      bookings[idx] = {
        ...current,
        pushNotifiedAt: Date.now(),
        pushNotifiedCalledAt: current.calledAt || null,
      };
    }

    // 2) 바로 다음 대기팀: 현재 REPORTING 팀이 1팀 앞에 있으므로 "앞에 1팀 남았습니다"
    // 서버 FCM으로 직접 보내 백그라운드/화면 잠금 상태에서도 수신 가능하게 합니다.
    const preIdx = bookings.findIndex((b) => b && b.status === "WAITING");
    if (preIdx < 0) {
      preCallSkipped = "no-waiting";
    } else {
      const nextWaiting = bookings[preIdx];
      const marker = String(current.calledAt || current.id || "reporting");
      if (!nextWaiting.fcmToken) {
        preCallSkipped = "no-fcm-token";
      } else if (String(nextWaiting.preCallNotifiedFor || "") === marker) {
        preCallSkipped = "already-sent";
      } else {
        const title = "국장실 보고대기";
        const body = `${nextWaiting.department || "해당"}팀, 앞에 1팀 남았습니다. 국장실 근처로 이동해 주세요.`;
        await admin.messaging().send({
          token: nextWaiting.fcmToken,
          android: { priority: "high" },
          webpush: {
            headers: { Urgency: "high", TTL: "600" },
            notification: {
              title,
              body,
              icon: "/icons/icon-192.png",
              badge: "/icons/notification-badge.png",
              tag: `pre-call-${String(nextWaiting.id || "")}-${marker}`,
              requireInteraction: true,
              vibrate: [180, 100, 180],
            },
            fcmOptions: { link: APP_URL },
          },
          data: {
            title,
            body,
            bookingId: String(nextWaiting.id || ""),
            type: "pre-call-one-ahead",
            aheadCount: "1",
            tag: `pre-call-${String(nextWaiting.id || "")}-${marker}`,
            url: APP_URL,
          },
        });
        preCallSent = true;
        bookings[preIdx] = {
          ...nextWaiting,
          preCallNotifiedAt: Date.now(),
          preCallNotifiedFor: marker,
        };
      }
    }

    await ref.update({ bookings });

    return json(200, {
      ok: true,
      sent: currentSent,
      currentSent,
      currentSkipped,
      preCallSent,
      preCallSkipped,
      reportingId: current.id,
      preCallBookingId: preIdx >= 0 ? bookings[preIdx]?.id || null : null,
    });
  } catch (error) {
    console.error("send-next-notification error", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
