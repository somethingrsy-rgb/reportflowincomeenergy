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

    const APP_URL = process.env.ALLOWED_ORIGIN || "";
    const title = "국장실 보고대기";
    const body = `${current.department || "해당"}팀 차례입니다. 국장실 앞으로 와주세요.`;

    await admin.messaging().send({
      token: current.fcmToken,
      notification: { title, body },
      android: { priority: "high" },
      webpush: {
        notification: {
          title,
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
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
