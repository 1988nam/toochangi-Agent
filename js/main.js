/**
 * 투챙이 - 메인 진입점
 * UI 이벤트 바인딩, 탭 라우팅, 데이터 렌더링
 */

// ── Google API 콜백 ─────────────────────────────────────────────
window.gapiLoaded = () => Auth.initGapi();
window.gisLoaded  = () => Auth.initGis();

// ── 앱 초기화 ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindLoginEvents();
  bindNavEvents();
  bindFilterEvents();
  bindModalEvents();
  bindAnalysisEvents();
  bindTopbarEvents();

  Auth.onLogin(user => onLoginSuccess(user));
});

function bindLoginEvents() {
  document.getElementById('login-btn').addEventListener('click', () => Auth.login());
  document.getElementById('logout-btn').addEventListener('click', () => {
    Auth.logout();
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    toast('로그아웃 되었습니다.', 'info');
  });
}

// ── 로그인 성공 ────────────────────────────────────────────────
async function onLoginSuccess(user) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-name-sidebar').textContent = user.name || '흰챙이';

  toast('🔮 투챙이에 연결되었습니다!', 'success');

  // 시트 초기 설정 확인
  const sheetId = localStorage.getItem('toochangi_sheet_id') || TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
  if (!sheetId || sheetId.startsWith('YOUR_')) {
    toast('📋 처음 사용 시 상단 "시트 초기화" 버튼을 눌러주세요!', 'info', 5000);
  } else {
    TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID = sheetId;
    await refreshAll();
  }
}

// ── 데이터 새로고침 ─────────────────────────────────────────────
async function refreshAll() {
  toast('📊 데이터 로드 중...', 'info');
  try {
    await Toochangi.loadAll();
    renderDashboard();
    renderPortfolioTab();
    renderTradelogTab();
    renderAnalysisTab();
    document.getElementById('last-updated').textContent =
      `최종 업데이트: ${new Date().toLocaleTimeString('ko-KR')}`;
    toast('✅ 데이터 업데이트 완료', 'success');
  } catch (e) {
    console.error('[Main] 새로고침 실패:', e);
    toast('⚠️ 데이터 로드 실패', 'error');
  }
}

// ── 탭 라우팅 ────────────────────────────────────────────────────
function bindNavEvents() {
  document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('go-analysis-btn')?.addEventListener('click', () => switchTab('analysis'));
}

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

  const panel = document.getElementById(`tab-${tab}`);
  const nav   = document.getElementById(`nav-${tab}`);
  if (panel) panel.classList.remove('hidden');
  if (nav)   nav.classList.add('active');

  const titles = {
    dashboard: '대시보드', portfolio: '포트폴리오',
    filter: '3단계 필터', tradelog: '매매일지',
    analysis: 'AI 분석', broker: '증권사 연동',
  };
  document.getElementById('page-title').textContent = titles[tab] || tab;

  if (tab === 'dashboard') Toochangi.renderCharts();
}

// ══════════════════════════════════════════════════════════════
// ── 대시보드 렌더링 ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function renderDashboard() {
  const metrics = Toochangi.calcPortfolioMetrics();
  const gaData  = Toochangi.getGachangiData();

  // 총 투자 자산
  document.getElementById('m-total-asset').textContent =
    metrics.totalValue > 0 ? `${metrics.totalValue.toLocaleString()}원` : '—';
  document.getElementById('m-total-asset-sub').textContent =
    metrics.totalPnL !== 0
      ? `평가손익 ${metrics.totalPnL >= 0 ? '+' : ''}${metrics.totalPnL.toLocaleString()}원`
      : '포트폴리오를 입력해주세요';

  // 총 수익률
  const yieldEl = document.getElementById('m-total-yield');
  yieldEl.textContent = metrics.totalYield !== 0 ? `${metrics.totalYield >= 0 ? '+' : ''}${metrics.totalYield.toFixed(2)}%` : '—';
  yieldEl.style.color = metrics.totalYield >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

  // 이번 달 투자 가능액 (가챙이 연동)
  const availEl = document.getElementById('m-available');
  if (gaData) {
    const avail = Math.max(0, gaData.available);
    availEl.textContent = `${avail.toLocaleString()}원`;
    document.getElementById('m-total-asset-sub').textContent = `가챙이 월 저축: ${gaData.savings.toLocaleString()}원`;
  } else {
    availEl.textContent = '—';
  }

  // 3단계 신호 요약
  const signalEl = document.getElementById('m-signal');
  signalEl.textContent = '체크 필요';
  signalEl.style.color = 'var(--accent-orange)';

  // 차트 렌더링
  Toochangi.renderCharts();

  // 최근 분석 미리보기
  renderRecentAnalysis();
}

