국장실 보고대기 앱 - Netlify Function + FCM 최종본

기준 주소:
https://reportflowincomeenergy-git.netlify.app/

중요:
Netlify Function은 단순 Drag & Drop 배포만으로는 정상 동작하지 않을 수 있습니다.
Netlify CLI 배포 또는 GitHub 연결 배포를 권장합니다.

필수 Netlify 환경변수:
1) FIREBASE_DATABASE_URL
   값: Firebase 콘솔 > 실시간 데이터베이스 > 데이터베이스 URL 확인
   (예: https://<프로젝트ID>-default-rtdb.asia-southeast1.firebasedatabase.app)

2) FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
   Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성 후
   다운로드한 JSON 파일에서 각 항목을 복사해 환경변수에 입력하세요.

3) ADMIN_PIN
   관리자 인증에 사용할 PIN을 Netlify 환경변수에 직접 설정하세요.
   ※ 보안상 이 문서를 포함한 어느 파일에도 PIN 값을 기록하지 마세요.

4) ADMIN_PIN_SECRET (선택)
   토큰 서명용 비밀값. 설정하지 않으면 ADMIN_PIN이 대신 사용됩니다.
   별도의 긴 랜덤 문자열(예: openssl rand -hex 32 결과)을 권장합니다.

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
- "관리자 도구 켜기" / "국장님 화면" 버튼은 PIN 입력 후 켜집니다.
- 한 번 맞게 입력하면 그 기기에서는 12시간 동안 다시 묻지 않습니다.
- PIN을 바꾸고 싶으면 Netlify 환경변수 ADMIN_PIN 값을 수정하세요.
  ※ PIN 값은 코드나 문서에 절대 기록하지 마세요.

멀티국 확장 구조 (2026-09-23 반영)
- 기존 소득에너지정책관실은 현재 주소와 기존 Firebase 경로(/directorQueue/v1/...)를 그대로 사용합니다.
- 신규 국은 /b/{bureauId} 주소를 사용하며, 데이터는 /directorQueues/{bureauId}/v1/... 아래에 독립 저장됩니다.
- 기존 국의 ADMIN_PIN / ADMIN_PIN_SECRET 환경변수는 그대로 유지됩니다.
- 신규 국의 관리자 PIN은 Netlify 환경변수 BUREAU_ADMIN_CONFIG_JSON에 JSON으로 추가합니다.
  예: {"rural-policy":{"pin":"<PIN>","secret":"<긴 비밀값>"}}
- 신규 국을 개설할 때 bureau-config.js의 configs 객체에 국 ID, 표시명, 빠른 업무분야 목록을 추가합니다.
- 관리자/대리수신자/예약자 FCM 토큰과 통계 데이터는 국별 state/history 경로에 분리됩니다.
- 신규 국 URL 예: /b/rural-policy
- 신규 국 통계 URL 예: /b/rural-policy/stats

주의:
- 현재 소득에너지정책관실의 주소, DB 경로, ADMIN_PIN 방식은 하위호환을 위해 변경하지 않았습니다.
- 신규 국을 iPhone 홈 화면 웹앱(PWA)으로 독립 설치할 경우에는 해당 국 전용 start_url을 가진 manifest를 함께 추가하는 것을 권장합니다.


[2026-09-23 관리자 화면/Android 알림 안정화]
- 관리자 패널 순서: 현재 팀 보고 완료 → 예약 없이 입장한 팀 등록 → 국장님 부재중 설정 → 관리자 알림 수신기기 등록
- 관리자 패널의 중복 기능(다음 순번 호출, 테스트용 대기열 자동 생성, 대리 수신자 등록 버튼) 제거
- 최근 완료된 누적 보고 목록은 그대로 유지
- 보고완료 확인 팝업 제거: 완료 즉시 다음 대기자 자동 호출
- Android 백그라운드 알림은 webpush.notification 자동 표시 우선, data-only는 서비스워커 fallback
- Android 포그라운드 알림은 Service Worker showNotification 사용
- Android badge 전용 투명 아이콘(notification-badge.png) 적용
- FCM/Service Worker 연결을 online/focus/pageshow/visibility 및 5분 주기로 재확인

[2026-09-23 최종 UI/알림 반영사항]
- 최초 상황판 디자인/배치 유지: "현재 국장실 보고 진행팀", "대기실 비어 있음", "국장실 비어 있음" 및 기존 안내문 유지
- 관리자 주요 기능 순서: 현재 팀 보고 완료 → 예약 없이 입장한 팀 등록 → 국장님 부재중 설정 → 관리자 알림 수신기기 등록
- 중복 기능 제거: 관리자 패널의 별도 다음 순번 호출, 테스트용 대기열 자동 생성, 대리 수신자 등록 버튼 제거
- 현재 팀 보고 완료: 확인 팝업 없이 즉시 완료 처리 후 다음 대기자가 있으면 자동 호출 및 푸시 발송
- 최근 완료된 누적 보고 목록 유지
- 버튼 아래 불필요한 설명 문구 제거(상태 표시 문구는 유지)
- Android 알림 안정화 유지: foreground Service Worker 표시, background FCM 표시, high priority, 주기적 FCM 상태 재확인
- Android 알림 badge 전용 투명 아이콘 icons/notification-badge.png 사용

[2026-09-24 변경]
- '앞에 1팀 남았습니다' 알림을 브라우저 화면 의존 방식에서 Netlify Function + FCM 서버 푸시 방식으로 변경했습니다.
- 현재 보고팀 호출과 동시에 다음 WAITING 팀 1곳에 사전 알림을 전송합니다.
- 동일 보고회차에 대한 중복 사전알림 방지 필드를 추가했습니다.
- 기존 클라이언트 '순번 임박 예보' 알림은 중복 방지를 위해 비활성화했습니다.
