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
  GEMINI_MODEL: 'gemini-2.0-flash',

  // ── OAuth 스코프 ──────────────────────────────────────────────
  SCOPES: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly',
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
};
