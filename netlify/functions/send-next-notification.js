const { admin, json, STATE_PATH } = require("./_config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });

  try {
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

    const APP_URL = process.env.ALLOWED_ORIGIN || "https://mafraincomeenergy.netlify.app";
    const title = "국장실 보고대기";
    const who = [current.department, current.reporterName ? `${current.reporterName}님` : ""].filter(Boolean).join(" ");
    const body = `${who ? who + ", " : ""}지금 즉시 국장실로 입장하세요!`;

    await admin.messaging().send({
      token: current.fcmToken,
      notification: { title, body },
      android: { priority: "high" },
      webpush: {
        notification: {
          title,
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/notification-badge.png",
          requireInteraction: true,
        },
        fcmOptions: { link: APP_URL },
      },
      data: {
        title,
        body,
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
