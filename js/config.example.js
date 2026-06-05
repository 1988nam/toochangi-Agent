/**
 * 투챙이 대시보드 - Google API 설정
 * 아래 항목을 본인의 Google Cloud Console 값으로 채워주세요.
 */
const TOOCHANGI_CONFIG = {
  // ── Google OAuth ──────────────────────────────────────────────
  CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  API_KEY: 'YOUR_GOOGLE_API_KEY',

  // ── Google Sheets ─────────────────────────────────────────────
  // 투챙이 전용 스프레드시트 ID (투자 기록, 포트폴리오)
  TOOCHANGI_SHEET_ID: 'YOUR_TOOCHANGI_SPREADSHEET_ID',
  // 가챙이 가계부 시트 ID (월 저축액 읽기 전용)
  GACHANGI_SHEET_ID: '1RahTa8uculzZR_nv9lmKnSOYJiqBQ6eco2NYaUh18qo',

  // ── Google Drive ──────────────────────────────────────────────
  // 투자 보고서/기사 업로드 폴더 ID
  SOURCE_FOLDER_ID: 'YOUR_SOURCE_FOLDER_ID',
  // 분석 완료 후 보관 폴더 ID
  ARCHIVE_FOLDER_ID: 'YOUR_ARCHIVE_FOLDER_ID',

  // ── Gemini AI ─────────────────────────────────────────────────
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY',
  GEMINI_MODEL: 'gemini-3.5-flash',

  // ── OAuth 스코프 ──────────────────────────────────────────────
  SCOPES: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ].join(' '),

  // ── 시트 탭 이름 ──────────────────────────────────────────────
  SHEET_NAMES: {
    PORTFOLIO: '포트폴리오',
    TRADE_LOG: '매매일지',
    ANALYSIS: '분석기록',
  },

  // ── 투자 전략 설정 (흰챙이 커스텀) ───────────────────────────
  STRATEGY: {
    // 3단계 필터 기준
    FILTER_1_MARKET_TREND: true,   // 시장 흐름 필터
    FILTER_2_SECTOR_TREND: true,   // 섹터 흐름 필터
    FILTER_3_INDIVIDUAL: true,     // 개별 종목 필터
    // 투자 비중 가이드
    SAFE_ASSET_RATIO: 0.3,         // 안전자산 30%
    RISK_ASSET_RATIO: 0.7,         // 위험자산 70%
  },

  // ── 투챙이 커스텀 운용 시스템 V3 Context ──────────────────────
  STRATEGY_CONTEXT: `[가족 프로필 및 미션]
- 정현(흰챙이): 7년 내 상급지 이동 시드 구축 및 고소득 세액 방어 (IRP 연 600만 유지, 나머지 가용 재원 ISA 집중)
- 혜영(깜챙이): 2026년 출산 대비 유동성 확보 및 비과세 혜택 (ISA 비과세 활용, 6개월 생활비 현금 상시 유지)
- 아챙이(2026 예정): S&P500 적립식 매수 (증여세 면제 한도 2천만 원 내 초장기 복리엔진)
- 양가 어머니: 인컴 전략 및 수급권 방어 (서울 2억/고창 3억 이하 유지 및 원금 방어 배당주)

[운용 원칙 및 3단계 필터]
- 1단계(전략 부합성): 은퇴(IRP)보다 주택 교체(ISA) 우선. 7년 내 인출 자금은 IRP 추가 납입 금지. 지수형 ETF 중심 복리 투자.
- 2단계(부채 허들): 대출 금리(3.67%)보다 변동성이 크거나 기대수익률이 낮으면 대출 상환 우선.
- 3단계(생애 주기): 합산 소득 2억 원 금융소득종합과세 방어(ISA 활용). 2026년 출산 시 일부 ISA를 파킹형 안전자산으로 전환.

[가계부 매핑 지침]
- 가용 재원 = 수입 총액 - 고정 지출(대출 원리금 240만 포함) - 변동 지출
- 'ISA/투자' 및 '정현/혜영' 이름 태그 자산은 '7년 뒤 상급지 주택 자금' 분류.
- IRP 연 600만 원 한도는 환급금 데이터와 연동 관리.`,

  // ── 유튜브 구독 채널 기본값 ──────────────────────────────────
  DEFAULT_YOUTUBE_CHANNELS: [
    { name: '삼프로TV', id: 'UChlv4GSd7OQl3js-jkLOnFA' },
    { name: '슈카월드', id: 'UCsJ6RuM2iZXBX5PQ8Zkxo4g' },
    { name: '박곰희TV', id: 'UCB78Qo1t-p46KzO_V5f7y4w' }
  ],
};