function renderRecentAnalysis() {
  const list = document.getElementById('recent-analysis-list');
  const history = Toochangi.getAnalysis().slice(-3).reverse();
  if (history.length === 0) {
    list.innerHTML = '<div class="empty-state">분석 기록이 없습니다</div>';
    return;
  }
  list.innerHTML = history.map(a => `
    <div class="analysis-item">
      <div class="analysis-item-header">
        <span class="analysis-item-date">${a.date}</span>
        ${a.opinion ? `<span class="badge-${a.opinion === '매수' ? 'buy' : 'sell'}">${a.opinion}</span>` : ''}
      </div>
      <div class="analysis-item-query">${a.query}</div>
      <div class="analysis-item-preview">${a.result}</div>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════════════════
// ── 포트폴리오 탭 렌더링 ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function renderPortfolioTab() {
  const tbody = document.getElementById('portfolio-tbody');
  const portfolio = Toochangi.getPortfolio();
  if (portfolio.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">종목을 추가해주세요</td></tr>';
    return;
  }
  tbody.innerHTML = portfolio.map(p => {
    const yieldStr = p._yield >= 0 ? `+${p._yield.toFixed(2)}%` : `${p._yield.toFixed(2)}%`;
    const yieldClass = p._yield >= 0 ? 'pos' : 'neg';
    return `<tr>
      <td>${p.name}</td>
      <td style="color:var(--text-muted)">${p.ticker}</td>
      <td style="color:var(--text-muted)">${p.market}</td>
      <td>${p.qty.toLocaleString()}</td>
      <td>${p.avgPrice.toLocaleString()}원</td>
      <td>${(p.curPrice || p.avgPrice).toLocaleString()}원</td>
      <td>${(p._value || 0).toLocaleString()}원</td>
      <td class="${yieldClass}">${yieldStr}</td>
      <td style="color:var(--text-muted)">${(p._weight || 0).toFixed(1)}%</td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// ── 매매일지 탭 렌더링 ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function renderTradelogTab() {
  const tbody = document.getElementById('trade-tbody');
  const tradelog = Toochangi.getTradeLog().reverse();
  if (tradelog.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">매매 기록이 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = tradelog.map(t => `<tr>
    <td>${t.date}</td>
    <td>${t.name}</td>
    <td><span class="${t.type === '매수' ? 'badge-buy' : 'badge-sell'}">${t.type}</span></td>
    <td>${t.qty.toLocaleString()}</td>
    <td>${t.price.toLocaleString()}원</td>
    <td>${t.amount.toLocaleString()}원</td>
    <td style="color:var(--text-muted)">${t.memo || '—'}</td>
  </tr>`).join('');
}

// ══════════════════════════════════════════════════════════════
// ── AI 분석 탭 렌더링 ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function renderAnalysisTab() {
  const historyList = document.getElementById('analysis-history-list');
  const history = Toochangi.getAnalysis().slice().reverse();
  if (history.length === 0) {
    historyList.innerHTML = '<div class="empty-state">저장된 분석이 없습니다</div>';
    return;
  }
  historyList.innerHTML = history.map(a => `
    <div class="analysis-item">
      <div class="analysis-item-header">
        <span class="analysis-item-date">${a.date}</span>
        ${a.opinion ? `<span class="badge-${a.opinion === '매수' ? 'buy' : 'sell'}">${a.opinion}</span>` : ''}
      </div>
      <div class="analysis-item-query">${a.query}</div>
      <div class="analysis-item-preview">${a.result}</div>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════════════════
// ── 3단계 필터 이벤트 ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function bindFilterEvents() {
  // 체크박스 변경 시 실시간 신호 업데이트
  [1,2,3].forEach(i => {
    ['a','b','c'].forEach((_, j) => {
      const chk = document.getElementById(`chk-${i}-${j+1}`);
      if (chk) chk.addEventListener('change', () => {
        const signal = Toochangi.evaluateFilter(i);
        Toochangi.updateFilterSignal(i, signal);
        Toochangi.evaluateFinalVerdict();
      });
    });
  });

  // 저장 버튼
  document.querySelectorAll('.btn-save-filter').forEach(btn => {
    btn.addEventListener('click', async () => {
      const result = Toochangi.evaluateFinalVerdict();
      try {
        await Toochangi.saveFilter({
          signal1: result.s1, signal2: result.s2, signal3: result.s3,
          verdict: result.verdict, memo: '',
        });
        toast('✅ 3단계 필터 결과 저장 완료', 'success');
      } catch (e) {
        toast('⚠️ 저장 실패: ' + e.message, 'error');
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════
// ── 모달 이벤트 ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function bindModalEvents() {
  // 모달 열기
  document.getElementById('add-holding-btn')?.addEventListener('click', () =>
    document.getElementById('modal-holding').classList.remove('hidden'));
  document.getElementById('add-trade-btn')?.addEventListener('click', () => {
    document.getElementById('input-trade-date').value = new Date().toISOString().slice(0,10);
    document.getElementById('modal-trade').classList.remove('hidden');
  });

  // 모달 닫기
  document.querySelectorAll('.modal-close, .btn-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      if (modalId) document.getElementById(modalId).classList.add('hidden');
    });
  });

  // 오버레이 클릭 시 닫기
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  // 종목 저장
  document.getElementById('save-holding-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('input-stock-name').value.trim();
    const qty  = parseFloat(document.getElementById('input-stock-qty').value);
    const avg  = parseFloat(document.getElementById('input-stock-avg').value);
    if (!name || !qty || !avg) { toast('필수 항목을 입력해주세요', 'error'); return; }

    try {
      await Toochangi.addPortfolio({
        name, ticker: document.getElementById('input-stock-ticker').value,
        market: document.getElementById('input-stock-market').value,
        qty, avgPrice: avg,
        curPrice: parseFloat(document.getElementById('input-stock-cur').value) || avg,
      });
      document.getElementById('modal-holding').classList.add('hidden');
      renderPortfolioTab();
      renderDashboard();
      toast(`✅ ${name} 추가 완료`, 'success');
    } catch (e) {
      toast('⚠️ 저장 실패: ' + e.message, 'error');
    }
  });

  // 매매 저장
  document.getElementById('save-trade-btn')?.addEventListener('click', async () => {
    const date  = document.getElementById('input-trade-date').value;
    const name  = document.getElementById('input-trade-stock').value.trim();
    const type  = document.getElementById('input-trade-type').value;
    const qty   = parseFloat(document.getElementById('input-trade-qty').value);
    const price = parseFloat(document.getElementById('input-trade-price').value);
    if (!date || !name || !qty || !price) { toast('필수 항목을 입력해주세요', 'error'); return; }

    try {
      await Toochangi.addTrade({
        date, name, type, qty, price,
        memo: document.getElementById('input-trade-memo').value,
      });
      document.getElementById('modal-trade').classList.add('hidden');
      renderTradelogTab();
      toast(`✅ 매매 기록 저장 완료`, 'success');
    } catch (e) {
      toast('⚠️ 저장 실패: ' + e.message, 'error');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// ── AI 분석 이벤트 ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
let _lastAnalysisResult = null;

function bindAnalysisEvents() {
  const runBtn  = document.getElementById('run-analysis-btn');
  const saveBtn = document.getElementById('save-analysis-btn');

  runBtn?.addEventListener('click', async () => {
    const query = document.getElementById('analysis-input').value.trim();
    if (!query) { toast('분석할 내용을 입력해주세요', 'error'); return; }

    const resultEl = document.getElementById('analysis-result');
    runBtn.disabled = true;
    document.getElementById('analyze-btn-text').textContent = '🔮 분석 중...';
    resultEl.textContent = '⏳ Gemini AI가 분석 중입니다...';
    saveBtn?.classList.add('hidden');

    try {
      const result = await Toochangi.runGeminiAnalysis(query);
      resultEl.textContent = result;
      _lastAnalysisResult = { query, result };
      saveBtn?.classList.remove('hidden');
    } catch (e) {
      resultEl.textContent = `❌ 분석 실패: ${e.message}`;
    } finally {
      runBtn.disabled = false;
      document.getElementById('analyze-btn-text').textContent = '🔮 AI 분석 실행';
    }
  });

  saveBtn?.addEventListener('click', async () => {
    if (!_lastAnalysisResult) return;
    try {
      await Toochangi.saveAnalysis(_lastAnalysisResult);
      renderAnalysisTab();
      saveBtn.classList.add('hidden');
      toast('✅ 분석 결과 시트에 저장 완료', 'success');
    } catch (e) {
      toast('⚠️ 저장 실패: ' + e.message, 'error');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// ── 상단바 이벤트 ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function bindTopbarEvents() {
  document.getElementById('sync-btn')?.addEventListener('click', () => {
    if (Auth.isLoggedIn()) refreshAll();
    else toast('먼저 로그인해주세요', 'error');
  });

  document.getElementById('setup-sheet-btn')?.addEventListener('click', async () => {
    if (!Auth.isLoggedIn()) { toast('먼저 로그인해주세요', 'error'); return; }
    toast('📋 투챙이 시트 생성 중...', 'info');
    try {
      const id = await SheetsAPI.setupToochangiSheet();
      toast(`✅ 투챙이 시트 생성 완료!\n시트 ID: ${id}`, 'success', 6000);
      await refreshAll();
    } catch (e) {
      toast('⚠️ 시트 생성 실패: ' + e.message, 'error');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// ── 토스트 알림 ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
let _toastTimer = null;
function toast(msg, type = 'info', duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}
