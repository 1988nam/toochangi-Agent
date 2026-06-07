# 나중에 고칠 것 (Fix It Later)

코드 감사에서 발견했으나 이번 라운드에서 미루기로 한 항목들. 처리하면 체크 표시.

## 보류 (사용자 결정으로 미룸)

- [ ] **YouTube ‘채널 추가’ 기능이 깨져 있음** — `js/main.js`의 채널 resolve 핸들러가 없는 백엔드
  `POST /api/youtube-channel-resolve` 를 호출 → GitHub Pages(정적 호스팅)엔 백엔드가 없어 항상 404.
  현재 ‘경제 영상 AI 요약’은 채널 목록을 사용하지 않고 AI가 직접 검색하므로 이 기능은 사실상 무용.
  - 선택지: (a) 채널 추가 UI·코드 제거, (b) 백엔드 호출 대신 채널 ID/핸들을 사용자가 직접 붙여넣어 목록에 추가하도록 변경.

## 데드 코드 (스크린샷 UI 제거의 잔여물)

- [ ] **`Toochangi.parseHoldingScreenshot`** (`js/toochangi.js`) — 드라이브 스크린샷 판독 UI(핸들러·모달)를
  제거하면서 호출처가 사라짐. 함수·export는 남아 있음(무해하나 미사용).
  - 함께 사실상 사용처 없어진 설정: ‘계좌 스크린샷 판독 모델’(`GEMINI_MODEL_VISION`),
    `SOURCE_FOLDER_ID` / `ARCHIVE_FOLDER_ID`.
  - 선택지: 스크린샷 기능을 다시 붙이거나(붙이면 위 함수·설정 재사용), 완전 제거.

## Tier 3 하드닝 (선택, 다음에)

- [ ] **Cloudflare Worker CORS 제한** — `cloudflare-worker/kis-proxy.js`가 `Access-Control-Allow-Origin: *`.
  본인 GitHub Pages 오리진만 허용하도록 좁히기(보안↑). Worker 재배포 필요.
- [ ] **Gemini OAuth→키 폴백 범위 확장** — 현재 401/403만 폴백. 429(레이트리밋)도 키로 폴백 고려.
  (404는 모델 부재이므로 키 폴백해도 동일 실패 → 제외)
- [ ] **모의투자 시장 데이터 단축** — KIS 모의(VTS)는 거래량순위·지수 미지원. `isMock`일 때 Worker에서
  해당 호출을 건너뛰고 빈 결과 반환(현재는 에러 후 null로 떨어짐 → 콘솔 소음).
- [ ] **테이블 렌더러 HTML 이스케이프 일괄 적용** — 포트폴리오·예적금·부동산·매매일지·보유종목 렌더가
  시트/AI 데이터를 innerHTML에 그대로 주입(일부만 이스케이프). 공용 `esc()` 도입해 전체 적용
  (범위 크고 회귀 위험 있어 별도 작업으로).
- [ ] **broker.js 토큰 만료 방어값** — `(expires_in - 7200)`은 KIS 24h 토큰엔 문제없지만, 짧은 토큰 가정 시
  음수 가능. `Math.max(...)` 클램프로 방어(현재 실사용엔 영향 없음).
