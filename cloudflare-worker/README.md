# 투챙이 KIS 중계 프록시 (Cloudflare Worker)

GitHub Pages(정적 호스팅)에서는 백엔드가 없고, 한국투자증권(KIS) OpenAPI는
브라우저 직접 호출을 **CORS로 차단**합니다. 그래서 KIS 연동(잔고/주문/시장데이터)에는
아주 작은 중계 프록시가 필요합니다. 이 Worker가 그 역할을 합니다.

- **무료**: Cloudflare Workers 무료 플랜(하루 10만 요청)으로 충분, 신용카드 불필요
- **안전**: appkey/appsecret은 *회원님 소유*의 Worker를 거쳐 KIS로만 전달 (제3자 노출 없음)

## 배포 방법 (약 5분)

1. https://dash.cloudflare.com 에 가입/로그인
2. 좌측 **Workers & Pages** → **Create application** → **Create Worker**
3. 이름 입력(예: `toochangi-kis`) → **Deploy**
4. 배포 후 **Edit code** → 편집기 내용 전체 삭제 → `kis-proxy.js` 파일 내용 전체 붙여넣기 → **Deploy**
5. 상단에 표시된 주소 복사 (예: `https://toochangi-kis.<계정>.workers.dev`)
6. 투챙이 앱 → **환경설정(KIS 연동)** → **KIS 프록시 URL** 칸에 그 주소 붙여넣기 → 저장

이후 앱이 KIS 호출을 이 Worker로 보냅니다. URL을 비워두면 KIS 연동만 꺼지고
(자동 추천은 Gemini 실시간 검색으로 정상 동작) 나머지 앱 기능엔 영향이 없습니다.

## 주의

- **모의투자(Mock)**: 토큰/잔고/주문은 지원되지만 **거래량 순위·지수 조회는 KIS가 모의환경에서 미지원**일 수 있습니다(이 경우 자동 추천은 Gemini 검색으로 대체).
- 계좌번호는 지점코드 포함 **숫자 10자리**(예: `5002345601`).
- KIS TR_ID는 실전/모의가 다릅니다(코드에 이미 분기되어 있음).
