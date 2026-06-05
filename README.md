# 투챙이 (Toochangi) 투자 분석 에이전트

> 흰챙이 가족의 투자 전략을 분석하고 자산 성장을 도와주는 AI 투자 비서

## 📌 프로젝트 개요

- **역할**: 투자 보고서/기사 분석, 포트폴리오 관리, 3단계 필터 기반 매수/매도 의사결정 지원
- **가챙이와의 관계**: 가챙이(가계부)의 월 저축 데이터를 Google Sheets를 통해 공유받아 투자 여유자금 계산
- **향후 확장**: 자동매매 모듈 연동 예정

## 🏗️ 아키텍처

```
toochangi-Agent (이 레포)
├── index.html          ← 투자 대시보드 UI
├── js/
│   ├── config.js       ← API 키 & 시트 ID 설정
│   ├── auth.js         ← Google OAuth 인증 (가챙이와 동일 방식)
│   ├── sheets.js       ← Google Sheets 연동
│   ├── toochangi.js    ← 핵심 투자 분석 로직
│   └── main.js         ← 앱 진입점
├── style.css           ← 투챙이 전용 스타일
└── docs/
    └── design.md       ← 설계 문서
```

## 🔗 연동 데이터

| 소스 | 용도 |
|---|---|
| 가챙이 Google Sheets | 월 저축액 → 투자 여유자금 계산 |
| 투챙이 전용 Sheets | 투자 기록, 포트폴리오 현황 |
| Google Drive | 투자 보고서/기사 파일 수집 폴더 |

## 🚀 실행 방법

```bash
npm install
npm start
# → http://localhost:3000
```

## ⚙️ 설정

`js/config.js`에서 Google Cloud Console 값 입력:
- `CLIENT_ID`: Google OAuth 클라이언트 ID
- `API_KEY`: Google Sheets API 키
- `GEMINI_API_KEY`: Gemini AI API 키
- `TOOCHANGI_SHEET_ID`: 투챙이 전용 스프레드시트 ID
- `GACHANGI_SHEET_ID`: 가챙이 가계부 시트 ID (읽기 전용)
