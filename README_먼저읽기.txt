국장실 보고대기 앱 - Netlify Function + FCM 최종본

기준 주소:
https://reportflowincomeenergy.netlify.app/

중요:
Netlify Function은 단순 Drag & Drop 배포만으로는 정상 동작하지 않을 수 있습니다.
Netlify CLI 배포 또는 GitHub 연결 배포를 권장합니다.

필수 Netlify 환경변수:
1) FIREBASE_DATABASE_URL
https://ryuso-af2f2-default-rtdb.firebaseio.com

2) FIREBASE_SERVICE_ACCOUNT_JSON
Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성
다운로드한 JSON 파일 내용을 그대로 붙여넣거나, base64로 변환한 값을 넣으세요.

배포 후 테스트:
https://reportflowincomeenergy.netlify.app/.netlify/functions/send-next-notification
은 POST 전용입니다. 앱에서 보고완료를 누를 때 자동 호출됩니다.

구성 파일:
- index.html: FCM 토큰 발급/저장 포함
- service-worker.js: 백그라운드 FCM 수신 포함
- netlify/functions/send-next-notification.js: 현재 REPORTING 대상자에게 푸시 발송
- netlify.toml: Netlify Functions 경로 설정
- package.json: firebase-admin 의존성
