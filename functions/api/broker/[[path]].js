/**
 * Cloudflare Pages Function — /api/broker/*  (KIS 중계)
 * ------------------------------------------------------------------
 * FE(같은 Pages 도메인)에서 동일 출처로 호출 → CORS 불필요, 별도 프록시 URL 불필요.
 * 기존 cloudflare-worker/kis-proxy.js 로직을 Pages Functions로 이관한 것.
 *
 * 라우팅: 파일명 [[path]] → /api/broker/<seg...> 전체 매칭. 마지막 세그먼트로 분기.
 *   /api/broker/token, /balance, /order, /market-rank, /market-index, /price, /reserved-orders
 */

const KIS = {
  real: 'https://openapi.koreainvestment.com:9443',
  mock: 'https://openapivts.koreainvestment.com:29443',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
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

export async function onRequestPost(context) {
  const seg = context.params.path; // ['token'] 형태
  const path = Array.isArray(seg) ? seg[seg.length - 1] : seg;

  let b;
  try { b = await context.request.json(); } catch (_) { return json({ error: 'invalid json body' }, 400); }

  const host = b.isMock ? KIS.mock : KIS.real;

  try {
    switch (path) {
      case 'token': return await issueToken(host, b);
      case 'balance': return await inquireBalance(host, b);
      case 'order': return await placeOrder(host, b);
      case 'market-rank': return await volumeRank(host, b);
      case 'market-index': return await marketIndex(host, b);
      case 'price': return await inquirePrice(host, b);
      case 'reserved-orders': return await reservedOrders(host, b);
      default: return json({ error: 'unknown endpoint: ' + path }, 404);
    }
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 502);
  }
}

// 동일 출처라 CORS preflight는 발생하지 않지만, 혹시 모를 OPTIONS에 204 응답
export function onRequestOptions() {
  return new Response(null, { status: 204 });
}

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
    CANO: b.cano, ACNT_PRDT_CD: b.acntPrdtCd,
    AFHR_FLPR_YN: 'N', OFL_YN: '', INQR_DVSN: '02', UNPR_DVSN: '01',
    FUND_STTL_ICLD_YN: 'N', FNCG_AMT_AUTO_RDPT_YN: 'N', PRCS_DVSN: '01',
    CTX_AREA_FK100: '', CTX_AREA_NK100: '',
  });
  const r = await fetch(host + '/uapi/domestic-stock/v1/trading/inquire-balance?' + qs.toString(), {
    method: 'GET', headers: kisHeaders(b, tr),
  });
  return json(await r.json(), r.status);
}

// ── 현금 주문(매수/매도) ───────────────────────────────────────────
async function placeOrder(host, b) {
  const buy = !!b.isBuy;
  const tr = b.isMock ? (buy ? 'VTTC0802U' : 'VTTC0801U') : (buy ? 'TTTC0802U' : 'TTTC0801U');
  const r = await fetch(host + '/uapi/domestic-stock/v1/trading/order-cash', {
    method: 'POST', headers: kisHeaders(b, tr),
    body: JSON.stringify({
      CANO: b.cano, ACNT_PRDT_CD: b.acntPrdtCd, PDNO: b.pdno,
      ORD_DVSN: b.ordDvsn || '01', ORD_QTY: String(b.ordQty), ORD_UNPR: String(b.ordUnpr || 0),
    }),
  });
  return json(await r.json(), r.status);
}

// ── 거래량 순위 (※ KIS 모의투자는 이 TR 미지원 → 빈 배열로 우회) ────
async function volumeRank(host, b) {
  // 모의 환경은 거래량순위(volume-rank)를 지원하지 않아 KIS가 500을 반환함.
  // 옛 server.js와 동일하게 빈 배열로 응답(클라이언트는 Gemini 검색으로 대체).
  if (b.isMock) return json({ output: [] });
  const qs = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J', FID_COND_SCR_DIV_CODE: '20171', FID_INPUT_ISCD: '0000',
    FID_DIV_CLS_CODE: '0', FID_BLNG_CLS_CODE: '0', FID_TRGT_CLS_CODE: '111111111',
    FID_TRGT_EXLS_CLS_CODE: '000000', FID_INPUT_PRICE_1: '', FID_INPUT_PRICE_2: '',
    FID_VOL_CNT: '', FID_INPUT_DATE_1: '',
  });
  const r = await fetch(host + '/uapi/domestic-stock/v1/quotations/volume-rank?' + qs.toString(), {
    method: 'GET', headers: kisHeaders(b, 'FHPST01710000'),
  });
  return json(await r.json(), r.status);
}

// ── 종목 현재가 시세 (관심 주식용) ─────────────────────────────────
async function inquirePrice(host, b) {
  const qs = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: String(b.ticker || '') });
  const r = await fetch(host + '/uapi/domestic-stock/v1/quotations/inquire-price?' + qs.toString(), {
    method: 'GET', headers: kisHeaders(b, 'FHKST01010100'),
  });
  return json(await r.json(), r.status);
}

// ── 예약 주문 조회 (※ 모의투자 미지원 가능) ────────────────────────
async function reservedOrders(host, b) {
  const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const qs = new URLSearchParams({
    CANO: b.cano, ACNT_PRDT_CD: b.acntPrdtCd,
    RSVN_ORD_ORD_DT: ymd(past), RSVN_ORD_END_DT: ymd(today),
    TMNL_MDIA_KIND_CD: '00', CTX_AREA_FK200: '', CTX_AREA_NK200: '',
  });
  const r = await fetch(host + '/uapi/domestic-stock/v1/trading/order-resv-ccnl?' + qs.toString(), {
    method: 'GET', headers: kisHeaders(b, 'CTSC0004R'),
  });
  return json(await r.json(), r.status);
}

// ── 코스피/코스닥 지수 → {output:{코스피:{current,rate}, 코스닥:{current,rate}}} ──
async function marketIndex(host, b) {
  const fetchIdx = async (iscd) => {
    const qs = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: 'U', FID_INPUT_ISCD: iscd });
    const r = await fetch(host + '/uapi/domestic-stock/v1/quotations/inquire-index-price?' + qs.toString(), {
      method: 'GET', headers: kisHeaders(b, 'FHPUP02100000'),
    });
    const d = await r.json().catch(() => ({}));
    const o = d.output || {};
    return { current: o.bstp_nmix_prpr || null, rate: o.bstp_nmix_prdy_ctrt || null };
  };
  const [kospi, kosdaq] = await Promise.all([fetchIdx('0001'), fetchIdx('1001')]);
  return json({ output: { 코스피: kospi, 코스닥: kosdaq } });
}
