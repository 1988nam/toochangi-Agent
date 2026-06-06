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
  bindAutoAnalysisEvents();
  bindManualAnalysisEvents();
  bindTopbarEvents();
  bindAssetEvents();
  bindBrokerEvents();
  bindSettingsEvents();

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
  document.getElementById('open-config-btn')?.addEventListener('click', () => {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    switchTab('settings');
  });
}

// ── 로그인 성공 ────────────────────────────────────────────────
async function onLoginSuccess(user) {
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

// ── 데이터 새로고침 ─────────────────────────────────────────────
async function refreshAll() {
  toast('📊 데이터 로드 중...', 'info');
  try {
    await Toochangi.loadAll();
    renderDashboard();
    renderPortfolioTab();
    renderSavingsTab();
    renderRealestateTab();
    renderTradelogTab();
    renderManualAnalysisTab();
    renderYouTubeFeed();

    const assetsPanel = document.getElementById('tab-assets');
    if (assetsPanel && !assetsPanel.classList.contains('hidden')) {
      initAssetMonthSelector();
      renderAssetsTab();
    }

    const brokerPanel = document.getElementById('tab-broker');
    if (brokerPanel && !brokerPanel.classList.contains('hidden')) {
      renderBrokerTab();
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
    filter: '3단계 필터', tradelog: '매매일지',
    assets: '자산현황',
    'auto-analysis': '자동 투자 추천',
    'manual-analysis': '수동 AI 분석',
    broker: '증권사 연동',
    settings: '환경 설정',
  };
  document.getElementById('page-title').textContent = titles[tab] || tab;

  if (tab === 'dashboard') Toochangi.renderCharts();
  if (tab === 'savings') renderSavingsTab();
  if (tab === 'realestate') renderRealestateTab();
  if (tab === 'assets') {
    initAssetMonthSelector();
    renderAssetsTab();
  }
  if (tab === 'broker') {
    renderBrokerTab();
  }
  if (tab === 'settings') {
    initSettingsFields();
  }
  if (tab === 'auto-analysis') {
    renderYouTubeFeed();
  }
}

// ══════════════════════════════════════════════════════════════
// ── 대시보드 렌더링 ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function renderDashboard() {
  const metrics = Toochangi.calcPortfolioMetrics();
  const gaData  = Toochangi.getGachangiData();

  // 총 투자 자산
  document.getElementById('m-total-asset').textContent =
    metrics.totalValue > 0 ? `${Math.floor(metrics.totalValue).toLocaleString()}원` : '—';
  document.getElementById('m-total-asset-sub').textContent =
    metrics.totalPnL !== 0
      ? `평가손익 ${metrics.totalPnL >= 0 ? '+' : ''}${Math.floor(metrics.totalPnL).toLocaleString()}원`
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
  const sheetLink = document.getElementById('btn-open-sheet');
  if (sheetLink) {
    const sheetId = (window.TOOCHANGI_CONFIG || {}).TOOCHANGI_SHEET_ID;
    sheetLink.href = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : '#';
  }

  // 계산되지 않은 지표들을 위해 먼저 계산을 호출하여 p._yield, p._weight 등이 올바르게 설정되도록 보장
  Toochangi.calcPortfolioMetrics();

  const tbody = document.getElementById('portfolio-tbody');
  const portfolio = Toochangi.getPortfolio();
  if (portfolio.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-state">종목을 추가해주세요</td></tr>';
    const chkAll = document.getElementById('chk-portfolio-all');
    if (chkAll) chkAll.checked = false;
    updateBulkActionsVisibility();
    return;
  }
  tbody.innerHTML = portfolio.map(p => {
    const yieldStr = p._yield >= 0 ? `+${p._yield.toFixed(2)}%` : `${p._yield.toFixed(2)}%`;
    const yieldClass = p._yield >= 0 ? 'pos' : 'neg';
    return `<tr data-rowindex="${p.rowIndex}">
      <td style="text-align: center;">
        <input type="checkbox" class="chk-portfolio-row" data-rowindex="${p.rowIndex}" style="cursor:pointer;" />
      </td>
      <td>${p.name}</td>
      <td style="color:var(--text-muted)">${p.ticker}</td>
      <td style="color:var(--text-muted)">${p.market}</td>
      <td>${p.memo || '-'}</td>
      <td>${p.qty.toLocaleString()}</td>
      <td>${Math.floor(p.avgPrice).toLocaleString()}원</td>
      <td>${Math.floor(p.curPrice || p.avgPrice).toLocaleString()}원</td>
      <td>${Math.floor(p._value || 0).toLocaleString()}원</td>
      <td class="${yieldClass}">${yieldStr}</td>
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
      document.getElementById('input-stock-ticker').value = item.ticker;
      document.getElementById('input-stock-market').value = item.market;
      document.getElementById('input-stock-qty').value = item.qty;
      document.getElementById('input-stock-avg').value = item.avgPrice;
      document.getElementById('input-stock-cur').value = item.curPrice || item.avgPrice;
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
    chkAll.checked = false;
    chkAll.addEventListener('change', (e) => {
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
        
        // KIS 자동매매 체크 및 실행 (종목 정보 전달)
        await Broker.checkAndTriggerAutoTrade({
          ...result,
          ticker: ticker,
          name: name
        });
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

  // 구글 드라이브 스크린샷 이미지 스캔 및 판독
  document.getElementById('scan-drive-screenshots-btn')?.addEventListener('click', async () => {
    if (!Auth.isLoggedIn()) { toast('먼저 로그인해주세요', 'error'); return; }
    
    const settings = window.TOOCHANGI_CONFIG || {};
    const folderId = settings.SOURCE_FOLDER_ID;
    if (!folderId || folderId.startsWith('YOUR_')) {
      alert('⚠️ 구글 드라이브 스캔 폴더 ID가 설정되지 않았습니다.\n\njs/config.js의 SOURCE_FOLDER_ID에 보유 잔고 스크린샷이 업로드되는 폴더 ID를 기입해주세요.');
      return;
    }

    const spinner = document.getElementById('modal-scanning-spinner');
    const spinnerText = document.getElementById('scanning-spinner-text');
    
    try {
      if (spinner) {
        spinnerText.textContent = '구글 드라이브 스캔 중...';
        spinner.classList.remove('hidden');
      }

      // ── 아카이브 폴더 결정 ─────────────────────────────────────────
      // 소스 폴더와 동일하다면 하위 '완료' 폴더를 자동 탐색/생성
      let targetArchiveId = settings.ARCHIVE_FOLDER_ID;
      if (targetArchiveId && !targetArchiveId.startsWith('YOUR_') && targetArchiveId === folderId) {
        try {
          const folderQ = `'${folderId}' in parents and name = '완료' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
          const folderRes = await gapi.client.drive.files.list({ q: folderQ, fields: 'files(id, name)' });
          const folders = folderRes.result.files || [];
          if (folders.length > 0) {
            targetArchiveId = folders[0].id;
          } else {
            const createRes = await gapi.client.drive.files.create({
              resource: { name: '완료', mimeType: 'application/vnd.google-apps.folder', parents: [folderId] },
              fields: 'id'
            });
            targetArchiveId = createRes.result.id;
          }
        } catch (folderErr) {
          console.error('[Drive Sync] 아카이브 폴더 생성 실패:', folderErr);
          targetArchiveId = folderId; // fallback: 이동 안 함
        }
      }

      // ── 1. 이미지 파일 목록 조회 ───────────────────────────────────
      const q = `'${folderId}' in parents and (mimeType = 'image/png' or mimeType = 'image/jpeg') and trashed = false`;
      const driveRes = await gapi.client.drive.files.list({ q, fields: 'files(id, name, mimeType)' });
      const files = driveRes.result.files || [];

      if (files.length === 0) {
        if (spinner) spinner.classList.add('hidden');
        alert('ℹ️ 드라이브 스캔 폴더에 스크린샷 파일이 존재하지 않습니다.\n\n모바일 기기 등에서 스크린샷을 찍어 해당 구글 드라이브 폴더에 업로드한 후 다시 실행해주세요.');
        return;
      }

      let parsedHoldings = [];
      const failedFiles = [];    // 판독 실패 파일 목록
      const succeededFiles = []; // 판독 성공 파일 목록

      // ── 2. 파일별 독립 처리 ─────────────────────────────────────────
      // 한 파일 실패해도 나머지는 계속 진행, 실패 파일은 원본 위치 유지
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 여러 파일 순차 판독 시 분당 API 호출 제한(Rate Limit)을 우회하기 위해 3초 대기
        if (i > 0) {
          if (spinner) {
            spinnerText.textContent = `API 요청 제한 방지 대기 중... (${i + 1} / ${files.length})`;
          }
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        if (spinner) {
          spinnerText.textContent = `이미지 판독 중... (${i + 1} / ${files.length}) — ${file.name}`;
        }

        let fileSucceeded = false;

        try {
          // 2-a. 미디어 다운로드
          const token = Auth.getToken();
          const fetchRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!fetchRes.ok) throw new Error(`다운로드 실패 (HTTP ${fetchRes.status})`);

          const blob = await fetchRes.blob();
          const base64Data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
          });

          // 2-b. Gemini AI 판독
          const parsed = await Toochangi.parseHoldingScreenshot(base64Data, file.mimeType);
          if (parsed && Array.isArray(parsed) && parsed.length > 0) {
            parsedHoldings = parsedHoldings.concat(parsed);
            fileSucceeded = true;
          } else {
            throw new Error('유효한 종목 정보를 추출하지 못했습니다');
          }
        } catch (fileErr) {
          // 개별 파일 실패 → 실패 목록에 기록 후 다음 파일로 계속
          // 실패한 파일은 아카이브하지 않고 원본 폴더에 유지
          console.error(`[Drive Sync] 판독 실패 (${file.name}):`, fileErr);
          failedFiles.push({ name: file.name, reason: fileErr.message });
          continue;
        }

        // 2-c. 성공한 파일만 완료 폴더로 이동
        if (fileSucceeded) {
          succeededFiles.push(file.name);
          try {
            if (targetArchiveId && !targetArchiveId.startsWith('YOUR_') && targetArchiveId !== folderId) {
              await gapi.client.drive.files.update({
                fileId: file.id,
                addParents: targetArchiveId,
                removeParents: folderId,
                fields: 'id, parents'
              });
            } else if (!targetArchiveId || targetArchiveId.startsWith('YOUR_')) {
              // 아카이브 폴더 미설정 → 휴지통으로
              await gapi.client.drive.files.update({ fileId: file.id, trashed: true });
            }
            // targetArchiveId === folderId (폴더 생성 실패 fallback) → 이동 안 함
          } catch (archiveErr) {
            console.error(`[Drive Sync] 아카이브 이동 실패 (${file.name}):`, archiveErr);
            // 이동 실패해도 데이터(parsedHoldings)는 살림
            failedFiles.push({ name: file.name + ' [아카이브 이동 실패]', reason: archiveErr.message });
          }
        }
      }

      if (spinner) spinner.classList.add('hidden');

      // ── 3. 처리 결과 요약 ─────────────────────────────────────────
      if (failedFiles.length > 0) {
        const failList = failedFiles.map(f => `• ${f.name}: ${f.reason}`).join('\n');
        const successMsg = succeededFiles.length > 0
          ? `\n\n✅ 성공 (${succeededFiles.length}개): ${succeededFiles.join(', ')}`
          : '';
        alert(`⚠️ 일부 이미지 판독에 실패했습니다.\n\n❌ 실패 (${failedFiles.length}개):\n${failList}${successMsg}\n\n실패한 파일은 드라이브 원본 폴더에 그대로 남아 있습니다.`);
      }

      if (parsedHoldings.length === 0) {
        if (failedFiles.length === 0) {
          alert('⚠️ 이미지 판독은 완료되었으나, 유효한 주식 종목 정보를 추출하지 못했습니다.');
        }
        return;
      }

      // ── 4. 성공한 데이터만 확인 모달에 표시 ──────────────────────
      renderScreenshotImportModal(parsedHoldings);

    } catch (e) {
      if (spinner) spinner.classList.add('hidden');
      console.error(e);
      alert('⚠️ 드라이브 스크린샷 스캔 중 오류가 발생했습니다: ' + e.message);
    }
  });

  // 스크린샷 가져오기 최종 승인
  document.getElementById('btn-confirm-screenshot-import')?.addEventListener('click', async () => {
    const tbody = document.getElementById('screenshot-import-tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) {
      toast('가져올 종목이 없습니다.', 'error');
      return;
    }

    toast('💾 포트폴리오 가져오기 진행 중...', 'info');
    document.getElementById('modal-screenshot-import').classList.add('hidden');

    try {
      for (const row of rows) {
        const name = row.querySelector('.import-name').value.trim();
        const ticker = row.querySelector('.import-ticker').value.trim();
        const market = row.querySelector('.import-market').value;
        const qty = parseFloat(row.querySelector('.import-qty').value) || 0;
        const avgPrice = parseFloat(row.querySelector('.import-avg').value) || 0;
        const curPrice = parseFloat(row.dataset.curprice) || avgPrice;
        const memo = row.querySelector('.import-memo').value.trim();

        if (!name || qty <= 0 || avgPrice <= 0) continue;

        await Toochangi.addPortfolio({
          name,
          ticker,
          market,
          qty,
          avgPrice,
          curPrice: curPrice,
          memo
        });
      }

      toast('✅ 스크린샷 데이터 가져오기 완료!', 'success');
      renderPortfolioTab();
      renderDashboard();
    } catch (e) {
      toast('⚠️ 가져오기 저장 중 오류: ' + e.message, 'error');
    }
  });

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
    const memo = document.getElementById('input-stock-memo').value.trim();
    const rowIndex = document.getElementById('input-stock-row-index')?.value;
    if (!name || !qty || !avg) { toast('필수 항목을 입력해주세요', 'error'); return; }

    try {
      const data = {
        name, ticker: document.getElementById('input-stock-ticker').value,
        market: document.getElementById('input-stock-market').value,
        qty, avgPrice: avg,
        curPrice: parseFloat(document.getElementById('input-stock-cur').value) || avg,
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
      if (document.getElementById('input-stock-row-index')) document.getElementById('input-stock-row-index').value = '';

      renderPortfolioTab();
      renderDashboard();
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

  // ── 예적금 이벤트 ──
  document.getElementById('add-savings-btn')?.addEventListener('click', () => {
    document.getElementById('savings-modal-title').textContent = '예적금 추가';
    document.getElementById('input-savings-row-index').value = '';
    document.getElementById('input-savings-name').value = '';
    document.getElementById('input-savings-bank').value = '';
    document.getElementById('input-savings-type').value = '';
    document.getElementById('input-savings-rate').value = '';
    document.getElementById('input-savings-balance').value = '';
    document.getElementById('input-savings-maturity').value = '';
    document.getElementById('input-savings-purpose').value = '';
    document.getElementById('input-savings-memo').value = '';
    document.getElementById('modal-savings-add-edit').classList.remove('hidden');
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
    const type = document.getElementById('input-savings-type').value.trim();
    const rate = parseFloat(document.getElementById('input-savings-rate').value);
    const balance = parseFloat(document.getElementById('input-savings-balance').value);
    const maturity = document.getElementById('input-savings-maturity').value;
    const purpose = document.getElementById('input-savings-purpose').value.trim();
    const memo = document.getElementById('input-savings-memo').value.trim();
    const rowIndex = document.getElementById('input-savings-row-index')?.value;

    if (!name || !bank || !type || isNaN(rate) || isNaN(balance)) {
      toast('필수 항목을 모두 입력해주세요', 'error');
      return;
    }

    try {
      const data = { name, bank, type, rate, balance, maturity, purpose, memo };
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
    const maintenance = parseFloat(document.getElementById('input-realestate-maintenance').value) || 0;
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

async function renderYouTubeFeed(force = false) {
  const listEl = document.getElementById('youtube-feed-list');
  const spinnerEl = document.getElementById('youtube-feed-loading');
  if (!listEl) return;

  if (_youtubeFeedLoading) return;

  // 캐시가 있고 강제 새로고침이 아니라면 캐시 사용
  if (_youtubeFeedCache && !force) {
    displayYouTubeFeed(_youtubeFeedCache);
    return;
  }

  // 채널 정보 가져오기
  let youtubeChannels = [];
  try {
    const stored = localStorage.getItem('toochangi_youtube_channels');
    if (stored) {
      youtubeChannels = JSON.parse(stored);
    } else {
      youtubeChannels = window.TOOCHANGI_CONFIG.DEFAULT_YOUTUBE_CHANNELS || [];
    }
  } catch (e) {
    console.error('[YouTubeFeed] 채널 로드 실패:', e);
    youtubeChannels = window.TOOCHANGI_CONFIG.DEFAULT_YOUTUBE_CHANNELS || [];
  }

  if (youtubeChannels.length === 0) {
    listEl.innerHTML = '<div class="empty-state">구독 중인 유튜브 채널이 없습니다. 환경설정에서 추가해주세요.</div>';
    return;
  }

  _youtubeFeedLoading = true;
  spinnerEl?.classList.remove('hidden');
  listEl.classList.add('hidden');

  try {
    const fetchPromises = youtubeChannels.map(async (ch) => {
      try {
        const res = await fetch(`/api/youtube-rss?channelId=${ch.id}`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        return data.entries || [];
      } catch (err) {
        console.warn(`[YouTubeFeed] Fetch failed for ${ch.name}:`, err.message);
        return [];
      }
    });

    const settled = await Promise.allSettled(fetchPromises);
    let allEntries = [];
    settled.forEach(s => {
      if (s.status === 'fulfilled') {
        allEntries = allEntries.concat(s.value);
      }
    });

    // 날짜 순 정렬 (최신순)
    allEntries.sort((a, b) => new Date(b.published) - new Date(a.published));

    // 최근 12개 비디오만 노출
    _youtubeFeedCache = allEntries.slice(0, 12);
    displayYouTubeFeed(_youtubeFeedCache);
  } catch (err) {
    console.error('[YouTubeFeed] 피드 동기화 실패:', err);
    listEl.innerHTML = '<div class="empty-state" style="color:var(--accent-red)">⚠️ 유튜브 피드를 가져오지 못했습니다. KIS 프록시 서버 상태를 확인하세요.</div>';
  } finally {
    _youtubeFeedLoading = false;
    spinnerEl?.classList.add('hidden');
    listEl.classList.remove('hidden');
  }
}

function displayYouTubeFeed(entries) {
  const listEl = document.getElementById('youtube-feed-list');
  if (!listEl) return;

  if (!entries || entries.length === 0) {
    listEl.innerHTML = '<div class="empty-state">조회된 최신 비디오 피드가 없습니다.</div>';
    return;
  }

  listEl.innerHTML = entries.map(video => {
    const pubDate = video.published ? new Date(video.published).toLocaleDateString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '—';
    const thumbUrl = `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;

    return `
      <a href="${video.videoUrl}" target="_blank" class="youtube-video-card" title="${video.title}">
        <div class="youtube-video-thumbnail-wrap">
          <img src="${thumbUrl}" class="youtube-video-thumbnail" alt="${video.title}" loading="lazy" />
        </div>
        <div class="youtube-video-info">
          <span class="youtube-video-channel">${video.channelName}</span>
          <div class="youtube-video-title">${video.title}</div>
          <span class="youtube-video-date">${pubDate}</span>
        </div>
      </a>
    `;
  }).join('');
}

function bindAutoAnalysisEvents() {
  const autoRecBtn       = document.getElementById('btn-auto-recommend');
  const autoRecEmpty     = document.getElementById('auto-rec-empty');
  const autoRecLoading   = document.getElementById('auto-rec-loading');
  const autoRecResult    = document.getElementById('auto-rec-result');
  const autoRecSourcesWrap = document.getElementById('auto-rec-sources-wrap');
  const autoRecChips     = document.getElementById('auto-rec-source-chips');
  const autoRecKisStatus = document.getElementById('auto-rec-kis-status');
  const autoRecGenAt     = document.getElementById('auto-rec-generated-at');
  const refreshYoutubeBtn = document.getElementById('btn-refresh-youtube');

  // KIS 연동 상태 배지 업데이트
  function updateKisStatusBadge() {
    if (!autoRecKisStatus) return;
    const kisSettings = typeof Broker !== 'undefined' ? Broker.getSettings() : null;
    if (kisSettings && kisSettings.appkey && kisSettings.secret && !kisSettings.isMock) {
      autoRecKisStatus.className = 'auto-rec-kis-badge';
      autoRecKisStatus.textContent = '📊 KIS 실거래 연동';
    } else if (kisSettings && kisSettings.appkey && kisSettings.isMock) {
      autoRecKisStatus.className = 'auto-rec-kis-badge offline';
      autoRecKisStatus.textContent = '🔸 KIS 모의 연동';
    } else {
      autoRecKisStatus.className = 'auto-rec-kis-badge offline';
      autoRecKisStatus.textContent = '📡 KIS 미연동';
    }
  }
  updateKisStatusBadge();

  autoRecBtn?.addEventListener('click', async () => {
    // UI 상태: 로딩 시작
    autoRecBtn.disabled = true;
    autoRecEmpty?.classList.add('hidden');
    autoRecResult?.classList.add('hidden');
    autoRecSourcesWrap?.classList.add('hidden');
    autoRecLoading?.classList.remove('hidden');

    updateKisStatusBadge();

    try {
      const result = await Toochangi.runAutoRecommendation();

      // 결과 렌더링 (볼드 마크다운 **text** 처리)
      const formatted = result.text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

      if (autoRecResult) {
        autoRecResult.innerHTML = formatted;
        autoRecResult.classList.remove('hidden');
      }

      // 생성 시각 표시
      if (autoRecGenAt) {
        autoRecGenAt.textContent = `📅 ${result.generatedAt}`;
        autoRecGenAt.style.display = 'inline';
      }

      // 출처 칩 렌더링
      if (autoRecChips && result.sources && result.sources.length > 0) {
        autoRecChips.innerHTML = result.sources.map(s =>
          `<a href="${s.url}" target="_blank" class="source-chip" title="${s.title}">
            🔗 ${s.title}
          </a>`
        ).join('');
        autoRecSourcesWrap?.classList.remove('hidden');
      }

    } catch (e) {
      if (autoRecResult) {
        autoRecResult.innerHTML = `<span style="color:var(--accent-red)">❌ 추천 실패: ${e.message}</span>`;
        autoRecResult.classList.remove('hidden');
      }
    } finally {
      autoRecBtn.disabled = false;
      autoRecLoading?.classList.add('hidden');
    }
  });

  refreshYoutubeBtn?.addEventListener('click', () => {
    toast('🔄 유튜브 피드 갱신 중...', 'info');
    renderYouTubeFeed(true);
  });
}

// ══════════════════════════════════════════════════════════════
// ── 수동 AI 분석 이벤트 ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
let _lastAnalysisResult = null;

function bindManualAnalysisEvents() {
  const runBtn  = document.getElementById('run-analysis-btn');
  const saveBtn = document.getElementById('save-analysis-btn');

  runBtn?.addEventListener('click', async () => {
    const query = document.getElementById('analysis-input').value.trim();
    if (!query) { toast('분석할 내용을 입력해주세요', 'error'); return; }

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
      const { text, sources } = await Toochangi.runGeminiAnalysis(query);
      resultEl.textContent = text;
      _lastAnalysisResult = { query, result: text, sources };

      // Render search sources/citations
      if (sourcesContainer && sourcesDiv && sources && sources.length > 0) {
        sourcesContainer.classList.remove('hidden');
        sourcesDiv.innerHTML = sources.map(s => {
          return `<a href="${s.url}" target="_blank" class="source-link" title="${s.title}">
            🔗 <span>${s.title}</span>
          </a>`;
        }).join('');
      }

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
    return `<option value="${m}">${parts[0]}년 ${parts[1]}월</option>`;
  }).join('');
}

async function renderAssetsTab() {
  const select = document.getElementById('asset-month-select');
  if (!select) return;
  
  const selectedMonthKey = select.value;
  if (!selectedMonthKey) return;
  
  const metrics = Toochangi.calcAssetMetrics(selectedMonthKey);
  document.getElementById('asset-total-val').textContent = `${metrics.totalAssets.toLocaleString()}원`;
  document.getElementById('asset-debt-val').textContent = `${metrics.totalDebt.toLocaleString()}원`;
  document.getElementById('asset-net-val').textContent = `${metrics.netWorth.toLocaleString()}원`;
  document.getElementById('asset-net-val').style.color = metrics.netWorth >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

  const tbody = document.getElementById('asset-tbody');
  const history = Toochangi.getAssetHistory();
  const monthEntries = history.filter(a => a.date && a.date.startsWith(selectedMonthKey));
  
  if (monthEntries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">해당 월에 등록된 자산 내역이 없습니다.</td></tr>';
  } else {
    tbody.innerHTML = monthEntries.map(a => `
      <tr>
        <td>${a.date}</td>
        <td><span class="badge" style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${a.category}</span></td>
        <td><strong>${a.name}</strong></td>
        <td style="color: ${a.category === '대출(부채)' ? 'var(--accent-red)' : 'var(--text-normal)'}">${a.balance.toLocaleString()}원</td>
        <td style="color: var(--text-muted)">${a.memo || '—'}</td>
        <td style="color: var(--text-muted); font-size: 12px;">${a.lastUpdated || '—'}</td>
        <td>
          <button class="btn-text-sm edit-asset-btn" data-row="${a.rowIndex}">수정</button>
          <button class="btn-text-sm delete-asset-btn" data-row="${a.rowIndex}" style="color: var(--accent-red); margin-left: 6px;">삭제</button>
        </td>
      </tr>
    `).join('');
    
    tbody.querySelectorAll('.edit-asset-btn').forEach(btn => {
      btn.addEventListener('click', () => openAssetModal(parseInt(btn.dataset.row)));
    });
    tbody.querySelectorAll('.delete-asset-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteAssetItem(parseInt(btn.dataset.row)));
    });
  }

  Toochangi.renderAssetCharts(selectedMonthKey);
}

function openAssetModal(rowIndex = null) {
  const modal = document.getElementById('modal-asset');
  const title = document.getElementById('asset-modal-title');
  const catSelect = document.getElementById('input-asset-category');
  
  catSelect.innerHTML = window.TOOCHANGI_CONFIG.ASSET_CATEGORIES.map(c => `<option>${c}</option>`).join('');
  
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

// ══════════════════════════════════════════════════════════════
// ── 증권사 연동 이벤트 및 렌더링 ──────────────────────────────────
// ══════════════════════════════════════════════════════════════
function bindBrokerEvents() {
  // 거래 구분 선택 (매수 / 매도)
  const buyBtn = document.getElementById('order-side-buy');
  const sellBtn = document.getElementById('order-side-sell');
  const submitBtn = document.getElementById('btn-submit-order');
  let isBuy = true;

  if (buyBtn && sellBtn && submitBtn) {
    buyBtn.addEventListener('click', () => {
      isBuy = true;
      buyBtn.style.background = '#ef4444';
      buyBtn.style.color = 'white';
      sellBtn.style.background = '#374151';
      sellBtn.style.color = '#9ca3af';
      submitBtn.textContent = '즉시 매수 주문 전송';
      submitBtn.style.background = '#ef4444';
    });

    sellBtn.addEventListener('click', () => {
      isBuy = false;
      sellBtn.style.background = '#3b82f6';
      sellBtn.style.color = 'white';
      buyBtn.style.background = '#374151';
      buyBtn.style.color = '#9ca3af';
      submitBtn.textContent = '즉시 매도 주문 전송';
      submitBtn.style.background = '#3b82f6';
    });
  }

  // 호가 구분 선택 시 단가 인풋 제어
  const orderTypeSelect = document.getElementById('input-order-type');
  const orderPriceInput = document.getElementById('input-order-price');
  if (orderTypeSelect && orderPriceInput) {
    orderTypeSelect.addEventListener('change', () => {
      if (orderTypeSelect.value === '01') { // 시장가
        orderPriceInput.disabled = true;
        orderPriceInput.value = '';
      } else { // 지정가
        orderPriceInput.disabled = false;
      }
    });
  }

  // 주문 전송 버튼
  submitBtn?.addEventListener('click', async () => {
    const tickerInput = document.getElementById('input-order-ticker');
    const qtyInput = document.getElementById('input-order-qty');
    const priceInput = document.getElementById('input-order-price');

    const ticker = tickerInput.value.trim();
    const qty = parseInt(qtyInput.value, 10);
    const price = parseFloat(priceInput.value);

    if (!ticker || ticker.length !== 6) {
      toast('⚠️ 올바른 종목코드 6자리를 입력해주세요.', 'error');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      toast('⚠️ 올바른 수량을 입력해주세요.', 'error');
      return;
    }
    if (orderTypeSelect.value === '00' && (isNaN(price) || price <= 0)) {
      toast('⚠️ 지정가 주문 시 단가를 입력해주세요.', 'error');
      return;
    }

    const sideText = isBuy ? '매수' : '매도';
    const typeText = orderTypeSelect.value === '01' ? '시장가' : `지정가 (${price.toLocaleString()}원)`;
    const settings = Broker.getSettings();

    const confirmed = confirm(
      `🔮 [주문 최종 확인]\n\n` +
      `- 주문 종목: ${ticker}\n` +
      `- 주문 구분: ${sideText}\n` +
      `- 주문 수량: ${qty}주\n` +
      `- 주문 호가: ${typeText}\n` +
      `- 실행 계좌: ${settings.account} (${settings.isMock ? '모의투자' : '실전투자'})\n\n` +
      `정말로 KIS API를 통해 실시간 주문을 즉시 전송하시겠습니까?`
    );

    if (!confirmed) return;

    toast('⏳ 주문 전송 중...', 'info');
    try {
      const result = await Broker.placeOrder({
        pdno: ticker,
        qty: qty,
        price: orderTypeSelect.value === '01' ? 0 : price,
        ordDvsn: orderTypeSelect.value,
        isBuy: isBuy
      });
      toast(`✅ 주문 완료! 주문번호: ${result.orderNo}`, 'success', 5000);
      
      // 인풋 초기화
      tickerInput.value = '';
      qtyInput.value = '';
      priceInput.value = '';

      // 잔고 재조회
      await renderBrokerTab();
    } catch (e) {
      console.error(e);
      toast(`❌ 주문 실패: ${e.message}`, 'error', 5000);
    }
  });

  // 설정 저장 버튼
  document.getElementById('btn-save-broker-settings')?.addEventListener('click', async () => {
    const appkey = document.getElementById('input-kis-appkey').value.trim();
    const secret = document.getElementById('input-kis-secret').value.trim();
    const account = document.getElementById('input-kis-account').value.trim();
    const isMock = document.getElementById('input-kis-mock').value === 'true';
    const autoTrade = document.getElementById('input-kis-autotrade').checked;
    const autoTradeAmount = parseInt(document.getElementById('input-kis-autotrade-amount').value, 10) || 500000;

    if (!appkey || !secret || !account) {
      toast('⚠️ 필수 설정 항목(AppKey, Secret, 계좌번호)을 입력해주세요.', 'error');
      return;
    }

    try {
      Broker.saveSettings({ appkey, secret, account, isMock, autoTrade, autoTradeAmount });
      toast('💾 KIS 연동 설정이 브라우저에 저장되었습니다.', 'success');
      
      await renderBrokerTab();
    } catch (e) {
      toast('⚠️ 설정 저장 후 데이터 로드 실패: ' + e.message, 'error');
    }
  });

  // 설정 초기화 버튼
  document.getElementById('btn-clear-broker-settings')?.addEventListener('click', () => {
    if (!confirm('정말로 KIS 연동 설정을 모두 초기화하고 로그아웃 하시겠습니까?\n저장된 API 키와 설정이 브라우저에서 삭제됩니다.')) {
      return;
    }

    localStorage.removeItem('toochangi_kis_appkey');
    localStorage.removeItem('toochangi_kis_secret');
    localStorage.removeItem('toochangi_kis_account');
    localStorage.removeItem('toochangi_kis_mock');
    localStorage.removeItem('toochangi_kis_autotrade');
    localStorage.removeItem('toochangi_kis_autotrade_amount');
    localStorage.removeItem('toochangi_kis_token');
    localStorage.removeItem('toochangi_kis_token_expiry');

    // 입력 필드 리셋
    document.getElementById('input-kis-appkey').value = '';
    document.getElementById('input-kis-secret').value = '';
    document.getElementById('input-kis-account').value = '';
    document.getElementById('input-kis-mock').value = 'true';
    document.getElementById('input-kis-autotrade').checked = false;
    document.getElementById('input-kis-autotrade-amount').value = '500000';

    document.getElementById('broker-dashboard').classList.add('hidden');
    toast('🧹 설정이 초기화되었습니다.', 'info');
  });

  // 실시간 동기화 버튼
  document.getElementById('refresh-broker-btn')?.addEventListener('click', async () => {
    toast('⏳ 실시간 잔고 갱신 중...', 'info');
    try {
      await renderBrokerTab();
      toast('✅ 잔고 갱신 완료', 'success');
    } catch (e) {
      toast('⚠️ 갱신 실패: ' + e.message, 'error');
    }
  });
}

async function renderBrokerTab() {
  const settings = Broker.getSettings();
  
  // UI 인풋 필드에 저장된 값 뿌려주기 (처음 열었을 때 등)
  const appkeyEl = document.getElementById('input-kis-appkey');
  const secretEl = document.getElementById('input-kis-secret');
  const accountEl = document.getElementById('input-kis-account');
  const mockEl = document.getElementById('input-kis-mock');
  const autoEl = document.getElementById('input-kis-autotrade');
  const autoAmtEl = document.getElementById('input-kis-autotrade-amount');

  if (appkeyEl && !appkeyEl.value) appkeyEl.value = settings.appkey;
  if (secretEl && !secretEl.value) secretEl.value = settings.secret;
  if (accountEl && !accountEl.value) accountEl.value = settings.account;
  if (mockEl) mockEl.value = settings.isMock ? 'true' : 'false';
  if (autoEl) autoEl.checked = settings.autoTrade;
  if (autoAmtEl && !autoAmtEl.value) autoAmtEl.value = settings.autoTradeAmount;

  // 설정이 완비된 경우 대시보드 활성화 및 잔고 조회
  if (settings.appkey && settings.secret && settings.account) {
    document.getElementById('broker-dashboard').classList.remove('hidden');
    
    try {
      const data = await Broker.loadBalanceAndHoldings();
      
      // 예수금, 평가금액 렌더링
      document.getElementById('broker-cash').textContent = `${Math.floor(data.cash).toLocaleString()}원`;
      document.getElementById('broker-eval-amt').textContent = `${Math.floor(data.evalAmt).toLocaleString()}원`;
      
      // 평가손익 & 수익률 부호 처리 및 스타일링
      const pnlEl = document.getElementById('broker-pnl');
      const yieldEl = document.getElementById('broker-yield');
      const pnlCard = document.getElementById('broker-pnl-card');
      const yieldCard = document.getElementById('broker-yield-card');

      pnlEl.textContent = `${data.pnl >= 0 ? '+' : ''}${Math.floor(data.pnl).toLocaleString()}원`;
      yieldEl.textContent = `${data.yield >= 0 ? '+' : ''}${data.yield.toFixed(2)}%`;

      // 색상 리셋 및 설정
      pnlCard.className = 'metric-card';
      yieldCard.className = 'metric-card';
      pnlEl.style.color = '';
      yieldEl.style.color = '';

      if (data.pnl > 0) {
        pnlCard.classList.add('accent-red');
        pnlEl.style.color = 'var(--accent-red)';
      } else if (data.pnl < 0) {
        pnlCard.classList.add('accent-blue');
        pnlEl.style.color = 'var(--accent-blue)';
      }

      if (data.yield > 0) {
        yieldCard.classList.add('accent-red');
        yieldEl.style.color = 'var(--accent-red)';
      } else if (data.yield < 0) {
        yieldCard.classList.add('accent-blue');
        yieldEl.style.color = 'var(--accent-blue)';
      }

      // 보유 주식 테이블 렌더링
      const tbody = document.getElementById('broker-holdings-tbody');
      if (tbody) {
        if (data.holdings.length === 0) {
          tbody.innerHTML = `<tr><td colspan="9" class="empty-state">조회된 보유 종목이 없습니다.</td></tr>`;
        } else {
          tbody.innerHTML = data.holdings.map(h => {
            const pnlText = `${h.pnl >= 0 ? '+' : ''}${Math.floor(h.pnl).toLocaleString()}원`;
            const yieldText = `${h.yield >= 0 ? '+' : ''}${h.yield.toFixed(2)}%`;
            const color = h.pnl > 0 ? 'var(--accent-red)' : (h.pnl < 0 ? 'var(--accent-blue)' : '');
            
            return `
              <tr>
                <td style="font-weight: 600;">${h.name}</td>
                <td><code style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px;">${h.ticker}</code></td>
                <td>${h.qty.toLocaleString()}주</td>
                <td>${Math.floor(h.avgPrice).toLocaleString()}원</td>
                <td>${Math.floor(h.curPrice).toLocaleString()}원</td>
                <td style="font-weight: 500;">${Math.floor(h.value).toLocaleString()}원</td>
                <td style="color: ${color}; font-weight: 500;">${pnlText}</td>
                <td style="color: ${color}; font-weight: 500;">${yieldText}</td>
                <td>
                  <div style="display: flex; gap: 4px;">
                    <button class="btn-primary-sm" style="padding: 2px 8px; font-size:11px; background:#ef4444; border-color:#ef4444;" onclick="quickOrder('${h.ticker}', 'buy')">매수</button>
                    <button class="btn-primary-sm" style="padding: 2px 8px; font-size:11px; background:#3b82f6; border-color:#3b82f6;" onclick="quickOrder('${h.ticker}', 'sell')">매도</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }
      }
    } catch (e) {
      console.error(e);
      document.getElementById('broker-dashboard').classList.add('hidden');
      toast('⚠️ KIS 잔고 조회 실패: ' + e.message, 'error', 5000);
    }
  } else {
    document.getElementById('broker-dashboard').classList.add('hidden');
  }
}

// 퀵 오더 헬퍼
window.quickOrder = (ticker, side) => {
  const tickerInput = document.getElementById('input-order-ticker');
  if (tickerInput) {
    tickerInput.value = ticker;
  }
  
  const sideBtn = side === 'buy' 
    ? document.getElementById('order-side-buy') 
    : document.getElementById('order-side-sell');
    
  if (sideBtn) {
    sideBtn.click();
  }
  
  // 포커스
  document.getElementById('input-order-qty')?.focus();
  toast(`⚡️ ${ticker} 종목 주문이 설정되었습니다.`, 'info');
};

// KIS 자동매매 주문 최종 승인용 커스텀 모달 노출 헬퍼
window.showKisOrderConfirmModal = (params) => {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-kis-order');
    if (!modal) {
      resolve(confirm(`[주문 최종 확인] ${params.name}(${params.ticker}) ${params.qty}주 주문하시겠습니까?`));
      return;
    }

    document.getElementById('kis-modal-side').textContent = params.isBuy ? '매수' : '매도';
    document.getElementById('kis-modal-side').style.color = params.isBuy ? 'var(--accent-red)' : 'var(--accent-blue)';
    document.getElementById('kis-modal-stock').textContent = `${params.name || ''} (${params.ticker})`;
    document.getElementById('kis-modal-price').textContent = params.price || '시장가 (Market)';
    
    // 수량 기본값 주입
    const qtyInput = document.getElementById('kis-modal-qty-input');
    if (qtyInput) qtyInput.value = params.qty;

    const settings = Broker.getSettings();
    document.getElementById('kis-modal-account').textContent = `${settings.account} (${settings.isMock ? '모의' : '실전'})`;

    modal.classList.remove('hidden');

    const confirmBtn = document.getElementById('btn-kis-order-confirm');
    const closeBtns = modal.querySelectorAll('.modal-close, .btn-cancel');

    const cleanUp = () => {
      modal.classList.add('hidden');
      // 복제하여 이벤트 리스너 제거
      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      
      closeBtns.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
      });
    };

    function onConfirm() {
      const finalQty = parseInt(document.getElementById('kis-modal-qty-input').value, 10) || params.qty;
      cleanUp();
      resolve({ confirmed: true, qty: finalQty });
    }

    function onCancel() {
      cleanUp();
      resolve({ confirmed: false });
    }

    // 신규 리스너 바인딩
    document.getElementById('btn-kis-order-confirm').addEventListener('click', onConfirm);
    modal.querySelectorAll('.modal-close, .btn-cancel').forEach(btn => {
      btn.addEventListener('click', onCancel);
    });
  });
};

