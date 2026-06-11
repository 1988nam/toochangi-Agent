# Cloudflare Pages + Functions 통합 배포 (FE + BE 한 도메인)

이 폴더(`toochangi-AgentvC`)는 **FE(정적) + BE(KIS 중계)를 Cloudflare 한 곳**에 올리기 위한 버전입니다.

- **FE**: 정적 파일(index.html, js/, style.css) → Cloudflare **Pages**
- **BE**: `functions/api/broker/[[path]].js` → Cloudflare **Pages Functions** (`/api/broker/*`)
- FE와 BE가 **같은 도메인** → CORS 불필요, 환경설정의 'KIS 프록시 URL' 칸은 **비워두면** 자동으로 `/api/broker` 사용

기존 `cloudflare-worker/`(별도 Worker)는 더 이상 필요 없습니다(참고용으로만 남겨둠).

## 사전 준비

1. Cloudflare 계정
2. **API 토큰** — 권한: `Account > Cloudflare Pages > Edit`
   - 발급: https://dash.cloudflare.com/profile/api-tokens → Create Token
3. 토큰을 환경변수로 등록 (PowerShell, 현재 창에 즉시 반영):
   ```powershell
   $env:CLOUDFLARE_API_TOKEN = "토큰값"
   # 계정이 여러 개면 계정 ID도:
   $env:CLOUDFLARE_ACCOUNT_ID = "계정ID"   # dash 우측 또는 `npx wrangler whoami`
   ```
   > `setx` 로 등록했다면 **새 터미널**을 열어야 반영됩니다.

## 배포

```powershell
cd C:\Users\1988n\toochangi-AgentvC

# (최초 1회) Pages 프로젝트 생성
npx wrangler pages project create toochangi-vc --production-branch main

# 배포 (이후 반복) — 현재 폴더를 정적 자산으로, functions/ 는 자동으로 Functions로
npx wrangler pages deploy . --project-name toochangi-vc
```

배포가 끝나면 `https://toochangi-vc.pages.dev` (또는 출력된 주소)가 나옵니다.

## 배포 후 확인

1. 그 주소 접속 → 구글 로그인 → 환경설정에서 키 입력(localStorage 저장; 정적이라 키는 빌드에 안 들어감)
2. 모의투자 탭 → 잔고 조회 → 콘솔에 `/api/broker/balance` 호출이 **같은 도메인**으로 나가는지 확인
3. KIS 프록시 URL 칸은 **비워둔 상태**가 정상

## 참고

- `.assetsignore` 가 node_modules·server.js·docs·cloudflare-worker 등을 정적 업로드에서 제외합니다.
- `functions/` 는 Pages가 자동으로 서버리스 함수로 빌드합니다(정적 자산 아님).
- `compatibility_date` 는 `wrangler.toml` 에서 관리합니다.
