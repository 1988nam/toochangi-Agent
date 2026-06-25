/**
 * 투챙이 - 메인 진입점
 * UI 이벤트 바인딩, 탭 라우팅, 데이터 렌더링
 */

// ── XSS 방지: 전역 HTML 이스케이프 ───────────────────────────────
// innerHTML로 렌더링하는 모든 동적/원격 데이터(종목명·뉴스·AI 분석 텍스트·메모·
// 오류 메시지·시트 셀 등)는 반드시 이 함수를 거쳐야 한다. 속성값(title="...") 안전을
// 위해 따옴표(" ')까지 이스케이프한다.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

// ── Google API 콜백 ─────────────────────────────────────────────
window.gapiLoaded = () => Auth.initGapi();
window.gisLoaded  = () => Auth.initGis();

// ── 앱 초기화 ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindLoginEvents();
  bindNavEvents();
  bindFilterEvents();
  bindModalEvents();
  bindAutoAnalysisEvents();
  bindManualAnalysisEvents();
  bindTopbarEvents();
  bindAssetEvents();
  bindSettingsEvents();
  bindAccordions();

  Auth.onLogin(user => onLoginSuccess(user));
});

// 아코디언 토글(이벤트 위임): .rec-hist-item 클릭 시 .rec-hist-full 펼침/접힘 (재렌더돼도 유지)
function _accordionToggle(e) {
  if (e.target.closest('a')) return;            // 링크 클릭은 토글 안 함
  if (e.target.closest('.btn-watch-remove')) return;
  const item = e.target.closest('.rec-hist-item');
  if (!item) return;
  const expanded = item.getAttribute('data-expanded') === '1';
  item.setAttribute('data-expanded', expanded ? '0' : '1');
  const prev = item.querySelector('.rec-hist-preview');
  const full = item.querySelector('.rec-hist-full');
  const arrow = item.querySelector('.rec-hist-arrow');
  if (prev) prev.style.display = expanded ? '' : 'none';
  if (full) full.style.display = expanded ? 'none' : '';
  if (arrow) arrow.textContent = expanded ? '▼' : '▲';
}
function bindAccordions() {
  ['recent-analysis-list', 'rec-history-list', 'news-history-list', 'dash-rec-cards', 'filter-passed-cards']
    .forEach(id => document.getElementById(id)?.addEventListener('click', _accordionToggle));
}

function bindLoginEvents() {
  document.getElementById('login-btn').addEventListener('click', () => Auth.login());
  document.getElementById('logout-btn').addEventListener('click', () => {
    Auth.logout();
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    toast('로그아웃 되었습니다.', 'info');
  });
  document.getElementById('open-config-btn')?.addEventListener('click', () => {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    switchTab('settings');
  });
}

// ── 로그인 성공 ────────────────────────────────────────────────
let _loginHandled = false;
async function onLoginSuccess(user) {
  if (_loginHandled) return; // 캐시 토큰 + 인터랙티브 콜백 중복 호출 시 이중 refreshAll 방지
  _loginHandled = true;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-name-sidebar').textContent = user.name || '흰챙이';

  toast('🔮 투챙이에 연결되었습니다!', 'success');

  // 시트 초기 설정 확인
  const sheetId = localStorage.getItem('toochangi_sheet_id') || window.TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
  if (!sheetId || sheetId.startsWith('YOUR_')) {
    toast('📋 처음 사용 시 상단 "시트 초기화" 버튼을 눌러주세요!', 'info', 5000);
  } else {
    window.TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID = sheetId;
    await refreshAll();
  }
}

function renderSavingsLinkedAccountOptions(selectedAccountNumber = '') {
  const select = document.getElementById('input-savings-linked-account');
  if (!select) return;

  const accounts = Toochangi.getGachangiAccounts ? Toochangi.getGachangiAccounts() : [];
  select.innerHTML = '<option value="">계좌를 선택하세요</option>';

  accounts.forEach((acc) => {
    const option = document.createElement('option');
    option.value = `${acc.accountName || ''}|${acc.accountNumber || ''}|${acc.ownerName || ''}`;
    option.textContent = `[${acc.ownerName || '미지정'}] ${acc.accountName || '계좌명 없음'} (${acc.accountNumber || '계좌번호 없음'})`;
    if ((acc.accountNumber || '') === selectedAccountNumber) option.selected = true;
    select.appendChild(option);
  });
}

function renderGachangiAccountsTable() {
  const tbody = document.getElementById('gachangi-accounts-tbody');
  if (!tbody) return;
  const accounts = Toochangi.getGachangiAccounts ? Toochangi.getGachangiAccounts() : [];
  if (!accounts.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">연동된 보유 계좌가 없습니다</td></tr>';
    return;
  }

  tbody.innerHTML = accounts.map((acc) => `
    <tr>
      <td>${escapeHtml(acc.type || '—')}</td>
      <td>
        <strong>${escapeHtml(acc.accountName || '계좌명 없음')}</strong>
        <div style="font-size:12px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(acc.purpose || '')}</div>
      </td>
      <td>${escapeHtml(acc.accountNumber || '계좌번호 없음')}</td>
      <td>${escapeHtml(acc.ownerName || '미지정')}</td>
    </tr>
  `).join('');
}

// ── 데이터 새로고침 ─────────────────────────────────────────────
async function refreshAll() {
  toast('📊 데이터 로드 중...', 'info');
  try {
    await Toochangi.loadAll();
    renderDashboard();
    renderPortfolioTab();
    renderSavingsTab();
    renderGachangiAccountsTable();
    renderRealestateTab();
    renderSavingsLinkedAccountOptions();
    renderTradelogTab();
    renderManualAnalysisTab();
    renderYouTubeFeed();
    renderNewsHistory();

    const assetsPanel = document.getElementById('tab-assets');
    if (assetsPanel && !assetsPanel.classList.contains('hidden')) {
      initAssetMonthSelector();
      renderAssetsTab();
    }

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
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      // 모바일 환경에서 메뉴 클릭 시 사이드바 자동 닫기
      const sidebar = document.querySelector('.sidebar');
      if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.remove('active');
      }
    });
  });
  document.getElementById('go-analysis-btn')?.addEventListener('click', () => switchTab('auto-analysis'));

  // ── 사이드바 접기/열기 ──────────────────────────────────────────
  const appContainer = document.getElementById('app');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  
  // 초기 상태 로드
  const isCollapsed = localStorage.getItem('toochangi_sidebar_collapsed') === 'true';
  if (isCollapsed && appContainer) {
    appContainer.classList.add('collapsed');
  }

  sidebarToggle?.addEventListener('click', () => {
    if (!appContainer) return;
    const collapsed = appContainer.classList.toggle('collapsed');
    localStorage.setItem('toochangi_sidebar_collapsed', collapsed);
  });

  // ── 모바일 사이드바 토글 및 닫기 버튼 바인딩 ─────────────────────
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const closeBtn = document.getElementById('sidebar-close-btn');
  const sidebar = document.querySelector('.sidebar');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.add('active');
    });
  }
  if (closeBtn && sidebar) {
    closeBtn.addEventListener('click', () => {
      sidebar.classList.remove('active');
    });
  }
  
  // 모바일 환경에서 사이드바 바깥 영역 클릭 시 닫기
  window.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('active') && window.innerWidth <= 768) {
      if (!sidebar.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
        sidebar.classList.remove('active');
      }
    }
  });
}

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

  const panel = document.getElementById(`tab-${tab}`);
  const nav   = document.getElementById(`nav-${tab}`);
  if (panel) panel.classList.remove('hidden');
  if (nav)   nav.classList.add('active');

  const titles = {
    dashboard: '대시보드', portfolio: '주식',
    savings: '예적금', realestate: '부동산',
    filter: '3단계 필터', tradelog: '주식 매매일지',
    assets: '자산현황',
    'auto-analysis': '자동 투자 추천',
    'ai-news': 'AI 뉴스',
    'manual-analysis': '수동 AI 분석',
    settings: '환경 설정',
  };
  document.getElementById('page-title').textContent = titles[tab] || tab;

  if (tab === 'dashboard') renderDashboard();
  if (tab === 'portfolio') {
    renderPortfolioTab(); // 표+요약+차트 모두 갱신(차트만 그리던 stale 위험 제거)
  }
  if (tab === 'savings') renderSavingsTab();
  if (tab === 'realestate') renderRealestateTab();
  if (tab === 'filter') renderFilterPassedRecommendations();
  if (tab === 'assets') {
    initAssetMonthSelector();
    renderAssetsTab();
  }
  if (tab === 'settings') {
    initSettingsFields();
  }
  if (tab === 'auto-analysis') {
    renderAutoRecHistory();
  }
  if (tab === 'ai-news') {
    renderYouTubeFeed();
    renderNewsHistory();
  }
}

// ══════════════════════════════════════════════════════════════
// ── 대시보드 렌더링 ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
// 주식 + 예적금 + 부동산을 실시간으로 집계한 자산 요약 (대시보드/자산현황 공통 소스)
function computeLiveAssetSummary() {
  const metrics = Toochangi.calcPortfolioMetrics();
  const savings = Toochangi.getSavings ? Toochangi.getSavings() : [];
  const realEstate = Toochangi.getRealEstate ? Toochangi.getRealEstate() : [];

  const stock = metrics.totalValue || 0;
  const stockYield = metrics.totalYield || 0;
  const cash = savings.reduce((sum, s) => sum + Toochangi.calcSavingsBalance(s), 0);

  let realEstateValue = 0;
  let realEstateDebt = 0;
  realEstate.forEach(item => {
    realEstateValue += parseFloat(item.currentValue) || 0;
    const loanAmount = parseFloat(item.loanAmount) || 0;
    if (loanAmount > 0) {
      // 부동산 메뉴와 동일하게 '남은 대출잔액' 기준, 계산 불가 시 원래 대출액으로 폴백
      const progress = calculateLoanProgress(item);
      realEstateDebt += (progress && progress.remainingBalance != null) ? progress.remainingBalance : loanAmount;
    }
  });
  const realEstateNet = realEstateValue - realEstateDebt;

  const totalAssets = stock + cash + realEstateValue; // 총자산(부채 차감 전)
  const totalDebt = realEstateDebt;
  const netWorth = totalAssets - totalDebt;

  return { stock, stockYield, cash, realEstateValue, realEstateDebt, realEstateNet, totalAssets, totalDebt, netWorth };
}

function renderDashboard() {
  const s = computeLiveAssetSummary();
  const setVal = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  // 총 자산 (주식 + 현금 + 부동산 시세)
  setVal('m-grand-total-asset', s.totalAssets > 0 ? `${Math.floor(s.totalAssets).toLocaleString()}원` : '—');

  // 순자산 (총자산 − 부채)
  setVal('m-net-worth', (s.totalAssets > 0 || s.totalDebt > 0) ? `${Math.floor(s.netWorth).toLocaleString()}원` : '—');
  const netEl = document.getElementById('m-net-worth');
  if (netEl) netEl.style.color = s.netWorth >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

  // 주식 수익률
  const yieldEl = document.getElementById('m-total-yield');
  if (yieldEl) {
    yieldEl.textContent = s.stockYield !== 0 ? `${s.stockYield >= 0 ? '+' : ''}${s.stockYield.toFixed(2)}%` : '—';
    yieldEl.style.color = s.stockYield > 0 ? 'var(--accent-green)' : (s.stockYield < 0 ? 'var(--accent-red)' : 'var(--text-muted)');
  }

  // 현금 자산
  setVal('m-available', s.cash > 0 ? `${Math.floor(s.cash).toLocaleString()}원` : '—');

  // 전월 대비 (자산현황 월별 스냅샷 기준)
  const prev = previousAssetSnapshot();
  setAssetDelta('m-grand-total-delta', s.totalAssets, prev && prev.total ? prev.total : null);
  setAssetDelta('m-net-worth-delta',   s.netWorth,    prev && prev.net   ? prev.net   : null);
  setAssetDelta('m-available-delta',   s.cash,        prev && prev.cash  ? prev.cash  : null);

  // 최근 분석 미리보기 + AI 추천 종목 카드
  renderRecentAnalysis();
  renderDashboardRecommendations();
}

function renderRecentAnalysis() {
  const list = document.getElementById('recent-analysis-list');
  if (!list) return;
  const history = Toochangi.getAnalysis().slice(-3).reverse();
  if (history.length === 0) {
    list.innerHTML = '<div class="empty-state">분석 기록이 없습니다</div>';
    return;
  }
  list.innerHTML = history.map(a => {
    const r = escapeHtml(a.result);
    const preview = r.slice(0, 160);
    const trunc = (a.result || '').length > 160;
    const full = _linkifyUrls(r.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')).replace(/\n/g, '<br>');
    return `
      <div class="analysis-item rec-hist-item" data-expanded="0" style="cursor:pointer;" title="클릭하면 전체 분석을 펼치거나 접습니다">
        <div class="analysis-item-header">
          <span class="analysis-item-date">${escapeHtml(a.date)}</span>
          <span style="display:flex; align-items:center; gap:8px;">
            ${a.opinion ? `<span class="badge-${a.opinion === '매수' ? 'buy' : 'sell'}">${escapeHtml(a.opinion)}</span>` : ''}
            <span class="rec-hist-arrow" style="font-size:11px; color:var(--text-muted);">▼</span>
          </span>
        </div>
        <div class="analysis-item-query">${escapeHtml(a.query)}</div>
        <div class="rec-hist-preview analysis-item-preview">${preview}${trunc ? '…' : ''}</div>
        <div class="rec-hist-full" style="display:none; white-space:pre-wrap; line-height:1.6; font-size:13px; color:var(--text-secondary); margin-top:4px;">${full || '(내용 없음)'}</div>
      </div>`;
  }).join('');
}

// ── AI 추천 종목 카드 (자동 투자 추천 결과를 구조화해 카드로) ──
function saveLastRecommendations(items, generatedAt, text) {
  try {
    localStorage.setItem('toochangi_last_recommendations', JSON.stringify({
      items: Array.isArray(items) ? items : [],
      generatedAt: generatedAt || new Date().toLocaleString('ko-KR'),
      text: text || '',
    }));
  } catch (_) {}
}
function getLastRecommendations() {
  // 1) 클라우드(시트 'AI추천기록') 최신본 우선 — 기기/브라우저 바뀌어도 유지
  const cloud = Toochangi.getLatestRecommendation ? Toochangi.getLatestRecommendation() : null;
  if (cloud) return { items: cloud.items || [], generatedAt: cloud.generatedAt || '', text: cloud.text || '' };
  // 2) 로컬 캐시 폴백
  try {
    const s = localStorage.getItem('toochangi_last_recommendations');
    if (s) { const o = JSON.parse(s); if (o && Array.isArray(o.items)) return { items: o.items, generatedAt: o.generatedAt || '', text: o.text || '' }; }
  } catch (_) {}
  return { items: [], generatedAt: '', text: '' };
}
// 전체 추천 텍스트에서 특정 종목의 분석 블록(추천 이유)을 best-effort 추출
function _extractStockReason(fullText, name) {
  if (!fullText || !name) return '';
  const idx = fullText.indexOf(name);
  if (idx === -1) return '';
  let start = fullText.lastIndexOf('\n', idx);
  start = start === -1 ? 0 : start + 1;
  // 다음 종목 헤더(**[ 또는 ### ) 전까지 잘라냄
  let next = fullText.length;
  const n1 = fullText.indexOf('**[', idx + name.length);
  const n2 = fullText.indexOf('\n### ', idx + name.length);
  if (n1 !== -1) next = Math.min(next, n1);
  if (n2 !== -1) next = Math.min(next, n2);
  let block = fullText.slice(start, next).trim();
  if (block.length > 1500) block = block.slice(0, 1500) + '…';
  return block;
}
function _filterDot(state) {
  const green = String(state).toUpperCase() === 'GREEN';
  return `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${green ? 'var(--accent-green)' : 'var(--accent-red)'}; margin-right:4px;"></span>`;
}
function _filterWord(state) {
  const g = String(state).toUpperCase() === 'GREEN';
  return `<span style="color:${g ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight:600;">${g ? 'GREEN' : 'RED'}</span>`;
}
function recommendationCardHtml(item, fullText) {
  const esc = escapeHtml;
  const verdict = item.verdict || '—';
  const buy = verdict === '매수';
  const vColor = buy ? 'var(--accent-green)' : 'var(--accent-orange)';
  const ticker = item.ticker ? `<span style="color:var(--text-muted); font-size:12px; margin-left:4px;">${esc(item.ticker)}</span>` : '';
  // 전체 추천 텍스트에서 이 종목 분석 블록 추출(있으면)
  const reasonBlock = _extractStockReason(fullText, item.name);
  const reasonHtml = reasonBlock
    ? _linkifyUrls(esc(reasonBlock).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')).replace(/\n/g, '<br>')
    : '';
  return `
    <div class="rec-hist-item" data-expanded="0" style="background:var(--bg-surface); border:1px solid var(--border); border-radius:10px; padding:14px; cursor:pointer;" title="클릭하면 추천 이유가 펼쳐집니다">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
        <div><strong>${esc(item.name) || '종목'}</strong>${ticker}</div>
        <span style="display:flex; align-items:center; gap:8px; white-space:nowrap;">
          <span style="font-size:11px; font-weight:700; color:${vColor}; border:1px solid ${vColor}; border-radius:6px; padding:2px 8px;">${esc(verdict)}</span>
          <span class="rec-hist-arrow" style="font-size:11px; color:var(--text-muted);">▼</span>
        </span>
      </div>
      <div style="display:flex; gap:14px; font-size:11px; color:var(--text-muted);">
        <span>${_filterDot(item.market)}시장</span>
        <span>${_filterDot(item.sector)}섹터</span>
        <span>${_filterDot(item.stock)}종목</span>
      </div>
      <div class="rec-hist-full" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed var(--border);">
        <div style="font-size:13px; color:var(--text-secondary); line-height:1.6;">📊 <b>추천 이유:</b> ${esc(item.issue) || '—'}</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:6px;">🎯 3단계 필터 — 시장 ${_filterWord(item.market)} · 섹터 ${_filterWord(item.sector)} · 종목 ${_filterWord(item.stock)} → 판정 <b>${esc(verdict)}</b></div>
        ${reasonHtml ? `<div style="font-size:12.5px; color:var(--text-secondary); line-height:1.6; margin-top:8px; white-space:pre-wrap;">${reasonHtml}</div>` : ''}
      </div>
    </div>`;
}
function renderRecommendationCards(containerId, items, emptyMsg, fullText) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = `<div class="empty-state">${emptyMsg || '아직 추천 데이터가 없습니다.'}</div>`;
    return;
  }
  el.innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px; align-items:start;">${items.map(it => recommendationCardHtml(it, fullText)).join('')}</div>`;
}
function renderDashboardRecommendations() {
  const { items, generatedAt, text } = getLastRecommendations();
  renderRecommendationCards('dash-rec-cards', items, '🤖 "자동 투자 추천 → 지금 시장 분석하기"를 실행하면 추천 종목·이슈·3단계 필터가 여기 카드로 표시됩니다.', text);
  const ts = document.getElementById('dash-rec-time');
  if (ts) ts.textContent = generatedAt ? `📅 ${generatedAt}` : '';
}
function renderFilterPassedRecommendations() {
  const { items, text } = getLastRecommendations();
  const isGreen = (s) => String(s).toUpperCase() === 'GREEN';
  const passed = (items || []).filter(it => isGreen(it.market) && isGreen(it.sector) && isGreen(it.stock));
  renderRecommendationCards('filter-passed-cards', passed, 'AI 추천 종목 중 3단계(시장·섹터·종목)를 모두 통과(GREEN)한 종목이 아직 없습니다.', text);
}