// 스크린샷 판독 모달 생성 및 데이터 주입 헬퍼
function renderScreenshotImportModal(holdings) {
  const tbody = document.getElementById('screenshot-import-tbody');
  if (!tbody) return;

  tbody.innerHTML = holdings.map((item, idx) => {
    return `<tr data-index="${idx}" data-curprice="${item.curPrice || item.avgPrice || 0}">
      <td><input type="text" class="import-name" value="${item.name || ''}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px;" /></td>
      <td><input type="text" class="import-ticker" value="${item.ticker || ''}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px;" /></td>
      <td>
        <select class="import-market" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px;">
          <option value="코스피" ${item.market === '코스피' ? 'selected' : ''}>코스피</option>
          <option value="코스닥" ${item.market === '코스닥' ? 'selected' : ''}>코스닥</option>
          <option value="나스닥" ${item.market === '나스닥' ? 'selected' : ''}>나스닥</option>
          <option value="NYSE" ${item.market === 'NYSE' ? 'selected' : ''}>NYSE</option>
          <option value="기타" ${item.market === '기타' ? 'selected' : ''}>기타</option>
        </select>
      </td>
      <td><input type="number" step="any" class="import-qty" value="${item.qty || 0}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px; text-align: right;" /></td>
      <td><input type="number" step="any" class="import-avg" value="${item.avgPrice || 0}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px; text-align: right;" /></td>
      <td><input type="text" class="import-memo" value="${item.memo || ''}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px;" /></td>
      <td style="text-align: center;">
        <button class="btn-delete-import-row" style="background: var(--accent-red); border: none; color: white; padding: 6px 10px; border-radius: 6px; cursor: pointer; transition: opacity 0.2s;">삭제</button>
      </td>
    </tr>`;
  }).join('');

  // 삭제 버튼 이벤트 바인딩
  tbody.querySelectorAll('.btn-delete-import-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      if (tr) tr.remove();
    });
  });

  // 모달 열기
  document.getElementById('modal-screenshot-import')?.classList.remove('hidden');
}

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
        <span class="youtube-config-name">${ch.name}</span>
        <span class="youtube-config-id">${ch.id}</span>
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
      STRATEGY_CONTEXT: document.getElementById('setting-strategy-context')?.value || '',
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
  if (document.getElementById('setting-strategy-context')) document.getElementById('setting-strategy-context').value = cfg.STRATEGY_CONTEXT || '';

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
    STRATEGY_CONTEXT: cfg.STRATEGY_CONTEXT || '',
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
      <td style="font-weight: 600;">${item.name}</td>
      <td><code style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px;">${item.ticker}</code></td>
      <td><input type="number" step="any" class="bulk-qty" value="${item.qty || 0}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px; text-align: right;" /></td>
      <td><input type="number" step="any" class="bulk-avg" value="${item.avgPrice || 0}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px; text-align: right;" /></td>
      <td><input type="text" class="bulk-memo" value="${item.memo || ''}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px;" /></td>
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
function renderSavingsTab() {
  const sheetLink = document.getElementById('btn-savings-open-sheet');
  if (sheetLink) {
    const sheetId = (window.TOOCHANGI_CONFIG || {}).TOOCHANGI_SHEET_ID;
    sheetLink.href = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : '#';
  }

  const tbody = document.getElementById('savings-tbody');
  const savings = Toochangi.getSavings();

  if (savings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">자산을 추가해 주세요</td></tr>';
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
      <td><strong>${s.name}</strong></td>
      <td>${s.bank}</td>
      <td><span class="badge" style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${s.type}</span></td>
      <td>${s.rate}%</td>
      <td>${s.balance.toLocaleString()}원</td>
      <td>${s.maturity || '—'}</td>
      <td><span style="color: var(--accent-orange); font-weight: 500;">${s.purpose || '—'}</span></td>
      <td style="color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${s.memo}">${s.memo || '—'}</td>
      <td>${s.date || '—'}</td>
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
      <td style="font-weight: 600;">${item.name}</td>
      <td>${item.bank}</td>
      <td><input type="number" step="0.01" class="bulk-savings-rate" value="${item.rate || 0}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px; text-align: right;" /></td>
      <td><input type="number" class="bulk-savings-balance" value="${item.balance || 0}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px; text-align: right;" /></td>
      <td><input type="text" class="bulk-savings-purpose" value="${item.purpose || ''}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px;" /></td>
      <td><input type="text" class="bulk-savings-memo" value="${item.memo || ''}" style="width: 100%; box-sizing: border-box; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 6px;" /></td>
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
          type: item.type,
          rate,
          balance,
          maturity: item.maturity,
          purpose,
          memo
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

function getElapsedLoanMonths(loanStartDate, termMonths) {
  if (!loanStartDate || !termMonths) return 0;

  const start = new Date(`${loanStartDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;

  const today = new Date();
  let months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  if (today.getDate() < start.getDate()) months -= 1;

  return Math.max(0, Math.min(termMonths, months));
}

function calculateLoanProgress(realEstateItem) {
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
  const elapsedMonths = getElapsedLoanMonths(loanStartDate, termMonths);
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

function renderRealestateTab() {
  const sheetLink = document.getElementById('btn-realestate-open-sheet');
  if (sheetLink) {
    const sheetId = (window.TOOCHANGI_CONFIG || {}).TOOCHANGI_SHEET_ID;
    sheetLink.href = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : '#';
  }

  const tbody = document.getElementById('realestate-tbody');
  const realEstate = Toochangi.getRealEstate();

  if (realEstate.length === 0) {
    tbody.innerHTML = '<tr><td colspan="16" class="empty-state">부동산을 추가해 주세요</td></tr>';
    return;
  }

  tbody.innerHTML = realEstate.map(r => {
    const loanProgress = calculateLoanProgress(r);
    return `<tr data-rowindex="${r.rowIndex}">
      <td><strong>${r.name}</strong></td>
      <td>${r.purchasePrice.toLocaleString()}원</td>
      <td>${r.currentValue.toLocaleString()}원</td>
      <td style="color: var(--accent-red);">${r.loanAmount > 0 ? formatRealEstateCurrency(r.loanAmount) : '—'}</td>
      <td>${r.loanRate > 0 ? r.loanRate + '%' : '—'}</td>
      <td>${r.loanStartDate || '—'}</td>
      <td>${r.loanTermYears ? `${r.loanTermYears}년` : '—'}</td>
      <td>${loanProgress ? formatRealEstateCurrency(loanProgress.paidPrincipal) : '—'}</td>
      <td>${loanProgress ? formatRealEstateCurrency(loanProgress.paidInterest) : '—'}</td>
      <td style="color: var(--accent-yellow);">${loanProgress ? formatRealEstateCurrency(loanProgress.remainingBalance) : '—'}</td>
      <td>${r.deposit > 0 ? formatRealEstateCurrency(r.deposit) : '—'}</td>
      <td style="color: var(--text-muted);">${r.maintenance > 0 ? formatRealEstateCurrency(r.maintenance) : '—'}</td>
      <td><span style="color: var(--accent-orange); font-weight: 500;">${r.purpose || '—'}</span></td>
      <td style="color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.memo}">${r.memo || '—'}</td>
      <td>${r.date || '—'}</td>
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
