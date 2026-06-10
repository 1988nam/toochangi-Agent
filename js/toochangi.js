/**
 * 투챙이 - 핵심 투자 분석 로직
 * 포트폴리오 계산, 3단계 필터, Gemini AI 분석, Chart.js 시각화
 */
const Toochangi = (() => {

  let _portfolio = [];
  let _tradelog  = [];
  let _analysisHistory = [];
  let _gachangiData = null;
  let _assetHistory = [];
  let _gachangiAccounts = [];
  let _savings = [];
  let _realEstate = [];

  // ── 데이터 로드 ─────────────────────────────────────────────────
  async function loadAll() {
    try {
      [_portfolio, _tradelog, _analysisHistory, _gachangiData, _assetHistory, _gachangiAccounts, _savings, _realEstate] = await Promise.all([
        SheetsAPI.getPortfolio(),
        SheetsAPI.getTradeLog(),
        SheetsAPI.getAnalysisHistory(),
        SheetsAPI.getGachangiMonthlySavings(),
        SheetsAPI.getAssetStatus(),
        SheetsAPI.getGachangiAccounts ? SheetsAPI.getGachangiAccounts() : [],
        SheetsAPI.getSavings ? SheetsAPI.getSavings() : [],
        SheetsAPI.getRealEstate ? SheetsAPI.getRealEstate() : [],
      ]);
      console.log('[Toochangi] 데이터 로드 완료');
    } catch (e) {
      console.error('[Toochangi] 데이터 로드 실패:', e);
    }
    // 최근 AI 추천(클라우드) 로드 — 실패해도 본 로드에 영향 없게 분리
    try {
      _lastRecommendation = (SheetsAPI.getLatestRecommendation ? await SheetsAPI.getLatestRecommendation() : null);
    } catch (e) {
      console.warn('[Toochangi] 추천기록 로드 실패:', e);
    }
  }

  let _lastRecommendation = null;
  function getLatestRecommendation() { return _lastRecommendation; }
  // AI추천기록 시트의 전체 이력(최신순) 조회
  async function getRecommendationHistory() {
    return SheetsAPI.getRecommendationHistory ? await SheetsAPI.getRecommendationHistory() : [];
  }
  async function saveRecommendation(items, text, generatedAt) {
    const gen = generatedAt || new Date().toLocaleString('ko-KR');
    await SheetsAPI.appendRecommendation(gen, items || [], text || '');
    _lastRecommendation = { generatedAt: gen, items: Array.isArray(items) ? items : [], text: text || '' };
    return _lastRecommendation;
  }

  // ── 포트폴리오 계산 ──────────────────────────────────────────────
  function calcPortfolioMetrics() {
    let totalCost = 0, totalValue = 0;
    _portfolio.forEach(p => {
      const cost = p.qty * p.avgPrice;
      const val  = p.qty * (p.curPrice || p.avgPrice);
      totalCost  += cost;
      totalValue += val;
    });
    const totalPnL   = totalValue - totalCost;
    const totalYield = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

    // 비중 계산
    _portfolio.forEach(p => {
      p._value  = p.qty * (p.curPrice || p.avgPrice);
      p._weight = totalValue > 0 ? (p._value / totalValue) * 100 : 0;
      p._pnl    = p._value - (p.qty * p.avgPrice);
      p._yield  = p.avgPrice > 0 ? ((p.curPrice || p.avgPrice) - p.avgPrice) / p.avgPrice * 100 : 0;
    });

    return { totalCost, totalValue, totalPnL, totalYield };
  }

  // ── 3단계 필터 ──────────────────────────────────────────────────
  function evaluateFilter(filterId) {
    const checks = {
      1: ['chk-1-1','chk-1-2','chk-1-3'],
      2: ['chk-2-1','chk-2-2','chk-2-3'],
      3: ['chk-3-1','chk-3-2','chk-3-3'],
    };
    const ids = checks[filterId];
    const checkedCount = ids.filter(id => document.getElementById(id)?.checked).length;
    return checkedCount >= 2 ? 'green' : 'red'; // 3개 중 2개 이상이면 GREEN
  }

  function updateFilterSignal(filterId, signal) {
    const signalEl = document.getElementById(`signal-${filterId}`);
    const cardEl   = document.getElementById(`filter-card-${filterId}`);
    if (!signalEl || !cardEl) return;

    const dot  = signalEl.querySelector('.signal-dot');
    const text = signalEl.querySelector('.signal-text');
    dot.className  = `signal-dot ${signal}`;
    text.textContent = signal === 'green' ? '✅ 조건 충족' : '🔴 조건 미충족';
    cardEl.className = `filter-card ${signal}`;
  }

  function evaluateFinalVerdict() {
    const s1 = evaluateFilter(1);
    const s2 = evaluateFilter(2);
    const s3 = evaluateFilter(3);
    [1,2,3].forEach(i => updateFilterSignal(i, i===1?s1:i===2?s2:s3));

    const allGreen = s1==='green' && s2==='green' && s3==='green';
    const verdictEl  = document.getElementById('final-verdict');
    const textEl     = document.getElementById('verdict-text');
    const noteEl     = document.getElementById('verdict-note');

    if (allGreen) {
      textEl.textContent = '🟢 매수 신호';
      textEl.style.color = 'var(--accent-green)';
      noteEl.textContent = '3단계 모두 충족 — 매수 진입을 검토하세요';
      verdictEl.className = 'final-verdict verdict-go';
    } else {
      const passedCount = [s1,s2,s3].filter(s=>s==='green').length;
      textEl.textContent = `🔴 대기 (${passedCount}/3 충족)`;
      textEl.style.color = 'var(--accent-red)';
      noteEl.textContent = '3단계 모두 충족될 때까지 신규 매수를 보류하세요';
      verdictEl.className = 'final-verdict verdict-stop';
    }

    return { s1, s2, s3, verdict: allGreen ? '매수' : '대기' };
  }

  // ── OpenAI(GPT) 호출 헬퍼 ───────────────────────────────────────
  // 시스템/유저 프롬프트를 받아 Chat Completions로 텍스트 응답을 반환 (실시간 검색 없음)
  async function _callOpenAI(systemPrompt, userPrompt) {
    const apiKey = window.TOOCHANGI_CONFIG.OPENAI_API_KEY;
    if (!apiKey || apiKey.startsWith('YOUR_')) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.');
    }
    const model = window.TOOCHANGI_CONFIG.OPENAI_MODEL || 'gpt-4o';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify((() => {
        // 추론 전용 모델(o1/o3/o4 등)은 temperature 변경을 거부 → 생략
        const isReasoning = /^o\d/i.test(model) || /reasoning/i.test(model);
        const payload = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_completion_tokens: 4000,
        };
        if (!isReasoning) payload.temperature = 0.7;
        return payload;
      })()),
    });
    if (!res.ok) {
      let msg = `OpenAI API 오류: ${res.status}`;
      try { const e = await res.json(); if (e.error && e.error.message) msg += ` - ${e.error.message}`; } catch (_) {}
      throw new Error(msg);
    }
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || '').trim() || 'AI 응답을 받지 못했습니다.';
  }

  function _aiProvider() { return (window.TOOCHANGI_CONFIG.AI_PROVIDER || 'gemini'); }

  // 추천 응답에서 기계 판독용 JSON 블록을 추출하고, 표시용 텍스트에서는 제거
  function _extractRecommendations(rawText) {
    let text = rawText || '';
    let recommendations = [];
    const m = text.match(/===REC_JSON_START===([\s\S]*?)===REC_JSON_END===/);
    if (m) {
      text = text.replace(m[0], '').trim();
      try {
        const json = m[1].trim().replace(/^```json/i, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) recommendations = parsed;
      } catch (_) { /* 파싱 실패 시 카드 없이 텍스트만 */ }
    }
    return { text, recommendations };
  }

  // 부동산 담보대출의 '남은 잔액'(상환 진행 반영). 화면/집계와 동일 기준. (calculateLoanProgress는 main.js 전역)
  function _remainingLoan(r) {
    const loan = parseFloat(r.loanAmount) || 0;
    if (loan <= 0) return 0;
    if (typeof calculateLoanProgress === 'function') {
      const p = calculateLoanProgress(r);
      if (p && p.remainingBalance != null) return Math.round(p.remainingBalance);
    }
    return loan;
  }

  // ── Gemini 인증 헬퍼 (OAuth Bearer 우선 → API 키 폴백) ───────────
  // 현재 Gemini를 호출할 수 있는 인증 수단(구글 로그인 토큰 또는 API 키)이 있는지
  function _hasGeminiAuth() {
    const apiKey = window.TOOCHANGI_CONFIG.GEMINI_API_KEY;
    const hasKey = apiKey && !apiKey.startsWith('YOUR_');
    const hasToken = (typeof Auth !== 'undefined' && Auth.getToken && Auth.getToken());
    return !!(hasKey || hasToken);
  }

  // 마지막으로 Gemini를 실제 호출했을 때 어떤 경로를 탔는지: 'oauth' | 'key' | null(아직 호출 전)
  let _lastGeminiAuthMode = null;
  // 마지막으로 실제 호출에 사용된 Gemini 모델명(_safeGeminiModel 대체 반영 후)
  let _lastGeminiModel = null;

  // 환경설정 배지용: 현재 Gemini 인증 상태 요약
  function getGeminiAuthStatus() {
    const cfg = window.TOOCHANGI_CONFIG || {};
    const apiKey = cfg.GEMINI_API_KEY;
    // generativelanguage GenerateContent가 실제로 요구하는 scope (cloud-platform 아님)
    const GL = 'generative-language';
    const hasKey = !!(apiKey && !apiKey.startsWith('YOUR_'));
    const hasToken = !!(typeof Auth !== 'undefined' && Auth.getToken && Auth.getToken());
    const scopeConfigured = !!(cfg.SCOPES && cfg.SCOPES.indexOf(GL) !== -1); // config(SCOPES)에 generative-language 포함
    // 실제 토큰이 generative-language 권한을 부여받았는지(= OAuth 호출이 통할 핵심 조건)
    const tokenHasScope = !!(typeof Auth !== 'undefined' && Auth.hasScope && Auth.hasScope(GL));
    // config엔 scope가 있는데 토큰엔 없음 → '재로그인 필요' 상태
    const needsRelogin = hasToken && scopeConfigured && !tokenHasScope;

    // 다음 호출 시 '예상' 경로 (토큰의 실제 scope 기준)
    let expected;
    if (hasToken && tokenHasScope) expected = 'oauth';        // 토큰이 scope 보유 → OAuth 성공 예상
    else if (needsRelogin && hasKey) expected = 'relogin';    // scope 설정됐지만 토큰 미반영 → 재로그인 필요(현재는 키 폴백)
    else if (needsRelogin) expected = 'relogin';
    else if (hasToken && hasKey) expected = 'oauth-fallback'; // scope 미설정 → OAuth 시도 후 키로 폴백
    else if (hasKey) expected = 'key';                        // 토큰 없음 → 키로 호출
    else if (hasToken) expected = 'oauth-fallback';           // 토큰만, scope 없음, 키 없음 → OAuth 시도(403 예상)
    else expected = 'none';
    return { hasKey, hasToken, scopeConfigured, tokenHasScope, needsRelogin, lastUsed: _lastGeminiAuthMode, expected };
  }

  // AI 응답에 붙일 '어떤 모델/인증으로 답했는지' 정보. provider별로 구성.
  function _answerModelInfo(provider) {
    if (provider === 'gpt') {
      return { model: (window.TOOCHANGI_CONFIG.OPENAI_MODEL || 'gpt'), provider: 'gpt', auth: 'key' };
    }
    return { model: _lastGeminiModel || '', provider: 'gemini', auth: _lastGeminiAuthMode || 'key' };
  }

  // OAuth(generative-language scope 토큰)에서만 호출 가능한 모델 → OAuth 미준비 시 대체할 안전 모델
  const _OAUTH_ONLY_MODELS = {
    'gemini-3.5-flash': 'gemini-2.5-flash',
    'gemini-3.5-pro': 'gemini-2.5-pro',
    'gemini-3-pro-preview': 'gemini-2.5-pro',
    'gemini-3-flash-preview': 'gemini-2.5-flash',
  };
  // OAuth 전용 모델인데 OAuth(토큰+scope)가 준비 안 됐으면 안전 모델로 대체(404 방지)
  function _safeGeminiModel(model) {
    const fallback = _OAUTH_ONLY_MODELS[model];
    if (!fallback) return model;
    const st = getGeminiAuthStatus();
    if (!st.tokenHasScope) {
      console.warn(`[Gemini] '${model}'은 OAuth 전용 — 토큰에 generative-language 권한 없음(재로그인 필요)이라 '${fallback}'로 대체합니다.`);
      return fallback;
    }
    return model;
  }

  // OAuth(Bearer) 호출 시 쿼터·과금을 매길 GCP 프로젝트(x-goog-user-project).
  // 미지정 시 구글이 기본 프로젝트로 처리해 "이 프로젝트에 API 미활성화" 403이 남.
  // 우선순위: 명시 설정(GCP_PROJECT) → CLIENT_ID 앞부분의 프로젝트 번호 자동 추출.
  function _gcpProject() {
    const cfg = window.TOOCHANGI_CONFIG || {};
    if (cfg.GCP_PROJECT) return String(cfg.GCP_PROJECT).trim();
    const m = String(cfg.CLIENT_ID || '').match(/^(\d+)-/);
    return m ? m[1] : '';
  }

  // 현재 인증(OAuth 우선 → 키 폴백)으로 호출 가능한 모델 목록 조회 (ListModels).
  // generateContent를 지원하는 모델만 반환: [{ id, displayName }]
  async function listAvailableModels() {
    const base = 'https://generativelanguage.googleapis.com/v1beta/models';
    const apiKey = window.TOOCHANGI_CONFIG.GEMINI_API_KEY;
    const hasKey = apiKey && !apiKey.startsWith('YOUR_');
    const token = (typeof Auth !== 'undefined' && Auth.getToken) ? Auth.getToken() : null;
    const proj = _gcpProject();

    async function fetchPage(pageToken) {
      const params = new URLSearchParams({ pageSize: '200' });
      if (pageToken) params.set('pageToken', pageToken);
      // 1) OAuth 우선
      if (token) {
        const headers = { Authorization: `Bearer ${token}` };
        if (proj) headers['x-goog-user-project'] = proj;
        const res = await fetch(`${base}?${params.toString()}`, { headers });
        if (res.ok) { _lastGeminiAuthMode = 'oauth'; return res.json(); }
        if (!(hasKey && (res.status === 401 || res.status === 403))) {
          const t = await res.text().catch(() => '');
          throw new Error(`모델 목록 조회 실패(${res.status}) ${t.replace(/\s+/g, ' ').slice(0, 200)}`);
        }
      }
      // 2) API 키 폴백
      if (!hasKey) throw new Error('Gemini 인증이 없습니다(OAuth 토큰·API 키 모두 없음).');
      const res2 = await fetch(`${base}?${params.toString()}&key=${apiKey}`);
      if (!res2.ok) {
        const t = await res2.text().catch(() => '');
        throw new Error(`모델 목록 조회 실패(${res2.status}) ${t.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
      _lastGeminiAuthMode = 'key';
      return res2.json();
    }

    const out = [];
    let pageToken = '';
    for (let i = 0; i < 10; i++) {
      const data = await fetchPage(pageToken);
      (data.models || []).forEach(m => {
        const methods = m.supportedGenerationMethods || m.supported_generation_methods || [];
        if (methods.indexOf('generateContent') !== -1) {
          out.push({ id: String(m.name || '').replace(/^models\//, ''), displayName: m.displayName || m.display_name || '' });
        }
      });
      pageToken = data.nextPageToken || data.next_page_token || '';
      if (!pageToken) break;
    }
    const seen = new Set();
    const uniq = out.filter(m => m.id && !seen.has(m.id) && seen.add(m.id));
    uniq.sort((a, b) => a.id.localeCompare(b.id));
    return uniq;
  }

  // Gemini generateContent 호출.
  //  1) 구글 OAuth 액세스 토큰이 있으면 Authorization: Bearer 로 먼저 시도(키를 브라우저에 안 둬도 됨)
  //  2) 토큰이 없거나 401/403(스코프 미설정·API 비활성화)·네트워크 예외면 ?key= API 키 방식으로 폴백
  // 반환: fetch Response (상위에서 res.ok/상태코드 처리)
  async function _geminiFetch(model, body) {
    model = _safeGeminiModel(model);
    _lastGeminiModel = model;
    const base = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const apiKey = window.TOOCHANGI_CONFIG.GEMINI_API_KEY;
    const hasKey = apiKey && !apiKey.startsWith('YOUR_');
    const token = (typeof Auth !== 'undefined' && Auth.getToken) ? Auth.getToken() : null;
    const payload = JSON.stringify(body);

    // 1) OAuth(Bearer) 우선
    if (token) {
      try {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        const proj = _gcpProject();
        if (proj) headers['x-goog-user-project'] = proj; // 쿼터/과금 프로젝트 지정 → 403(프로젝트 미지정) 방지
        const res = await fetch(base, { method: 'POST', headers, body: payload });
        if (res.ok) { _lastGeminiAuthMode = 'oauth'; return res; }
        // 인증/권한 문제(401·403)는 키로 폴백 가능 → 키 있으면 폴백, 없으면 그대로 반환
        if (!(hasKey && (res.status === 401 || res.status === 403))) { _lastGeminiAuthMode = 'oauth'; return res; }
        let detail = '';
        try { detail = (await res.text()).replace(/\s+/g, ' ').slice(0, 400); } catch (_) {}
        const grantedScopes = (typeof Auth !== 'undefined' && Auth.getTokenScopes) ? Auth.getTokenScopes() : '(unknown)';
        console.warn(`[Gemini] OAuth 호출 실패(${res.status}) → API 키 방식으로 폴백`
          + (proj ? ` | x-goog-user-project=${proj}` : ' | ⚠️프로젝트 미지정(CLIENT_ID에서 추출 실패)')
          + ` | 토큰 부여 scope: [${grantedScopes}]`
          + (detail ? ` | 사유: ${detail}` : ''));
      } catch (e) {
        if (!hasKey) throw e;
        console.warn('[Gemini] OAuth 호출 예외 → API 키 방식으로 폴백:', e.message);
      }
    }

    // 2) API 키 폴백
    if (!hasKey) throw new Error('Gemini 인증 실패: 구글 로그인(OAuth) 토큰도, API 키도 사용할 수 없습니다.');
    _lastGeminiAuthMode = 'key';
    return fetch(`${base}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
  }

  // 429 응답 본문에서 '어떤 쿼터를 넘겼는지(quotaMetric)'와 '재시도 지연(retryDelay)'을 추출.
  // Gemini 429 본문 예: { error: { message, details: [
  //   { '@type': '...QuotaFailure', violations: [{ quotaMetric, quotaId, quotaDimensions }] },
  //   { '@type': '...RetryInfo', retryDelay: '17s' } ] } }
  function _parse429(bodyText) {
    let quota = '', quotaId = '', retrySec = 0, message = '', dims = '';
    try {
      const j = JSON.parse(bodyText);
      message = j.error?.message || '';
      for (const d of (j.error?.details || [])) {
        const t = String(d['@type'] || '');
        if (t.indexOf('QuotaFailure') !== -1) {
          const v = (d.violations || [])[0] || {};
          quota = v.quotaMetric || quota;
          quotaId = v.quotaId || quotaId;
          if (v.quotaDimensions) dims = JSON.stringify(v.quotaDimensions);
        }
        if (t.indexOf('RetryInfo') !== -1 && d.retryDelay) {
          const m = String(d.retryDelay).match(/([\d.]+)s/);
          if (m) retrySec = Math.ceil(parseFloat(m[1]));
        }
      }
    } catch (_) { /* 본문이 JSON이 아니면 message만 비움 */ }
    return { quota, quotaId, retrySec, message, dims };
  }

  // generateContent 호출 래퍼.
  //  - 429 발생 시 본문의 retryDelay(없으면 Retry-After 헤더, 그래도 없으면 7초) 만큼 대기 후 1회 재시도
  //  - 최종 실패 시 '버려지던 응답 본문'을 파싱해 어떤 쿼터/사유였는지 에러 메시지·콘솔에 그대로 노출
  // label: 로그·에러에 표시할 기능명(예: 'AI 분석')
  async function _geminiGenerate(model, body, label) {
    label = label || 'Gemini';
    let res = await _geminiFetch(model, body);

    if (res.status === 429) {
      const text = await res.text().catch(() => '');
      const info = _parse429(text);
      const headerSec = parseInt(res.headers.get('retry-after') || '', 10);
      const waitSec = (Number.isFinite(headerSec) && headerSec > 0) ? headerSec
        : (info.retrySec > 0 ? info.retrySec : 7);
      console.warn(`[${label}] 429 쿼터 초과 — ${waitSec}초 후 1회 재시도`
        + ` | 인증경로: ${_lastGeminiAuthMode || '?'} | 모델: ${_lastGeminiModel || model}`
        + (info.quota ? `\n  초과 쿼터(metric): ${info.quota}` : '')
        + (info.quotaId ? `\n  quotaId: ${info.quotaId}` : '')
        + (info.dims ? `\n  dimensions: ${info.dims}` : '')
        + (info.message ? `\n  사유: ${info.message}` : '')
        + (text ? `\n  raw: ${text.replace(/\s+/g, ' ').slice(0, 500)}` : ''));
      await new Promise(r => setTimeout(r, waitSec * 1000));
      res = await _geminiFetch(model, body);
    }

    if (!res.ok) {
      let text = '';
      try { text = await res.text(); } catch (_) {}
      if (res.status === 429) {
        const info = _parse429(text);
        console.warn(`[${label}] 429 재시도 후에도 실패`
          + (info.quota ? `\n  초과 쿼터(metric): ${info.quota}` : '')
          + (info.quotaId ? `\n  quotaId: ${info.quotaId}` : '')
          + (info.dims ? `\n  dimensions: ${info.dims}` : '')
          + `\n  인증경로: ${_lastGeminiAuthMode || '?'} | 모델: ${_lastGeminiModel || model}`
          + (text ? `\n  raw: ${text.replace(/\s+/g, ' ').slice(0, 800)}` : ''));
        const e = new Error(`${label} 사용량 한도(429) 초과`
          + (info.quota ? ` — 초과 쿼터: ${info.quota}` : '')
          + (info.retrySec ? `, 약 ${info.retrySec}초 후 재시도 가능` : '')
          + (info.message ? `\n사유: ${info.message}` : '')
          + `\n(자세한 쿼터·원문은 개발자도구 콘솔 참고)`);
        e.status = 429; e.quota = info.quota; e.quotaId = info.quotaId; e.retrySec = info.retrySec; e.raw = text;
        throw e;
      }
      const detail = text.replace(/\s+/g, ' ').slice(0, 300);
      throw new Error(`${label} Gemini API 오류: ${res.status}${detail ? ` — ${detail}` : ''}`);
    }
    return res;
  }

  // AI가 실시간 검색으로 최근 경제·투자 유튜브 영상을 직접 찾아 요약 (Gemini 그라운딩 필요)
  async function runEconomyVideoSummary() {
    if (!_hasGeminiAuth()) {
      throw new Error('실시간 검색 요약은 Gemini 인증이 필요합니다. 구글 로그인(OAuth) 또는 API 키를 설정해주세요.');
    }
    const today = new Date().toLocaleDateString('ko-KR');
    const systemPrompt = `당신은 한국 경제·투자 유튜브 큐레이터입니다. 실시간 인터넷/유튜브 검색이 가능합니다.
최근 1~2주 내 화제가 된 경제·투자 관련 유튜브 영상(예: 삼프로TV, 슈카월드, 박곰희TV, 김작가TV 등)과 시장 이슈를 검색하여,
가장 중요한 5~7개를 골라 각각 아래 형식으로 한국어로 정리하세요. 추측하지 말고 검색 결과에 근거하세요.

각 항목은 반드시 아래 3줄 형식을 지키세요. 제목 다음 줄에 핵심 요약, 그 다음 줄에 실제 영상 링크(URL)를 넣습니다.

### N. [제목] — 채널명
* **핵심 요약:** 1~2줄 (무엇을, 왜 중요한지)
URL : (검색으로 찾은 실제 유튜브 영상 링크. 정확한 영상 링크를 못 찾으면 관련 뉴스/채널 링크라도 반드시 표기. 임의로 지어내지 말 것)

마지막에 전체 시장 흐름을 2~3문장으로 요약하는 총평을 덧붙이세요.`;
    const userPrompt = `오늘(${today}) 기준, 최근 경제·투자 유튜브에서 꼭 봐야 할 핵심 영상들을 검색해 요약해줘.`;
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
    };
    const res = await _geminiGenerate(window.TOOCHANGI_CONFIG.GEMINI_MODEL_RECOMMEND, body, 'AI 영상요약');
    const data = await res.json();
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts || []).filter(p => p && p.text).map(p => p.text).join('').trim() || '요약을 받지 못했습니다.';
    const chunks = cand?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map(c => c.web ? { title: c.web.title, url: c.web.uri } : null).filter(Boolean);
    const generatedAt = new Date().toLocaleString('ko-KR');
    // 시트 '영상요약기록'에 저장(휘발 방지) + 오래된 것 자동 정리
    try { if (SheetsAPI.appendVideoSummary) await SheetsAPI.appendVideoSummary(generatedAt, text, sources); }
    catch (e) { console.warn('[Toochangi] 영상요약 저장 실패:', e); }
    return { text, sources, generatedAt, ..._answerModelInfo('gemini') };
  }

  // 시트에 저장된 가장 최근 경제 영상 요약 조회
  async function getLatestVideoSummary() {
    return SheetsAPI.getLatestVideoSummary ? await SheetsAPI.getLatestVideoSummary() : null;
  }
  // 영상요약기록 전체 이력(최신순)
  async function getVideoSummaryHistory() {
    return SheetsAPI.getVideoSummaryHistory ? await SheetsAPI.getVideoSummaryHistory() : [];
  }

  // ── Gemini AI 분석 ──────────────────────────────────────────────
  async function runGeminiAnalysis(query) {
    const provider = _aiProvider();
    if (provider === 'gemini' && !_hasGeminiAuth()) {
      return '⚠️ Gemini 인증이 없습니다. 구글 로그인(OAuth) 또는 js/config.js의 GEMINI_API_KEY를 설정해주세요.';
    }

    const stocksSummary = _portfolio.length > 0
      ? _portfolio.map(p => `- ${p.name}(${p.ticker}): ${p.qty}주, 평단 ${p.avgPrice.toLocaleString()}원, 현재가 ${(p.curPrice||p.avgPrice).toLocaleString()}원 (비중 ${(p._weight || 0).toFixed(1)}%, 용도: ${p.memo || '투자'})`).join('\n')
      : '- 보유 주식 없음';

    const savingsSummary = _savings.length > 0
      ? _savings.map(s => `- ${s.name}(${s.bank}, 명의 ${s.owner || '미지정'}): 잔액 ${calcSavingsBalance(s).toLocaleString()}원${(parseFloat(s.monthlyDeposit) || 0) > 0 ? `(매월 ${(parseFloat(s.monthlyDeposit) || 0).toLocaleString()}원 자동납입)` : ''}, 금리 ${s.rate}%, 만기일 ${s.maturity || '없음'}, 용도: ${s.purpose}`).join('\n')
      : '- 보유 예적금 없음';

    const realEstateSummary = _realEstate.length > 0
      ? _realEstate.map(r => `- ${r.name}: 매입가 ${r.purchasePrice.toLocaleString()}원, 현재가 ${r.currentValue.toLocaleString()}원, 담보대출잔액 ${_remainingLoan(r).toLocaleString()}원(금리 ${r.loanRate}%), 연간 상환액 ${r.maintenance.toLocaleString()}원, 용도: ${r.purpose}`).join('\n')
      : '- 보유 부동산 없음';

    const assetSummary = `[보유 주식/ETF]\n${stocksSummary}\n\n[보유 예적금]\n${savingsSummary}\n\n[보유 부동산]\n${realEstateSummary}`;

    const gachangiContext = _gachangiData
      ? `이번 달 가계부 현황 - 수입: ${_gachangiData.income.toLocaleString()}원, 지출: ${_gachangiData.expense.toLocaleString()}원, 월 저축액: ${_gachangiData.savings.toLocaleString()}원`
      : '';

    const strategyContext = window.TOOCHANGI_CONFIG.STRATEGY_CONTEXT || `[가족 프로필 및 미션]
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
- IRP 연 600만 원 한도는 환급금 데이터와 연동 관리.`;

    const searchNote = provider === 'gpt'
      ? `[정보 한계]
- 실시간 인터넷 검색은 불가합니다. 제공된 자산 현황·운용 원칙과 모델 지식만으로 분석하고, 확인되지 않은 최신 뉴스/시세는 단정하지 마세요.`
      : `구글 검색 기능 연동 (Google Search Grounding):
- 당신에게는 실시간 인터넷 검색 기능이 주어져 있습니다. 질문에 나타난 종목에 대해 실시간 네이버/구글 뉴스 보도 내용 및 유튜브(YouTube) 영상 여론/댓글 트렌드, 시장 토론방 분위기를 적극적으로 검색하여 분석에 반영하세요.`;

    const systemPrompt = `당신은 투챙이 - 흰챙이 가족의 AI 투자 비서입니다.

${searchNote}

[흰챙이 커스텀 자산 운용 가이드라인 & 원칙]
${strategyContext}

[현재 가구 전체 자산 현황]
${assetSummary}

${gachangiContext}

질문에 대해 구체적이고 실행 가능한 투자 의견을 한국어로 답하세요.
분석 시 3단계 필터 기준을 명시하고, 투자 의견(매수/매도/관망)과 기간(단기/중기/장기)을 반드시 포함하세요.`;

    // GPT 선택 시 OpenAI로 분석 (실시간 검색 없음 → 출처 비움)
    if (provider === 'gpt') {
      const text = await _callOpenAI(systemPrompt, query);
      return { text, sources: [], ..._answerModelInfo('gpt') };
    }

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: query }] }],
      tools: [{ googleSearch: {} }], // Enables Google Search Grounding for real-time news/YouTube search
      // 2.5-pro는 thinking 토큰을 소비(끌 수 없음) → 출력 한도를 넉넉히 잡아 중간 잘림 방지
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    };

    const res = await _geminiGenerate(window.TOOCHANGI_CONFIG.GEMINI_MODEL_ANALYSIS, body, 'AI 분석');
    const data = await res.json();
    const candidate = data.candidates?.[0];
    // 응답 파트 전체를 합쳐 텍스트 추출 (thinking/멀티파트 대비)
    const text = (candidate?.content?.parts || []).filter(p => p && p.text).map(p => p.text).join('').trim()
      || '분석 결과를 받지 못했습니다.';
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map(c => {
      if (c.web) {
        return { title: c.web.title, url: c.web.uri };
      }
      return null;
    }).filter(Boolean);
    return { text, sources, ..._answerModelInfo('gemini') };
  }

  // ── 자동 투자 추천 ──────────────────────────────────────────────
  // KIS 거래량 데이터 + Google Search Grounding(뉴스/유튜브) + 포트폴리오 + 전략 Context를
  // 통합하여 흰챙이 가족 원칙에 맞는 종목을 자동 발굴·추천하는 함수
  // mode: 'all'(기본 전체 시장) | 'kospi'(코스피 전용 — KIS 모의 연동·코스피 정보만으로 코스피 종목 추천)
  async function runAutoRecommendation(mode = 'all') {
    const isKospi = mode === 'kospi';
    const provider = _aiProvider();
    if (provider === 'gemini' && !_hasGeminiAuth()) {
      throw new Error('Gemini 인증이 없습니다. 구글 로그인(OAuth) 또는 API 키를 설정해주세요.');
    }

    // ── 데이터 수집 (KIS + 포트폴리오 + 전략 + 유튜브 RSS) ──────────────────
    let marketData = null;
    if (typeof Broker !== 'undefined') {
      try {
        marketData = await Broker.fetchMarketData();
      } catch (e) {
        console.warn('[AutoRec] KIS 시장 데이터 수집 실패 (Gemini 검색 전용으로 계속):', e.message);
      }
    }

    // 유튜브: 채널 RSS 직접 조회(정적 호스팅에서 CORS로 실패) 대신, 실시간 검색으로 AI가 직접 경제 유튜브를 찾아 요약하도록 지시
    const youtubeFeedText = (provider === 'gpt')
      ? ''
      : `[경제 유튜브 검색 지시]\n최근 1~2주 내 한국 경제·투자 관련 화제의 유튜브 영상(삼프로TV·슈카월드·박곰희TV 등 포함)과 시장 이슈를 실시간 검색해, 핵심 논점·여론을 분석에 반영하세요.`;

    const stocksSummary = _portfolio.length > 0
      ? _portfolio.map(p => `- ${p.name}(${p.ticker}): ${p.qty}주, 평단 ${p.avgPrice.toLocaleString()}원, 현재가 ${(p.curPrice||p.avgPrice).toLocaleString()}원 (비중 ${(p._weight || 0).toFixed(1)}%, 용도: ${p.memo || '투자'})`).join('\n')
      : '- 보유 주식 없음';

    const savingsSummary = _savings.length > 0
      ? _savings.map(s => `- ${s.name}(${s.bank}, 명의 ${s.owner || '미지정'}): 잔액 ${calcSavingsBalance(s).toLocaleString()}원${(parseFloat(s.monthlyDeposit) || 0) > 0 ? `(매월 ${(parseFloat(s.monthlyDeposit) || 0).toLocaleString()}원 자동납입)` : ''}, 금리 ${s.rate}%, 만기일 ${s.maturity || '없음'}, 용도: ${s.purpose}`).join('\n')
      : '- 보유 예적금 없음';

    const realEstateSummary = _realEstate.length > 0
      ? _realEstate.map(r => `- ${r.name}: 매입가 ${r.purchasePrice.toLocaleString()}원, 현재가 ${r.currentValue.toLocaleString()}원, 담보대출잔액 ${_remainingLoan(r).toLocaleString()}원(금리 ${r.loanRate}%), 연간 상환액 ${r.maintenance.toLocaleString()}원, 용도: ${r.purpose}`).join('\n')
      : '- 보유 부동산 없음';

    const assetSummary = `[보유 주식/ETF]\n${stocksSummary}\n\n[보유 예적금]\n${savingsSummary}\n\n[보유 부동산]\n${realEstateSummary}`;

    const gachangiContext = _gachangiData
      ? `이번 달 수입: ${_gachangiData.income.toLocaleString()}원, ` +
        `지출: ${_gachangiData.expense.toLocaleString()}원, ` +
        `가용 저축액: ${_gachangiData.savings.toLocaleString()}원`
      : '가계부 데이터 미연동';

    const strategyContext = window.TOOCHANGI_CONFIG.STRATEGY_CONTEXT || '';

    // ── KIS 데이터 요약 텍스트 생성 ──────────────────────────────
    let kisSection = '';
    if (marketData && marketData.volumeRank && marketData.volumeRank.length > 0) {
      const rankLines = marketData.volumeRank
        .map(r => `  ${r.rank}위 ${r.name}(${r.ticker}): ${r.price}, 등락 ${r.change}, 거래량 ${r.volume} ${r.volChange}`)
        .join('\n');
      kisSection = `[KIS 실시간 거래량 순위 TOP ${marketData.volumeRank.length}]
${rankLines}`;
      if (marketData.indices && typeof marketData.indices === 'object' && !Array.isArray(marketData.indices)) {
        const idxLines = Object.entries(marketData.indices)
          .filter(([, v]) => v && v.current != null)
          .map(([k, v]) => `  ${k}: ${v.current} (${v.rate != null ? v.rate : '-'}%)`)
          .join('\n');
        if (idxLines) kisSection += `\n\n[코스피/코스닥 지수]\n${idxLines}`;
      }
    } else {
      kisSection = '[KIS 거래량 데이터] KIS 미연동 또는 모의환경 — 아래 검색 지시에 따라 직접 검색하세요.';
    }

    // ── Gemini 프롬프트 구성 ──────────────────────────────────────
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

    const recSearchNote = provider === 'gpt'
      ? '실시간 인터넷 검색은 불가합니다. 제공된 데이터·운용 원칙·모델 지식만으로 발굴하고, 확인되지 않은 최신 정보는 단정하지 마세요.'
      : '실시간 인터넷 검색 기능(Google Search Grounding)이 활성화되어 있습니다.';
    const systemPrompt = `당신은 투챙이 - 흰챙이 가족의 AI 자동 투자 발굴 엔진입니다.
${recSearchNote}${isKospi ? '\n[모드] 코스피(KOSPI) 전용 추천 — 코스피 상장 종목만, 코스피 지수·수급·뉴스 중심으로 분석합니다.' : ''}

[흰챙이 커스텀 자산 운용 가이드라인]
${strategyContext}`;

    // 모드별 인트로/제약/검색 지시
    const recIntro = isKospi
      ? `오늘(${today}) 기준으로 **코스피(KOSPI, 유가증권시장) 상장 종목** 중에서만 투자 검토할 만한 종목을 발굴·추천해주세요.`
      : `오늘(${today}) 기준으로 투자 검토할 만한 종목을 자동 발굴·추천해주세요.`;
    const kospiConstraint = isKospi
      ? `[⚠️ 코스피 전용 제약 — 반드시 준수]
- 추천 종목은 모두 코스피(유가증권시장) 상장 종목이어야 합니다. 코스닥·해외·비상장 제외(코스피 추종 ETF는 허용).
- 코스피 지수 흐름, 외국인·기관 수급, 코스피 대형주/업종 뉴스 중심으로 분석하세요.
- 위 KIS(모의 연동) 데이터의 코스피 지수·거래량을 우선 반영하세요.
`
      : '';
    const searchInstructions = isKospi
      ? `1. 오늘 코스피(KOSPI) 지수 흐름과 외국인·기관 수급 동향 검색
2. 코스피 거래량/등락 상위 종목과 급등락 원인(공시·실적·이슈) 검색
3. 코스피 주요 업종(반도체·2차전지·자동차·금융·바이오 등) 오늘 테마·뉴스 검색
4. 코스피 대형주(삼성전자·SK하이닉스 등) 최신 이슈 검색
5. 위 구독 유튜브 채널의 코스피 관련 최신 영상·여론 검색`
      : `1. 오늘 국내외 주요 증시 특징 및 거래량 급등 테마/섹터 뉴스 검색
2. 위 구독 유튜브 채널의 실시간 피드에 기록된 최신 영상 주제들을 면밀히 파악하고, 최근 시장 여론과 주목받는 종목들을 추천 후보군에 적극 반영하십시오.
3. 위 KIS 거래량 상위 종목들의 급등 원인(공시, 실적, 이슈) 검색
4. 미국 시장(S&P500, 나스닥) 오늘 주요 이슈 및 ETF 자금 흐름 검색
5. 현재 ISA 계좌에 담기 적합한 국내 ETF 트렌드 검색`;

    const userPrompt = `${recIntro}

${kospiConstraint}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[현재 가구 전체 자산 현황]
  ${assetSummary}

[가계부 현황]
  ${gachangiContext}

${kisSection}

${youtubeFeedText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[필수 검색 지시 — 아래 항목을 Google Search로 반드시 검색하세요]
${searchInstructions}

[추천 출력 형식]
추천 종목 3~5개를 아래 형식으로 각각 작성하세요:

**[종목명(티커)]**
- 📊 추천 이유: (검색 결과 기반, 구체적으로)
- 🎯 3단계 필터 통과 여부:
  - 1단계(전략 부합성): ✅/❌ — 이유
  - 2단계(부채 허들 3.67%): ✅/❌ — 기대수익률 vs 대출금리
  - 3단계(생애주기/ISA 적합성): ✅/❌ — 2026 출산·2033 주택교체 관점
- 💡 흰챙이 전략 부합성: (ISA/IRP 중 어디에 담을지, 아챙이 계좌 적합 여부 등)
- ⏰ 진입 고려 시점: 단기/중기/장기, 분할매수 vs 일시매수 의견
- ⚠️ 리스크 요인: (주의할 점)

마지막에 **[오늘의 시장 총평]** 섹션도 100자 내외로 추가해주세요.

[기계 판독용 JSON — 위 분석을 마친 뒤 응답 맨 끝에 아래 블록을 정확히 한 번만 출력]
추천한 각 종목을 '3단계 필터(① 시장 흐름 ② 섹터 흐름 ③ 개별 종목)' 관점에서 GREEN/RED로 판정하고, 세 단계 모두 GREEN이면 verdict는 "매수", 아니면 "대기"로 표기하세요.
===REC_JSON_START===
[{"name":"종목명","ticker":"티커(없으면 빈칸)","issue":"핵심 이슈/추천 이유 한 줄","market":"GREEN","sector":"GREEN","stock":"RED","verdict":"대기"}]
===REC_JSON_END===`;

    // ── Gemini API 호출 ────────────────────────────────────────────
    // GPT 선택 시 OpenAI로 추천 (실시간 검색 없음 → 출처 비움)
    if (provider === 'gpt') {
      const raw = await _callOpenAI(systemPrompt, userPrompt);
      const { text, recommendations } = _extractRecommendations(raw);
      return {
        text,
        recommendations,
        sources: [],
        hadKisData: !!(marketData && marketData.volumeRank?.length > 0),
        generatedAt: new Date().toLocaleString('ko-KR'),
        ..._answerModelInfo('gpt'),
      };
    }

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      tools: [{ googleSearch: {} }],
      // 2.5-flash는 thinking 토큰을 소비 → 비활성화하고 출력 한도를 넉넉히(중간 잘림 방지)
      generationConfig: { temperature: 0.6, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
    };

    const res = await _geminiGenerate(window.TOOCHANGI_CONFIG.GEMINI_MODEL_RECOMMEND, body, 'AI 추천');
    const data = await res.json();
    const candidate = data.candidates?.[0];
    // 응답 파트 전체를 합쳐 텍스트 추출 (thinking/멀티파트 대비)
    const rawText = (candidate?.content?.parts || []).filter(p => p && p.text).map(p => p.text).join('').trim()
      || '추천 결과를 받지 못했습니다.';
    const { text, recommendations } = _extractRecommendations(rawText);
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map(c => c.web ? { title: c.web.title, url: c.web.uri } : null).filter(Boolean);

    return {
      text,
      recommendations,
      sources,
      hadKisData: !!(marketData && marketData.volumeRank?.length > 0),
      generatedAt: new Date().toLocaleString('ko-KR'),
      ..._answerModelInfo('gemini'),
    };
  }

  // ── Chart.js 렌더링 ──────────────────────────────────────────────
  let _chartAllocation = null;
  let _chartPortfolioAllocation = null;
  let _chartPortfolioMarketAllocation = null;
  let _chartMonthly    = null;

  function renderAllocationChart(canvasId = 'chart-allocation', isPortfolioTab = false) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    if (isPortfolioTab && _chartPortfolioAllocation) _chartPortfolioAllocation.destroy();
    if (!isPortfolioTab && _chartAllocation) _chartAllocation.destroy();

    const labels = _portfolio.length > 0
      ? _portfolio.map(p => p.name)
      : ['현금','미설정'];
    const data = _portfolio.length > 0
      ? _portfolio.map(p => p._weight || 0)
      : [100, 0];
    const colors = [
      '#8b5cf6','#3b82f6','#10b981','#f59e0b',
      '#ef4444','#06b6d4','#ec4899','#84cc16',
    ];

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#111827' }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', font: { family: 'Outfit', size: 12 }, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw.toFixed(1)}%` } },
        },
        cutout: '65%',
      },
    });

    if (isPortfolioTab) {
      _chartPortfolioAllocation = chart;
    } else {
      _chartAllocation = chart;
    }
  }

  function renderMarketAllocationChart() {
    const ctx = document.getElementById('chart-portfolio-market-allocation');
    if (!ctx) return;
    if (_chartPortfolioMarketAllocation) _chartPortfolioMarketAllocation.destroy();

    // 시장별 비중 계산
    const marketTotals = {};
    let grandTotal = 0;
    
    _portfolio.forEach(p => {
      const market = p.market || '기타';
      const value = p.qty * (p.curPrice || p.avgPrice);
      marketTotals[market] = (marketTotals[market] || 0) + value;
      grandTotal += value;
    });

    const labels = Object.keys(marketTotals);
    const data = labels.map(market => 
      grandTotal > 0 ? (marketTotals[market] / grandTotal) * 100 : 0
    );

    // 시장별 색상 맵
    const marketColors = {
      '코스피': '#8b5cf6',
      '코스닥': '#3b82f6',
      '나스닥': '#10b981',
      'NYSE': '#f59e0b',
      '기타': '#ef4444'
    };
    const colors = labels.map(market => marketColors[market] || '#84cc16');

    if (labels.length === 0) {
      labels.push('데이터 없음');
      data.push(1);
    }

    _chartPortfolioMarketAllocation = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#111827' }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', font: { family: 'Outfit', size: 12 }, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw.toFixed(1)}%` } },
        },
        cutout: '65%',
      },
    });
  }

  // ── 자산현황 계산 및 연동 ──────────────────────────────────────
  function getAssetHistory() { return _assetHistory; }
  async function reloadAssetHistory() {
    _assetHistory = await SheetsAPI.getAssetStatus();
    return _assetHistory;
  }

  function calcAssetMetrics(selectedMonthKey) {
    let totalAssets = 0;
    let totalDebt = 0;

    const monthEntries = _assetHistory.filter(a => a.date && a.date.startsWith(selectedMonthKey));
    monthEntries.forEach(a => {
      const balance = a.balance || 0;
      if (a.category === '대출(부채)') {
        totalDebt += balance;
      } else {
        totalAssets += balance;
      }
    });

    return {
      totalAssets,
      totalDebt,
      netWorth: totalAssets - totalDebt
    };
  }

  async function syncPortfolioAssets(targetDate) {
    let domesticVal = 0;
    let foreignVal = 0;
    _portfolio.forEach(p => {
      const val = p.qty * (p.curPrice || p.avgPrice);
      if (p.market === '코스피' || p.market === '코스닥') {
        domesticVal += val;
      } else {
        foreignVal += val;
      }
    });

    await SheetsAPI.syncPortfolioToAssets(domesticVal, foreignVal, targetDate);
    _assetHistory = await SheetsAPI.getAssetStatus();
  }

  // ── 자산현황 차트 렌더링 ──────────────────────────────────────
  let _chartAssetAllocation = null;
  let _chartNetWorthTrend = null;

  // 실시간 자산 구성 비중 도넛 (주식/현금/부동산) — 자산현황 탭에서 사용
  function renderLiveAssetAllocationChart(stock, cash, realEstateNet) {
    const ctx = document.getElementById('chart-asset-allocation');
    if (!ctx) return;
    if (_chartAssetAllocation) _chartAssetAllocation.destroy();

    const entries = [
      { label: '주식 자산',   value: stock,         color: '#8b5cf6' },
      { label: '현금 자산',   value: cash,          color: '#3b82f6' },
      { label: '부동산 자산', value: realEstateNet, color: '#f59e0b' },
    ].filter(e => e.value > 0);
    const total = entries.reduce((s, e) => s + e.value, 0);

    const labels = entries.length ? entries.map(e => e.label) : ['등록된 자산 없음'];
    const data   = entries.length ? entries.map(e => e.value) : [1];
    const colors = entries.length ? entries.map(e => e.color) : ['#374151'];

    _chartAssetAllocation = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#111827' }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', font: { family: 'Outfit', size: 12 }, boxWidth: 12 } },
          tooltip: { callbacks: { label: c => {
            if (c.label === '등록된 자산 없음') return c.label;
            const pct = total > 0 ? (c.raw / total * 100).toFixed(1) : '0.0';
            return `${c.label}: ${Math.floor(c.raw).toLocaleString()}원 (${pct}%)`;
          } } },
        },
        cutout: '60%',
      },
    });
  }

  function renderNetWorthTrendChart(viewMode) {
    const ctx = document.getElementById('chart-networth-trend');
    if (!ctx) return;
    if (_chartNetWorthTrend) _chartNetWorthTrend.destroy();

    // 월별로 행을 모은 뒤, 스냅샷(자동/과거) 행이 있는 달은 스냅샷만 집계(수동/동기화 행 중복 방지)
    const SNAP_MEMOS = ['자동 월별 스냅샷', '과거 월별 스냅샷'];
    const bucketOf = (cat) => {
      cat = cat || '';
      if (cat === '대출(부채)') return 'debt';
      if (cat.includes('주식') || cat.includes('투자')) return 'stock';
      if (cat.includes('현금') || cat.includes('예금') || cat.includes('적금')) return 'cash';
      if (cat.includes('부동산')) return 'realEstate';
      return 'other';
    };
    const monthRows = {};
    _assetHistory.forEach(a => {
      if (!a.date) return;
      const mk = a.date.substring(0, 7);
      (monthRows[mk] = monthRows[mk] || []).push(a);
    });
    const monthsMap = {};
    Object.keys(monthRows).forEach(mk => {
      const all = monthRows[mk];
      // 스냅샷이 커버한 '버킷'에 한해서만 수동/동기화 행 제외(연금·기타·부분입력 카테고리는 보존)
      const snapBuckets = new Set(all.filter(a => SNAP_MEMOS.includes(a.memo)).map(a => bucketOf(a.category)));
      const rows = snapBuckets.size > 0
        ? all.filter(a => SNAP_MEMOS.includes(a.memo) || !snapBuckets.has(bucketOf(a.category)))
        : all;
      let assets = 0, debt = 0;
      rows.forEach(a => {
        if (a.category === '대출(부채)') debt += a.balance; else assets += a.balance;
      });
      monthsMap[mk] = { assets, debt };
    });

    const allMonths = Object.keys(monthsMap).sort();
    let labels, netWorthData, assetData;

    if (viewMode === 'all') {
      // 전체 보기: 연·분기 단위 집계 (각 분기의 마지막 월 스냅샷 사용)
      const qMap = {};
      allMonths.forEach(m => {
        const parts = m.split('-').map(Number);
        const q = Math.ceil(parts[1] / 3);
        qMap[`${parts[0]}-Q${q}`] = monthsMap[m]; // 오름차순이라 마지막 대입 = 분기 내 최신 월
      });
      const qKeys = Object.keys(qMap).sort();
      labels = qKeys.map(k => { const seg = k.split('-Q'); return `${seg[0].substring(2)} ${seg[1]}Q`; });
      netWorthData = qKeys.map(k => qMap[k].assets - qMap[k].debt);
      assetData = qKeys.map(k => qMap[k].assets);
    } else {
      // 기본: 최근 6개월 (월별)
      const months = allMonths.slice(-6);
      labels = months.map(m => { const p = m.split('-'); return `${p[0].substring(2)}-${p[1]}`; });
      netWorthData = months.map(m => monthsMap[m].assets - monthsMap[m].debt);
      assetData = months.map(m => monthsMap[m].assets);
    }

    _chartNetWorthTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '순자산',
            data: netWorthData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointBackgroundColor: '#10b981'
          },
          {
            label: '총자산',
            data: assetData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            fill: false,
            tension: 0.3,
            borderWidth: 2,
            borderDash: [5, 5],
            pointBackgroundColor: '#3b82f6'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { family: 'Outfit', size: 11 } } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { family: 'Outfit', size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: {
            ticks: {
              color: '#94a3b8',
              font: { family: 'Outfit', size: 10 },
              callback: v => {
                if (Math.abs(v) >= 100000000) {
                  return `${(v / 100000000).toFixed(1)}억원`;
                }
                if (Math.abs(v) >= 10000) {
                  return `${(v / 10000).toLocaleString()}만원`;
                }
                return v.toLocaleString();
              }
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
  }

  // ── getters ──────────────────────────────────────────────────────
  function getPortfolio() { return _portfolio; }
  function getTradeLog()  { return _tradelog; }
  function getAnalysis()  { return _analysisHistory; }
  function getGachangiData() { return _gachangiData; }
  function getGachangiAccounts() { return _gachangiAccounts; }
  function getSavings()   { return _savings; }
  function getRealEstate() { return _realEstate; }

  // ── 예적금 자동 납입(누적) 계산 ──────────────────────────────
  // 'YYYY-MM-DD' 또는 'YYYY.MM.DD' 형식의 문자열을 Date로 파싱 (실패 시 null)
  function _parseSavingsDate(str) {
    if (!str) return null;
    const m = String(str).match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  // (start, end] 구간에서 매월 depositDay 일이 도래한 횟수
  function _countMonthlyDeposits(start, end, depositDay) {
    if (!(end > start)) return 0;
    let count = 0;
    const baseYear = start.getFullYear();
    const baseMonth = start.getMonth();
    for (let k = 0; k < 1200; k += 1) { // 최대 100년치 안전 상한
      const d = new Date(baseYear, baseMonth + k, depositDay);
      if (d > end) break;
      if (d > start) count += 1;
    }
    return count;
  }

  // 저장된 기준잔액 + (납입 시작일부터 만기일/오늘까지 누적된 자동 납입액)
  // asOf(Date)를 주면 그 시점 기준 잔액을 계산 (과거 스냅샷용). 없으면 오늘 기준.
  function calcSavingsBalance(s, asOf) {
    const base = parseFloat(s.balance) || 0;
    const monthly = parseFloat(s.monthlyDeposit) || 0;
    if (monthly <= 0) return base;
    const day = parseInt(s.depositDay, 10) || 0;
    if (!day) return base;
    const start = _parseSavingsDate(s.depositStartDate);
    if (!start) return base;
    let end = (asOf instanceof Date && !isNaN(asOf.getTime())) ? asOf : new Date();
    const maturity = _parseSavingsDate(s.maturity);
    if (maturity && maturity < end) end = maturity; // 만기일 이후로는 누적 중단
    return base + monthly * _countMonthlyDeposits(start, end, day);
  }

  async function addPortfolio(row) {
    await SheetsAPI.appendPortfolio(row);
    await loadAll();
  }
  async function updatePortfolio(rowIndex, row) {
    await SheetsAPI.updatePortfolio(rowIndex, row);
    await loadAll();
  }
  async function deletePortfolio(rowIndex) {
    await SheetsAPI.deletePortfolio(rowIndex);
    await loadAll();
  }
  async function updatePortfolioRows(updates) {
    await SheetsAPI.updatePortfolioRows(updates);
    await loadAll();
  }
  async function deletePortfolioRows(rowIndices) {
    await SheetsAPI.deletePortfolioRows(rowIndices);
    await loadAll();
  }

  // ── 예적금 CRUD ──
  async function addSavings(row) {
    await SheetsAPI.appendSavings(row);
    await loadAll();
  }
  async function updateSavings(rowIndex, row) {
    await SheetsAPI.updateSavings(rowIndex, row);
    await loadAll();
  }
  async function deleteSavings(rowIndex) {
    await SheetsAPI.deleteSavings(rowIndex);
    await loadAll();
  }
  async function updateSavingsRows(updates) {
    await SheetsAPI.updateSavingsRows(updates);
    await loadAll();
  }
  async function deleteSavingsRows(rowIndices) {
    await SheetsAPI.deleteSavingsRows(rowIndices);
    await loadAll();
  }
  async function restoreSavingsFromBackup() {
    await SheetsAPI.restoreSavingsFromBackup();
    await loadAll();
  }

  // ── 부동산 CRUD ──
  async function addRealEstate(row) {
    await SheetsAPI.appendRealEstate(row);
    await loadAll();
  }
  async function updateRealEstate(rowIndex, row) {
    await SheetsAPI.updateRealEstate(rowIndex, row);
    await loadAll();
  }
  async function deleteRealEstate(rowIndex) {
    await SheetsAPI.deleteRealEstate(rowIndex);
    await loadAll();
  }
  async function updateRealEstateRows(updates) {
    await SheetsAPI.updateRealEstateRows(updates);
    await loadAll();
  }
  async function deleteRealEstateRows(rowIndices) {
    await SheetsAPI.deleteRealEstateRows(rowIndices);
    await loadAll();
  }
  async function addTrade(row) {
    await SheetsAPI.appendTrade(row);
    const portfolioAction = await applyTradeToPortfolio(row);
    await loadAll();
    return { portfolioAction };
  }

  // 매매 기록을 포트폴리오(주식 리스트)에 자동 반영
  // 반환: 'added' | 'updated' | 'removed' | 'skipped'
  async function applyTradeToPortfolio(trade) {
    const qty = parseFloat(trade.qty) || 0;
    const price = parseFloat(trade.price) || 0;
    if (qty <= 0) return 'skipped';

    const portfolio = await SheetsAPI.getPortfolio();
    // 매칭 우선순위: ① 티커(종목코드)가 양쪽에 있으면 티커로 정확 매칭
    //              ② 티커가 없으면 종목명 + 명의(명의 비면 와일드카드)
    // 과거엔 종목명만으로 매칭해 동명이종목(예: 같은 이름의 국내/해외)이 잘못 합쳐졌다.
    const wantTicker = (trade.ticker || '').trim();
    const ownerMatches = (p) => (!trade.owner || !p.owner || p.owner === trade.owner);
    const match =
      (wantTicker && portfolio.find(p => (p.ticker || '').trim() === wantTicker && ownerMatches(p))) ||
      portfolio.find(p => p.name === trade.name && ownerMatches(p));

    if (trade.type === '매도') {
      if (!match) return 'skipped'; // 보유하지 않은 종목 → 반영 생략
      const newQty = (match.qty || 0) - qty;
      if (newQty <= 1e-9) {
        await SheetsAPI.deletePortfolio(match.rowIndex); // 전량 매도 → 리스트에서 삭제
        return 'removed';
      }
      // 매도 시 평균단가는 유지, 수량만 차감
      await SheetsAPI.updatePortfolio(match.rowIndex, {
        name: match.name, ticker: match.ticker, market: match.market,
        qty: newQty, avgPrice: match.avgPrice, owner: match.owner, memo: match.memo,
      });
      return 'updated';
    }

    // 매수 (기본)
    if (match) {
      const totalQty = (match.qty || 0) + qty;
      const newAvg = totalQty > 0
        ? Math.round(((match.qty || 0) * (match.avgPrice || 0) + qty * price) / totalQty)
        : price;
      await SheetsAPI.updatePortfolio(match.rowIndex, {
        name: match.name,
        ticker: match.ticker || trade.ticker || '',
        market: match.market || trade.market || '',
        qty: totalQty, avgPrice: newAvg,
        owner: match.owner || trade.owner || '',
        memo: match.memo,
      });
      return 'updated';
    }

    // 신규 종목 → 포트폴리오에 추가 (현재가/수익률/비중은 GOOGLEFINANCE 수식 자동 생성)
    await SheetsAPI.appendPortfolio({
      name: trade.name,
      ticker: trade.ticker || '',
      market: trade.market || '',
      qty, avgPrice: price,
      owner: trade.owner || '',
      memo: '매매일지 자동 반영',
    });
    return 'added';
  }
  async function saveAnalysis(row) {
    await SheetsAPI.appendAnalysis(row);
    _analysisHistory.push(row);
  }
  async function saveFilter(row) {
    await SheetsAPI.appendFilter(row);
  }
  async function applyFormulasToPortfolio() {
    await SheetsAPI.applyFormulasToPortfolio();
    await loadAll();
  }
  async function restorePortfolioFromBackup() {
    await SheetsAPI.restorePortfolioFromBackup();
    await loadAll();
  }

  async function parseHoldingScreenshot(base64Data, mimeType) {
    if (!_hasGeminiAuth()) {
      throw new Error('Gemini 인증이 없습니다. 구글 로그인(OAuth) 또는 API 키를 설정해주세요.');
    }

    const systemPrompt = `당신은 이미지 분석 및 금융 데이터 추출 전문가입니다. 
제시된 이미지는 사용자의 증권사 계좌 보유 종목 잔고 화면(스마트폰 MTS 또는 PC HTS 스크린샷)입니다.
이미지에서 보유 주식 및 ETF 종목들을 분석하여 다음 JSON 스키마를 만족하는 배열을 추출해주세요:
[
  {
    "name": "종목명",
    "ticker": "6자리 종목코드 (알 수 없는 해외 주식의 경우 AAPL/TSLA 등 알파벳 티커, 확인 불가능시 빈 문자열)",
    "market": "코스피, 코스닥, 나스닥, NYSE 중 판별하여 작성. 모호하거나 모를 시 '기타'",
    "qty": 보유 수량 (실수형 숫자, 소수점 이하 자리수가 있다면 반드시 소수로 추출하세요. 예: 1.886, 91.127),
    "avgPrice": 평균 단가 (숫자, 소수점 이하가 있다면 반드시 소수로 추출하세요. 아래의 역산 지침 참고),
    "curPrice": 현재가 (숫자, 소수점 이하가 있다면 소수로 추출하세요. 아래의 역산 지침 참고),
    "memo": "해당 증권사 이름 (예: 미래에셋, 키움, 토스, 한국투자 등)"
  }
]

⚠️ **평균단가(avgPrice) 및 현재가(curPrice) 역산 지침**:
1. **평균단가 직접 추출**: 이미지에 평균단가(매입단가)가 적혀 있다면 그대로 숫자로 추출합니다.
2. **역산(Back-calculation) 적용**: 이미지상에서 평균단가(또는 현재가)를 직접 찾을 수 없거나 판독이 어렵다면, 이미지에 있는 평가금액(또는 평가자산), 보유수량, 수익률(%), 평가손익(원화 금액) 정보를 종합하여 다음과 같이 계산(역산)해서 평균단가를 구하세요:
   - 평가금액(V_eval) = 보유수량(qty) * 현재가(curPrice)
   - 평가손익(pnl) = 평가금액(V_eval) - 매입금액(V_purchase)
   - 수익률(yield_pct) = (평가손익 / 매입금액) * 100
   - 공식 A: 평균단가(avgPrice) = (평가금액 - 평가손익) / 보유수량
   - 공식 B: 평균단가(avgPrice) = 현재가 / (1 + (수익률 / 100))
   - 공식 C: 현재가(curPrice) = 평가금액 / 보유수량 (이미지에 현재가 정보가 직접 기재되어 있지 않은 경우 활용)
   - 예시: 평가금액 1,097,913원, 보유수량 2.78주, 수익률 +32.5%인 경우:
     * 현재가 = 1,097,913 / 2.78 = 394,932.7원
     * 평균단가 = 394,932.7 / (1 + 0.325) = 298,062.4원
   - 예시: 평가금액 6,781,500원, 보유수량 33주, 수익률 +27.63%인 경우:
     * 현재가 = 6,781,500 / 33 = 205,500원
     * 평균단가 = 205,500 / 1.2763 = 161,012.3원
3. **기본값**: 위 정보를 모두 찾을 수 없어 역산할 수 없는 경우에만 평균단가를 현재가와 동일하게 처리하세요.

⚠️ **주의사항 (반드시 준수)**:
1. **소수점(실수) 수량 파싱**: 해외 소수점 주식이나 소수점 투자 수량(예: 1.886주, 91.127주 등)에서 마침표(.)를 천 단위 구분 기호와 혼동하지 마세요. 소수점 이하 자리가 있으면 반드시 소수형 숫자(float)로 추출하셔야 합니다. 91.127을 91127로 파싱해서는 절대 안 됩니다.
2. 평균 단가(avgPrice) 및 현재가(curPrice)에 소수점 기호(.)가 들어간 경우도 마찬가지로 정확한 소수(float)로 추출해 주십시오. (예: 38.557)
3. 텍스트 설명이나 마크업 기호(예: \`\`\`json) 없이 오직 유효한 JSON 배열만 반환하세요.`;

    const body = {
      contents: [{
        parts: [
          { text: systemPrompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 }
      }
    };

    const visionModel = window.TOOCHANGI_CONFIG.GEMINI_MODEL_VISION;
    // 429 시 retryDelay/Retry-After 존중 재시도 + 실패 본문(쿼터 상세) 노출
    const res = await _geminiGenerate(visionModel, body, '화면판독');
    const data = await res.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error('판독된 데이터를 받지 못했습니다.');

    try {
      return JSON.parse(resultText.trim());
    } catch (e) {
      console.error('JSON 파싱 실패:', resultText);
      throw new Error('판독 데이터가 유효한 JSON 포맷이 아닙니다.');
    }
  }

  return {
    loadAll,
    calcPortfolioMetrics,
    evaluateFilter, updateFilterSignal, evaluateFinalVerdict,
    runGeminiAnalysis,
    runAutoRecommendation,
    runEconomyVideoSummary, getLatestVideoSummary, getVideoSummaryHistory,
    getGeminiAuthStatus, listAvailableModels,
    getLatestRecommendation, getRecommendationHistory, saveRecommendation,
    renderAllocationChart,
    renderMarketAllocationChart,
    getPortfolio, getTradeLog, getAnalysis, getGachangiData, getGachangiAccounts, getSavings, getRealEstate, calcSavingsBalance,
    addPortfolio, updatePortfolio, deletePortfolio, updatePortfolioRows, deletePortfolioRows, addTrade, saveAnalysis, saveFilter, applyFormulasToPortfolio, restorePortfolioFromBackup,
    addSavings, updateSavings, deleteSavings, updateSavingsRows, deleteSavingsRows, restoreSavingsFromBackup,
    addRealEstate, updateRealEstate, deleteRealEstate, updateRealEstateRows, deleteRealEstateRows,
    getAssetHistory, reloadAssetHistory, calcAssetMetrics, syncPortfolioAssets, renderLiveAssetAllocationChart, renderNetWorthTrendChart,
    parseHoldingScreenshot
  };
})();
