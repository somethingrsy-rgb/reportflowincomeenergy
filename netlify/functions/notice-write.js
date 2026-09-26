const { admin, json, STATE_PATH } = require('./_config');
const { verifyToken } = require('./admin-write');
exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'POST only' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: '잘못된 요청입니다.' }); }
  if (!verifyToken(body?.token)) return json(401, { ok: false, error: '관리자 인증이 만료되었습니다. PIN을 다시 입력해 주세요.' });
  const notice = body.notice;
  if (!notice || typeof notice.text !== 'string' || notice.text.length > 500 || typeof notice.enabled !== 'boolean') {
    return json(400, { ok: false, error: '공지는 500자 이내로 입력해 주세요.' });
  }
  const text = notice.text.trim();
  const value = { text, enabled: notice.enabled && text.length > 0 };
  try {
    const result = await admin.database().ref(STATE_PATH).transaction(current => ({
      ...(current || {}), notice: value,
      updatedAt: String(Math.max(Date.now(), Number(current?.updatedAt || 0) + 1))
    }));
    return json(200, { ok: true, notice: value, updatedAt: result.snapshot.val().updatedAt });
  } catch (error) {
    console.error('notice-write error:', error);
    return json(500, { ok: false, error: '공지 저장에 실패했습니다.' });
  }
};
