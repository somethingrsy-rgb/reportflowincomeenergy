// ============================================================
// 공통 설정 모듈 — 모든 Netlify Function이 이 파일을 공유합니다.
// 실제 값은 절대 여기에 적지 말고, Netlify 환경변수에만 설정하세요.
// ============================================================

const admin = require("firebase-admin");

// 운영 도메인 — Netlify 환경변수 ALLOWED_ORIGIN 으로 주입.
// 환경변수가 없으면 빈 문자열로 두어 CORS 허용 없이 동작합니다.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const STATE_PATH = "/directorQueue/v1/state";

function getServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing one of FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars"
    );
  }
  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

// Firebase Admin SDK는 한 번만 초기화합니다.
if (!admin.apps.length) {
  if (!DATABASE_URL) {
    throw new Error("Missing FIREBASE_DATABASE_URL env var");
  }
  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
    databaseURL: DATABASE_URL,
  });
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

module.exports = { admin, json, STATE_PATH, ALLOWED_ORIGIN };
