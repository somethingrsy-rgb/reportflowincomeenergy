국장실 보고대기 앱 - Netlify Function + FCM 최종본

기준 주소:
https://mafraincomeenergy.netlify.app/

중요:
Netlify Function은 단순 Drag & Drop 배포만으로는 정상 동작하지 않을 수 있습니다.
Netlify CLI 배포 또는 GitHub 연결 배포를 권장합니다.

필수 Netlify 환경변수:
1) FIREBASE_DATABASE_URL
https://reportflowincomeenergy-default-rtdb.asia-southeast1.firebasedatabase.app

2) FIREBASE_PROJECT_ID
Firebase 콘솔 > 프로젝트 설정 > 일반에서 확인

3) FIREBASE_CLIENT_EMAIL
Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성 후 client_email 값

4) FIREBASE_PRIVATE_KEY
Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성 후 private_key 값
(줄바꿈은 \n 그대로 붙여넣기)

5) ADMIN_PIN
관리자 PIN 번호 (숫자 4~6자리 권장)

6) ADMIN_PIN_SECRET
PIN 토큰 서명용 비밀키 (랜덤 문자열 32자 이상 권장, 없으면 ADMIN_PIN이 대신 사용됨)

배포 후 테스트:
https://mafraincomeenergy.netlify.app/.netlify/functions/send-next-notification
은 POST 전용입니다. 앱에서 보고완료를 누를 때 자동 호출됩니다.

보안 안내:
- notify-deputy, send-next-notification 함수는 관리자 토큰 검증 후 실행됩니다.
- Firebase DB 규칙은 ".read": "auth != null", ".write": "auth != null" 이상으로 설정하세요.
- ADMIN_PIN은 코드 어디에도 노출되지 않으며 Netlify 환경변수에만 저장됩니다.
