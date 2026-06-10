/**
 * 투챙이 KIS 중계 프록시 (Cloudflare Worker)
 * ------------------------------------------------------------------
 * 목적: 브라우저(GitHub Pages) ↔ 한국투자증권(KIS) OpenAPI 사이의
 *       CORS 차단을 우회하고, KIS 호출(토큰/잔고/주문/시장데이터)을 대행한다.
 *
 * 보안: appkey/appsecret은 "회원님 소유"의 이 Worker를 거쳐 KIS로만 전달된다.
 *       (제3자 공개 프록시가 아님 → 키가 외부에 노출되지 않음)
 *
 * 배포(요약):
 *   1) https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2) 이 파일 전체를 편집기에 붙여넣고 Deploy
 *   3) 배포된 주소(예: https://toochangi-kis.<계정>.workers.dev)를
 *      앱 환경설정의 'KIS 프록시 URL'에 입력
 *
 * 무료 플랜(하루 10만 요청)으로 개인 사용엔 충분하다.
 */

const KIS = {
  real: 'https://openapi.koreainvestment.com:9443',
  mock: 'https://openapivts.koreainvestment.com:29443',
};

// 허용 출처(Origin) 화이트리스트. 브라우저가 보내는 Origin 헤더가 이 목록에 있을 때만
// CORS를 허용한다(과거엔 '*'로 모든 출처 허용 → 오픈 릴레이). 배포 환경변수
// ALLOWED_ORIGINS(쉼표 구분)로 추가/덮어쓸 수 있다.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://1988nam.github.io',   // GitHub Pages (실제 앱 호스트)
  'http://localhost:3000',       // 로컬 개발(server.js)
  'http://127.0.0.1:3000',
  'http://localhost:8080',
];

function allowedOrigins(env) {
  const raw = env && env.ALLOWED_ORIGINS ? String(env.ALLOWED_ORIGINS) : '';
  const extra = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

// 요청 Origin이 화이트리스트에 있을 때만 Access-Control-Allow-Origin을 반영한다.
function corsHeaders(origin, env) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origin && allowedOrigins(env).has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

function kisHeaders(b, tr) {
  return {
    'content-type': 'application/json; charset=utf-8',
    authorization: 'Bearer ' + b.token,
    appkey: b.appkey,
    appsecret: b.appsecret,
    tr_id: tr,
    custtype: 'P',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    // CORS preflight — 허용되지 않은 출처는 ACAO 헤더가 없어 브라우저가 차단한다.
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    // 선택적 공유 토큰 인증: 배포 환경변수 PROXY_TOKEN이 설정된 경우에만 동작한다.
    // 설정 시 앱은 X-Proxy-Token 헤더(localStorage: toochangi_kis_proxy_token)를 함께 보내야 한다.
    // (미설정 시 기존 배포와 100% 호환 — 통과)
    if (env && env.PROXY_TOKEN) {
      if (request.headers.get('X-Proxy-Token') !== env.PROXY_TOKEN) {
        return json({ error: 'unauthorized' }, 401, cors);
      }
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '').split('/').pop(); // 마지막 경로 세그먼트

    let b;
    try { b = await request.json(); } catch (_) { return json({ error: 'invalid json body' }, 400, cors); }

    const host = b.isMock ? KIS.mock : KIS.real;

    try {
      let resp;
      switch (path) {
        case 'token': resp = await issueToken(host, b); break;
        case 'balance': resp = await inquireBalance(host, b); break;
        case 'order': resp = await placeOrder(host, b); break;
        case 'market-rank': resp = await volumeRank(host, b); break;
        case 'market-index': resp = await marketIndex(host, b); break;
        case 'price': resp = await inquirePrice(host, b); break;
        case 'reserved-orders': resp = await reservedOrders(host, b); break;
        default: return json({ error: 'unknown endpoint: ' + path }, 404, cors);
      }
      // 핸들러 응답에 CORS 헤더 주입(핸들러는 CORS를 모름).
      const merged = new Headers(resp.headers);
      for (const [k, v] of Object.entries(cors)) merged.set(k, v);
      return new Response(resp.body, { status: resp.status, headers: merged });
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 502, cors);
    }
  },
};

// ── 토큰 발급 ──────────────────────────────────────────────────────
async function issueToken(host, b) {
  const r = await fetch(host + '/oauth2/tokenP', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: b.appkey, appsecret: b.appsecret }),
  });
  return json(await r.json(), r.status);
}

