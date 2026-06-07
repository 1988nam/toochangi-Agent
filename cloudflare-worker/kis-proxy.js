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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
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
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '').split('/').pop(); // 마지막 경로 세그먼트

    let b;
    try { b = await request.json(); } catch (_) { return json({ error: 'invalid json body' }, 400); }

    const host = b.isMock ? KIS.mock : KIS.real;

    try {
      switch (path) {
        case 'token': return await issueToken(host, b);
        case 'balance': return await inquireBalance(host, b);
        case 'order': return await placeOrder(host, b);
        case 'market-rank': return await volumeRank(host, b);
        case 'market-index': return await marketIndex(host, b);
        default: return json({ error: 'unknown endpoint: ' + path }, 404);
      }
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 502);
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
