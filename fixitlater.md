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

## Tier 3 — 추가 발견(낮은 우선순위)

### 일관성 / 리팩터링
- [ ] **그라운딩 출처 추출 중복(3곳)** — `toochangi.js`의 `runEconomyVideoSummary`·`runGeminiAnalysis`·
  `runAutoRecommendation`가 `chunks.map(c => c.web ? {title,url} : null).filter(Boolean)`를 각각 재구현.
  `_extractSources(candidate)` 헬퍼로 통합.
- [ ] **시트 getter 반환형 불일치** — 일부(`getPortfolio`/`getTradeLog`/`getAnalysisHistory`)는 실패 시 throw,
  나머지는 `[]`/`null` 반환. `loadAll`의 `Promise.all`이 throw 시 전체 거부될 수 있음 → catch+`[]`로 표준화.
- [ ] **콤마 제거 파서 불일치** — `getGachangiMonthlySavings`/`getAssetStatus`는 `_num`/`_int` 대신
  인라인 `replace(/,/g,'')` 사용. 공용 `_num`으로 통일.
- [ ] **헤더 리터럴 중복** — 예적금/부동산 헤더 배열이 모듈 const + `_initHeaders` + ensure 로직에 3중 정의.
  공용 const 참조로 단일화.
- [ ] **STRATEGY_CONTEXT 중복** — `index.html` 인라인 기본 config와 localStorage 마이그레이션 스크립트에
  동일 텍스트가 2번. 한 곳에서만 정의하도록.

### 정확성(엣지)
- [ ] **시트 스키마 감지를 행 길이로 추정** — `getSavings`(owner_account 판정)·`getRealEstate`(loan 메타 판정)가
  `r.length` 기반. Sheets가 후행 빈 셀을 잘라 오분류→필드 누락/날짜 손실 가능. 헤더 행 기준 감지로 변경.
- [ ] **거래량순위 등락 부호** — `broker.js`에서 `prdy_vrss_sign === '2'`만 `+`. 하락(코드 4/5)도 양수 %로
  표기됨. 4/5는 `-` 접두. (모의는 데이터 없어 영향 적음)
- [ ] **예수금 필드 OR** — `broker.js` `cash = dnca_tot_amt || prvs_rcvb_amt` — 의미 다른 두 금액을 OR.
  한 필드로 확정하거나 의도 문서화.

### 데드/문서
- [ ] **`getBalanceData`/`_balanceData`(broker.js)** — export됐으나 소비처 없음(추정 데드). 확인 후 제거.
- [ ] **config.example.js에 `KIS_PROXY_URL` 누락** — `broker.js`는 이 키를 폴백 소스로 읽지만 예시엔 없음.
  주석으로 `KIS_PROXY_URL: ''` 추가해 문서화.
- [ ] **colspan 불일치** — 포트폴리오 empty-state `colspan`이 실제 열수(13)와, 부동산이 실제(15)와 어긋남.
  HTML/JS 모두 실제 열수로 정렬.
