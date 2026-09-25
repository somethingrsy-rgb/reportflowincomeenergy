const { admin } = require('./_config');
const crypto = require('crypto');

// 별도 발송 기록을 사용해 동시 요청과 상태 덮어쓰기에서도 중복을 막는다.
async function sendOnce(eventId, message) {
  const key = crypto.createHash('sha256').update(eventId).digest('hex');
  const delivery = admin.database().ref('/directorQueue/v1/notificationDeliveries/' + key);
  const claimId = crypto.randomUUID();
  const claim = await delivery.transaction(value => {
    if (value?.sent || (value?.claimedAt && Date.now() - value.claimedAt < 60000)) return;
    return { claimId, claimedAt: Date.now() };
  });
  if (!claim.committed) return false;
  let accepted = false;
  try {
    message.data = { ...message.data, eventId };
    message.webpush = { ...message.webpush, notification: {
      ...message.webpush?.notification, tag: 'director-queue-' + eventId, renotify: false
    }};
    await admin.messaging().send(message);
    accepted = true;
    await delivery.set({ sent: true, sentAt: Date.now() });
    return true;
  } catch (error) {
    if (!accepted) await delivery.transaction(value => value?.claimId === claimId ? null : undefined);
    throw error;
  }
}
module.exports = { sendOnce };
