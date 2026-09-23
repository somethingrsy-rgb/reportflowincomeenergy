importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDrKIGHnhSHRbYj0aPzCUdvk3eZMgoEOW4",
  authDomain: "reportflowincomeenergy.firebaseapp.com",
  databaseURL: "https://reportflowincomeenergy-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "reportflowincomeenergy",
  storageBucket: "reportflowincomeenergy.firebasestorage.app",
  messagingSenderId: "120114688919",
  appId: "1:120114688919:web:08644922957c82b8adcad2"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // 서버가 webpush.notification을 포함하면 Android/브라우저가 백그라운드 알림을
  // 자동 표시합니다. 이 경우 서비스워커에서 다시 표시하면 중복되므로 종료합니다.
  if (payload?.notification?.title || payload?.notification?.body) return;

  // data-only 메시지가 도착한 경우를 위한 안전한 fallback 표시입니다.
  const title = payload?.data?.title || "국장실 보고대기";
  const body = payload?.data?.body || "새 알림이 도착했습니다.";
  const tag = payload?.data?.tag || `director-queue-${payload?.data?.type || 'alert'}-${Date.now()}`;

  return self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/notification-badge.png",
    tag,
    renotify: true,
    requireInteraction: true,
    vibrate: [250, 120, 250],
    silent: false,
    data: { url: payload?.data?.url || "/" }
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification?.data?.url || "./index.html"));
});

const CACHE_NAME = "director-queue-pwa-v4-android-notification";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/notification-badge.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/.netlify/functions/')) return;

  // Firebase Realtime Database, FCM 등록(fcmregistrations.googleapis.com),
  // Firebase Installations 같은 구글 API 호출은 서비스워커가 가로채지 않고
  // 그대로 통과시킨다. 가로채서 fetch(event.request)로 다시 보내면 그 과정에서
  // 인증 관련 정보가 깨져서 FCM 토큰 발급이 401로 실패하는 문제가 있었다.
  if (url.hostname.includes("firebaseio.com") || url.hostname.endsWith("googleapis.com")) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});