// ══════════════════════════════════════════════════════════════
// ── 포트폴리오 탭 렌더링 ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function computeMarketYield(items) {
  const totals = items.reduce((acc, item) => {
    const qty = parseFloat(item.qty) || 0;
    const avgPrice = parseFloat(item.avgPrice) || 0;
    const currentValue = parseFloat(item._value || item.value || (qty * (item.curPrice || item.avgPrice || 0))) || 0;
    acc.cost += qty * avgPrice;
    acc.value += currentValue;
    return acc;
  }, { cost: 0, value: 0 });

  if (totals.cost <= 0) return null;
  return ((totals.value - totals.cost) / totals.cost) * 100;
}

function renderPortfolioSummaryCards(portfolio, metrics) {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
    return el;
  };

  setText('portfolio-total-asset', metrics.totalValue > 0 ? `${Math.floor(metrics.totalValue).toLocaleString()}원` : '—');
  setText('portfolio-total-asset-sub', '평가금액 기준');

  // 투자 금액(최초 원금) = Σ(수량 × 평균단가)
  setText('portfolio-invested', metrics.totalCost > 0 ? `${Math.floor(metrics.totalCost).toLocaleString()}원` : '—');

  const totalYieldEl = setText(
    'portfolio-total-yield',
    metrics.totalValue > 0 || metrics.totalCost > 0
      ? `${metrics.totalYield >= 0 ? '+' : ''}${metrics.totalYield.toFixed(2)}%`
      : '—'
  );
  if (totalYieldEl) {
    totalYieldEl.style.color = (metrics.totalValue > 0 || metrics.totalCost > 0)
      ? (metrics.totalYield > 0 ? 'var(--accent-green)' : (metrics.totalYield < 0 ? 'var(--accent-red)' : 'var(--text-muted)'))
      : '';
  }
  setText('portfolio-total-yield-sub',
    (metrics.totalValue > 0 || metrics.totalCost > 0)
      ? `평가손익 ${metrics.totalPnL >= 0 ? '+' : ''}${Math.floor(metrics.totalPnL).toLocaleString()}원`
      : '전체 보유 종목 기준');

  const kospiItems = portfolio.filter((item) => (item.market || '').trim() === '코스피');
  const kospiYield = computeMarketYield(kospiItems);
  const kospiYieldEl = setText(
    'portfolio-kospi-yield',
    kospiYield === null ? '—' : `${kospiYield >= 0 ? '+' : ''}${kospiYield.toFixed(2)}%`
  );
  if (kospiYieldEl) {
    kospiYieldEl.style.color = kospiYield === null ? '' : (kospiYield > 0 ? 'var(--accent-green)' : (kospiYield < 0 ? 'var(--accent-red)' : 'var(--text-muted)'));
  }
  setText('portfolio-kospi-yield-sub', kospiItems.length > 0 ? `코스피 ${kospiItems.length}종목 기준` : '코스피 보유 종목 없음');

  const nasdaqItems = portfolio.filter((item) => (item.market || '').trim() === '나스닥');
  const nasdaqYield = computeMarketYield(nasdaqItems);
  const nasdaqYieldEl = setText(
    'portfolio-nasdaq-yield',
    nasdaqYield === null ? '—' : `${nasdaqYield >= 0 ? '+' : ''}${nasdaqYield.toFixed(2)}%`
  );
  if (nasdaqYieldEl) {
    nasdaqYieldEl.style.color = nasdaqYield === null ? '' : (nasdaqYield > 0 ? 'var(--accent-green)' : (nasdaqYield < 0 ? 'var(--accent-red)' : 'var(--text-muted)'));
  }
  setText('portfolio-nasdaq-yield-sub', nasdaqItems.length > 0 ? `나스닥 ${nasdaqItems.length}종목 기준` : '나스닥 보유 종목 없음');

  // 명의별 수익률 (정현 / 혜영)
  const renderOwnerYield = (owner, valId, subId) => {
    const items = portfolio.filter(item => (item.owner || '').trim() === owner);
    const oYield = computeMarketYield(items);
    const el = setText(valId, oYield === null ? '—' : `${oYield >= 0 ? '+' : ''}${oYield.toFixed(2)}%`);
    if (el) el.style.color = oYield === null ? '' : (oYield > 0 ? 'var(--accent-green)' : (oYield < 0 ? 'var(--accent-red)' : 'var(--text-muted)'));
    setText(subId, items.length > 0 ? `${owner} 명의 ${items.length}종목 기준` : `${owner} 명의 종목 없음`);
  };
  renderOwnerYield('정현', 'portfolio-jeonghyeon-yield', 'portfolio-jeonghyeon-yield-sub');
  renderOwnerYield('혜영', 'portfolio-hyeyoung-yield', 'portfolio-hyeyoung-yield-sub');

  // 주식 자산 전월 대비 (자산현황 월별 스냅샷 기준)
  const prevSnap = previousAssetSnapshot();
  setAssetDelta('portfolio-total-asset-delta', metrics.totalValue, prevSnap && prevSnap.stock ? prevSnap.stock : null);
}

// KRX 숫자 티커(예: 5930)는 6자리로 앞자리 0을 채워 표기 (예: 005930). 미국 등 문자 티커는 그대로.
function formatStockTicker(ticker) {
  const t = String(ticker || '').trim();
  return /^\d+$/.test(t) ? t.padStart(6, '0') : t;
}

// ── 주식 리스트 정렬 상태/로직 ──
let portfolioSortKey = null;     // 정렬 기준 컬럼 (null이면 시트 순서)
let portfolioSortDir = 'asc';    // 'asc' | 'desc'
const PORTFOLIO_NUMERIC_KEYS = ['qty', 'avgPrice', 'curPrice', 'value', 'yield', 'weight'];

function portfolioSortValue(p, key) {
  switch (key) {
    case 'name':     return p.name || '';
    case 'ticker':   return formatStockTicker(p.ticker);
    case 'market':   return p.market || '';
    case 'owner':    return p.owner || '';
    case 'memo':     return p.memo || '';
    case 'qty':      return p.qty || 0;
    case 'avgPrice': return p.avgPrice || 0;
    case 'curPrice': return p.curPrice || p.avgPrice || 0;
    case 'value':    return p._value || 0;
    case 'yield':    return p._yield || 0;
    case 'weight':   return p._weight || 0;
    default:         return '';
  }
}

function applyPortfolioSort(list) {
  if (!portfolioSortKey) return list;
  const dir = portfolioSortDir === 'asc' ? 1 : -1;
  const isNum = PORTFOLIO_NUMERIC_KEYS.includes(portfolioSortKey);
  return [...list].sort((a, b) => {
    const va = portfolioSortValue(a, portfolioSortKey);
    const vb = portfolioSortValue(b, portfolioSortKey);
    if (isNum) return (va - vb) * dir;
    return String(va).localeCompare(String(vb), 'ko') * dir;
  });
}

function updatePortfolioSortIndicators() {
  document.querySelectorAll('#portfolio-table th .sort-ind').forEach(span => {
    span.textContent = (span.dataset.col === portfolioSortKey)
      ? (portfolioSortDir === 'asc' ? ' ▲' : ' ▼')
      : '';
  });
}

// 헤더 클릭 핸들러 (전역): 같은 컬럼이면 방향 토글, 다른 컬럼이면 오름차순으로 시작
function sortPortfolio(key) {
  if (portfolioSortKey === key) {
    portfolioSortDir = portfolioSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    portfolioSortKey = key;
    portfolioSortDir = 'asc';
  }
  renderPortfolioTab();
}

