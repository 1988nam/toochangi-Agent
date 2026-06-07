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

  // ── Gemini AI 분석 ──────────────────────────────────────────────
  async function runGeminiAnalysis(query) {
    const apiKey = window.TOOCHANGI_CONFIG.GEMINI_API_KEY;
    if (!apiKey || apiKey.startsWith('YOUR_')) {
      return '⚠️ Gemini API 키가 설정되지 않았습니다. js/config.js의 GEMINI_API_KEY를 설정해주세요.';
    }

    const stocksSummary = _portfolio.length > 0
      ? _portfolio.map(p => `- ${p.name}(${p.ticker}): ${p.qty}주, 평단 ${p.avgPrice.toLocaleString()}원, 현재가 ${(p.curPrice||p.avgPrice).toLocaleString()}원 (비중 ${(p._weight || 0).toFixed(1)}%, 용도: ${p.memo || '투자'})`).join('\n')
      : '- 보유 주식 없음';

    const savingsSummary = _savings.length > 0
      ? _savings.map(s => `- ${s.name}(${s.bank}, 명의 ${s.owner || '미지정'}): 잔액 ${calcSavingsBalance(s).toLocaleString()}원${(parseFloat(s.monthlyDeposit) || 0) > 0 ? `(매월 ${(parseFloat(s.monthlyDeposit) || 0).toLocaleString()}원 자동납입)` : ''}, 금리 ${s.rate}%, 만기일 ${s.maturity || '없음'}, 용도: ${s.purpose}`).join('\n')
      : '- 보유 예적금 없음';

    const realEstateSummary = _realEstate.length > 0
      ? _realEstate.map(r => `- ${r.name}: 매입가 ${r.purchasePrice.toLocaleString()}원, 현재가 ${r.currentValue.toLocaleString()}원, 담보대출 ${r.loanAmount.toLocaleString()}원(금리 ${r.loanRate}%), 전세보증금 ${r.deposit.toLocaleString()}원, 연간유지비/이자 ${r.maintenance.toLocaleString()}원, 용도: ${r.purpose}`).join('\n')
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

    const systemPrompt = `당신은 투챙이 - 흰챙이 가족의 AI 투자 비서입니다.

구글 검색 기능 연동 (Google Search Grounding):
- 당신에게는 실시간 인터넷 검색 기능이 주어져 있습니다. 질문에 나타난 종목에 대해 실시간 네이버/구글 뉴스 보도 내용 및 유튜브(YouTube) 영상 여론/댓글 트렌드, 시장 토론방 분위기를 적극적으로 검색하여 분석에 반영하세요.

[흰챙이 커스텀 자산 운용 가이드라인 & 원칙]
${strategyContext}

[현재 가구 전체 자산 현황]
${assetSummary}

${gachangiContext}

질문에 대해 구체적이고 실행 가능한 투자 의견을 한국어로 답하세요.
분석 시 3단계 필터 기준을 명시하고, 투자 의견(매수/매도/관망)과 기간(단기/중기/장기)을 반드시 포함하세요.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${window.TOOCHANGI_CONFIG.GEMINI_MODEL_ANALYSIS}:generateContent?key=${apiKey}`;
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: query }] }],
      tools: [{ googleSearch: {} }], // Enables Google Search Grounding for real-time news/YouTube search
      generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Gemini API 오류: ${res.status}`);
    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || '분석 결과를 받지 못했습니다.';
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map(c => {
      if (c.web) {
        return { title: c.web.title, url: c.web.uri };
      }
      return null;
    }).filter(Boolean);
    return { text, sources };
  }

  // ── 자동 투자 추천 ──────────────────────────────────────────────
  // KIS 거래량 데이터 + Google Search Grounding(뉴스/유튜브) + 포트폴리오 + 전략 Context를
  // 통합하여 흰챙이 가족 원칙에 맞는 종목을 자동 발굴·추천하는 함수
  async function runAutoRecommendation() {
    const apiKey = window.TOOCHANGI_CONFIG.GEMINI_API_KEY;
    if (!apiKey || apiKey.startsWith('YOUR_')) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.');
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

    // 유튜브 채널 로드 및 RSS 피드 실시간 조회
    let youtubeChannels = [];
    try {
      const stored = localStorage.getItem('toochangi_youtube_channels');
      if (stored) {
        youtubeChannels = JSON.parse(stored);
      } else {
        youtubeChannels = window.TOOCHANGI_CONFIG.DEFAULT_YOUTUBE_CHANNELS || [];
      }
    } catch (e) {
      console.error('[AutoRec] YouTube 채널 로드 실패:', e);
      youtubeChannels = window.TOOCHANGI_CONFIG.DEFAULT_YOUTUBE_CHANNELS || [];
    }

    let youtubeFeedText = '';
    if (youtubeChannels.length > 0) {
      const fetchPromises = youtubeChannels.map(async (ch) => {
        try {
          const res = await fetch(`/api/youtube-rss?channelId=${ch.id}`);
          if (!res.ok) throw new Error(`Status ${res.status}`);
          const data = await res.json();
          return { name: ch.name, entries: data.entries || [] };
        } catch (err) {
          console.warn(`[AutoRec] YouTube feed fetch failed for ${ch.name} (${ch.id}):`, err.message);
          return { name: ch.name, entries: [], error: err.message };
        }
      });

      try {
        const settled = await Promise.allSettled(fetchPromises);
        const feeds = settled
          .filter(s => s.status === 'fulfilled')
          .map(s => s.value);

        const feedLines = [];
        feeds.forEach(f => {
          if (f.entries && f.entries.length > 0) {
            feedLines.push(`- ${f.name}:`);
            f.entries.slice(0, 3).forEach(entry => {
              const dateStr = entry.published ? entry.published.substring(0, 10) : '';
              feedLines.push(`  * "${entry.title}" (${dateStr})`);
            });
          }
        });
        if (feedLines.length > 0) {
          youtubeFeedText = `[구독 유튜브 채널 실시간 피드 (최신 업로드)]\n${feedLines.join('\n')}`;
        } else {
          youtubeFeedText = '[구독 유튜브 채널 실시간 피드] 유튜브 피드 데이터를 가져오지 못했습니다.';
        }
      } catch (err) {
        console.error('[AutoRec] YouTube RSS 전체 조회 중 오류:', err);
        youtubeFeedText = '[구독 유튜브 채널 실시간 피드] 피드 조회 중 에러가 발생했습니다.';
      }
    } else {
      youtubeFeedText = '[구독 유튜브 채널 실시간 피드] 구독 중인 유튜브 채널이 없습니다.';
    }

    const stocksSummary = _portfolio.length > 0
      ? _portfolio.map(p => `- ${p.name}(${p.ticker}): ${p.qty}주, 평단 ${p.avgPrice.toLocaleString()}원, 현재가 ${(p.curPrice||p.avgPrice).toLocaleString()}원 (비중 ${(p._weight || 0).toFixed(1)}%, 용도: ${p.memo || '투자'})`).join('\n')
      : '- 보유 주식 없음';

    const savingsSummary = _savings.length > 0
      ? _savings.map(s => `- ${s.name}(${s.bank}, 명의 ${s.owner || '미지정'}): 잔액 ${calcSavingsBalance(s).toLocaleString()}원${(parseFloat(s.monthlyDeposit) || 0) > 0 ? `(매월 ${(parseFloat(s.monthlyDeposit) || 0).toLocaleString()}원 자동납입)` : ''}, 금리 ${s.rate}%, 만기일 ${s.maturity || '없음'}, 용도: ${s.purpose}`).join('\n')
      : '- 보유 예적금 없음';

    const realEstateSummary = _realEstate.length > 0
      ? _realEstate.map(r => `- ${r.name}: 매입가 ${r.purchasePrice.toLocaleString()}원, 현재가 ${r.currentValue.toLocaleString()}원, 담보대출 ${r.loanAmount.toLocaleString()}원(금리 ${r.loanRate}%), 전세보증금 ${r.deposit.toLocaleString()}원, 연간유지비/이자 ${r.maintenance.toLocaleString()}원, 용도: ${r.purpose}`).join('\n')
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
      if (marketData.indices) {
        const idxLines = Object.entries(marketData.indices)
          .map(([k, v]) => `  ${k}: ${v.current} (${v.rate}%)`)
          .join('\n');
        kisSection += `\n\n[코스피/코스닥 지수]\n${idxLines}`;
      }
    } else {
      kisSection = '[KIS 거래량 데이터] KIS 미연동 또는 모의환경 — 아래 검색 지시에 따라 직접 검색하세요.';
    }

    // ── Gemini 프롬프트 구성 ──────────────────────────────────────
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

    const systemPrompt = `당신은 투챙이 - 흰챙이 가족의 AI 자동 투자 발굴 엔진입니다.