// ── 잔고/보유 종목 조회 ────────────────────────────────────────────
async function inquireBalance(host, b) {
  const tr = b.isMock ? 'VTTC8434R' : 'TTTC8434R';
  const qs = new URLSearchParams({
    CANO: b.cano,
    ACNT_PRDT_CD: b.acntPrdtCd,
    AFHR_FLPR_YN: 'N',
    OFL_YN: '',
    INQR_DVSN: '02',
    UNPR_DVSN: '01',
    FUND_STTL_ICLD_YN: 'N',
    FNCG_AMT_AUTO_RDPT_YN: 'N',
    PRCS_DVSN: '01',
    CTX_AREA_FK100: '',
    CTX_AREA_NK100: '',
  });
  const r = await fetch(host + '/uapi/domestic-stock/v1/trading/inquire-balance?' + qs.toString(), {
    method: 'GET',
    headers: kisHeaders(b, tr),
  });
  return json(await r.json(), r.status);
}

// ── 현금 주문(매수/매도) ───────────────────────────────────────────
async function placeOrder(host, b) {
  const buy = !!b.isBuy;
  const tr = b.isMock ? (buy ? 'VTTC0802U' : 'VTTC0801U') : (buy ? 'TTTC0802U' : 'TTTC0801U');
  const r = await fetch(host + '/uapi/domestic-stock/v1/trading/order-cash', {
    method: 'POST',
    headers: kisHeaders(b, tr),
    body: JSON.stringify({
      CANO: b.cano,
      ACNT_PRDT_CD: b.acntPrdtCd,
      PDNO: b.pdno,
      ORD_DVSN: b.ordDvsn || '01',
      ORD_QTY: String(b.ordQty),
      ORD_UNPR: String(b.ordUnpr || 0),
    }),
  });
  return json(await r.json(), r.status);
}

// ── 거래량 순위 (※ 모의투자 미지원 → 실전에서만 데이터) ─────────────
async function volumeRank(host, b) {
  const qs = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_COND_SCR_DIV_CODE: '20171',
    FID_INPUT_ISCD: '0000',
    FID_DIV_CLS_CODE: '0',
    FID_BLNG_CLS_CODE: '0',
    FID_TRGT_CLS_CODE: '111111111',
    FID_TRGT_EXLS_CLS_CODE: '000000',
    FID_INPUT_PRICE_1: '',
    FID_INPUT_PRICE_2: '',
    FID_VOL_CNT: '',
    FID_INPUT_DATE_1: '',
  });
  const r = await fetch(host + '/uapi/domestic-stock/v1/quotations/volume-rank?' + qs.toString(), {
    method: 'GET',
    headers: kisHeaders(b, 'FHPST01710000'),
  });
  return json(await r.json(), r.status);
}

// ── 종목 현재가 시세 (관심 주식용) ─────────────────────────────
async function inquirePrice(host, b) {
  const qs = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: String(b.ticker || '') });
  const r = await fetch(host + '/uapi/domestic-stock/v1/quotations/inquire-price?' + qs.toString(), {
    method: 'GET',
    headers: kisHeaders(b, 'FHKST01010100'),
  });
  return json(await r.json(), r.status);
}

// ── 예약 주문 조회 (※ 모의투자 미지원일 수 있음) ───────────────
async function reservedOrders(host, b) {
  // 조회 기간: 최근 30일 ~ 오늘 (YYYYMMDD)
  const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const qs = new URLSearchParams({
    CANO: b.cano,
    ACNT_PRDT_CD: b.acntPrdtCd,
    RSVN_ORD_ORD_DT: ymd(past),
    RSVN_ORD_END_DT: ymd(today),
    TMNL_MDIA_KIND_CD: '00',
    CTX_AREA_FK200: '',
    CTX_AREA_NK200: '',
  });
  const r = await fetch(host + '/uapi/domestic-stock/v1/trading/order-resv-ccnl?' + qs.toString(), {
    method: 'GET',
    headers: kisHeaders(b, 'CTSC0004R'),
  });
  return json(await r.json(), r.status);
}

// ── 코스피/코스닥 지수 현재가 → {output:{코스피:{current,rate}, 코스닥:{current,rate}}} ──
async function marketIndex(host, b) {
  const fetchIdx = async (iscd) => {
    const qs = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: 'U', FID_INPUT_ISCD: iscd });
    const r = await fetch(host + '/uapi/domestic-stock/v1/quotations/inquire-index-price?' + qs.toString(), {
      method: 'GET',
      headers: kisHeaders(b, 'FHPUP02100000'),
    });
    const d = await r.json().catch(() => ({}));
    const o = d.output || {};
    return { current: o.bstp_nmix_prpr || null, rate: o.bstp_nmix_prdy_ctrt || null };
  };
  const [kospi, kosdaq] = await Promise.all([fetchIdx('0001'), fetchIdx('1001')]);
  return json({ output: { 코스피: kospi, 코스닥: kosdaq } });
}
