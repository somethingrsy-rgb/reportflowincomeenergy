const { admin, json, STATE_PATH } = require("./_config");

const HISTORY_PATH = "/directorQueue/v1/history";

// 새로 등록되거나 새로 완료된 항목을 찾아 history에 기록한다.
async function recordHistory(prevBookings, nextBookings) {
  const prevIds = new Set((prevBookings || []).map((b) => b.id));
  const prevCompletedIds = new Set(
    (prevBookings || []).filter((b) => b.status === "COMPLETED").map((b) => b.id)
  );

  const newlyRegistered = (nextBookings || []).filter((b) => !prevIds.has(b.id));
  const newlyCompleted = (nextBookings || []).filter(
    (b) => b.status === "COMPLETED" && !prevCompletedIds.has(b.id)
  );

  if (newlyRegistered.length === 0 && newlyCompleted.length === 0) return;

  const todayStr = new Date().toISOString().split("T")[0];
  const historyRef = admin.database().ref(HISTORY_PATH);
  const writes = [];

  for (const b of newlyRegistered) {
    writes.push(
      historyRef.push({
        type: "등록",
        category: b.department || b.category || "기타",
        reporter: b.reporterName,
        title: b.title,
        date: todayStr,
        bookingId: b.id,
        createdAt: Date.now(),
      })
    );
  }

  for (const b of newlyCompleted) {
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
    writes.push(historyRef.push(entry));
  }

  await Promise.all(writes);
}

// 일반 사용자(비관리자) 쓰기를 처리하는 함수.
// PIN 인증은 없지만, 클라이언트가 Firebase DB에 직접 쓰지 못하도록 막은 뒤
// 모든 쓰기가 반드시 서버를 거치도록 강제하기 위해 만들었다.
// 동시성 제어(ETag 비교)는 클라이언트가 기존처럼 처리하고, 여기서는 그 결과를 받아
// 한 번 더 같은 비교를 서버에서 직접 수행해 신뢰할 수 있는 쓰기만 반영한다.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "잘못된 요청 형식입니다." });
  }

  const { nextState, expectedUpdatedAt } = body;

  if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
    return json(400, { ok: false, error: "저장할 데이터 형식이 올바르지 않습니다." });
  }
  if (!Array.isArray(nextState.bookings)) {
    return json(400, { ok: false, error: "bookings 형식이 올바르지 않습니다." });
  }

  try {
    const stateRef = admin.database().ref(STATE_PATH);
    const prevSnapshot = await stateRef.once("value");
    const prevState = prevSnapshot.val() || {};

    // 동시 수정 충돌 감지: 내가 읽었던 시점과 지금 서버의 최신 시점이 다르면 거부
    const serverUpdatedAt = prevState.updatedAt || "0";
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== serverUpdatedAt) {
      return json(409, { ok: false, error: "동시 수정 충돌이 감지되었습니다.", conflict: true });
    }

    nextState.updatedAt = Date.now().toString();
    await stateRef.set(nextState);

    try {
      await recordHistory(prevState.bookings, nextState.bookings);
    } catch (historyError) {
      console.error("history 기록 실패 (상태 저장은 정상 완료됨):", historyError);
    }

    return json(200, { ok: true, state: nextState });
  } catch (error) {
    console.error("queue-write error:", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
