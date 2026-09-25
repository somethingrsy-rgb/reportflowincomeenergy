const { admin, json, STATE_PATH } = require("./_config");

// 클라이언트(index.html)의 getOrderedWaitingList 와 같은 기준으로 대기 순서를 계산한다.
function getRank(b) {
  return typeof b.orderRank === "number" ? b.orderRank : b.id;
}

function buildMessage(token, title, body, data, appUrl) {
  return {
    token,
    notification: { title, body },
    android: { priority: "high" },
    webpush: {
      headers: { Urgency: "high" },
      notification: {
        title,
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/notification-badge.png",
        requireInteraction: true,
      },
      fcmOptions: { link: appUrl },
    },
    data: { title, body, ...data },
  };
}

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

    const APP_URL = process.env.ALLOWED_ORIGIN || "https://mafraincomeenergy.netlify.app";
    const current = bookings[idx];
    const updates = {}; // 바뀐 필드만 경로 단위로 저장 (다른 사용자의 동시 변경을 덮어쓰지 않음)
    const result = { ok: true, reportingId: current.id };

    // Separate delivery ledger survives client state saves and concurrent triggers.
    if (current.fcmToken) {
      const key = require("crypto").createHash("sha256")
        .update(String(current.id) + ":" + String(current.calledAt || current.id)).digest("hex");
      const delivery = admin.database().ref("/directorQueue/v1/pushDeliveries/" + key);
      const claimId = require("crypto").randomUUID();
      try {
        const claim = await delivery.transaction(value => {
          if (value?.sent || (value?.claimedAt && Date.now() - value.claimedAt < 60000)) return;
          return { claimId, claimedAt: Date.now() };
        });
        if (claim.committed) {
          try {
            const title = "[긴급] 내 차례입니다!";
            const body = (current.department || "") + " " + (current.reporterName || "") + "님, 지금 즉시 국장실로 입장하세요!";
            await admin.messaging().send(buildMessage(current.fcmToken, title, body,
              { type: "reporting", bookingId: String(current.id), calledAt: String(current.calledAt || "") }, APP_URL));
            await delivery.set({ sent: true, sentAt: Date.now() });
            result.reportingSent = true;
          } catch (error) {
            await delivery.transaction(value => value?.claimId === claimId ? null : undefined);
            throw error;
          }
        }
      } catch (error) {
        console.error("reporting notification error", error);
        result.reportingError = error.message || String(error);
      }
    } else {
      result.reportingSkipped = "no-device-token";
    }

    // 대기 1번(다음 차례)인 사람에게: "다음번 차례입니다" 푸시
    // 보고 중인 팀이 바뀔 때마다 한 번만 보낸다(nextPushCalledAt 로 중복 방지).
    try {
      const waiting = bookings
        .map((b, i) => ({ b, i }))
        .filter((x) => x.b && x.b.status === "WAITING")
        .sort((a, c) => getRank(a.b) - getRank(c.b));
      const next = waiting[0];
      const nextKey = String(current.calledAt || current.id || "");

      if (next && next.b.fcmToken && nextKey && next.b.nextPushCalledAt !== nextKey) {
        const title = "국장실 보고대기";
        const body = "다음번 차례입니다. 국장실 근처로 이동해 주십시오.";

        await admin.messaging().send(
          buildMessage(
            next.b.fcmToken,
            title,
            body,
            { type: "next-in-line", bookingId: String(next.b.id || "") },
            APP_URL
          )
        );
        updates[`bookings/${next.i}/nextPushCalledAt`] = nextKey;
        result.nextSent = true;
        result.nextId = next.b.id;
      }
    } catch (nextError) {
      // 푸시 발송 실패가 호출 처리 자체를 실패로 만들지 않도록 분리한다.
      console.error("next-in-line notification error", nextError);
      result.nextError = nextError.message || String(nextError);
    }

    if (Object.keys(updates).length) await ref.update(updates);

    return json(200, result);
  } catch (error) {
    console.error("send-next-notification error", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
