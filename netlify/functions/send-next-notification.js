const { admin, json, STATE_PATH } = require("./_config");
const { sendOnce } = require("./_notification");

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
        ...(data.eventId ? { tag: "director-queue-" + data.eventId, renotify: false } : {}),
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


    const APP_URL = process.env.ALLOWED_ORIGIN || "https://mafraincomeenergy.netlify.app";
    const current = bookings[idx] || {};
    
    const result = { ok: true, reportingId: current.id || null };

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
          let pushAccepted = false;
          try {
            const title = "[긴급] 내 차례입니다!";
            const body = (current.department || "") + " " + (current.reporterName || "") + "님, 지금 즉시 국장실로 입장하세요!";
            await admin.messaging().send(buildMessage(current.fcmToken, title, body,
              { eventId: "reporting:" + current.id + ":" + (current.calledAt || current.id), type: "reporting", bookingId: String(current.id), calledAt: String(current.calledAt || "") }, APP_URL));
            pushAccepted = true;
            await delivery.set({ sent: true, sentAt: Date.now() });
            result.reportingSent = true;
          } catch (error) {
            if (!pushAccepted) await delivery.transaction(value => value?.claimId === claimId ? null : undefined);
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
    // 예약과 호출 회차별로 한 번만 보낸다(별도 발송 기록으로 동시 요청도 차단).
    try {
      const waiting = bookings
        .map((b, i) => ({ b, i }))
        .filter((x) => x.b && x.b.status === "WAITING")
        .sort((a, c) => getRank(a.b) - getRank(c.b));
      const next = waiting[0];
      const nextKey = String(current.calledAt || current.id || "idle");

      if (next && next.b.fcmToken) {
        const title = "국장실 보고대기";
        const body = "다음번 차례입니다. 국장실 근처로 이동해 주십시오.";

        await sendOnce(
          "next-in-line:" + next.b.id + ":" + nextKey,
          buildMessage(
            next.b.fcmToken,
            title,
            body,
            { type: "next-in-line", bookingId: String(next.b.id || "") },
            APP_URL
          )
        );

        result.nextSent = true;
        result.nextId = next.b.id;
      }
    } catch (nextError) {
      // 푸시 발송 실패가 호출 처리 자체를 실패로 만들지 않도록 분리한다.
      console.error("next-in-line notification error", nextError);
      result.nextError = nextError.message || String(nextError);
    }



    return json(200, result);
  } catch (error) {
    console.error("send-next-notification error", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};

