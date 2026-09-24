const { admin } = require("./_config");

// Called only by the server after a new booking has been saved.
async function sendAdminRegistration(adminToken, payload) {
  if (!adminToken) return { sent: false, skipped: "no-admin-token" };
    const department = payload.department || "";
    const reporterName = payload.reporterName || "";
    const title = payload.title || "";

    const APP_URL = process.env.ALLOWED_ORIGIN || "https://mafraincomeenergy.netlify.app";
    const notifTitle = "국장실 보고대기 - 신규 등록";
    const titleSuffix = title ? ` (${title})` : "";
    let notifBody;
    if (reporterName) {
      notifBody = `${department ? department + " " : ""}${reporterName}님이 신규 등록했습니다.${titleSuffix}`;
    } else if (department) {
      notifBody = `${department}에서 신규 등록이 접수되었습니다.${titleSuffix}`;
    } else {
      notifBody = "신규 등록이 접수되었습니다.";
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
      data: { title: notifTitle, body: notifBody, type: "new-registration" },
    });

  return { sent: true };
}
module.exports = { sendAdminRegistration };
