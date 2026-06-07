/**
 * 투챙이 - 한국투자증권(KIS) API 연동 프론트엔드 모듈
 * 로컬 스토리지 키 관리, 백엔드 프록시 연동, 주문 및 자동매매 트리거
 */
const Broker = (() => {
  let _balanceData = null;

  // ── 설정 로드 / 저장 ──────────────────────────────────────────
  function getSettings() {
    return {
      appkey: localStorage.getItem('toochangi_kis_appkey') || '',
      secret: localStorage.getItem('toochangi_kis_secret') || '',
      account: localStorage.getItem('toochangi_kis_account') || '',
      isMock: localStorage.getItem('toochangi_kis_mock') === 'true',
      autoTrade: localStorage.getItem('toochangi_kis_autotrade') === 'true',
      autoTradeAmount: parseInt(localStorage.getItem('toochangi_kis_autotrade_amount') || '500000', 10),
      proxyUrl: getProxyBase(),
    };
  }

  // KIS 중계 프록시(Cloudflare Worker 등) 베이스 URL. 미설정 시 빈 문자열.
  // 우선순위: localStorage → config(KIS_PROXY_URL). 끝의 슬래시 제거.
  function getProxyBase() {
    const raw = (localStorage.getItem('toochangi_kis_proxy')
      || (window.TOOCHANGI_CONFIG && window.TOOCHANGI_CONFIG.KIS_PROXY_URL)
      || '').trim();
    return raw.replace(/\/+$/, '');
  }

  // 프록시 엔드포인트 URL 구성. 미설정이면 명확한 오류로 안내.
  function _proxyUrl(path) {
    const base = getProxyBase();
    if (!base) {
      throw new Error('KIS 프록시 URL이 설정되지 않았습니다. 환경설정(KIS 연동)에서 Cloudflare Worker 주소를 입력하세요.');
    }
    return `${base}/${path}`;
  }

  function saveSettings(settings) {
    localStorage.setItem('toochangi_kis_appkey', settings.appkey);
    localStorage.setItem('toochangi_kis_secret', settings.secret);
    localStorage.setItem('toochangi_kis_account', settings.account);
    localStorage.setItem('toochangi_kis_mock', settings.isMock ? 'true' : 'false');
    localStorage.setItem('toochangi_kis_autotrade', settings.autoTrade ? 'true' : 'false');
    localStorage.setItem('toochangi_kis_autotrade_amount', settings.autoTradeAmount.toString());
    if (settings.proxyUrl !== undefined) {
      localStorage.setItem('toochangi_kis_proxy', (settings.proxyUrl || '').trim().replace(/\/+$/, ''));
    }

    // 설정이 변경되면 기존에 발급받은 캐시 토큰 정리
    localStorage.removeItem('toochangi_kis_token');
    localStorage.removeItem('toochangi_kis_token_expiry');
  }

  // ── KIS API 토큰 조회 및 캐싱 ──────────────────────────────────
  async function getAccessToken(settings) {
    const cachedToken = localStorage.getItem('toochangi_kis_token');
    const expiry = localStorage.getItem('toochangi_kis_token_expiry');

    // 토큰 만료 전(유효시간 2시간 여유를 둠)인 경우 캐시 토큰 사용
    if (cachedToken && expiry && parseInt(expiry, 10) > Date.now()) {
      return cachedToken;
    }

    const res = await fetch(_proxyUrl('token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appkey: settings.appkey,
        appsecret: settings.secret,
        isMock: settings.isMock
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error_description || err.error || '토큰 발급 실패');
    }

    const data = await res.json();
    const token = data.access_token;
    
    // 만료 시간 설정 (초 단위 만료 시간에서 2시간을 빼고 로컬 시간에 결합하여 세이브)
    const tokenExpiry = Date.now() + (data.expires_in - 7200) * 1000;

    localStorage.setItem('toochangi_kis_token', token);
    localStorage.setItem('toochangi_kis_token_expiry', tokenExpiry.toString());

    return token;
  }

  // ── 잔고 및 보유 종목 조회 ──────────────────────────────────────
  async function loadBalanceAndHoldings() {
    const settings = getSettings();
    if (!settings.appkey || !settings.secret || !settings.account) {
      throw new Error('증권사 API 설정(AppKey, Secret, 계좌번호)이 누락되었습니다.');
    }

    const token = await getAccessToken(settings);

    // 계좌번호 포맷 가공: 하이픈 제거 후 전반 8자리(CANO)와 후반 2자리(ACNT_PRDT_CD) 추출
    const cleanAccount = settings.account.replace(/[^0-9]/g, '');
    if (cleanAccount.length < 10) {
      throw new Error('계좌번호는 지점코드를 포함하여 총 10자리여야 합니다.');
    }
    const cano = cleanAccount.substring(0, 8);
    const acntPrdtCd = cleanAccount.substring(8, 10);

    const res = await fetch(_proxyUrl('balance'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appkey: settings.appkey,
        appsecret: settings.secret,
        token,
        cano,
        acntPrdtCd,
        isMock: settings.isMock
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.msg1 || '잔고 조회 실패');
    }

    const data = await res.json();
    
    // API 출력 데이터 해석
    const output1 = data.output1 || []; // 보유 주식 목록
    const output2 = data.output2 || [{}]; // 잔고 합계 요약

    const holdings = output1.map(h => ({
      name: h.prdt_name,
      ticker: h.pdno,
      qty: parseInt(h.hldg_qty, 10) || 0,
      avgPrice: parseFloat(h.pchs_avg_pric) || 0,
      curPrice: parseFloat(h.prpr) || 0,
      value: parseFloat(h.evlu_amt) || 0,
      pnl: parseFloat(h.evlu_pl_amt) || 0,
      yield: parseFloat(h.evlu_erng_rt) || 0,
    })).filter(h => h.qty > 0);

    const summary = output2[0] || {};
    
    _balanceData = {
      cash: parseFloat(summary.dnca_tot_amt || summary.prvs_rcvb_amt || 0), // 예수금
      evalAmt: parseFloat(summary.tot_evlu_amt || 0), // 총 평가금액
      pnl: parseFloat(summary.evlu_pl_amt_tot || 0), // 총 평가손익
      yield: parseFloat(summary.evlu_erng_rt_tot || 0), // 총 수익률
      holdings
    };

    return _balanceData;
  }

  // ── 주문 실행 ──────────────────────────────────────────────────
  async function placeOrder(params) {
    const settings = getSettings();
    if (!settings.appkey || !settings.secret || !settings.account) {
      throw new Error('증권사 API 설정이 누락되었습니다.');
    }

    const token = await getAccessToken(settings);

    const cleanAccount = settings.account.replace(/[^0-9]/g, '');
    const cano = cleanAccount.substring(0, 8);
    const acntPrdtCd = cleanAccount.substring(8, 10);

    const res = await fetch(_proxyUrl('order'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appkey: settings.appkey,
        appsecret: settings.secret,
        token,
        cano,
        acntPrdtCd,
        pdno: params.pdno,
        ordQty: params.qty,
        ordUnpr: params.price || 0,
        ordDvsn: params.ordDvsn || '01', // '00' 지정가, '01' 시장가
        isBuy: params.isBuy,
        isMock: settings.isMock
      })
    });

    const data = await res.json();
    if (!res.ok || data.rt_cd !== '0') {
      throw new Error(data.msg1 || '주문 요청 실패');
    }

    return {
      orderNo: data.output?.ODNO,
      msg: data.msg1,
      raw: data
    };
  }

  // ── 자동매매 신호 연동 및 감지 ──────────────────────────────────
  // ── 자동매매 신호 연동 및 감지 ──────────────────────────────────
  async function checkAndTriggerAutoTrade(verdictResult) {
    const settings = getSettings();
    if (!settings.autoTrade) return;

    if (verdictResult.verdict !== '매수') {
      console.log('[AutoTrade] 3단계 신호가 매수 신호가 아니므로 자동 주문을 생략합니다.');
      return;
    }

    let ticker = verdictResult.ticker ? verdictResult.ticker.trim() : '';
    let name = verdictResult.name ? verdictResult.name.trim() : '';

    // 종목 정보가 누락된 경우 예외적으로 prompt 사용
    if (!ticker || ticker.length !== 6) {
      ticker = prompt('🔮 [3단계 매수 신호 감지] 한국투자증권 자동 매수 주문을 발송할 주식 종목코드 6자리를 입력해주세요 (예: 005930).\n\n입력하지 않거나 취소하면 자동매매가 진행되지 않습니다.');
      if (!ticker || ticker.trim().length !== 6) {
        alert('올바른 종목코드가 입력되지 않아 주문이 취소되었습니다.');
        return;
      }
      ticker = ticker.trim();
    }

    // 포트폴리오에서 현재가 가져와 자동 수량 계산 시도
    let defaultQty = 10;
    try {
      const portfolio = typeof Toochangi !== 'undefined' ? Toochangi.getPortfolio() : [];
      const stock = portfolio.find(p => p.ticker === ticker);
      const curPrice = stock ? stock.curPrice : 0;
      if (curPrice > 0) {
        defaultQty = Math.floor(settings.autoTradeAmount / curPrice) || 1;
      }
    } catch (err) {
      console.warn('포트폴리오 단가 분석 실패:', err);
    }

    // 커스텀 최종 승인 모달 호출
    const orderConfirm = await window.showKisOrderConfirmModal({
      ticker,
      name,
      qty: defaultQty,
      price: '시장가 (Market)',
      isBuy: true
    });

    if (!orderConfirm.confirmed) {
      alert('자동 주문 전송이 취소되었습니다.');
      return;
    }

    const qty = orderConfirm.qty;

    try {
      const orderResult = await placeOrder({
        pdno: ticker,
        qty: qty,
        price: 0,
        ordDvsn: '01', // 시장가 매수
        isBuy: true
      });

      alert(`✅ KIS 자동 매수 주문 발송 완료!\n주문번호: ${orderResult.orderNo}\n결과메시지: ${orderResult.msg}`);
    } catch (e) {
      console.error(e);
      alert(`❌ KIS 자동 주문 실패: ${e.message}`);
    }
  }

  // ── 시장 데이터 조회 (거래량 순위 + 지수) ─────────────────────────
  // 실거래 환경에서만 동작. 모의 또는 설정 미완성 시 null 반환 (Gemini 검색으로 대체)
  async function fetchMarketData() {
    const settings = getSettings();
    if (!settings.appkey || !settings.secret) {
      console.log('[Market] KIS 설정 미완성 — Gemini 검색 전용 모드로 전환');
      return null;
    }

    let token;
    try {
      token = await getAccessToken(settings);
    } catch (e) {
      console.warn('[Market] KIS 토큰 발급 실패:', e.message);
      return null;
    }

    const basePayload = {
      appkey: settings.appkey,
      appsecret: settings.secret,
      token,
      isMock: settings.isMock
    };

    try {
      const [rankRes, indexRes] = await Promise.all([
        fetch(_proxyUrl('market-rank'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(basePayload)
        }),
        fetch(_proxyUrl('market-index'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(basePayload)
        })
      ]);

      const rankData  = rankRes.ok  ? await rankRes.json()  : { output: [] };
      const indexData = indexRes.ok ? await indexRes.json() : { output: null };

      // 거래량 TOP 10 종목 가공
      const volumeRank = (rankData.output || []).slice(0, 10).map(item => ({
        rank: item.data_rank,
        name: item.hts_kor_isnm,
        ticker: item.mksc_shrn_iscd,
        price: parseInt(item.stck_prpr || '0', 10).toLocaleString() + '원',
        change: item.prdy_vrss_sign === '2' ? `+${item.prdy_ctrt}%` : `${item.prdy_ctrt}%`,
        volume: parseInt(item.acml_vol || '0', 10).toLocaleString() + '주',
        volChange: item.vol_inrt ? `거래량증가율 ${item.vol_inrt}%` : ''
      }));

      return {
        volumeRank,
        indices: indexData.output || null,
        isMock: settings.isMock
      };
    } catch (err) {
      console.warn('[Market] 시장 데이터 조회 실패:', err.message);
      return null;
    }
  }

  function getBalanceData() { return _balanceData; }

  return {
    getSettings,
    saveSettings,
    getProxyBase,
    loadBalanceAndHoldings,
    placeOrder,
    checkAndTriggerAutoTrade,
    getBalanceData,
    fetchMarketData
  };
})();
