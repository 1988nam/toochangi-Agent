/**
 * 투챙이 - 핵심 투자 분석 로직
 * 포트폴리오 계산, 3단계 필터, Gemini AI 분석, Chart.js 시각화
 */
const Toochangi = (() => {

  let _portfolio = [];
  let _tradelog  = [];
  let _analysisHistory = [];
  let _gachangiData = null;

  // ── 데이터 로드 ─────────────────────────────────────────────────
  async function loadAll() {
    try {
      [_portfolio, _tradelog, _analysisHistory, _gachangiData] = await Promise.all([
        SheetsAPI.getPortfolio(),
        SheetsAPI.getTradeLog(),
        SheetsAPI.getAnalysisHistory(),
        SheetsAPI.getGachangiMonthlySavings(),
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
    const apiKey = TOOCHANGI_CONFIG.GEMINI_API_KEY;
    if (!apiKey || apiKey.startsWith('YOUR_')) {
      return '⚠️ Gemini API 키가 설정되지 않았습니다. js/config.js의 GEMINI_API_KEY를 설정해주세요.';
    }

    const portfolioSummary = _portfolio.length > 0
      ? _portfolio.map(p => `${p.name}(${p.ticker}): ${p.qty}주 평단${p.avgPrice.toLocaleString()}원`).join(', ')
      : '현재 보유 종목 없음';

    const gachangiContext = _gachangiData
      ? `이번 달 가계부 현황 - 수입: ${_gachangiData.income.toLocaleString()}원, 지출: ${_gachangiData.expense.toLocaleString()}원, 월 저축액: ${_gachangiData.savings.toLocaleString()}원`
      : '';

    const systemPrompt = `당신은 투챙이 - 흰챙이 가족의 AI 투자 비서입니다.

투자 원칙:
- 3단계 필터 원칙: ①시장흐름 ②섹터흐름 ③개별종목 모두 충족 시 매수
- 안전자산 30%, 위험자산 70% 원칙
- 국내 주식 중심, 장기 우상향 관점
- 2033년 상급지 주택 이전을 위한 시드 구축이 목표
- 2026년 출산 예정으로 유동성 주의

현재 포트폴리오: ${portfolioSummary}
${gachangiContext}

질문에 대해 구체적이고 실행 가능한 투자 의견을 한국어로 답하세요.
분석 시 3단계 필터 기준을 명시하고, 투자 의견(매수/매도/관망)과 기간(단기/중기/장기)을 반드시 포함하세요.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TOOCHANGI_CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: query }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Gemini API 오류: ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '분석 결과를 받지 못했습니다.';
  }

  // ── Chart.js 렌더링 ──────────────────────────────────────────────
  let _chartAllocation = null;
  let _chartMonthly    = null;

  function renderCharts() {
    renderAllocationChart();
    renderMonthlyChart();
  }

  function renderAllocationChart() {
    const ctx = document.getElementById('chart-allocation');
    if (!ctx) return;
    if (_chartAllocation) _chartAllocation.destroy();

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

    _chartAllocation = new Chart(ctx, {
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

  function renderMonthlyChart() {
    const ctx = document.getElementById('chart-monthly-yield');
    if (!ctx) return;
    if (_chartMonthly) _chartMonthly.destroy();

    // 매매일지에서 월별 수익률 계산 (더미 데이터로 시작)
    const months = ['1월','2월','3월','4월','5월','6월'];
    const yields = months.map(() => (Math.random() * 6 - 2).toFixed(2));

    _chartMonthly = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{
          label: '월별 수익률(%)',
          data: yields,
          backgroundColor: yields.map(v => parseFloat(v) >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'),
          borderColor:     yields.map(v => parseFloat(v) >= 0 ? '#10b981' : '#ef4444'),
          borderWidth: 1, borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { family: 'Outfit' } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: {
            ticks: { color: '#94a3b8', font: { family: 'Outfit' }, callback: v => `${v}%` },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
        },
      },
    });
  }

  // ── getters ──────────────────────────────────────────────────────
  function getPortfolio() { return _portfolio; }
  function getTradeLog()  { return _tradelog; }
  function getAnalysis()  { return _analysisHistory; }
  function getGachangiData() { return _gachangiData; }

  async function addPortfolio(row) {
    await SheetsAPI.appendPortfolio(row);
    await loadAll();
  }
  async function addTrade(row) {
    await SheetsAPI.appendTrade(row);
    await loadAll();
  }
  async function saveAnalysis(row) {
    await SheetsAPI.appendAnalysis(row);
    _analysisHistory.push(row);
  }
  async function saveFilter(row) {
    await SheetsAPI.appendFilter(row);
  }

  return {
    loadAll,
    calcPortfolioMetrics,
    evaluateFilter, updateFilterSignal, evaluateFinalVerdict,
    runGeminiAnalysis,
    renderCharts,
    getPortfolio, getTradeLog, getAnalysis, getGachangiData,
    addPortfolio, addTrade, saveAnalysis, saveFilter,
  };
})();