function renderPortfolioTab() {
  const sheetLink = document.getElementById('btn-open-sheet');
  if (sheetLink) {
    const sheetId = (window.TOOCHANGI_CONFIG || {}).TOOCHANGI_SHEET_ID;
    sheetLink.href = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : '#';
  }

  // 계산되지 않은 지표들을 위해 먼저 계산을 호출하여 p._yield, p._weight 등이 올바르게 설정되도록 보장
  const metrics = Toochangi.calcPortfolioMetrics();

  const tbody = document.getElementById('portfolio-tbody');
  const portfolio = Toochangi.getPortfolio();
  renderPortfolioSummaryCards(portfolio, metrics);
  
  // 도넛 그래프 렌더링 (주식 투자 현황 - 종목 기준, 시장 기준)
  Toochangi.renderAllocationChart('chart-portfolio-allocation', true);
  Toochangi.renderMarketAllocationChart();
  
  if (portfolio.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" class="empty-state">종목을 추가해주세요</td></tr>';
    const chkAll = document.getElementById('chk-portfolio-all');
    if (chkAll) chkAll.checked = false;
    updateBulkActionsVisibility();
    return;
  }
  updatePortfolioSortIndicators();
  tbody.innerHTML = applyPortfolioSort(portfolio).map((p, i) => {
    const yieldStr = p._yield >= 0 ? `+${p._yield.toFixed(2)}%` : `${p._yield.toFixed(2)}%`;
    // 서구식: 상승(+) 초록, 하락(−) 빨강, 0% 중립
    const yieldColor = p._yield > 0 ? 'var(--accent-green)' : (p._yield < 0 ? 'var(--accent-red)' : 'var(--text-muted)');
    return `<tr data-rowindex="${p.rowIndex}">
      <td style="text-align: center;">
        <input type="checkbox" class="chk-portfolio-row" data-rowindex="${p.rowIndex}" style="cursor:pointer;" />
      </td>
      <td style="text-align: center; color: var(--text-muted);">${i + 1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td style="color:var(--text-muted)">${escapeHtml(formatStockTicker(p.ticker))}</td>
      <td><span class="market-pill" data-market="${escapeHtml(p.market || '기타')}">${escapeHtml(p.market)}</span></td>
      <td>${escapeHtml(p.owner || '-')}</td>
      <td>${escapeHtml(p.memo || '-')}</td>
      <td>${p.qty.toLocaleString()}</td>
      <td>${Math.floor(p.avgPrice).toLocaleString()}원</td>
      <td>${Math.floor(p.curPrice || p.avgPrice).toLocaleString()}원</td>
      <td>${Math.floor(p._value || 0).toLocaleString()}원</td>
      <td style="color: ${yieldColor}; font-weight: 600;">${yieldStr}</td>
      <td style="color:var(--text-muted)">${(p._weight || 0).toFixed(1)}%</td>
      <td style="text-align: center;">
        <div style="display:flex; gap:4px; justify-content:center;">
          <button class="btn-primary-sm edit-holding-btn" data-rowindex="${p.rowIndex}" style="padding: 2px 8px; font-size: 11px;">수정</button>
          <button class="btn-primary-sm delete-holding-btn" style="padding: 2px 8px; font-size: 11px; background:var(--accent-red); border-color:var(--accent-red);" data-rowindex="${p.rowIndex}">삭제</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // 개별 수정 버튼 바인딩
  tbody.querySelectorAll('.edit-holding-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rIdx = parseInt(e.target.dataset.rowindex, 10);
      const item = portfolio.find(p => p.rowIndex === rIdx);
      if (!item) return;

      document.getElementById('input-stock-row-index').value = rIdx;
      document.getElementById('input-stock-name').value = item.name;
      document.getElementById('input-stock-ticker').value = formatStockTicker(item.ticker);
      document.getElementById('input-stock-market').value = item.market;
      document.getElementById('input-stock-qty').value = item.qty;
      document.getElementById('input-stock-avg').value = item.avgPrice;
      document.getElementById('input-stock-cur').value = item.curPrice || item.avgPrice;
      if (document.getElementById('input-stock-owner')) document.getElementById('input-stock-owner').value = item.owner || '';
      document.getElementById('input-stock-memo').value = item.memo || '';

      document.querySelector('#modal-holding h3').textContent = '종목 수정';
      document.getElementById('modal-holding').classList.remove('hidden');
    });
  });

  // 개별 삭제 버튼 바인딩
  tbody.querySelectorAll('.delete-holding-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const rIdx = parseInt(e.target.dataset.rowindex, 10);
      const item = portfolio.find(p => p.rowIndex === rIdx);
      if (!item) return;

      if (!confirm(`"${item.name}" 종목을 정말로 삭제하시겠습니까?`)) return;

      toast('⏳ 종목 삭제 중...', 'info');
      try {
        await Toochangi.deletePortfolio(rIdx);
        toast(`✅ ${item.name} 삭제 완료`, 'success');
        renderPortfolioTab();
        renderDashboard();
        updateBulkActionsVisibility();
      } catch (err) {
        toast('⚠️ 삭제 실패: ' + err.message, 'error');
      }
    });
  });

  // 개별 체크박스 선택 시 다중 선택 액션 버튼 가시성 제어
  tbody.querySelectorAll('.chk-portfolio-row').forEach(chk => {
    chk.addEventListener('change', () => {
      updateBulkActionsVisibility();
    });
  });

  // 전체 선택 체크박스 상태 동기화 및 가시성 제어
  const chkAll = document.getElementById('chk-portfolio-all');
  if (chkAll) {
    // 매 렌더마다 핸들러가 쌓이지 않도록 노드 교체 후 1회 바인딩(예적금과 동일 패턴)
    const newChkAll = chkAll.cloneNode(true);
    chkAll.parentNode.replaceChild(newChkAll, chkAll);
    newChkAll.checked = false;
    newChkAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      tbody.querySelectorAll('.chk-portfolio-row').forEach(chk => {
        chk.checked = checked;
      });
      updateBulkActionsVisibility();
    });
  }
}

// ══════════════════════════════════════════════════════════════
// ── 매매일지 탭 렌더링 ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function renderTradelogTab() {
  const tbody = document.getElementById('trade-tbody');
  const tradelog = Toochangi.getTradeLog().slice().reverse();
  if (tradelog.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">매매 기록이 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = tradelog.map(t => `<tr>
    <td>${escapeHtml(t.date)}</td>
    <td>${escapeHtml(t.name)}</td>
    <td><span class="${t.type === '매수' ? 'badge-buy' : 'badge-sell'}">${escapeHtml(t.type)}</span></td>
    <td>${t.qty.toLocaleString()}</td>
    <td>${t.price.toLocaleString()}원</td>
    <td>${t.amount.toLocaleString()}원</td>
    <td style="color:var(--text-muted)">${escapeHtml(t.memo || '—')}</td>
  </tr>`).join('');
}

// ══════════════════════════════════════════════════════════════
// ── 수동 AI 분석 탭 렌더링 ────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function renderManualAnalysisTab() {
  const historyList = document.getElementById('analysis-history-list');
  const history = Toochangi.getAnalysis().slice().reverse();
  if (history.length === 0) {
    historyList.innerHTML = '<div class="empty-state">저장된 분석이 없습니다</div>';
    return;
  }
  historyList.innerHTML = history.map(a => `
    <div class="analysis-item">
      <div class="analysis-item-header">
        <span class="analysis-item-date">${escapeHtml(a.date)}</span>
        ${a.opinion ? `<span class="badge-${a.opinion === '매수' ? 'buy' : 'sell'}">${escapeHtml(a.opinion)}</span>` : ''}
      </div>
      <div class="analysis-item-query">${escapeHtml(a.query)}</div>
      <div class="analysis-item-preview">${escapeHtml(a.result)}</div>
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
      const name = document.getElementById('input-filter-stock-name').value.trim();
      const ticker = document.getElementById('input-filter-stock-ticker').value.trim();
      const result = Toochangi.evaluateFinalVerdict();

      try {
        await Toochangi.saveFilter({
          signal1: result.s1, signal2: result.s2, signal3: result.s3,
          verdict: result.verdict,
          memo: name && ticker ? `종목: ${name}(${ticker})` : '',
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
  document.getElementById('add-holding-btn')?.addEventListener('click', () => {
    document.querySelector('#modal-holding h3').textContent = '종목 추가';
    document.getElementById('input-stock-row-index').value = '';
    document.getElementById('input-stock-name').value = '';
    document.getElementById('input-stock-ticker').value = '';
    document.getElementById('input-stock-qty').value = '';
    document.getElementById('input-stock-avg').value = '';
    document.getElementById('input-stock-cur').value = '';
    document.getElementById('input-stock-memo').value = '';
    if (document.getElementById('input-stock-owner')) document.getElementById('input-stock-owner').value = '';
    document.getElementById('modal-holding').classList.remove('hidden');
  });

  // 다중 수정 및 삭제 버튼 이벤트 바인딩
  document.getElementById('btn-bulk-edit')?.addEventListener('click', openBulkEditModal);
  document.getElementById('btn-bulk-delete')?.addEventListener('click', deleteBulkHoldings);
  document.getElementById('btn-save-bulk-edit')?.addEventListener('click', saveBulkEdit);
  
  // 실시간 주가 수식 반영
  document.getElementById('apply-formulas-btn')?.addEventListener('click', async () => {
    if (!Auth.isLoggedIn()) { toast('먼저 로그인해주세요', 'error'); return; }
    if (!confirm('현재 포트폴리오의 모든 종목에 구글 파이낸스 실시간 수식을 적용하시겠습니까?\n기존에 입력된 현재가와 평가금액이 자동으로 업데이트되는 수식으로 바뀝니다.')) return;
    
    toast('⏳ 실시간 주가 수식 반영 중...', 'info');
    try {
      await Toochangi.applyFormulasToPortfolio();
      toast('✅ 실시간 주가 수식 반영 완료!', 'success');
      renderPortfolioTab();
      renderDashboard();
    } catch (e) {
      toast('⚠️ 수식 반영 실패: ' + e.message, 'error');
    }
  });

  // 직전 작업 취소 (원복)
  document.getElementById('restore-portfolio-btn')?.addEventListener('click', async () => {
    if (!Auth.isLoggedIn()) { toast('먼저 로그인해주세요', 'error'); return; }
    if (!confirm('정말로 직전 작업(수식 반영, 추가, 수정, 삭제 등)을 취소하고 원래 상태로 되돌리시겠습니까?\n백업된 데이터로 구글 시트가 덮어씌워집니다.')) return;
    
    toast('⏳ 데이터 복원 중...', 'info');
    try {
      await Toochangi.restorePortfolioFromBackup();
      toast('✅ 직전 작업 취소 완료!', 'success');
      renderPortfolioTab();
      renderDashboard();
    } catch (e) {
      toast('⚠️ 복원 실패: ' + e.message, 'error');
    }
  });

  document.getElementById('add-trade-btn')?.addEventListener('click', () => {
    document.getElementById('input-trade-date').value = new Date().toISOString().slice(0,10);
    document.getElementById('input-trade-type').value = '매수';
    document.getElementById('input-trade-stock').value = '';
    document.getElementById('input-trade-ticker').value = '';
    document.getElementById('input-trade-market').value = '코스피';
    document.getElementById('input-trade-owner').value = '';
    document.getElementById('input-trade-qty').value = '';
    document.getElementById('input-trade-price').value = '';
    document.getElementById('input-trade-memo').value = '';
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
    const memo = document.getElementById('input-stock-memo').value.trim();
    const rowIndex = document.getElementById('input-stock-row-index')?.value;
    const currentPortfolio = Toochangi.getPortfolio ? Toochangi.getPortfolio() : [];
    const existingItem = rowIndex ? currentPortfolio.find(p => p.rowIndex === parseInt(rowIndex, 10)) : null;
    const ownerInput = document.getElementById('input-stock-owner');
    const owner = ownerInput ? ownerInput.value.trim() : (existingItem?.owner || '');
    if (!name || !qty || !avg) { toast('필수 항목을 입력해주세요', 'error'); return; }

    try {
      const data = {
        name, ticker: document.getElementById('input-stock-ticker').value,
        market: document.getElementById('input-stock-market').value,
        qty, avgPrice: avg,
        curPrice: parseFloat(document.getElementById('input-stock-cur').value) || avg,
        owner,
        memo,
      };

      if (rowIndex) {
        await Toochangi.updatePortfolio(parseInt(rowIndex, 10), data);
        toast(`✅ ${name} 수정 완료`, 'success');
      } else {
        await Toochangi.addPortfolio(data);
        toast(`✅ ${name} 추가 완료`, 'success');
      }
      document.getElementById('modal-holding').classList.add('hidden');
      
      // 입력 필드 초기화
      document.getElementById('input-stock-name').value = '';
      document.getElementById('input-stock-ticker').value = '';
      document.getElementById('input-stock-qty').value = '';
      document.getElementById('input-stock-avg').value = '';
      document.getElementById('input-stock-cur').value = '';
      document.getElementById('input-stock-memo').value = '';
      if (document.getElementById('input-stock-owner')) document.getElementById('input-stock-owner').value = '';
      if (document.getElementById('input-stock-row-index')) document.getElementById('input-stock-row-index').value = '';

      renderPortfolioTab();
      renderDashboard();
    } catch (e) {
      toast('⚠️ 저장 실패: ' + e.message, 'error');
    }
  });

  // 매매 저장
  document.getElementById('save-trade-btn')?.addEventListener('click', async () => {
    const date   = document.getElementById('input-trade-date').value;
    const name   = document.getElementById('input-trade-stock').value.trim();
    const type   = document.getElementById('input-trade-type').value;
    const ticker = document.getElementById('input-trade-ticker').value.trim();
    const market = document.getElementById('input-trade-market').value;
    const owner  = document.getElementById('input-trade-owner').value;
    const qty    = parseFloat(document.getElementById('input-trade-qty').value);
    const price  = parseFloat(document.getElementById('input-trade-price').value);
    if (!date || !name || !qty || !price) { toast('필수 항목을 입력해주세요', 'error'); return; }

    try {
      const result = await Toochangi.addTrade({
        date, name, type, ticker, market, owner, qty, price,
        memo: document.getElementById('input-trade-memo').value,
      });
      document.getElementById('modal-trade').classList.add('hidden');
      renderTradelogTab();
      renderPortfolioTab();   // 포트폴리오 자동 반영 결과 갱신
      renderDashboard();
      const reflectMsg = result && result.portfolioAction
        ? { added: '신규 종목으로 추가', updated: '보유 종목에 반영', removed: '보유 종목 전량 매도 → 리스트에서 삭제', skipped: '미보유 종목이라 포트폴리오 반영은 생략' }[result.portfolioAction]
        : '';
      toast(`✅ 매매 기록 저장 완료${reflectMsg ? ` · ${reflectMsg}` : ''}`, 'success');
    } catch (e) {
      toast('⚠️ 저장 실패: ' + e.message, 'error');
    }
  });

  // ── 예적금 이벤트 ──
  document.getElementById('add-savings-btn')?.addEventListener('click', () => {
    document.getElementById('savings-modal-title').textContent = '예적금 추가';
    document.getElementById('input-savings-row-index').value = '';
    document.getElementById('input-savings-name').value = '';
    document.getElementById('input-savings-bank').value = '';
    document.getElementById('input-savings-owner').value = '';
    document.getElementById('input-savings-linked-account').value = '';
    document.getElementById('input-savings-accountNumber').value = '';
    document.getElementById('input-savings-type').value = '';
    document.getElementById('input-savings-rate').value = '';
    document.getElementById('input-savings-balance').value = '';
    document.getElementById('input-savings-maturity').value = '';
    document.getElementById('input-savings-purpose').value = '';
    document.getElementById('input-savings-memo').value = '';
    document.getElementById('input-savings-monthly-deposit').value = '';
    document.getElementById('input-savings-deposit-day').value = '';
    document.getElementById('input-savings-deposit-start').value = '';
    renderSavingsLinkedAccountOptions();
    document.getElementById('modal-savings-add-edit').classList.remove('hidden');
  });

  document.getElementById('input-savings-linked-account')?.addEventListener('change', (e) => {
    const [accountName, accountNumber, ownerName] = (e.target.value || '').split('|');
    document.getElementById('input-savings-accountNumber').value = accountNumber || '';

    const ownerSelect = document.getElementById('input-savings-owner');
    if (ownerName && ownerSelect && ['정현', '혜영', '아챙'].includes(ownerName)) {
      ownerSelect.value = ownerName;
    }

    const bankInput = document.getElementById('input-savings-bank');
    if (bankInput && !bankInput.value.trim() && accountName) {
      bankInput.value = accountName;
    }
  });

  document.getElementById('btn-savings-bulk-edit')?.addEventListener('click', openSavingsBulkEditModal);
  document.getElementById('btn-savings-bulk-delete')?.addEventListener('click', deleteSavingsBulk);
  document.getElementById('btn-savings-save-bulk-edit')?.addEventListener('click', saveSavingsBulkEdit);

  document.getElementById('restore-savings-btn')?.addEventListener('click', async () => {
    if (!Auth.isLoggedIn()) { toast('먼저 로그인해주세요', 'error'); return; }
    if (!confirm('정말로 직전 작업(추가, 수정, 삭제 등)을 취소하고 원래 상태로 되돌리시겠습니까?\n백업된 데이터로 구글 시트가 덮어씌워집니다.')) return;
    
    toast('⏳ 데이터 복원 중...', 'info');
    try {
      await Toochangi.restoreSavingsFromBackup();
      toast('✅ 직전 작업 취소 완료!', 'success');
      renderSavingsTab();
      renderDashboard();
      updateSavingsBulkActionsVisibility();
    } catch (e) {
      toast('⚠️ 복원 실패: ' + e.message, 'error');
    }
  });

  document.getElementById('save-savings-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('input-savings-name').value.trim();
    const bank = document.getElementById('input-savings-bank').value.trim();
    const owner = document.getElementById('input-savings-owner').value;
    const accountNumber = document.getElementById('input-savings-accountNumber').value.trim();
    const type = document.getElementById('input-savings-type').value.trim();
    const rate = parseFloat(document.getElementById('input-savings-rate').value);
    const balance = parseFloat(document.getElementById('input-savings-balance').value);
    const maturity = document.getElementById('input-savings-maturity').value;
    const purpose = document.getElementById('input-savings-purpose').value.trim();
    const memo = document.getElementById('input-savings-memo').value.trim();
    const rowIndex = document.getElementById('input-savings-row-index')?.value;

    // 자동 납입(누적) 설정
    const monthlyDeposit = parseFloat(document.getElementById('input-savings-monthly-deposit').value) || 0;
    let depositDay = parseInt(document.getElementById('input-savings-deposit-day').value, 10) || 0;
    let depositStartDate = document.getElementById('input-savings-deposit-start').value;
    if (monthlyDeposit > 0) {
      // 월 납입액이 있으면 기준일은 5일, 시작일은 오늘을 기본값으로 채워 '오늘부터' 누적되게 함
      if (!depositDay) depositDay = 5;
      if (!depositStartDate) {
        const t = new Date();
        depositStartDate = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      }
    }

    if (!name || !bank || !owner || !accountNumber || !type || isNaN(rate) || isNaN(balance)) {
      toast('필수 항목을 모두 입력해주세요', 'error');
      return;
    }

    try {
      const data = { name, bank, owner, accountNumber, type, rate, balance, maturity, purpose, memo, monthlyDeposit, depositDay, depositStartDate };
      if (rowIndex) {
        await Toochangi.updateSavings(parseInt(rowIndex, 10), data);
        toast(`✅ ${name} 수정 완료`, 'success');
      } else {
        await Toochangi.addSavings(data);
        toast(`✅ ${name} 추가 완료`, 'success');
      }
      document.getElementById('modal-savings-add-edit').classList.add('hidden');
      renderSavingsTab();
      renderDashboard();
      updateSavingsBulkActionsVisibility();
    } catch (e) {
      toast('⚠️ 저장 실패: ' + e.message, 'error');
    }
  });

  // ── 부동산 이벤트 ──
  document.getElementById('add-realestate-btn')?.addEventListener('click', () => {
    document.getElementById('realestate-modal-title').textContent = '부동산 추가';
    document.getElementById('input-realestate-row-index').value = '';
    document.getElementById('input-realestate-name').value = '';
    document.getElementById('input-realestate-purchasePrice').value = '';
    document.getElementById('input-realestate-currentValue').value = '';
    document.getElementById('input-realestate-loanAmount').value = '';
    document.getElementById('input-realestate-loanRate').value = '';
    document.getElementById('input-realestate-loanStartDate').value = '';
    document.getElementById('input-realestate-loanTermYears').value = '';
    document.getElementById('input-realestate-deposit').value = '';
    document.getElementById('input-realestate-maintenance').value = '';
    document.getElementById('input-realestate-purpose').value = '';
    document.getElementById('input-realestate-memo').value = '';
    document.getElementById('modal-realestate-add-edit').classList.remove('hidden');
  });

  document.getElementById('save-realestate-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('input-realestate-name').value.trim();
    const purchasePrice = parseFloat(document.getElementById('input-realestate-purchasePrice').value);
    const currentValue = parseFloat(document.getElementById('input-realestate-currentValue').value);
    const loanAmount = parseFloat(document.getElementById('input-realestate-loanAmount').value) || 0;
    const loanRate = parseFloat(document.getElementById('input-realestate-loanRate').value) || 0;
    const loanStartDate = document.getElementById('input-realestate-loanStartDate').value;
    const loanTermYears = parseInt(document.getElementById('input-realestate-loanTermYears').value, 10) || 0;
    const deposit = parseFloat(document.getElementById('input-realestate-deposit').value) || 0;
    // 연간유지비/이자 컬럼은 원리금균등 기준 '연간 상환금액'으로 자동 계산해 저장(시트도 동일 값 반영)
    const maintenance = calcAnnualLoanRepayment({ loanAmount, loanRate, loanTermYears }) || 0;
    const purpose = document.getElementById('input-realestate-purpose').value.trim();
    const memo = document.getElementById('input-realestate-memo').value.trim();
    const rowIndex = document.getElementById('input-realestate-row-index')?.value;

    if (loanAmount > 0 && (!loanStartDate || !loanTermYears)) {
      toast('대출이 있으면 대출실행일과 상환년수를 입력해 주세요', 'error');
      return;
    }

    if (!name || isNaN(purchasePrice) || isNaN(currentValue)) {
      toast('필수 항목을 모두 입력해주세요', 'error');
      return;
    }

    try {
      const data = {
        name,
        purchasePrice,
        currentValue,
        loanAmount,
        loanRate,
        loanStartDate: loanAmount > 0 ? loanStartDate : '',
        loanTermYears: loanAmount > 0 ? loanTermYears : '',
        deposit,
        maintenance,
        purpose,
        memo
      };
      if (rowIndex) {
        await Toochangi.updateRealEstate(parseInt(rowIndex, 10), data);
        toast(`✅ ${name} 수정 완료`, 'success');
      } else {
        await Toochangi.addRealEstate(data);
        toast(`✅ ${name} 추가 완료`, 'success');
      }
      document.getElementById('modal-realestate-add-edit').classList.add('hidden');
      renderRealestateTab();
      renderDashboard();
    } catch (e) {
      toast('⚠️ 저장 실패: ' + e.message, 'error');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// ── 자동 투자 추천 이벤트 및 유튜브 피드 ─────────────────────────────
// ══════════════════════════════════════════════════════════════
let _youtubeFeedCache = null;
let _youtubeFeedLoading = false;

// 이스케이프된 텍스트의 URL을 클릭 가능한 링크로 변환 (escape 이후에 호출)
function _linkifyUrls(s) {
  return String(s == null ? '' : s).replace(/(https?:\/\/[^\s<）)]+)/g,
    '<a href="$1" target="_blank" rel="noopener" style="color:var(--accent-blue); text-decoration:underline; word-break:break-all;">$1</a>');
}
// 요약 텍스트 가공: 이스케이프 → **볼드** → URL 링크화
function _formatSummaryText(text) {
  let esc = escapeHtml(text);
  // 마크다운 헤딩(### …)을 볼드 줄로 변환해 '###'가 화면에 그대로 노출되는 것 방지
  esc = esc.replace(/^\s*###\s*(.+?)\s*$/gm, '<strong>$1</strong>');
  esc = esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return _linkifyUrls(esc);
}

// 요약 텍스트를 항목 단위로 쪼개 '게재일' 기준 신선도 버킷으로 분류.
//  baseTs(ms): 신선도 계산 기준 시각(보통 now). 각 항목의 '게재일 : YYYY-MM-DD'를 절대일자로 파싱해 판정(모델 라벨 불신).
//  반환: { buckets:{within24h, within7d, other}, tail }  (tail = 인트로/### 총평 등 항목 아닌 부분)
function parseNewsItems(text, baseTs) {
  const blocks = String(text == null ? '' : text).split(/(?=^###\s)/m);
  const buckets = { within24h: [], within7d: [], other: [] };
  let tail = '';
  for (const raw of blocks) {
    const b = raw.trim();
    if (!b) continue;
    if (!/^###\s*\d+\./.test(b)) { tail += (tail ? '\n\n' : '') + b; continue; } // 번호 없는 블록(총평/인트로)
    const m = b.match(/게재일\s*[:：]\s*(\d{4}-\d{2}-\d{2})/);
    const t = m ? Date.parse(m[1] + 'T00:00:00+09:00') : NaN;
    if (isNaN(t)) { buckets.other.push(b); continue; }          // 날짜 미상/미파싱 → 격리
    const diffH = (baseTs - t) / 3600000;
    if (diffH > 7 * 24 || diffH < -24) buckets.other.push(b);   // 7일 초과 또는 비정상 미래 → 격리
    else if (diffH <= 24) buckets.within24h.push(b);
    else buckets.within7d.push(b);
  }
  return { buckets, tail };
}

// 경제 뉴스/영상 요약 HTML 빌더(신규 요약/시트 복원 공용). 신선도 버킷(24h/7일/그외)으로 섹션 분리.
function _videoFeedHtml(text, sources, metaLine) {
  const { buckets, tail } = parseNewsItems(text, Date.now());
  const total = buckets.within24h.length + buckets.within7d.length + buckets.other.length;
  const wrap = (inner) => `<div style="white-space:pre-wrap; line-height:1.6; font-size:13.5px; color:var(--text-secondary);">${inner}</div>`;
  const hdr = (t) => `<div style="margin:14px 0 6px; font-weight:700; font-size:14px; color:var(--text-primary, #e8eaed);">${t}</div>`;
  const items = (arr) => arr.map(b => _formatSummaryText(b)).join('\n');

  let body;
  if (!total) {
    // 항목 파싱 실패 → 기존처럼 통짜 렌더(graceful degradation)
    body = wrap(_formatSummaryText(text));
  } else {
    let inner = hdr('🔥 24시간 이내' + (buckets.within24h.length ? ` (${buckets.within24h.length})` : ''));
    inner += buckets.within24h.length
      ? wrap(items(buckets.within24h))
      : `<div style="font-size:12.5px; color:var(--text-muted); margin-bottom:4px;">최근 24시간 내 확인된 신규 항목이 없습니다 — 아래 “최근 7일”을 확인하세요.</div>`;
    if (buckets.within7d.length) inner += hdr(`🗓️ 최근 7일 (${buckets.within7d.length})`) + wrap(items(buckets.within7d));
    if (buckets.other.length) inner += hdr(`📁 그 외 · 오래됨/날짜 미상 (${buckets.other.length})`) + wrap(items(buckets.other));
    if (tail.trim()) inner += `<div style="white-space:pre-wrap; line-height:1.6; font-size:13px; color:var(--text-muted); margin-top:12px; padding-top:8px; border-top:1px solid rgba(255,255,255,.08);">${_formatSummaryText(tail)}</div>`;
    body = inner;
  }

  const srcHtml = (sources && sources.length)
    ? `<div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:6px;">${sources.slice(0, 8).map(s => `<a href="${escapeHtml(s.url)}" target="_blank" class="source-link" title="${escapeHtml(s.title)}">🔗 <span>${escapeHtml(s.title)}</span></a>`).join('')}</div>`
    : '';
  const metaHtml = metaLine ? `<div style="margin-top:8px;font-size:11px;color:#64748b;">${metaLine}</div>` : '';
  return `${body}${srcHtml}${metaHtml}`;
}

// AI(Gemini 실시간 검색)가 최근 경제·투자 유튜브를 찾아 요약. 자동 호출(force=false)에선 검색하지 않고 안내만(쿼터 절약)
async function renderYouTubeFeed(force = false) {
  const listEl = document.getElementById('youtube-feed-list');
  const spinnerEl = document.getElementById('youtube-feed-loading');
  if (!listEl) return;
  if (_youtubeFeedLoading) return;

  if (!force) {
    if (_youtubeFeedCache) { listEl.innerHTML = _youtubeFeedCache; return; }
    // 메모리 캐시가 없으면 시트에 저장된 최신 요약을 복원(휘발 방지)
    try {
      const latest = (typeof Toochangi !== 'undefined' && Toochangi.getLatestVideoSummary)
        ? await Toochangi.getLatestVideoSummary() : null;
      if (latest && latest.text) {
        _youtubeFeedCache = _videoFeedHtml(latest.text, latest.sources, `📅 ${latest.generatedAt} · 저장된 요약 (‘요약 받기’를 누르면 최신본)`);
        listEl.innerHTML = _youtubeFeedCache;
        return;
      }
    } catch (_) {}
    listEl.innerHTML = '<div class="empty-state">🔄 "요약 받기"를 누르면 AI가 최근 경제·투자 유튜브 핵심을 실시간 검색해 요약합니다.</div>';
    return;
  }

  _youtubeFeedLoading = true;
  spinnerEl?.classList.remove('hidden');
  listEl.classList.add('hidden');
  try {
    const vres = await Toochangi.runEconomyVideoSummary();
    _youtubeFeedCache = _videoFeedHtml(vres.text, vres.sources, aiModelLabel(vres));
    listEl.innerHTML = _youtubeFeedCache;
    renderNewsHistory(); // 새 요약이 시트에 쌓였으니 히스토리 갱신
  } catch (err) {
    console.error('[EconomyVideo] 요약 실패:', err);
    listEl.innerHTML = `<div class="empty-state" style="color:var(--accent-red)">⚠️ ${escapeHtml(err.message)}</div>`;
  } finally {
    _youtubeFeedLoading = false;
    spinnerEl?.classList.add('hidden');
    listEl.classList.remove('hidden');
  }
}

function bindAutoAnalysisEvents() {
  const autoRecBtn       = document.getElementById('btn-auto-recommend');
  const autoRecEmpty     = document.getElementById('auto-rec-empty');
  const autoRecLoading   = document.getElementById('auto-rec-loading');
  const autoRecResult    = document.getElementById('auto-rec-result');
  const autoRecSourcesWrap = document.getElementById('auto-rec-sources-wrap');
  const autoRecChips     = document.getElementById('auto-rec-source-chips');
  const autoRecGenAt     = document.getElementById('auto-rec-generated-at');
  const refreshYoutubeBtn = document.getElementById('btn-refresh-youtube');

  const kospiRecBtn = document.getElementById('btn-auto-recommend-kospi');

  async function runAutoRec(mode) {
    // UI 상태: 로딩 시작
    if (autoRecBtn) autoRecBtn.disabled = true;
    if (kospiRecBtn) kospiRecBtn.disabled = true;
    autoRecEmpty?.classList.add('hidden');
    autoRecResult?.classList.add('hidden');
    autoRecSourcesWrap?.classList.add('hidden');
    autoRecLoading?.classList.remove('hidden');

    try {
      const result = await Toochangi.runAutoRecommendation(mode);

      // 결과 렌더링: 먼저 HTML 이스케이프(주입/깨짐 방지) → 볼드/줄바꿈만 마크업 허용
      const formatted = String(result.text == null ? '' : result.text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

      if (autoRecResult) {
        const tag = mode === 'kospi'
          ? '<div style="margin-bottom:8px;"><span style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:600;background:rgba(37,99,235,.18);color:#60a5fa;">🇰🇷 코스피 전용 분석</span></div>'
          : '';
        autoRecResult.innerHTML = tag + formatted;
        autoRecResult.classList.remove('hidden');
      }

      // 생성 시각 + 사용 모델 표시
      if (autoRecGenAt) {
        const ml = aiModelLabel(result);
        autoRecGenAt.textContent = `📅 ${result.generatedAt}` + (ml ? `  ·  ${ml}` : '');
        autoRecGenAt.style.display = 'inline';
      }

      // 출처 칩 렌더링
      if (autoRecChips && result.sources && result.sources.length > 0) {
        autoRecChips.innerHTML = result.sources.map(s =>
          `<a href="${escapeHtml(s.url)}" target="_blank" class="source-chip" title="${escapeHtml(s.title)}">
            🔗 ${escapeHtml(s.title)}
          </a>`
        ).join('');
        autoRecSourcesWrap?.classList.remove('hidden');
      }

      // 구조화된 추천 종목 저장(로컬 캐시 + 클라우드 시트) → 대시보드/3단계 필터 카드 갱신
      saveLastRecommendations(result.recommendations || [], result.generatedAt, result.text);
      try {
        await Toochangi.saveRecommendation(result.recommendations || [], result.text, result.generatedAt);
        renderAutoRecHistory(); // 새 추천이 시트에 쌓였으니 히스토리 갱신
      } catch (saveErr) {
        console.warn('추천 클라우드 저장 실패(로컬만 유지):', saveErr);
      }
      renderDashboardRecommendations();
      renderFilterPassedRecommendations();

    } catch (e) {
      if (autoRecResult) {
        autoRecResult.innerHTML = `<span style="color:var(--accent-red)">❌ 추천 실패: ${escapeHtml(e.message)}</span>`;
        autoRecResult.classList.remove('hidden');
      }
    } finally {
      if (autoRecBtn) autoRecBtn.disabled = false;
      if (kospiRecBtn) kospiRecBtn.disabled = false;
      autoRecLoading?.classList.add('hidden');
    }
  }

  autoRecBtn?.addEventListener('click', () => runAutoRec('all'));
  kospiRecBtn?.addEventListener('click', () => runAutoRec('kospi'));

  refreshYoutubeBtn?.addEventListener('click', () => {
    toast('🔄 유튜브 피드 갱신 중...', 'info');
    renderYouTubeFeed(true);
  });

  document.getElementById('btn-refresh-rec-history')?.addEventListener('click', () => renderAutoRecHistory());
  document.getElementById('btn-refresh-news-history')?.addEventListener('click', () => renderNewsHistory());
  // 히스토리 아코디언 토글은 전역 bindAccordions()에서 위임 처리(rec-history-list/news-history-list 포함)
}

// 자동 추천 히스토리 렌더 (구글 시트 'AI추천기록' 전체 이력, 최신순)
async function renderAutoRecHistory() {
  const listEl = document.getElementById('rec-history-list');
  if (!listEl) return;
  const esc = escapeHtml;
  listEl.innerHTML = '<div class="empty-state">⏳ 추천 기록을 불러오는 중...</div>';

  let history = [];
  try {
    history = (typeof Toochangi !== 'undefined' && Toochangi.getRecommendationHistory)
      ? await Toochangi.getRecommendationHistory() : [];
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state" style="color:var(--accent-red)">⚠️ 추천 기록 로드 실패: ${esc(e.message)}</div>`;
    return;
  }
  if (!history.length) {
    listEl.innerHTML = `<div class="empty-state">저장된 자동 추천 기록이 없습니다. (자동 추천을 실행하면 구글 시트 'AI추천기록'에 쌓입니다)</div>`;
    return;
  }

  const verdictBadge = (v) => v === '매수'
    ? `<span class="badge-buy">매수</span>`
    : `<span style="display:inline-block; padding:1px 7px; border-radius:8px; font-size:11px; font-weight:600; background:rgba(148,163,184,.18); color:#94a3b8;">${esc(v || '대기')}</span>`;
  const chipStyle = 'display:inline-flex; align-items:center; gap:5px; background:var(--bg-surface); border:1px solid var(--border); border-radius:6px; padding:3px 8px; font-size:12px;';

  listEl.innerHTML = history.map(rec => {
    const items = Array.isArray(rec.items) ? rec.items : [];
    const chips = items.length
      ? items.map(it => `<span style="${chipStyle}">${esc(it.name || '')}${it.ticker ? ` (${esc(it.ticker)})` : ''} ${verdictBadge(it.verdict)}</span>`).join('')
      : '<span style="color:var(--text-muted); font-size:12px;">구조화된 추천 종목 없음</span>';
    const txt = esc(rec.text || '');
    const preview = txt.slice(0, 280);
    const truncated = (rec.text || '').length > 280;
    const fullHtml = _linkifyUrls(txt.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')).replace(/\n/g, '<br>');
    return `
      <div class="analysis-item rec-hist-item" data-expanded="0" style="cursor:pointer;" title="클릭하면 전체 내용을 펼치거나 접습니다">
        <div class="analysis-item-header">
          <span class="analysis-item-date">📅 ${esc(rec.generatedAt)}</span>
          <span style="display:flex; align-items:center; gap:8px; font-size:11px; color:var(--text-muted);">종목 ${items.length}개 <span class="rec-hist-arrow">▼</span></span>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin:8px 0;">${chips}</div>
        ${preview ? `<div class="rec-hist-preview analysis-item-preview">${preview}${truncated ? '…' : ''}</div>` : ''}
        <div class="rec-hist-full" style="display:none; white-space:pre-wrap; line-height:1.6; font-size:13px; color:var(--text-secondary); margin-top:4px;">${fullHtml || '(내용 없음)'}</div>
      </div>
    `;
  }).join('');
}

// 경제 영상 AI 요약 히스토리 렌더 (구글 시트 '영상요약기록' 전체 이력, 최신순, 최대 30건)
async function renderNewsHistory() {
  const listEl = document.getElementById('news-history-list');
  if (!listEl) return;
  const esc = escapeHtml;
  listEl.innerHTML = '<div class="empty-state">⏳ 요약 기록을 불러오는 중...</div>';

  let history = [];
  try {
    history = (typeof Toochangi !== 'undefined' && Toochangi.getVideoSummaryHistory)
      ? await Toochangi.getVideoSummaryHistory() : [];
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state" style="color:var(--accent-red)">⚠️ 요약 기록 로드 실패: ${esc(e.message)}</div>`;
    return;
  }
  if (!history.length) {
    listEl.innerHTML = `<div class="empty-state">저장된 요약 기록이 없습니다. ("요약 받기"를 실행하면 구글 시트 '영상요약기록'에 쌓입니다)</div>`;
    return;
  }

  listEl.innerHTML = history.map(rec => {
    const sources = Array.isArray(rec.sources) ? rec.sources : [];
    const srcHtml = sources.length
      ? `<div style="display:flex; flex-wrap:wrap; gap:6px; margin:8px 0;">${sources.slice(0, 8).map(s => `<a href="${esc(s.url)}" target="_blank" class="source-link" title="${esc(s.title)}" onclick="event.stopPropagation()">🔗 <span>${esc(s.title)}</span></a>`).join('')}</div>`
      : '';
    const txt = esc(rec.text || '');
    const preview = txt.slice(0, 280);
    const truncated = (rec.text || '').length > 280;
    const fullHtml = _linkifyUrls(txt.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')).replace(/\n/g, '<br>');
    return `
      <div class="analysis-item rec-hist-item" data-expanded="0" style="cursor:pointer;" title="클릭하면 전체 내용을 펼치거나 접습니다">
        <div class="analysis-item-header">
          <span class="analysis-item-date">📅 ${esc(rec.generatedAt)}</span>
          <span style="display:flex; align-items:center; gap:8px; font-size:11px; color:var(--text-muted);">출처 ${sources.length}개 <span class="rec-hist-arrow">▼</span></span>
        </div>
        ${preview ? `<div class="rec-hist-preview analysis-item-preview">${preview}${truncated ? '…' : ''}</div>` : ''}
        <div class="rec-hist-full" style="display:none;">
          <div style="white-space:pre-wrap; line-height:1.6; font-size:13px; color:var(--text-secondary); margin-top:4px;">${fullHtml || '(내용 없음)'}</div>
          ${srcHtml}
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// ── 수동 AI 분석 이벤트 ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
let _lastAnalysisResult = null;
// 🖼️ 수동 AI 분석에 첨부한 이미지들: [{ mimeType, data(base64), dataUrl, name }]
let _analysisImages = [];
const ANALYSIS_MAX_IMAGES = 4;
const ANALYSIS_MAX_IMG_BYTES = 8 * 1024 * 1024; // 이미지 1장당 최대 8MB

// File → { mimeType, data(base64, 접두사 제외), dataUrl, name }
function _readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      const m = url.match(/^data:([^;]+);base64,(.*)$/);
      if (!m) { reject(new Error('이미지 인코딩 실패')); return; }
      resolve({ mimeType: m[1], data: m[2], dataUrl: url, name: file.name });
    };
    reader.onerror = () => reject(reader.error || new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

function _renderAnalysisImagePreview() {
  const wrap = document.getElementById('analysis-image-preview');
  if (!wrap) return;
  // dataUrl은 로컬에서 읽은 base64 data URI(신뢰 가능) → src에 직접 사용
  wrap.innerHTML = _analysisImages.map((img, i) => `
    <div class="analysis-thumb">
      <img src="${img.dataUrl}" alt="${escapeHtml(img.name || `첨부 이미지 ${i + 1}`)}">
      <button type="button" class="thumb-remove" data-idx="${i}" title="제거">✕</button>
    </div>`).join('');
}

async function _handleAnalysisImageFiles(fileList) {
  const files = Array.from(fileList || []);
  for (const file of files) {
    if (_analysisImages.length >= ANALYSIS_MAX_IMAGES) {
      toast(`사진은 최대 ${ANALYSIS_MAX_IMAGES}장까지 첨부할 수 있습니다`, 'error');
      break;
    }
    if (!file.type.startsWith('image/')) { toast('이미지 파일만 첨부할 수 있습니다', 'error'); continue; }
    if (file.size > ANALYSIS_MAX_IMG_BYTES) { toast(`${file.name}: 이미지가 너무 큽니다(최대 8MB)`, 'error'); continue; }
    try {
      _analysisImages.push(await _readImageFile(file));
    } catch (e) {
      toast('이미지 읽기 실패: ' + e.message, 'error');
    }
  }
  _renderAnalysisImagePreview();
}

function bindManualAnalysisEvents() {
  const runBtn  = document.getElementById('run-analysis-btn');
  const saveBtn = document.getElementById('save-analysis-btn');
  const attachBtn = document.getElementById('attach-image-btn');
  const fileInput = document.getElementById('analysis-image-input');
  const previewWrap = document.getElementById('analysis-image-preview');
  const textarea = document.getElementById('analysis-input');

  // 🖼️ 사진 첨부: 버튼 → 파일선택, 변경 시 읽기, 썸네일 ✕로 제거, 붙여넣기(Ctrl+V) 지원
  attachBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    await _handleAnalysisImageFiles(fileInput.files);
    fileInput.value = ''; // 같은 파일 재선택 허용
  });
  previewWrap?.addEventListener('click', (e) => {
    const btn = e.target.closest('.thumb-remove');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (!isNaN(idx)) { _analysisImages.splice(idx, 1); _renderAnalysisImagePreview(); }
  });
  textarea?.addEventListener('paste', (e) => {
    const imgFiles = Array.from(e.clipboardData?.items || [])
      .filter(it => it.type.startsWith('image/'))
      .map(it => it.getAsFile())
      .filter(Boolean);
    if (imgFiles.length) { e.preventDefault(); _handleAnalysisImageFiles(imgFiles); }
  });

  runBtn?.addEventListener('click', async () => {
    const query = document.getElementById('analysis-input').value.trim();
    if (!query && _analysisImages.length === 0) { toast('분석할 내용이나 사진을 입력해주세요', 'error'); return; }
    const images = _analysisImages.slice();
    const effectiveQuery = query || '첨부한 이미지를 분석해주세요.';

    const resultEl = document.getElementById('analysis-result');
    const sourcesContainer = document.getElementById('analysis-sources-container');
    const sourcesDiv = document.getElementById('analysis-sources');

    runBtn.disabled = true;
    document.getElementById('analyze-btn-text').textContent = '🔮 분석 중...';
    resultEl.textContent = '⏳ Gemini AI가 분석 중입니다...';
    if (sourcesContainer) sourcesContainer.classList.add('hidden');
    if (sourcesDiv) sourcesDiv.innerHTML = '';
    saveBtn?.classList.add('hidden');

    try {
      const result = await Toochangi.runGeminiAnalysis(effectiveQuery, images);
      const { text, sources } = result;
      resultEl.textContent = text;
      const ml = aiModelLabel(result);
      if (ml) {
        const mb = document.createElement('div');
        mb.style.cssText = 'margin-top:10px;font-size:11px;color:#64748b;';
        mb.textContent = ml;
        resultEl.appendChild(mb);
      }
      const savedQuery = effectiveQuery + (images.length ? ` [이미지 ${images.length}장 첨부]` : '');
      _lastAnalysisResult = { query: savedQuery, result: text, sources };

      // Render search sources/citations
      if (sourcesContainer && sourcesDiv && sources && sources.length > 0) {
        sourcesContainer.classList.remove('hidden');
        sourcesDiv.innerHTML = sources.map(s => {
          return `<a href="${escapeHtml(s.url)}" target="_blank" class="source-link" title="${escapeHtml(s.title)}">
            🔗 <span>${escapeHtml(s.title)}</span>
          </a>`;
        }).join('');
      }

      // 분석 완료 → 분석기록 시트에 자동 저장 (별도 저장 버튼 불필요)
      try {
        let finalResult = text;
        if (sources && sources.length > 0) {
          finalResult += '\n\n🔍 [구글 실시간 검색 출처]\n' +
            sources.map((s, idx) => `${idx + 1}. ${s.title}: ${s.url}`).join('\n');
        }
        await Toochangi.saveAnalysis({ query: savedQuery, result: finalResult });
        renderManualAnalysisTab();
        toast('✅ 분석 완료 · 히스토리에 자동 저장됨', 'success');
      } catch (saveErr) {
        // 자동 저장이 실패한 경우에만 수동 저장 버튼을 노출(재시도용)
        console.error('[분석] 자동 저장 실패:', saveErr);
        saveBtn?.classList.remove('hidden');
        toast('⚠️ 히스토리 자동 저장 실패 — 💾 버튼으로 다시 시도하세요', 'error');
      }
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
      let finalResult = _lastAnalysisResult.result;
      if (_lastAnalysisResult.sources && _lastAnalysisResult.sources.length > 0) {
        finalResult += '\n\n🔍 [구글 실시간 검색 출처]\n' + 
          _lastAnalysisResult.sources.map((s, idx) => `${idx + 1}. ${s.title}: ${s.url}`).join('\n');
      }
      await Toochangi.saveAnalysis({
        query: _lastAnalysisResult.query,
        result: finalResult
      });
      renderManualAnalysisTab();
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

// ══════════════════════════════════════════════════════════════
// ── 자산현황 이벤트 및 렌더링 ──────────────────────────────────
// ══════════════════════════════════════════════════════════════
function bindAssetEvents() {
  document.getElementById('asset-month-select')?.addEventListener('change', () => {
    renderAssetsTab();
  });
  
  document.getElementById('add-asset-btn')?.addEventListener('click', () => {
    openAssetModal(null);
  });
  
  document.getElementById('save-asset-btn')?.addEventListener('click', () => {
    saveAssetItem();
  });
  
  document.getElementById('sync-portfolio-asset-btn')?.addEventListener('click', () => {
    syncPortfolioAssets();
  });

  document.getElementById('asset-backfill-btn')?.addEventListener('click', openAssetBackfillModal);
  document.getElementById('save-asset-backfill-btn')?.addEventListener('click', saveAssetBackfill);
  document.getElementById('asset-backfill-paste-btn')?.addEventListener('click', fillBackfillFromPaste);

  document.getElementById('trend-view-toggle')?.addEventListener('click', () => {
    netWorthTrendView = (netWorthTrendView === 'all') ? 'recent' : 'all';
    const btn = document.getElementById('trend-view-toggle');
    const label = document.getElementById('trend-view-label');
    if (btn) btn.textContent = (netWorthTrendView === 'all') ? '최근 6개월 →' : '전체 보기 (분기) →';
    if (label) label.textContent = (netWorthTrendView === 'all') ? '(전체 · 분기)' : '(최근 6개월)';
    Toochangi.renderNetWorthTrendChart(netWorthTrendView);
  });

  document.getElementById('input-asset-category')?.addEventListener('change', () => {
    toggleAssetCategoryFields();
  });
}

function toggleAssetCategoryFields() {
  const category = document.getElementById('input-asset-category').value;
  
  document.querySelectorAll('.form-group-sub').forEach(el => el.classList.add('hidden'));
  
  if (category === '부동산') {
    document.getElementById('group-asset-real-estate').classList.remove('hidden');
  } else if (category === '적금/정기예금') {
    document.getElementById('group-asset-savings').classList.remove('hidden');
  } else if (category === '대출(부채)') {
    document.getElementById('group-asset-loan').classList.remove('hidden');
  } else {
    document.getElementById('group-asset-standard').classList.remove('hidden');
  }
}

function initAssetMonthSelector() {
  const select = document.getElementById('asset-month-select');
  if (!select) return;
  
  if (select.children.length > 0) return;

  const months = [];
  const history = Toochangi.getAssetHistory();
  
  history.forEach(a => {
    if (a.date) {
      const m = a.date.substring(0, 7);
      if (!months.includes(m)) months.push(m);
    }
  });
  
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  if (!months.includes(currentMonthKey)) months.push(currentMonthKey);
  
  months.sort().reverse();
  
  select.innerHTML = months.map(m => {
    const parts = m.split('-');
    return `<option value="${escapeHtml(m)}">${escapeHtml(parts[0])}년 ${escapeHtml(parts[1])}월</option>`;
  }).join('');
}

// 이번 달 자동 스냅샷이 없으면 실시간 자산 값을 자산현황 시트에 기록 (추이/월별 스냅샷 자동 누적)
let _snapshotInFlight = false;
async function ensureMonthlyAssetSnapshot(summary) {
  if (_snapshotInFlight) return; // 동시 호출(이중 로그인/월 전환) 시 중복 기록 방지
  if ((summary.totalAssets || 0) <= 0 && (summary.totalDebt || 0) <= 0) return; // 데이터 없으면 스킵
  const SNAP_MEMO = '자동 월별 스냅샷';
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const history = Toochangi.getAssetHistory() || [];
  // 이번 달에 스냅샷(자동/과거 백필)이 이미 있으면 중복 기록하지 않음
  if (history.some(a => a.date && String(a.date).startsWith(monthKey) && ASSET_SNAPSHOT_MEMOS.includes(a.memo))) return;

  const today = `${monthKey}-${String(now.getDate()).padStart(2, '0')}`;
  const rows = [
    { category: '국내주식/투자', name: '주식 자산(자동)',   balance: Math.floor(summary.stock) },
    { category: '예적금/현금',   name: '현금 자산(자동)',   balance: Math.floor(summary.cash) },
    { category: '부동산',        name: '부동산 시세(자동)', balance: Math.floor(summary.realEstateValue) },
    { category: '대출(부채)',    name: '부동산 대출(자동)', balance: Math.floor(summary.realEstateDebt) },
  ].filter(r => r.balance > 0);

  _snapshotInFlight = true;
  try {
    for (const r of rows) {
      await SheetsAPI.appendAsset({ date: today, category: r.category, name: r.name, balance: r.balance, memo: SNAP_MEMO });
    }
    await Toochangi.reloadAssetHistory();
  } finally {
    _snapshotInFlight = false;
  }
}

// ── 과거 월별 스냅샷 (1~지난달) 입력 ──────────────────────────
// monthKey 'YYYY-MM' → 해당 월 마지막 날 Date
function _monthEndDate(monthKey) {
  const parts = monthKey.split('-').map(Number);
  return new Date(parts[0], parts[1], 0, 23, 59, 59);
}
// 특정 시점 기준 현금(예적금) 합계
function cashAsOf(date) {
  const savings = Toochangi.getSavings ? Toochangi.getSavings() : [];
  return savings.reduce((sum, s) => sum + Toochangi.calcSavingsBalance(s, date), 0);
}
// 특정 시점 기준 부동산 대출 잔액 합계 (그 시점에 대출이 없었으면 0)
function realEstateDebtAsOf(date) {
  const realEstate = Toochangi.getRealEstate ? Toochangi.getRealEstate() : [];
  let debt = 0;
  realEstate.forEach(item => {
    const loanAmount = parseFloat(item.loanAmount) || 0;
    if (loanAmount <= 0) return;
    const start = item.loanStartDate ? new Date(`${item.loanStartDate}T00:00:00`) : null;
    if (start && date < start) return; // 그 시점엔 대출이 없었음
    const progress = calculateLoanProgress(item, date);
    debt += (progress && progress.remainingBalance != null) ? progress.remainingBalance : loanAmount;
  });
  return debt;
}
// 입력 대상 월: 지난달부터 과거로 18개월 (이번 달은 자동 스냅샷이 처리)
function _backfillMonths() {
  const now = new Date();
  const months = [];
  for (let i = 18; i >= 1; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function openAssetBackfillModal() {
  const tbody = document.getElementById('asset-backfill-tbody');
  if (!tbody) return;
  const months = _backfillMonths();
  if (months.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">입력할 과거 월이 없습니다.</td></tr>';
  } else {
    const st = 'width:100%; box-sizing:border-box; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); padding:6px 10px; border-radius:6px; text-align:right;';
    tbody.innerHTML = months.map(mk => {
      const [y, m] = mk.split('-');
      return `<tr data-month="${mk}">
        <td style="font-weight:600;">${y}년 ${parseInt(m, 10)}월</td>
        <td><input type="number" class="backfill-stock" placeholder="0" style="${st}" /></td>
        <td><input type="number" class="backfill-realestate" placeholder="0" style="${st}" /></td>
      </tr>`;
    }).join('');
  }
  document.getElementById('modal-asset-backfill').classList.remove('hidden');
}

// 붙여넣기 텍스트(한 줄에 'YYYY-MM 부동산' 또는 'YYYY-MM 주식 부동산')로 표를 자동 채움
function fillBackfillFromPaste() {
  const text = (document.getElementById('asset-backfill-paste')?.value) || '';
  const tbody = document.getElementById('asset-backfill-tbody');
  if (!tbody) return;
  let filled = 0;
  text.split('\n').forEach(line => {
    const mm = line.match(/(\d{4})[-.\/]\s*(\d{1,2})/);
    if (!mm) return;
    const monthKey = `${mm[1]}-${String(parseInt(mm[2], 10)).padStart(2, '0')}`;
    const row = tbody.querySelector(`tr[data-month="${monthKey}"]`);
    if (!row) return;
    const rest = line.slice(line.indexOf(mm[0]) + mm[0].length).replace(/,/g, '');
    const nums = (rest.match(/\d+/g) || []).filter(n => n.length >= 5); // 금액만(일/층 등 작은 수 제외)
    if (nums.length === 0) return;
    let stock = null, realEstate;
    if (nums.length >= 2) { stock = nums[0]; realEstate = nums[1]; } else { realEstate = nums[0]; }
    if (stock != null) { const si = row.querySelector('.backfill-stock'); if (si) si.value = stock; }
    const ri = row.querySelector('.backfill-realestate'); if (ri) ri.value = realEstate;
    filled += 1;
  });
  toast(filled > 0 ? `✅ ${filled}개월 채웠습니다. 확인 후 저장하세요.` : '인식된 줄 없음 (형식: YYYY-MM 금액)', filled > 0 ? 'success' : 'error');
}

async function saveAssetBackfill() {
  const tbody = document.getElementById('asset-backfill-tbody');
  if (!tbody) return;
  const targets = [];
  tbody.querySelectorAll('tr[data-month]').forEach(tr => {
    const monthKey = tr.dataset.month;
    const stock = parseFloat(tr.querySelector('.backfill-stock')?.value) || 0;
    const realEstateValue = parseFloat(tr.querySelector('.backfill-realestate')?.value) || 0;
    if (stock > 0 || realEstateValue > 0) targets.push({ monthKey, stock, realEstateValue });
  });
  if (targets.length === 0) { toast('입력된 월이 없습니다', 'error'); return; }

  toast('⏳ 과거 스냅샷 저장 중...', 'info');
  document.getElementById('modal-asset-backfill').classList.add('hidden');
  const BACKFILL_MEMO = '과거 월별 스냅샷';
  try {
    for (const t of targets) {
      const asOf = _monthEndDate(t.monthKey);
      const dateStr = `${t.monthKey}-${String(asOf.getDate()).padStart(2, '0')}`;
      const cash = Math.floor(cashAsOf(asOf));
      const debt = Math.floor(realEstateDebtAsOf(asOf));

      // 같은 월의 기존 스냅샷(과거/자동) 행 제거 후 재기록 (중복 합산 방지)
      const dup = (await SheetsAPI.getAssetStatus())
        .filter(a => a.date && String(a.date).startsWith(t.monthKey) && (a.memo === BACKFILL_MEMO || a.memo === '자동 월별 스냅샷'))
        .map(a => a.rowIndex)
        .sort((a, b) => b - a);
      for (const rIdx of dup) await SheetsAPI.deleteAsset(rIdx);

      const rowsToWrite = [
        { category: '국내주식/투자', name: '주식 자산(과거)',   balance: Math.floor(t.stock) },
        { category: '예적금/현금',   name: '현금 자산(과거)',   balance: cash },
        { category: '부동산',        name: '부동산 시세(과거)', balance: Math.floor(t.realEstateValue) },
        { category: '대출(부채)',    name: '부동산 대출(과거)', balance: debt },
      ].filter(r => r.balance > 0);
      for (const r of rowsToWrite) {
        await SheetsAPI.appendAsset({ date: dateStr, category: r.category, name: r.name, balance: r.balance, memo: BACKFILL_MEMO });
      }
    }
    await Toochangi.reloadAssetHistory();
    toast(`✅ 과거 ${targets.length}개월 스냅샷 저장 완료`, 'success');
    initAssetMonthSelector();
    renderAssetsTab();
  } catch (e) {
    toast('⚠️ 저장 실패: ' + e.message, 'error');
  }
}

// 추이 차트 보기 모드: 'recent'(최근 6개월) | 'all'(전체·분기)
let netWorthTrendView = 'recent';

// 특정 월의 스냅샷 집계 (총자산/부채/순자산/주식/현금)
const ASSET_SNAPSHOT_MEMOS = ['자동 월별 스냅샷', '과거 월별 스냅샷'];
// 카테고리 → 버킷(주식/현금/부동산/부채/기타)
function assetCategoryBucket(category) {
  const c = category || '';
  if (c === '대출(부채)') return 'debt';
  if (c.includes('주식') || c.includes('투자')) return 'stock';
  if (c.includes('현금') || c.includes('예금') || c.includes('적금')) return 'cash';
  if (c.includes('부동산')) return 'realEstate';
  return 'other';
}
// 해당 월에서 집계에 '반영'되는 행만 반환 (스냅샷이 커버한 버킷의 수동/동기화 행은 제외)
function activeAssetRows(monthEntries) {
  const snapBuckets = new Set(
    monthEntries.filter(a => ASSET_SNAPSHOT_MEMOS.includes(a.memo)).map(a => assetCategoryBucket(a.category))
  );
  if (snapBuckets.size === 0) return monthEntries;
  return monthEntries.filter(a => ASSET_SNAPSHOT_MEMOS.includes(a.memo) || !snapBuckets.has(assetCategoryBucket(a.category)));
}
function assetSnapshotForMonth(monthKey) {
  const history = Toochangi.getAssetHistory() || [];
  const entries = history.filter(a => a.date && String(a.date).startsWith(monthKey));
  if (entries.length === 0) return null;
  let total = 0, debt = 0, stock = 0, cash = 0, realEstate = 0;
  activeAssetRows(entries).forEach(a => {
    const bal = a.balance || 0;
    const bucket = assetCategoryBucket(a.category);
    if (bucket === 'debt') debt += bal; else total += bal;
    if (bucket === 'stock') stock += bal;
    else if (bucket === 'cash') cash += bal;
    else if (bucket === 'realEstate') realEstate += bal;
  });
  return { total, debt, net: total - debt, stock, cash, realEstate };
}
// 현재 월보다 이전인 가장 최근 스냅샷 월의 집계
function previousAssetSnapshot() {
  const history = Toochangi.getAssetHistory() || [];
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const months = [...new Set(history.filter(a => a.date).map(a => String(a.date).substring(0, 7)))]
    .filter(mk => mk < cur)
    .sort();
  if (months.length === 0) return null;
  return assetSnapshotForMonth(months[months.length - 1]);
}
// 전월 대비 증감 표시 (invert=true면 증가가 부정적 = 부채)
function setAssetDelta(id, current, prev, invert) {
  const el = document.getElementById(id);
  if (!el) return;
  if (prev == null || Number.isNaN(prev)) { el.textContent = ''; return; }
  const diff = current - prev;
  if (Math.abs(diff) < 1) { el.textContent = '전월과 동일'; el.style.color = 'var(--text-muted)'; return; }
  const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : 0;
  const up = diff > 0;
  el.textContent = `전월 대비 ${up ? '+' : '−'}${Math.abs(Math.floor(diff)).toLocaleString()}원 ${up ? '▲' : '▼'}${Math.abs(pct).toFixed(1)}%`;
  const good = invert ? !up : up;
  el.style.color = good ? 'var(--accent-green)' : 'var(--accent-red)';
}

async function renderAssetsTab() {
  // ── 실시간 자산 요약 (주식+예적금+부동산 기준, 월 선택과 무관하게 항상 표시) ──
  const summary = computeLiveAssetSummary();
  document.getElementById('asset-total-val').textContent = `${Math.floor(summary.totalAssets).toLocaleString()}원`;
  document.getElementById('asset-debt-val').textContent = `${Math.floor(summary.totalDebt).toLocaleString()}원`;
  const netEl = document.getElementById('asset-net-val');
  netEl.textContent = `${Math.floor(summary.netWorth).toLocaleString()}원`;
  netEl.style.color = summary.netWorth >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

  const stockEl = document.getElementById('asset-stock-val');
  if (stockEl) stockEl.textContent = summary.stock > 0 ? `${Math.floor(summary.stock).toLocaleString()}원` : '—';
  const cashEl = document.getElementById('asset-cash-val');
  if (cashEl) cashEl.textContent = summary.cash > 0 ? `${Math.floor(summary.cash).toLocaleString()}원` : '—';
  const reEl = document.getElementById('asset-realestate-val');
  if (reEl) reEl.textContent = summary.realEstateValue > 0 ? `${Math.floor(summary.realEstateValue).toLocaleString()}원` : '—';

  // 부채비율(%) = 부채 / 총 자산
  const ratioEl = document.getElementById('asset-debt-ratio');
  if (ratioEl) ratioEl.textContent = summary.totalAssets > 0
    ? `${(summary.totalDebt / summary.totalAssets * 100).toFixed(1)}%`
    : '—';

  // 순자산 구성 비중(실시간 도넛)
  Toochangi.renderLiveAssetAllocationChart(summary.stock, summary.cash, summary.realEstateNet);

  // 자동 월별 스냅샷: 이번 달 기록이 없으면 실시간 값을 자산현황 시트에 저장 → 추이/스냅샷 자동 누적
  try { await ensureMonthlyAssetSnapshot(summary); } catch (e) { console.warn('월별 스냅샷 자동 저장 실패:', e); }

  // 전월 대비 증감 표시 (직전 월 스냅샷 대비)
  const prevSnap = previousAssetSnapshot();
  setAssetDelta('asset-total-delta', summary.totalAssets, prevSnap && prevSnap.total ? prevSnap.total : null);
  setAssetDelta('asset-net-delta',   summary.netWorth,    prevSnap && prevSnap.net   ? prevSnap.net   : null);
  setAssetDelta('asset-stock-delta', summary.stock,       prevSnap && prevSnap.stock ? prevSnap.stock : null);
  setAssetDelta('asset-cash-delta',  summary.cash,        prevSnap && prevSnap.cash  ? prevSnap.cash  : null);
  setAssetDelta('asset-realestate-delta', summary.realEstateValue, prevSnap && prevSnap.realEstate ? prevSnap.realEstate : null);
  setAssetDelta('asset-debt-delta',  summary.totalDebt,   prevSnap && prevSnap.debt  ? prevSnap.debt  : null, true);

  // 총자산·순자산 추이(스냅샷 기록 기반, 현재 보기 모드 적용)
  Toochangi.renderNetWorthTrendChart(netWorthTrendView);

  // ── 월별 자산 세부 기록 (스냅샷) ──
  const select = document.getElementById('asset-month-select');
  const selectedMonthKey = select ? select.value : '';
  const tbody = document.getElementById('asset-tbody');
  if (!tbody) return;
  if (!selectedMonthKey) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">기록된 월별 자산 스냅샷이 없습니다.</td></tr>';
    return;
  }

  const history = Toochangi.getAssetHistory();
  const monthEntries = history.filter(a => a.date && a.date.startsWith(selectedMonthKey));

  if (monthEntries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">해당 월에 등록된 자산 내역이 없습니다.</td></tr>';
  } else {
    const activeSet = new Set(activeAssetRows(monthEntries).map(a => a.rowIndex));
    tbody.innerHTML = monthEntries.map(a => {
      const inactive = !activeSet.has(a.rowIndex); // 추이/집계에 미반영(스냅샷이 같은 버킷을 대체)
      return `
      <tr style="${inactive ? 'opacity:0.5;' : ''}">
        <td>${escapeHtml(a.date)}</td>
        <td><span class="badge" style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${escapeHtml(a.category)}</span>${inactive ? ' <span style="color: var(--text-muted); font-size: 10px;">추이 미반영</span>' : ''}</td>
        <td><strong>${escapeHtml(a.name)}</strong></td>
        <td style="color: ${a.category === '대출(부채)' ? 'var(--accent-red)' : 'var(--text-normal)'}">${a.balance.toLocaleString()}원</td>
        <td style="color: var(--text-muted)">${escapeHtml(a.memo || '—')}</td>
        <td style="color: var(--text-muted); font-size: 12px;">${escapeHtml(a.lastUpdated || '—')}</td>
        <td>
          <button class="btn-text-sm edit-asset-btn" data-row="${a.rowIndex}">수정</button>
          <button class="btn-text-sm delete-asset-btn" data-row="${a.rowIndex}" style="color: var(--accent-red); margin-left: 6px;">삭제</button>
        </td>
      </tr>
    `;
    }).join('');

    tbody.querySelectorAll('.edit-asset-btn').forEach(btn => {
      btn.addEventListener('click', () => openAssetModal(parseInt(btn.dataset.row)));
    });
    tbody.querySelectorAll('.delete-asset-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteAssetItem(parseInt(btn.dataset.row)));
    });
  }
}

function openAssetModal(rowIndex = null) {
  const modal = document.getElementById('modal-asset');
  const title = document.getElementById('asset-modal-title');
  const catSelect = document.getElementById('input-asset-category');
  
  catSelect.innerHTML = window.TOOCHANGI_CONFIG.ASSET_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  
  const inputRowIndex = document.getElementById('input-asset-row-index');
  const inputDate = document.getElementById('input-asset-date');
  const inputCategory = document.getElementById('input-asset-category');
  const inputName = document.getElementById('input-asset-name');
  
  // 모든 인풋 필드 초기화
  document.getElementById('input-asset-balance').value = '';
  document.getElementById('input-asset-memo').value = '';
  
  document.getElementById('input-asset-re-price').value = '';
  document.getElementById('input-asset-re-loan').value = '';
  document.getElementById('input-asset-re-rate').value = '';
  document.getElementById('input-asset-re-principal').value = '';
  document.getElementById('input-asset-re-memo').value = '';
  
  document.getElementById('input-asset-sav-principal').value = '';
  document.getElementById('input-asset-sav-rate').value = '';
  document.getElementById('input-asset-sav-maturity').value = '';
  document.getElementById('input-asset-sav-memo').value = '';
  
  document.getElementById('input-asset-loan-principal').value = '';
  document.getElementById('input-asset-loan-rate').value = '';
  document.getElementById('input-asset-loan-maturity').value = '';
  document.getElementById('input-asset-loan-memo').value = '';

  if (rowIndex) {
    title.textContent = '자산 수정';
    const asset = Toochangi.getAssetHistory().find(a => a.rowIndex === rowIndex);
    if (!asset) return;
    
    inputRowIndex.value = rowIndex;
    inputDate.value = asset.date;
    inputCategory.value = asset.category;
    inputName.value = asset.name;

    const memoStr = asset.memo || '';
    
    if (asset.category === '부동산') {
      const reRegex = /매입가:\s*([\d,]+)원\s*\/\s*대출:\s*([\d,]+)원\s*\(([\d\.]+)\%\)\s*\/\s*원금:\s*([\d,]+)원(?:\s*\/\s*(.*))?/;
      const match = memoStr.match(reRegex);
      if (match) {
        document.getElementById('input-asset-re-price').value = parseInt(match[1].replace(/,/g, ''), 10);
        document.getElementById('input-asset-re-loan').value = parseInt(match[2].replace(/,/g, ''), 10);
        document.getElementById('input-asset-re-rate').value = parseFloat(match[3]);
        document.getElementById('input-asset-re-principal').value = parseInt(match[4].replace(/,/g, ''), 10);
        document.getElementById('input-asset-re-memo').value = match[5] || '';
      } else {
        document.getElementById('input-asset-re-price').value = asset.balance;
        document.getElementById('input-asset-re-memo').value = memoStr;
      }
    } else if (asset.category === '적금/정기예금') {
      const savRegex = /원금:\s*([\d,]+)원\s*\/\s*금리:\s*([\d\.]+)\%\s*\/\s*만기:\s*([^\/\s]+)(?:\s*\/\s*(.*))?/;
      const match = memoStr.match(savRegex);
      if (match) {
        document.getElementById('input-asset-sav-principal').value = parseInt(match[1].replace(/,/g, ''), 10);
        document.getElementById('input-asset-sav-rate').value = parseFloat(match[2]);
        document.getElementById('input-asset-sav-maturity').value = match[3];
        document.getElementById('input-asset-sav-memo').value = match[4] || '';
      } else {
        document.getElementById('input-asset-sav-principal').value = asset.balance;
        document.getElementById('input-asset-sav-memo').value = memoStr;
      }
    } else if (asset.category === '대출(부채)') {
      const loanRegex = /대출금:\s*([\d,]+)원\s*\/\s*금리:\s*([\d\.]+)\%\s*\/\s*만기:\s*([^\/\s]+)(?:\s*\/\s*(.*))?/;
      const match = memoStr.match(loanRegex);
      if (match) {
        document.getElementById('input-asset-loan-principal').value = parseInt(match[1].replace(/,/g, ''), 10);
        document.getElementById('input-asset-loan-rate').value = parseFloat(match[2]);
        document.getElementById('input-asset-loan-maturity').value = match[3];
        document.getElementById('input-asset-loan-memo').value = match[4] || '';
      } else {
        document.getElementById('input-asset-loan-principal').value = asset.balance;
        document.getElementById('input-asset-loan-memo').value = memoStr;
      }
    } else {
      document.getElementById('input-asset-balance').value = asset.balance;
      document.getElementById('input-asset-memo').value = memoStr;
    }
  } else {
    title.textContent = '자산 추가';
    inputRowIndex.value = '';
    inputDate.value = new Date().toISOString().split('T')[0];
    inputCategory.selectedIndex = 0;
    inputName.value = '';
  }
  
  toggleAssetCategoryFields();
  modal.classList.remove('hidden');
}

async function saveAssetItem() {
  const rowIndex = document.getElementById('input-asset-row-index').value;
  const date = document.getElementById('input-asset-date').value;
  const category = document.getElementById('input-asset-category').value;
  const name = document.getElementById('input-asset-name').value.trim();
  
  let balance = 0;
  let memo = '';

  if (!date || !name) {
    toast('필수 항목을 모두 올바르게 입력해주세요.', 'error');
    return;
  }

  if (category === '부동산') {
    const priceVal = parseFloat(document.getElementById('input-asset-re-price').value) || 0;
    const loanVal = parseFloat(document.getElementById('input-asset-re-loan').value) || 0;
    const rateVal = parseFloat(document.getElementById('input-asset-re-rate').value) || 0;
    const principalVal = parseFloat(document.getElementById('input-asset-re-principal').value) || 0;
    const customMemo = document.getElementById('input-asset-re-memo').value.trim();

    if (priceVal <= 0) {
      toast('평가액/매입가를 입력해주세요.', 'error');
      return;
    }

    balance = priceVal - loanVal; // 순자산 평가액
    memo = `매입가: ${priceVal.toLocaleString()}원 / 대출: ${loanVal.toLocaleString()}원 (${rateVal}%) / 원금: ${principalVal.toLocaleString()}원`;
    if (customMemo) memo += ` / ${customMemo}`;
  } 
  else if (category === '적금/정기예금') {
    const principalVal = parseFloat(document.getElementById('input-asset-sav-principal').value) || 0;
    const rateVal = parseFloat(document.getElementById('input-asset-sav-rate').value) || 0;
    const maturityVal = document.getElementById('input-asset-sav-maturity').value;
    const customMemo = document.getElementById('input-asset-sav-memo').value.trim();

    if (principalVal <= 0) {
      toast('예금 원금을 입력해주세요.', 'error');
      return;
    }

    balance = principalVal;
    memo = `원금: ${principalVal.toLocaleString()}원 / 금리: ${rateVal}% / 만기: ${maturityVal || '-'}`;
    if (customMemo) memo += ` / ${customMemo}`;
  } 
  else if (category === '대출(부채)') {
    const principalVal = parseFloat(document.getElementById('input-asset-loan-principal').value) || 0;
    const rateVal = parseFloat(document.getElementById('input-asset-loan-rate').value) || 0;
    const maturityVal = document.getElementById('input-asset-loan-maturity').value;
    const customMemo = document.getElementById('input-asset-loan-memo').value.trim();

    if (principalVal <= 0) {
      toast('대출 금액을 입력해주세요.', 'error');
      return;
    }

    balance = principalVal;
    memo = `대출금: ${principalVal.toLocaleString()}원 / 금리: ${rateVal}% / 만기: ${maturityVal || '-'}`;
    if (customMemo) memo += ` / ${customMemo}`;
  } 
  else {
    balance = parseFloat(document.getElementById('input-asset-balance').value);
    memo = document.getElementById('input-asset-memo').value.trim();

    if (isNaN(balance)) {
      toast('잔고를 입력해주세요.', 'error');
      return;
    }
  }
  
  toast('⏳ 자산 저장 중...', 'info');
  try {
    const data = { date, category, name, balance, memo };
    if (rowIndex) {
      await SheetsAPI.updateAsset(parseInt(rowIndex), data);
      toast('✅ 자산이 수정되었습니다.', 'success');
    } else {
      await SheetsAPI.appendAsset(data);
      toast('✅ 자산이 추가되었습니다.', 'success');
    }
    
    document.getElementById('modal-asset').classList.add('hidden');
    await refreshAll();
  } catch (e) {
    console.error(e);
    toast('⚠️ 자산 저장 실패: ' + e.message, 'error');
  }
}

async function deleteAssetItem(rowIndex) {
  const asset = Toochangi.getAssetHistory().find(a => a.rowIndex === rowIndex);
  if (!asset) return;
  
  if (!confirm(`"${asset.name}" 자산 항목을 정말 삭제하시겠습니까?`)) return;
  
  toast('⏳ 자산 삭제 중...', 'info');
  try {
    await SheetsAPI.deleteAsset(rowIndex);
    toast('✅ 자산이 삭제되었습니다.', 'success');
    await refreshAll();
  } catch (e) {
    console.error(e);
    toast('⚠️ 자산 삭제 실패: ' + e.message, 'error');
  }
}

async function syncPortfolioAssets() {
  const select = document.getElementById('asset-month-select');
  if (!select) return;
  const selectedMonthKey = select.value;
  if (!selectedMonthKey) return;
  
  const today = new Date();
  const currentMonthKey = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
  
  let targetDate;
  if (selectedMonthKey === currentMonthKey) {
    targetDate = today.toISOString().split('T')[0];
  } else {
    const parts = selectedMonthKey.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const lastDay = new Date(year, month, 0).getDate();
    targetDate = `${selectedMonthKey}-${lastDay.toString().padStart(2, '0')}`;
  }
  
  toast('⏳ 포트폴리오 평가금 동기화 중...', 'info');
  try {
    await Toochangi.syncPortfolioAssets(targetDate);
    toast('✅ 포트폴리오 동기화 완료!', 'success');
    await refreshAll();
  } catch (e) {
    console.error(e);
    toast('⚠️ 동기화 실패: ' + e.message, 'error');
  }
}

// 스크린샷 판독 모달 생성 및 데이터 주입 헬퍼
// ── 환경 설정 이벤트 ───────────────────────────────────────────
let _tempYouTubeChannels = [];

function renderSettingsYouTubeChannels() {
  const container = document.getElementById('youtube-channels-list');
  if (!container) return;

  if (_tempYouTubeChannels.length === 0) {
    container.innerHTML = '<div class="empty-state">등록된 유튜브 채널이 없습니다. 채널을 추가해 주세요.</div>';
    return;
  }

  container.innerHTML = _tempYouTubeChannels.map((ch, idx) => `
    <div class="youtube-config-item">
      <div class="youtube-config-item-info">
        <span class="youtube-config-name">${escapeHtml(ch.name)}</span>
        <span class="youtube-config-id">${escapeHtml(ch.id)}</span>
      </div>
      <button class="btn-delete-channel" data-index="${idx}">❌ 삭제</button>
    </div>
  `).join('');

  // 삭제 버튼 이벤트 바인딩
  container.querySelectorAll('.btn-delete-channel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      _tempYouTubeChannels.splice(idx, 1);
      renderSettingsYouTubeChannels();
    });
  });
}

function bindSettingsEvents() {
  const saveBtn = document.getElementById('btn-save-settings');
  const resetBtn = document.getElementById('btn-reset-settings');
  const copyBtn = document.getElementById('btn-copy-settings-token');
  const importBtn = document.getElementById('btn-import-settings-token');
  const addChannelBtn = document.getElementById('btn-add-youtube-channel');

  // OAuth 토글 변경 시: OAuth 전용 모델 활성/비활성 + 인증 배지 즉시 갱신
  document.getElementById('setting-gemini-oauth')?.addEventListener('change', () => {
    updateGeminiModelOptions();
    renderGeminiAuthBadge();
  });

  // 사용 가능한 모델 목록 불러오기
  document.getElementById('btn-load-gemini-models')?.addEventListener('click', loadAvailableGeminiModels);

  addChannelBtn?.addEventListener('click', async () => {
    const resolveInput = document.getElementById('youtube-channel-resolve-input');
    const urlOrHandle = resolveInput ? resolveInput.value.trim() : '';

    if (!urlOrHandle) {
      toast('유튜브 채널 주소 또는 핸들(@)을 입력해주세요.', 'error');
      return;
    }

    addChannelBtn.disabled = true;
    addChannelBtn.textContent = '⏳ 확인 중...';

    try {
      const res = await fetch('/api/youtube-channel-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlOrHandle })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '알 수 없는 서버 오류');
      }

      // 중복 체크
      if (_tempYouTubeChannels.some(ch => ch.id === data.id)) {
        toast('⚠️ 이미 등록된 채널입니다.', 'error');
        return;
      }

      _tempYouTubeChannels.push({ name: data.name, id: data.id });
      renderSettingsYouTubeChannels();

      if (resolveInput) resolveInput.value = '';
      toast(`✅ ${data.name} 채널이 추가되었습니다 (설정 저장 시 최종 반영).`, 'success');
    } catch (err) {
      console.error('[YouTubeResolve] 실패:', err);
      toast(`⚠️ 채널 인식 실패: ${err.message}`, 'error');
    } finally {
      addChannelBtn.disabled = false;
      addChannelBtn.textContent = '➕ 채널 추가';
    }
  });

  saveBtn?.addEventListener('click', () => {
    const overrides = {
      CLIENT_ID: document.getElementById('setting-client-id').value.trim(),
      API_KEY: document.getElementById('setting-api-key').value.trim(),
      TOOCHANGI_SHEET_ID: document.getElementById('setting-toochangi-sheet-id').value.trim(),
      GACHANGI_SHEET_ID: document.getElementById('setting-gachangi-sheet-id').value.trim(),
      SOURCE_FOLDER_ID: document.getElementById('setting-source-folder-id').value.trim(),
      ARCHIVE_FOLDER_ID: document.getElementById('setting-archive-folder-id').value.trim(),
      GEMINI_API_KEY: document.getElementById('setting-gemini-key').value.trim(),
      GEMINI_MODEL_ANALYSIS: document.getElementById('setting-gemini-model-analysis').value,
      GEMINI_MODEL_RECOMMEND: document.getElementById('setting-gemini-model-recommend').value,
      GEMINI_MODEL_VISION: document.getElementById('setting-gemini-model-vision').value,
      AI_PROVIDER: document.getElementById('setting-ai-provider')?.value || 'gemini',
      OPENAI_API_KEY: document.getElementById('setting-openai-key')?.value.trim() || '',
      OPENAI_MODEL: document.getElementById('setting-openai-model')?.value.trim() || 'gpt-4o',
      STRATEGY_CONTEXT: document.getElementById('setting-strategy-context')?.value || '',
      GEMINI_USE_OAUTH: !!document.getElementById('setting-gemini-oauth')?.checked,
    };

    localStorage.setItem('toochangi_config_overrides', JSON.stringify(overrides));
    localStorage.setItem('toochangi_youtube_channels', JSON.stringify(_tempYouTubeChannels));

    if (overrides.TOOCHANGI_SHEET_ID) {
      localStorage.setItem('toochangi_sheet_id', overrides.TOOCHANGI_SHEET_ID);
    }
    
    toast('✅ 설정이 브라우저 로컬에 저장되었습니다. 1초 뒤 새로고침하여 적용합니다.', 'success');
    setTimeout(() => {
      location.reload();
    }, 1200);
  });

  resetBtn?.addEventListener('click', () => {
    if (confirm('모든 사용자 설정을 초기화하시겠습니까? 저장된 API 키와 스프레드시트/드라이브 ID, 유튜브 채널 목록이 브라우저에서 모두 지워집니다.')) {
      localStorage.removeItem('toochangi_config_overrides');
      localStorage.removeItem('toochangi_sheet_id');
      localStorage.removeItem('toochangi_youtube_channels');
      toast('🔄 설정이 초기화되었습니다. 적용을 위해 새로고침합니다.', 'info');
      setTimeout(() => {
        location.reload();
      }, 1200);
    }
  });

  // 설정 토큰 클립보드 복사
  copyBtn?.addEventListener('click', () => {
    const tokenInput = document.getElementById('setting-export-token');
    if (!tokenInput || !tokenInput.value) return;
    tokenInput.select();
    navigator.clipboard.writeText(tokenInput.value);
    toast('📋 설정 토큰이 클립보드에 복사되었습니다!', 'success');
  });

  // 설정 토큰 가져오기
  importBtn?.addEventListener('click', () => {
    const importInput = document.getElementById('setting-import-token');
    const val = importInput ? importInput.value.trim() : '';
    if (!val) {
      toast('가져올 설정 토큰을 입력해주세요.', 'error');
      return;
    }
    try {
      // Base64 decode + UTF-8 decode
      const jsonStr = decodeURIComponent(escape(atob(val)));
      const parsed = JSON.parse(jsonStr);

      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('올바른 설정 데이터 구조가 아닙니다.');
      }

      // Extract YouTube channels if exist
      if (parsed.youtubeChannels) {
        localStorage.setItem('toochangi_youtube_channels', JSON.stringify(parsed.youtubeChannels));
        delete parsed.youtubeChannels; // do not store in config overrides overrides
      }

      localStorage.setItem('toochangi_config_overrides', JSON.stringify(parsed));
      if (parsed.TOOCHANGI_SHEET_ID) {
        localStorage.setItem('toochangi_sheet_id', parsed.TOOCHANGI_SHEET_ID);
      }

      toast('📥 설정을 성공적으로 가져왔습니다! 적용을 위해 새로고침합니다.', 'success');
      setTimeout(() => {
        location.reload();
      }, 1200);
    } catch (e) {
      console.error('설정 가져오기 실패:', e);
      alert('⚠️ 올바르지 않은 설정 토큰입니다. 복사한 토큰이 깨졌는지 다시 확인해 주세요: ' + e.message);
    }
  });
}

// AI 응답에 붙일 모델/인증 라벨. 예: "🤖 gemini-3-pro-preview (OAuth)"
function aiModelLabel(r) {
  if (!r || !r.model) return '';
  const auth = r.provider === 'gpt' ? 'OpenAI' : (r.auth === 'oauth' ? 'OAuth' : 'API키');
  return `🤖 ${r.model} (${auth})`;
}

// Gemini 인증 상태 배지: 현재 OAuth/키 중 무엇으로 호출되는지, scope 설정 여부를 한눈에 표시
function renderGeminiAuthBadge() {
  const el = document.getElementById('gemini-auth-badge');
  if (!el) return;
  if (typeof Toochangi === 'undefined' || !Toochangi.getGeminiAuthStatus) { el.innerHTML = ''; return; }
  const s = Toochangi.getGeminiAuthStatus();
  const chip = (text, color, bg) =>
    `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-weight:600;color:${color};background:${bg};">${text}</span>`;

  // '재로그인 필요'(config엔 scope 있으나 토큰 미반영)는 마지막 호출 경로와 무관하게 최우선 경고
  let line1;
  if (s.needsRelogin) {
    line1 = chip('🔄 재로그인 필요', '#92400e', 'rgba(245,158,11,0.18)')
      + ' <span style="color:#94a3b8;">— scope는 설정됐지만 현재 토큰엔 미반영 (지금은 키로 폴백 중)</span>';
  } else if (s.lastUsed === 'oauth') {
    line1 = chip('🔓 OAuth로 호출 중', '#065f46', 'rgba(16,185,129,0.18)') + ' <span style="color:#94a3b8;">— 키 없이 구글 로그인 토큰 사용</span>';
  } else if (s.lastUsed === 'key') {
    line1 = chip('🔑 API 키로 호출 중', '#92400e', 'rgba(245,158,11,0.18)') + ' <span style="color:#94a3b8;">— 브라우저에 키 저장됨</span>';
  } else {
    // 아직 호출 전 → 예상 경로
    const map = {
      oauth: [chip('🔓 OAuth 사용 예정', '#065f46', 'rgba(16,185,129,0.18)'), '토큰에 scope 반영됨'],
      relogin: [chip('🔄 재로그인 필요', '#92400e', 'rgba(245,158,11,0.18)'), 'scope 설정됐으나 토큰 미반영'],
      'oauth-fallback': [chip('🔑 키(폴백) 예정', '#92400e', 'rgba(245,158,11,0.18)'), 'scope 미설정 → OAuth 시도 후 키로 폴백'],
      key: [chip('🔑 API 키 사용 예정', '#92400e', 'rgba(245,158,11,0.18)'), '로그인 토큰 없음'],
      none: [chip('⚠️ 인증 없음', '#991b1b', 'rgba(239,68,68,0.18)'), '키도 토큰도 없음'],
    };
    const m = map[s.expected] || map.none;
    line1 = m[0] + ` <span style="color:#94a3b8;">— ${m[1]} (호출 시 확정)</span>`;
  }

  // 상태 상세: config scope와 '토큰 실제 반영'을 구분 표시
  const ok = (b) => b ? '<span style="color:#10b981;">●</span>' : '<span style="color:#64748b;">○</span>';
  const line2 = `<div style="margin-top:6px;color:#94a3b8;">`
    + `${ok(s.hasToken)} 로그인 토큰 &nbsp; `
    + `${ok(s.scopeConfigured)} scope 설정 &nbsp; `
    + `${ok(s.tokenHasScope)} 토큰에 반영 &nbsp; `
    + `${ok(s.hasKey)} API 키`
    + `</div>`;

  // 상황별 안내
  let hint = '';
  if (s.needsRelogin) {
    hint = `<div style="margin-top:6px;color:#f59e0b;">➡️ <b>로그아웃 후 다시 로그인</b>하세요. 동의화면에서 <code>generative-language.retriever</code> 권한을 새로 허용해야 토큰에 반영됩니다. (재로그인해도 403이면 GCP에서 <b>Generative Language API 활성화</b> 또는 동의화면 <b>scope 등록</b> 확인)</div>`;
  } else if (s.hasToken && !s.scopeConfigured) {
    hint = `<div style="margin-top:6px;color:#64748b;">키 없이 OAuth로 쓰려면: GCP에서 Generative Language API 활성화 + 동의화면에 <code>generative-language.retriever</code> scope 등록 → 아래 <b>‘Gemini를 OAuth로 호출’ 체크 후 저장</b> → 로그아웃·재로그인</div>`;
  }

  el.innerHTML = line1 + line2 + hint;
}

// OAuth 전용 모델(gemini-3-*-preview) 가드: OAuth 체크가 꺼져 있으면 선택 불가(비활성화),
// 이미 선택돼 있으면 안전한 기본값으로 되돌림. 체크 토글/설정 열기 시 호출.
function updateGeminiModelOptions() {
  const oauthOn = !!document.getElementById('setting-gemini-oauth')?.checked;
  const selects = [
    { id: 'setting-gemini-model-analysis', def: 'gemini-2.5-pro' },
    { id: 'setting-gemini-model-recommend', def: 'gemini-2.5-flash' },
    { id: 'setting-gemini-model-vision', def: 'gemini-2.5-flash' },
  ];
  selects.forEach(({ id, def }) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    // OAuth 꺼짐 + 현재 선택이 OAuth 전용 → 기본값으로 되돌린 뒤 비활성화
    if (!oauthOn) {
      const cur = sel.options[sel.selectedIndex];
      if (cur && cur.dataset && cur.dataset.oauthOnly === '1') sel.value = def;
    }
    Array.from(sel.options).forEach(o => {
      if (o.dataset && o.dataset.oauthOnly === '1') o.disabled = !oauthOn;
    });
  });
}

// 받아온 모델 목록을 3개 드롭다운 맨 위 '내 계정 사용 가능 모델' 그룹에 채움(선택값 유지)
function populateModelDropdowns(models) {
  const ids = ['setting-gemini-model-analysis', 'setting-gemini-model-recommend', 'setting-gemini-model-vision'];
  ids.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const cur = sel.value;
    const old = sel.querySelector('optgroup[data-fetched="1"]');
    if (old) old.remove();
    const og = document.createElement('optgroup');
    og.label = '내 계정 사용 가능 모델';
    og.setAttribute('data-fetched', '1');
    models.forEach(m => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.displayName ? `${m.id} — ${m.displayName}` : m.id;
      og.appendChild(o);
    });
    sel.insertBefore(og, sel.firstChild);
    // 기존 선택값이 목록에 있으면 유지
    if (cur) sel.value = cur;
  });
}

// '사용 가능한 모델 불러오기' 버튼 핸들러
async function loadAvailableGeminiModels() {
  const btn = document.getElementById('btn-load-gemini-models');
  const status = document.getElementById('gemini-models-status');
  if (typeof Toochangi === 'undefined' || !Toochangi.listAvailableModels) return;
  if (btn) btn.disabled = true;
  if (status) { status.style.color = '#94a3b8'; status.textContent = '⏳ 불러오는 중...'; }
  try {
    const models = await Toochangi.listAvailableModels();
    if (!models.length) {
      if (status) { status.style.color = '#f59e0b'; status.textContent = '⚠️ generateContent 지원 모델이 없습니다.'; }
      return;
    }
    populateModelDropdowns(models);
    if (status) { status.style.color = '#10b981'; status.textContent = `✅ ${models.length}개 모델 로드됨 — 드롭다운 상단에서 선택 후 저장`; }
  } catch (e) {
    if (status) { status.style.color = 'var(--accent-red)'; status.textContent = `❌ ${e.message}`; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initSettingsFields() {
  const cfg = window.TOOCHANGI_CONFIG || {};
  const sheetLink = document.getElementById('btn-open-sheet');
  if (sheetLink) {
    const sheetId = cfg.TOOCHANGI_SHEET_ID;
    sheetLink.href = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : '#';
  }
  if (document.getElementById('setting-client-id')) document.getElementById('setting-client-id').value = cfg.CLIENT_ID || '';
  if (document.getElementById('setting-api-key')) document.getElementById('setting-api-key').value = cfg.API_KEY || '';
  if (document.getElementById('setting-toochangi-sheet-id')) document.getElementById('setting-toochangi-sheet-id').value = cfg.TOOCHANGI_SHEET_ID || '';
  if (document.getElementById('setting-gachangi-sheet-id')) document.getElementById('setting-gachangi-sheet-id').value = cfg.GACHANGI_SHEET_ID || '';
  if (document.getElementById('setting-source-folder-id')) document.getElementById('setting-source-folder-id').value = cfg.SOURCE_FOLDER_ID || '';
  if (document.getElementById('setting-archive-folder-id')) document.getElementById('setting-archive-folder-id').value = cfg.ARCHIVE_FOLDER_ID || '';
  if (document.getElementById('setting-gemini-key')) document.getElementById('setting-gemini-key').value = cfg.GEMINI_API_KEY || '';
  if (document.getElementById('setting-gemini-model-analysis')) document.getElementById('setting-gemini-model-analysis').value = cfg.GEMINI_MODEL_ANALYSIS || 'gemini-2.5-pro';
  if (document.getElementById('setting-gemini-model-recommend')) document.getElementById('setting-gemini-model-recommend').value = cfg.GEMINI_MODEL_RECOMMEND || 'gemini-2.5-flash';
  if (document.getElementById('setting-gemini-model-vision')) document.getElementById('setting-gemini-model-vision').value = cfg.GEMINI_MODEL_VISION || 'gemini-2.5-flash';
  if (document.getElementById('setting-ai-provider')) document.getElementById('setting-ai-provider').value = cfg.AI_PROVIDER || 'gemini';
  if (document.getElementById('setting-openai-key')) document.getElementById('setting-openai-key').value = cfg.OPENAI_API_KEY || '';
  if (document.getElementById('setting-openai-model')) document.getElementById('setting-openai-model').value = cfg.OPENAI_MODEL || 'gpt-4o';
  if (document.getElementById('setting-strategy-context')) document.getElementById('setting-strategy-context').value = cfg.STRATEGY_CONTEXT || '';
  if (document.getElementById('setting-gemini-oauth')) document.getElementById('setting-gemini-oauth').checked = !!cfg.GEMINI_USE_OAUTH;

  // 유튜브 채널 초기화
  try {
    const stored = localStorage.getItem('toochangi_youtube_channels');
    if (stored) {
      _tempYouTubeChannels = JSON.parse(stored);
    } else {
      _tempYouTubeChannels = JSON.parse(JSON.stringify(cfg.DEFAULT_YOUTUBE_CHANNELS || []));
    }
  } catch (e) {
    console.error('유튜브 설정 채널 불러오기 실패:', e);
    _tempYouTubeChannels = JSON.parse(JSON.stringify(cfg.DEFAULT_YOUTUBE_CHANNELS || []));
  }
  renderSettingsYouTubeChannels();
  renderGeminiAuthBadge();
  updateGeminiModelOptions();

  // 설정 내보내기 토큰 생성 및 노출
  const overrides = {
    CLIENT_ID: cfg.CLIENT_ID || '',
    API_KEY: cfg.API_KEY || '',
    TOOCHANGI_SHEET_ID: cfg.TOOCHANGI_SHEET_ID || '',
    GACHANGI_SHEET_ID: cfg.GACHANGI_SHEET_ID || '',
    SOURCE_FOLDER_ID: cfg.SOURCE_FOLDER_ID || '',
    ARCHIVE_FOLDER_ID: cfg.ARCHIVE_FOLDER_ID || '',
    GEMINI_API_KEY: cfg.GEMINI_API_KEY || '',
    GEMINI_MODEL_ANALYSIS: cfg.GEMINI_MODEL_ANALYSIS || 'gemini-2.5-pro',
    GEMINI_MODEL_RECOMMEND: cfg.GEMINI_MODEL_RECOMMEND || 'gemini-2.5-flash',
    GEMINI_MODEL_VISION: cfg.GEMINI_MODEL_VISION || 'gemini-2.5-flash',
    AI_PROVIDER: cfg.AI_PROVIDER || 'gemini',
    OPENAI_API_KEY: cfg.OPENAI_API_KEY || '',
    OPENAI_MODEL: cfg.OPENAI_MODEL || 'gpt-4o',
    STRATEGY_CONTEXT: cfg.STRATEGY_CONTEXT || '',
    GEMINI_USE_OAUTH: !!cfg.GEMINI_USE_OAUTH,
    youtubeChannels: _tempYouTubeChannels,
  };
  try {
    const jsonStr = JSON.stringify(overrides);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    const exportInput = document.getElementById('setting-export-token');
    if (exportInput) exportInput.value = b64;
  } catch (e) {
    console.error('설정 토큰 생성 실패:', e);
  }
}

// 다중 선택 상태 업데이트 및 버튼 제어
function updateBulkActionsVisibility() {
  const checked = document.querySelectorAll('.chk-portfolio-row:checked');
  const bulkEditBtn = document.getElementById('btn-bulk-edit');
  const bulkDeleteBtn = document.getElementById('btn-bulk-delete');
  if (bulkEditBtn && bulkDeleteBtn) {
    if (checked.length > 0) {
      bulkEditBtn.classList.remove('hidden');
      bulkDeleteBtn.classList.remove('hidden');
    } else {
      bulkEditBtn.classList.add('hidden');
      bulkDeleteBtn.classList.add('hidden');
    }
  }
}

// 다중 수정 모달 채우기 및 열기
function openBulkEditModal() {
  const checked = document.querySelectorAll('.chk-portfolio-row:checked');
  if (checked.length === 0) return;

  const portfolio = Toochangi.getPortfolio();
  const tbody = document.getElementById('bulk-edit-portfolio-tbody');
  if (!tbody) return;

  tbody.innerHTML = Array.from(checked).map(chk => {
    const rIdx = parseInt(chk.dataset.rowindex, 10);
    const item = portfolio.find(p => p.rowIndex === rIdx);
    if (!item) return '';

    return `<tr data-rowindex="${rIdx}">
      <td style="font-weight: 600;">${escapeHtml(item.name)}</td>
      <td><code style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px;">${escapeHtml(item.ticker)}</code></td>
      <td><input type="number" step="any" class="bulk-qty" value="${item.qty || 0}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px; text-align: right;" /></td>
      <td><input type="number" step="any" class="bulk-avg" value="${item.avgPrice || 0}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px; text-align: right;" /></td>
      <td><input type="text" class="bulk-memo" value="${escapeHtml(item.memo || '')}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px;" /></td>
    </tr>`;
  }).join('');

  document.getElementById('modal-bulk-edit-portfolio').classList.remove('hidden');
}

// 다중 수정 사항 저장
async function saveBulkEdit() {
  const tbody = document.getElementById('bulk-edit-portfolio-tbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr');
  if (rows.length === 0) return;

  toast('⏳ 다중 수정사항 저장 중...', 'info');
  document.getElementById('modal-bulk-edit-portfolio').classList.add('hidden');

  try {
    const portfolio = Toochangi.getPortfolio();
    const updates = [];
    for (const row of rows) {
      const rIdx = parseInt(row.dataset.rowindex, 10);
      const item = portfolio.find(p => p.rowIndex === rIdx);
      if (!item) continue;

      const qty = parseFloat(row.querySelector('.bulk-qty').value) || 0;
      const avgPrice = parseFloat(row.querySelector('.bulk-avg').value) || 0;
      const memo = row.querySelector('.bulk-memo').value.trim();

      if (qty <= 0 || avgPrice <= 0) continue;

      updates.push({
        rowIndex: rIdx,
        row: {
          name: item.name,
          ticker: item.ticker,
          market: item.market,
          qty,
          avgPrice,
          curPrice: item.curPrice || avgPrice,
          owner: item.owner || '',
          memo
        }
      });
    }

    if (updates.length > 0) {
      await Toochangi.updatePortfolioRows(updates);
    }

    toast('✅ 다중 수정 완료!', 'success');
    renderPortfolioTab();
    renderDashboard();
    updateBulkActionsVisibility();
  } catch (err) {
    toast('⚠️ 다중 수정 실패: ' + err.message, 'error');
  }
}

// 선택 종목 다중 삭제
async function deleteBulkHoldings() {
  const checked = document.querySelectorAll('.chk-portfolio-row:checked');
  if (checked.length === 0) return;

  if (!confirm(`선택한 ${checked.length}개 종목을 정말로 모두 삭제하시겠습니까?`)) return;

  toast('⏳ 다중 종목 삭제 중...', 'info');

  try {
    const rowIndices = Array.from(checked).map(chk => parseInt(chk.dataset.rowindex, 10));
    await Toochangi.deletePortfolioRows(rowIndices);

    toast('✅ 선택 삭제 완료!', 'success');
    renderPortfolioTab();
    renderDashboard();
    updateBulkActionsVisibility();
  } catch (err) {
    toast('⚠️ 선택 삭제 실패: ' + err.message, 'error');
  }
}

// ── 예적금 / 부동산 탭 렌더링 및 벌크 액션 ──
// 예적금 핵심 지표 카드: 현금 자산(잔액 합계) / 총 수익률(연 예상 이자 + 평균 금리)
function renderSavingsSummaryCards(savings) {
  let totalCash = 0;
  let interestSum = 0;   // Σ(잔액 × 금리/100)
  let weightedRateNum = 0; // Σ(잔액 × 금리)
  savings.forEach(s => {
    const bal = Toochangi.calcSavingsBalance(s);
    const rate = parseFloat(s.rate) || 0;
    totalCash += bal;
    interestSum += bal * rate / 100;
    weightedRateNum += bal * rate;
  });
  const avgRate = totalCash > 0 ? weightedRateNum / totalCash : 0;

  const cashEl = document.getElementById('savings-total-cash');
  if (cashEl) cashEl.textContent = totalCash > 0 ? `${Math.floor(totalCash).toLocaleString()}원` : '—';

  const yieldEl = document.getElementById('savings-total-yield');
  if (yieldEl) {
    yieldEl.textContent = interestSum > 0 ? `+${Math.floor(interestSum).toLocaleString()}원` : (totalCash > 0 ? '0원' : '—');
    yieldEl.style.color = interestSum > 0 ? 'var(--accent-green)' : 'var(--text-primary)';
  }
  const subEl = document.getElementById('savings-total-yield-sub');
  if (subEl) subEl.textContent = totalCash > 0 ? `연 예상 이자 · 평균 금리 ${avgRate.toFixed(2)}%` : '예적금 이자 수익';

  // 현금 자산 전월 대비 (자산현황 월별 스냅샷 기준)
  const prevSnap = previousAssetSnapshot();
  setAssetDelta('savings-total-cash-delta', totalCash, prevSnap && prevSnap.cash ? prevSnap.cash : null);
}

function renderSavingsTab() {
  const sheetLink = document.getElementById('btn-savings-open-sheet');
  if (sheetLink) {
    const sheetId = (window.TOOCHANGI_CONFIG || {}).TOOCHANGI_SHEET_ID;
    sheetLink.href = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : '#';
  }

  const tbody = document.getElementById('savings-tbody');
  const savings = Toochangi.getSavings();
  renderSavingsSummaryCards(savings);

  if (savings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" class="empty-state">자산을 추가해 주세요</td></tr>';
    const chkAll = document.getElementById('chk-savings-all');
    if (chkAll) chkAll.checked = false;
    updateSavingsBulkActionsVisibility();
    return;
  }

  tbody.innerHTML = savings.map(s => {
    return `<tr data-rowindex="${s.rowIndex}">
      <td style="text-align: center;">
        <input type="checkbox" class="chk-savings-row" data-rowindex="${s.rowIndex}" style="cursor:pointer;" />
      </td>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.bank)}</td>
      <td>${escapeHtml(s.owner || '—')}</td>
      <td>${escapeHtml(s.accountNumber || '—')}</td>
      <td><span class="badge" style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${escapeHtml(s.type)}</span></td>
      <td>${s.rate}%</td>
      <td>${Toochangi.calcSavingsBalance(s).toLocaleString()}원</td>
      <td>${(parseFloat(s.monthlyDeposit) || 0) > 0
        ? `<span style="color: var(--accent-green); font-weight: 500;">+${(parseFloat(s.monthlyDeposit) || 0).toLocaleString()}원</span><br><span style="color: var(--text-muted); font-size: 11px;">매월 ${escapeHtml(s.depositDay || 5)}일</span>`
        : '—'}</td>
      <td>${escapeHtml(s.maturity || '—')}</td>
      <td><span style="color: var(--accent-orange); font-weight: 500;">${escapeHtml(s.purpose || '—')}</span></td>
      <td style="color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(s.memo)}">${escapeHtml(s.memo || '—')}</td>
      <td>${escapeHtml(s.date || '—')}</td>
      <td style="text-align: center;">
        <div style="display:flex; gap:4px; justify-content:center;">
          <button class="btn-primary-sm edit-savings-btn" data-rowindex="${s.rowIndex}" style="padding: 2px 8px; font-size: 11px;">수정</button>
          <button class="btn-primary-sm delete-savings-btn" style="padding: 2px 8px; font-size: 11px; background:var(--accent-red); border-color:var(--accent-red);" data-rowindex="${s.rowIndex}">삭제</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.edit-savings-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rIdx = parseInt(e.target.dataset.rowindex, 10);
      const item = savings.find(s => s.rowIndex === rIdx);
      if (!item) return;

      document.getElementById('input-savings-row-index').value = rIdx;
      document.getElementById('input-savings-name').value = item.name;
      document.getElementById('input-savings-bank').value = item.bank;
      document.getElementById('input-savings-owner').value = item.owner || '';
      document.getElementById('input-savings-accountNumber').value = item.accountNumber || '';
      document.getElementById('input-savings-type').value = item.type;
      document.getElementById('input-savings-rate').value = item.rate;
      document.getElementById('input-savings-balance').value = item.balance;
      
      let matDate = '';
      if (item.maturity) {
        const match = item.maturity.match(/(\d{4})[.-]\s*(\d{1,2})[.-]\s*(\d{1,2})/);
        if (match) {
          matDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        } else {
          matDate = item.maturity;
        }
      }
      document.getElementById('input-savings-maturity').value = matDate;
      document.getElementById('input-savings-purpose').value = item.purpose;
      document.getElementById('input-savings-memo').value = item.memo || '';
      document.getElementById('input-savings-monthly-deposit').value = item.monthlyDeposit || '';
      document.getElementById('input-savings-deposit-day').value = item.depositDay || '';
      document.getElementById('input-savings-deposit-start').value = item.depositStartDate || '';
      renderSavingsLinkedAccountOptions(item.accountNumber || '');

      document.getElementById('savings-modal-title').textContent = '예적금 수정';
      document.getElementById('modal-savings-add-edit').classList.remove('hidden');
    });
  });

  tbody.querySelectorAll('.delete-savings-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const rIdx = parseInt(e.target.dataset.rowindex, 10);
      const item = savings.find(s => s.rowIndex === rIdx);
      if (!item) return;

      if (!confirm(`"${item.name}" 자산을 정말로 삭제하시겠습니까?`)) return;

      toast('⏳ 예적금 삭제 중...', 'info');
      try {
        await Toochangi.deleteSavings(rIdx);
        toast(`✅ ${item.name} 삭제 완료`, 'success');
        renderSavingsTab();
        renderDashboard();
        updateSavingsBulkActionsVisibility();
      } catch (err) {
        toast('⚠️ 삭제 실패: ' + err.message, 'error');
      }
    });
  });

  tbody.querySelectorAll('.chk-savings-row').forEach(chk => {
    chk.addEventListener('change', () => {
      updateSavingsBulkActionsVisibility();
    });
  });

  const chkAll = document.getElementById('chk-savings-all');
  if (chkAll) {
    const newChkAll = chkAll.cloneNode(true);
    chkAll.parentNode.replaceChild(newChkAll, chkAll);
    newChkAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      tbody.querySelectorAll('.chk-savings-row').forEach(chk => {
        chk.checked = checked;
      });
      updateSavingsBulkActionsVisibility();
    });
  }
}

function updateSavingsBulkActionsVisibility() {
  const checked = document.querySelectorAll('.chk-savings-row:checked');
  const bulkEditBtn = document.getElementById('btn-savings-bulk-edit');
  const bulkDeleteBtn = document.getElementById('btn-savings-bulk-delete');
  if (bulkEditBtn && bulkDeleteBtn) {
    if (checked.length > 0) {
      bulkEditBtn.classList.remove('hidden');
      bulkDeleteBtn.classList.remove('hidden');
    } else {
      bulkEditBtn.classList.add('hidden');
      bulkDeleteBtn.classList.add('hidden');
    }
  }
}

function openSavingsBulkEditModal() {
  const checked = document.querySelectorAll('.chk-savings-row:checked');
  if (checked.length === 0) return;

  const savings = Toochangi.getSavings();
  const tbody = document.getElementById('bulk-edit-savings-tbody');
  if (!tbody) return;

  tbody.innerHTML = Array.from(checked).map(chk => {
    const rIdx = parseInt(chk.dataset.rowindex, 10);
    const item = savings.find(s => s.rowIndex === rIdx);
    if (!item) return '';

    return `<tr data-rowindex="${rIdx}">
      <td style="font-weight: 600;">${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.bank)}</td>
      <td><input type="number" step="0.01" class="bulk-savings-rate" value="${item.rate || 0}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px; text-align: right;" /></td>
      <td><input type="number" class="bulk-savings-balance" value="${item.balance || 0}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px; text-align: right;" /></td>
      <td><input type="text" class="bulk-savings-purpose" value="${escapeHtml(item.purpose || '')}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px;" /></td>
      <td><input type="text" class="bulk-savings-memo" value="${escapeHtml(item.memo || '')}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px;" /></td>
    </tr>`;
  }).join('');

  document.getElementById('modal-savings-bulk-edit').classList.remove('hidden');
}

async function saveSavingsBulkEdit() {
  const tbody = document.getElementById('bulk-edit-savings-tbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr');
  if (rows.length === 0) return;

  toast('⏳ 예적금 다중 수정사항 저장 중...', 'info');
  document.getElementById('modal-savings-bulk-edit').classList.add('hidden');

  try {
    const savings = Toochangi.getSavings();
    const updates = [];
    for (const row of rows) {
      const rIdx = parseInt(row.dataset.rowindex, 10);
      const item = savings.find(s => s.rowIndex === rIdx);
      if (!item) continue;

      const rate = parseFloat(row.querySelector('.bulk-savings-rate').value) || 0;
      const balance = parseFloat(row.querySelector('.bulk-savings-balance').value) || 0;
      const purpose = row.querySelector('.bulk-savings-purpose').value.trim();
      const memo = row.querySelector('.bulk-savings-memo').value.trim();

      updates.push({
        rowIndex: rIdx,
        row: {
          name: item.name,
          bank: item.bank,
          owner: item.owner,
          accountNumber: item.accountNumber,
          type: item.type,
          rate,
          balance,
          maturity: item.maturity,
          purpose,
          memo,
          monthlyDeposit: item.monthlyDeposit,
          depositDay: item.depositDay,
          depositStartDate: item.depositStartDate
        }
      });
    }

    if (updates.length > 0) {
      await Toochangi.updateSavingsRows(updates);
    }

    toast('✅ 다중 수정 완료!', 'success');
    renderSavingsTab();
    renderDashboard();
    updateSavingsBulkActionsVisibility();
  } catch (err) {
    toast('⚠️ 다중 수정 실패: ' + err.message, 'error');
  }
}

async function deleteSavingsBulk() {
  const checked = document.querySelectorAll('.chk-savings-row:checked');
  if (checked.length === 0) return;

  if (!confirm(`선택한 ${checked.length}개 예적금 자산을 정말로 모두 삭제하시겠습니까?`)) return;

  toast('⏳ 다중 자산 삭제 중...', 'info');

  try {
    const rowIndices = Array.from(checked).map(chk => parseInt(chk.dataset.rowindex, 10));
    await Toochangi.deleteSavingsRows(rowIndices);

    toast('✅ 선택 삭제 완료!', 'success');
    renderSavingsTab();
    renderDashboard();
    updateSavingsBulkActionsVisibility();
  } catch (err) {
    toast('⚠️ 선택 삭제 실패: ' + err.message, 'error');
  }
}

function formatRealEstateCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Math.round(Number(value)).toLocaleString()}원`;
}

// 원리금균등 상환 기준 '연간 상환금액'(원금+이자) 계산. 대출 정보가 없으면 null.
function calcAnnualLoanRepayment(item) {
  const principal = parseFloat(item.loanAmount) || 0;
  const annualRate = parseFloat(item.loanRate) || 0;
  const termYears = parseInt(item.loanTermYears, 10) || 0;
  if (principal <= 0 || termYears <= 0) return null;

  const termMonths = termYears * 12;
  let monthlyPayment;
  if (annualRate <= 0) {
    monthlyPayment = principal / termMonths; // 무이자: 원금 균등
  } else {
    const r = annualRate / 100 / 12;
    const f = Math.pow(1 + r, termMonths);
    monthlyPayment = principal * r * f / (f - 1);
  }
  return Math.round(monthlyPayment * 12);
}

function getElapsedLoanMonths(loanStartDate, termMonths, asOf) {
  if (!loanStartDate || !termMonths) return 0;

  const start = new Date(`${loanStartDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;

  const today = (asOf instanceof Date && !Number.isNaN(asOf.getTime())) ? asOf : new Date();
  let months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  if (today.getDate() < start.getDate()) months -= 1;

  return Math.max(0, Math.min(termMonths, months));
}

// asOf(Date)를 주면 그 시점 기준 상환 진행도를 계산 (과거 스냅샷용). 없으면 오늘 기준.
function calculateLoanProgress(realEstateItem, asOf) {
  const principal = parseFloat(realEstateItem.loanAmount) || 0;
  const annualRate = parseFloat(realEstateItem.loanRate) || 0;
  const termYears = parseInt(realEstateItem.loanTermYears, 10) || 0;
  const loanStartDate = realEstateItem.loanStartDate || '';

  if (principal <= 0) return null;
  if (!loanStartDate || !termYears) {
    return {
      paidPrincipal: null,
      paidInterest: null,
      remainingBalance: null
    };
  }

  const termMonths = termYears * 12;
  const elapsedMonths = getElapsedLoanMonths(loanStartDate, termMonths, asOf);
  if (termMonths <= 0) {
    return {
      paidPrincipal: null,
      paidInterest: null,
      remainingBalance: null
    };
  }

  if (annualRate <= 0) {
    const monthlyPrincipal = principal / termMonths;
    const paidPrincipal = Math.min(principal, monthlyPrincipal * elapsedMonths);
    return {
      paidPrincipal,
      paidInterest: 0,
      remainingBalance: Math.max(0, principal - paidPrincipal)
    };
  }

  const monthlyRate = annualRate / 100 / 12;
  const monthlyFactor = Math.pow(1 + monthlyRate, termMonths);
  const monthlyPayment = principal * monthlyRate * monthlyFactor / (monthlyFactor - 1);

  let remainingBalance = principal;
  let paidPrincipal = 0;
  let paidInterest = 0;

  for (let i = 0; i < elapsedMonths; i += 1) {
    const interestPayment = remainingBalance * monthlyRate;
    const principalPayment = Math.min(remainingBalance, monthlyPayment - interestPayment);
    paidInterest += interestPayment;
    paidPrincipal += principalPayment;
    remainingBalance = Math.max(0, remainingBalance - principalPayment);
    if (remainingBalance <= 0) break;
  }

  return {
    paidPrincipal,
    paidInterest,
    remainingBalance
  };
}

// 부동산 핵심 지표 카드 (총 시세 / 순자산 / 잔여 대출 / 평가손익)
function renderRealestateSummaryCards(realEstate) {
  let totalValue = 0, totalPurchase = 0, totalDebt = 0;
  realEstate.forEach(item => {
    totalValue += parseFloat(item.currentValue) || 0;
    totalPurchase += parseFloat(item.purchasePrice) || 0;
    const loanAmount = parseFloat(item.loanAmount) || 0;
    if (loanAmount > 0) {
      const p = calculateLoanProgress(item);
      totalDebt += (p && p.remainingBalance != null) ? p.remainingBalance : loanAmount;
    }
  });
  const net = totalValue - totalDebt;
  const gain = totalValue - totalPurchase;
  const gainPct = totalPurchase > 0 ? (gain / totalPurchase * 100) : 0;

  const setV = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setV('re-total-value', totalValue > 0 ? `${Math.floor(totalValue).toLocaleString()}원` : '—');
  setV('re-net', (totalValue > 0 || totalDebt > 0) ? `${Math.floor(net).toLocaleString()}원` : '—');
  setV('re-debt', totalDebt > 0 ? `${Math.floor(totalDebt).toLocaleString()}원` : '—');

  const gainEl = document.getElementById('re-gain');
  if (gainEl) {
    gainEl.textContent = totalPurchase > 0 ? `${gain >= 0 ? '+' : ''}${Math.floor(gain).toLocaleString()}원` : '—';
    gainEl.style.color = gain > 0 ? 'var(--accent-green)' : (gain < 0 ? 'var(--accent-red)' : 'var(--text-primary)');
  }
  const gainSubEl = document.getElementById('re-gain-sub');
  if (gainSubEl) {
    gainSubEl.textContent = totalPurchase > 0 ? `매입가 대비 ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%` : '시세 − 매입가';
    gainSubEl.style.color = totalPurchase > 0
      ? (gainPct > 0 ? 'var(--accent-green)' : (gainPct < 0 ? 'var(--accent-red)' : 'var(--text-muted)'))
      : 'var(--text-muted)';
  }

  // 전월 대비 (자산현황 월별 스냅샷 기준)
  const prevSnap = previousAssetSnapshot();
  setAssetDelta('re-total-value-delta', totalValue, prevSnap && prevSnap.realEstate ? prevSnap.realEstate : null);
  const prevReNet = (prevSnap && prevSnap.realEstate) ? (prevSnap.realEstate - prevSnap.debt) : null;
  setAssetDelta('re-net-delta', net, prevReNet);
  setAssetDelta('re-debt-delta', totalDebt, prevSnap && prevSnap.debt ? prevSnap.debt : null, true);
}

function renderRealestateTab() {
  const sheetLink = document.getElementById('btn-realestate-open-sheet');
  if (sheetLink) {
    const sheetId = (window.TOOCHANGI_CONFIG || {}).TOOCHANGI_SHEET_ID;
    sheetLink.href = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : '#';
  }

  const tbody = document.getElementById('realestate-tbody');
  const realEstate = Toochangi.getRealEstate();
  renderRealestateSummaryCards(realEstate);

  if (realEstate.length === 0) {
    tbody.innerHTML = '<tr><td colspan="16" class="empty-state">부동산을 추가해 주세요</td></tr>';
    return;
  }

  tbody.innerHTML = realEstate.map(r => {
    const loanProgress = calculateLoanProgress(r);
    return `<tr data-rowindex="${r.rowIndex}">
      <td><strong>${escapeHtml(r.name)}</strong></td>
      <td>${r.purchasePrice.toLocaleString()}원</td>
      <td>${r.currentValue.toLocaleString()}원</td>
      <td style="color: var(--accent-red);">${r.loanAmount > 0 ? formatRealEstateCurrency(r.loanAmount) : '—'}</td>
      <td>${r.loanRate > 0 ? r.loanRate + '%' : '—'}</td>
      <td>${escapeHtml(r.loanStartDate || '—')}</td>
      <td>${r.loanTermYears ? `${r.loanTermYears}년` : '—'}</td>
      <td>${loanProgress ? formatRealEstateCurrency(loanProgress.paidPrincipal) : '—'}</td>
      <td>${loanProgress ? formatRealEstateCurrency(loanProgress.paidInterest) : '—'}</td>
      <td style="color: var(--accent-yellow);">${loanProgress ? formatRealEstateCurrency(loanProgress.remainingBalance) : '—'}</td>
      <td style="color: var(--accent-green); font-weight: 500;">${calcAnnualLoanRepayment(r) != null ? formatRealEstateCurrency(calcAnnualLoanRepayment(r)) : '—'}</td>
      <td><span style="color: var(--accent-orange); font-weight: 500;">${escapeHtml(r.purpose || '—')}</span></td>
      <td style="color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(r.memo)}">${escapeHtml(r.memo || '—')}</td>
      <td>${escapeHtml(r.date || '—')}</td>
      <td style="text-align: center;">
        <div style="display:flex; gap:4px; justify-content:center;">
          <button class="btn-primary-sm edit-realestate-btn" data-rowindex="${r.rowIndex}" style="padding: 2px 8px; font-size: 11px;">수정</button>
          <button class="btn-primary-sm delete-realestate-btn" style="padding: 2px 8px; font-size: 11px; background:var(--accent-red); border-color:var(--accent-red);" data-rowindex="${r.rowIndex}">삭제</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.edit-realestate-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rIdx = parseInt(e.target.dataset.rowindex, 10);
      const item = realEstate.find(r => r.rowIndex === rIdx);
      if (!item) return;

      document.getElementById('input-realestate-row-index').value = rIdx;
      document.getElementById('input-realestate-name').value = item.name;
      document.getElementById('input-realestate-purchasePrice').value = item.purchasePrice;
      document.getElementById('input-realestate-currentValue').value = item.currentValue;
      document.getElementById('input-realestate-loanAmount').value = item.loanAmount;
      document.getElementById('input-realestate-loanRate').value = item.loanRate;
      document.getElementById('input-realestate-loanStartDate').value = item.loanStartDate || '';
      document.getElementById('input-realestate-loanTermYears').value = item.loanTermYears || '';
      document.getElementById('input-realestate-deposit').value = item.deposit;
      document.getElementById('input-realestate-maintenance').value = item.maintenance;
      document.getElementById('input-realestate-purpose').value = item.purpose;
      document.getElementById('input-realestate-memo').value = item.memo || '';

      document.getElementById('realestate-modal-title').textContent = '부동산 수정';
      document.getElementById('modal-realestate-add-edit').classList.remove('hidden');
    });
  });

  tbody.querySelectorAll('.delete-realestate-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const rIdx = parseInt(e.target.dataset.rowindex, 10);
      const item = realEstate.find(r => r.rowIndex === rIdx);
      if (!item) return;

      if (!confirm(`"${item.name}" 자산을 정말로 삭제하시겠습니까?`)) return;

      toast('⏳ 부동산 삭제 중...', 'info');
      try {
        await Toochangi.deleteRealEstate(rIdx);
        toast(`✅ ${item.name} 삭제 완료`, 'success');
        renderRealestateTab();
        renderDashboard();
      } catch (err) {
        toast('⚠️ 삭제 실패: ' + err.message, 'error');
      }
    });
  });
}