실시간 인터넷 검색 기능(Google Search Grounding)이 활성화되어 있습니다.

[흰챙이 커스텀 자산 운용 가이드라인]
${strategyContext}`;

    const userPrompt = `오늘(${today}) 기준으로 투자 검토할 만한 종목을 자동 발굴·추천해주세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[현재 가구 전체 자산 현황]
  ${assetSummary}

[가계부 현황]
  ${gachangiContext}

${kisSection}

${youtubeFeedText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[필수 검색 지시 — 아래 항목을 Google Search로 반드시 검색하세요]
1. 오늘 국내외 주요 증시 특징 및 거래량 급등 테마/섹터 뉴스 검색
2. 위 구독 유튜브 채널의 실시간 피드에 기록된 최신 영상 주제들을 면밀히 파악하고, 최근 시장 여론과 주목받는 종목들을 추천 후보군에 적극 반영하십시오.
3. 위 KIS 거래량 상위 종목들의 급등 원인(공시, 실적, 이슈) 검색
4. 미국 시장(S&P500, 나스닥) 오늘 주요 이슈 및 ETF 자금 흐름 검색
5. 현재 ISA 계좌에 담기 적합한 국내 ETF 트렌드 검색

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

마지막에 **[오늘의 시장 총평]** 섹션도 100자 내외로 추가해주세요.`;

    // ── Gemini API 호출 ────────────────────────────────────────────
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${window.TOOCHANGI_CONFIG.GEMINI_MODEL_RECOMMEND}:generateContent?key=${apiKey}`;
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 3000 },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Gemini API 오류: ${res.status}`);
    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || '추천 결과를 받지 못했습니다.';
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map(c => c.web ? { title: c.web.title, url: c.web.uri } : null).filter(Boolean);

    return {
      text,
      sources,
      hadKisData: !!(marketData && marketData.volumeRank?.length > 0),
      generatedAt: new Date().toLocaleString('ko-KR')
    };
  }

  // ── Chart.js 렌더링 ──────────────────────────────────────────────
  let _chartAllocation = null;
  let _chartPortfolioAllocation = null;
  let _chartPortfolioMarketAllocation = null;
  let _chartMonthly    = null;

  function renderCharts() {
    renderAllocationChart();
    renderAssetPortfolioChart();
  }

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

  function renderAssetPortfolioChart() {
    const ctx = document.getElementById('chart-monthly-yield');
    if (!ctx) return;
    if (_chartMonthly) _chartMonthly.destroy();

    // 자산 포트폴리오 비중: 주식 / 현금 / 부동산(순자산)
    const metrics = calcPortfolioMetrics();
    const stockValue = metrics.totalValue || 0;
    const cashValue = (_savings || []).reduce((sum, s) => sum + calcSavingsBalance(s), 0);
    const realEstateNet = (_realEstate || []).reduce((sum, r) => {
      const value = parseFloat(r.currentValue) || 0;
      const loanAmount = parseFloat(r.loanAmount) || 0;
      // 부동산 메뉴/대시보드와 동일하게 '남은 대출잔액' 기준. 계산 불가 시 원래 대출액으로 폴백.
      let loan = loanAmount;
      if (loanAmount > 0 && typeof calculateLoanProgress === 'function') {
        const progress = calculateLoanProgress(r);
        if (progress && progress.remainingBalance != null) loan = progress.remainingBalance;
      }
      return sum + (value - loan);
    }, 0);

    const entries = [
      { label: '주식 자산',   value: stockValue,    color: '#8b5cf6' },
      { label: '현금 자산',   value: cashValue,     color: '#3b82f6' },
      { label: '부동산 자산', value: realEstateNet, color: '#f59e0b' },
    ].filter(e => e.value > 0);

    const total = entries.reduce((s, e) => s + e.value, 0);

    const labels = entries.length > 0 ? entries.map(e => e.label) : ['등록된 자산 없음'];
    const data   = entries.length > 0 ? entries.map(e => e.value) : [1];
    const colors = entries.length > 0 ? entries.map(e => e.color) : ['#374151'];

    _chartMonthly = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#111827' }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', font: { family: 'Outfit', size: 12 }, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: ctx => {
                if (ctx.label === '등록된 자산 없음') return ctx.label;
                const pct = total > 0 ? (ctx.raw / total * 100).toFixed(1) : '0.0';
                return `${ctx.label}: ${Math.floor(ctx.raw).toLocaleString()}원 (${pct}%)`;
              },
            },
          },
        },
        cutout: '65%',
      },
    });
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

  function renderAssetCharts(selectedMonthKey) {
    renderAssetAllocationChart(selectedMonthKey);
    renderNetWorthTrendChart();
  }

  function renderAssetAllocationChart(selectedMonthKey) {
    const ctx = document.getElementById('chart-asset-allocation');
    if (!ctx) return;
    if (_chartAssetAllocation) _chartAssetAllocation.destroy();

    const monthEntries = _assetHistory.filter(a => a.date && a.date.startsWith(selectedMonthKey) && a.category !== '대출(부채)');
    const catTotals = {};
    monthEntries.forEach(a => {
      catTotals[a.category] = (catTotals[a.category] || 0) + a.balance;
    });

    const labels = Object.keys(catTotals);
    const data = Object.values(catTotals);

    if (labels.length === 0) {
      labels.push('등록된 자산 없음');
      data.push(1);
    }

    const colors = [
      '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b',
      '#ef4444', '#06b6d4', '#ec4899', '#84cc16'
    ];

    _chartAssetAllocation = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#111827' }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', font: { family: 'Outfit', size: 11 }, boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const val = ctx.raw;
                if (ctx.label === '등록된 자산 없음') return ctx.label;
                return `${ctx.label}: ${val.toLocaleString()}원`;
              }
            }
          }
        },
        cutout: '60%',
      },
    });
  }

  function renderNetWorthTrendChart() {
    const ctx = document.getElementById('chart-networth-trend');
    if (!ctx) return;
    if (_chartNetWorthTrend) _chartNetWorthTrend.destroy();

    const monthsMap = {};
    _assetHistory.forEach(a => {
      if (!a.date) return;
      const monthKey = a.date.substring(0, 7); // "YYYY-MM"
      if (!monthsMap[monthKey]) {
        monthsMap[monthKey] = { assets: 0, debt: 0 };
      }
      if (a.category === '대출(부채)') {
        monthsMap[monthKey].debt += a.balance;
      } else {
        monthsMap[monthKey].assets += a.balance;
      }
    });

    const sortedMonths = Object.keys(monthsMap).sort().slice(-6);
    const netWorthData = sortedMonths.map(m => monthsMap[m].assets - monthsMap[m].debt);
    const assetData = sortedMonths.map(m => monthsMap[m].assets);

    const labels = sortedMonths.map(m => {
      const parts = m.split('-');
      return `${parts[0].substring(2)}-${parts[1]}`;
    });

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
  function calcSavingsBalance(s) {
    const base = parseFloat(s.balance) || 0;
    const monthly = parseFloat(s.monthlyDeposit) || 0;
    if (monthly <= 0) return base;
    const day = parseInt(s.depositDay, 10) || 0;
    if (!day) return base;
    const start = _parseSavingsDate(s.depositStartDate);
    if (!start) return base;
    let end = new Date();
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
    // 종목명 + 명의로 매칭 (명의가 비어 있으면 와일드카드 취급)
    const match = portfolio.find(p =>
      p.name === trade.name &&
      (!trade.owner || !p.owner || p.owner === trade.owner)
    );

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
    const apiKey = window.TOOCHANGI_CONFIG.GEMINI_API_KEY;
    if (!apiKey || apiKey.startsWith('YOUR_')) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.');
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${window.TOOCHANGI_CONFIG.GEMINI_MODEL_VISION}:generateContent?key=${apiKey}`;
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
        temperature: 0.1
      }
    };

    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // 429 (Rate Limit) 에러 발생 시 7초 대기 후 1회 자동 재시도
    if (res.status === 429) {
      console.warn('[Gemini API] 429 사용량 초과 감지. 7초 대기 후 재시도합니다...');
      await new Promise(resolve => setTimeout(resolve, 7000));
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    if (!res.ok) throw new Error(`Gemini API 오류: ${res.status}`);
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
    renderCharts,
    renderAllocationChart,
    renderMarketAllocationChart,
    getPortfolio, getTradeLog, getAnalysis, getGachangiData, getGachangiAccounts, getSavings, getRealEstate, calcSavingsBalance,
    addPortfolio, updatePortfolio, deletePortfolio, updatePortfolioRows, deletePortfolioRows, addTrade, saveAnalysis, saveFilter, applyFormulasToPortfolio, restorePortfolioFromBackup,
    addSavings, updateSavings, deleteSavings, updateSavingsRows, deleteSavingsRows, restoreSavingsFromBackup,
    addRealEstate, updateRealEstate, deleteRealEstate, updateRealEstateRows, deleteRealEstateRows,
    getAssetHistory, calcAssetMetrics, syncPortfolioAssets, renderAssetCharts,
    parseHoldingScreenshot
  };
})();
