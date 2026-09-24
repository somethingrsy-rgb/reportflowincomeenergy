const crypto = require("crypto");
const { admin, json, STATE_PATH } = require("./_config");

const HISTORY_PATH = "/directorQueue/v1/history";

// 관리자 동작(호출/완료/리셋 등)으로 새로 COMPLETED 된 예약을 찾아 history에 기록한다.
// 통계 페이지는 history만 보고 계산하므로, 여기서 기록을 빠뜨리면 통계에서 누락된다.
async function recordNewlyCompleted(prevBookings, nextBookings) {
  const prevCompletedIds = new Set(
    (prevBookings || []).filter((b) => b.status === "COMPLETED").map((b) => b.id)
  );
  const newlyCompleted = (nextBookings || []).filter(
    (b) => b.status === "COMPLETED" && !prevCompletedIds.has(b.id)
  );

  if (newlyCompleted.length === 0) return;

  const todayStr = new Date().toISOString().split("T")[0];
  const historyRef = admin.database().ref(HISTORY_PATH);

  await Promise.all(
    newlyCompleted.map((b) => {
      const entry = {
        type: "완료",
        category: b.department || b.category || "기타",
        reporter: b.reporterName,
        title: b.title,
        date: todayStr,
        bookingId: b.id,
        createdAt: Date.now(),
      };
      if (b.calledAt && b.completedAt) {
        entry.processingTimeMs = b.completedAt - b.calledAt;
      }
      return historyRef.push(entry);
    })
  );
}

// verify-pin.js가 발급한 토큰이 진짜이고(서명이 맞고) 아직 만료되지 않았는지 확인한다.
function verifyToken(token) {
  const ADMIN_PIN = process.env.ADMIN_PIN;
  const ADMIN_PIN_SECRET = process.env.ADMIN_PIN_SECRET || ADMIN_PIN;
  if (!ADMIN_PIN_SECRET || !token || typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expiresAtStr, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || Date.now() > expiresAt) return false;

  const expectedSignature = crypto
    .createHmac("sha256", ADMIN_PIN_SECRET)
    .update(expiresAtStr)
    .digest("hex");

  if (signature.length !== expectedSignature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

// 관리자 전용 동작(다음 호출, 리셋, 부재중 설정 등)을 실제로 저장하는 유일한 통로.
// 토큰이 가짜이거나 만료됐으면 거부된다.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "잘못된 요청 형식입니다." });
  }

  const { token, nextState } = body;

  if (!verifyToken(token)) {
    return json(401, { ok: false, error: "관리자 인증이 유효하지 않거나 만료되었습니다." });
  }

  if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
    return json(400, { ok: false, error: "저장할 데이터 형식이 올바르지 않습니다." });
  }

  try {
    const stateRef = admin.database().ref(STATE_PATH);

    // history 기록을 위해 덮어쓰기 전 상태를 먼저 읽어둔다.
    const prevSnapshot = await stateRef.once("value");
    const prevState = prevSnapshot.val() || {};

    await stateRef.set(nextState);

    // 새로 COMPLETED 된 항목이 있으면 history에 기록 (실패해도 본 저장은 이미 성공한 것으로 처리)
    try {
      await recordNewlyCompleted(prevState.bookings, nextState.bookings);
    } catch (historyError) {
      console.error("history 기록 실패 (상태 저장은 정상 완료됨):", historyError);
    }

    return json(200, { ok: true });
  } catch (error) {
    console.error("admin-write error:", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
