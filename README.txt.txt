국장실 보고대기 앱 - Netlify Function + FCM 최종본

기준 주소:
https://reportflowincomeenergy-git.netlify.app/

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
https://reportflowincomeenergy-git.netlify.app/.netlify/functions/send-next-notification
은 POST 전용입니다. 앱에서 보고완료를 누를 때 자동 호출됩니다.

구성 파일:
- index.html: FCM 토큰 발급/저장 포함
- service-worker.js: 백그라운드 FCM 수신 포함
- netlify/functions/send-next-notification.js: 현재 REPORTING 대상자에게 푸시 발송
- netlify/functions/notify-deputy.js: 국장님 부재중 전환 시 대리 수신자에게 푸시 발송
- netlify.toml: Netlify Functions 경로 설정
- package.json: firebase-admin 의존성

참고 사항 (이번 버전):
- 실제 Netlify에 연결되어 배포 중인 도메인은 reportflowincomeenergy-git.netlify.app
  입니다. (reportflowincomeenergy.netlify.app 아님) 푸시 알림 클릭 시 이동 링크도
  이 도메인으로 통일했습니다.

신규 기능: 국장님 부재중 관리
- 화면 상단 상태 배너에서 국장님 재실/부재중 상태를 누구나 확인할 수 있습니다.
- "관리자 도구" 또는 "국장님 화면" 모드에서 배너의 버튼(또는 관리자 패널의
  "국장님 부재중 상태 설정" 버튼)을 눌러 부재중으로 전환할 수 있습니다.
  (출장 / 내부회의 / 외부회의 / 휴식 / 기타 중 선택, 메모·예상 복귀시간 선택 입력)
- 부재중인 동안에는 "다음 순번 호출"이 실제로 사람을 부르지 않고 예약 상태로
  대기하며, 복귀 처리를 누르는 순간 대기 중이던 다음 순번이 자동으로 호출되고
  푸시 알림이 발송됩니다. (자동 재전송 예약)
- 부재중으로 전환되는 즉시 등록된 "대리 수신자" 기기로 자동 푸시 알림이
  전송됩니다. 관리자 패널의 "이 기기를 대리 수신자로 등록" 버튼을 대리 수신
  담당자의 기기(예: 비서실 직원 휴대폰)에서 한 번 눌러두면 됩니다. (사전에
  해당 기기에서 "알림 활성화"를 먼저 켜둬야 토큰이 생성됩니다.)
- 모든 부재중 이력(사유/메모/시작·종료 시각)은 관리자 패널의 "부재중 이력"
  섹션에 자동으로 기록되어 나중에 확인할 수 있습니다.
- 별도의 Netlify 환경변수 추가 없이 기존 FIREBASE_DATABASE_URL /
  FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY 만으로
  동작합니다.

접근 제한:
- "관리자 도구 켜기" / "국장님 화면" 버튼은 PIN(1379) 입력 후 켜집니다.
- 한 번 맞게 입력하면 그 기기에서는 다시 묻지 않습니다 (껐다 켜도 유지).
- PIN을 바꾸고 싶으면 index.html 안의 ACCESS_PIN 값을 수정하면 됩니다.
