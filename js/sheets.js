/**
 * 투챙이 - Google Sheets API 모듈
 * 투챙이 전용 시트 + 가챙이 시트 읽기
 */
const SheetsAPI = (() => {
  const cfg = () => window.TOOCHANGI_CONFIG;

  // ── 시트 자동 생성 ──────────────────────────────────────────────
  /**
   * 투챙이 전용 스프레드시트가 없으면 자동 생성 후 config에 ID 저장
   */
  async function setupToochangiSheet() {
    const storedId = localStorage.getItem('toochangi_sheet_id');
    if (storedId) {
      TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID = storedId;
      console.log('[Sheets] 기존 투챙이 시트 ID 로드:', storedId);
      await _ensureSheetTabs();
      return storedId;
    }

    // 새 스프레드시트 생성
    const res = await gapi.client.sheets.spreadsheets.create({
      properties: { title: '투챙이 투자 기록부' },
      sheets: [
        { properties: { title: '포트폴리오', index: 0 } },
        { properties: { title: '매매일지',   index: 1 } },
        { properties: { title: '분석기록',   index: 2 } },
        { properties: { title: '3단계필터',  index: 3 } },
      ],
    });

    const newId = res.result.spreadsheetId;
    TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID = newId;
    localStorage.setItem('toochangi_sheet_id', newId);
    console.log('✅ 투챙이 시트 생성 완료:', newId);

    // 헤더 초기화
    await _initHeaders(newId);
    return newId;
  }

  async function _ensureSheetTabs() {
    // 탭이 이미 있으면 패스 - 실제 운영에서는 탭 존재 여부 확인 로직 추가 가능
  }

  async function _initHeaders(sheetId) {
    const portfolioHeaders = [['종목명','티커','시장','보유수량','평균단가(원)','현재가(원)','평가금액','수익률(%)','비중(%)','메모','최종수정일']];
    const tradeHeaders     = [['날짜','종목명','구분','수량','단가(원)','금액(원)','3단계필터','메모']];
    const analysisHeaders  = [['날짜','질문','AI분석결과','관련종목','투자의견','기간']];
    const filterHeaders    = [['날짜','시장신호','섹터신호','종목신호','최종판단','메모']];

    const batchData = [
      { range: '포트폴리오!A1', values: portfolioHeaders },
      { range: '매매일지!A1',   values: tradeHeaders },
      { range: '분석기록!A1',   values: analysisHeaders },
      { range: '3단계필터!A1',  values: filterHeaders },
    ];

    await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      resource: { valueInputOption: 'RAW', data: batchData },
    });
    console.log('✅ 투챙이 시트 헤더 초기화 완료');
  }

  // ── 포트폴리오 ──────────────────────────────────────────────────
  async function getPortfolio() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return [];
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: id, range: '포트폴리오!A2:K',
    });
    return (res.result.values || []).map(r => ({
      name:    r[0]  || '',
      ticker:  r[1]  || '',
      market:  r[2]  || '',
      qty:     parseFloat(r[3])  || 0,
      avgPrice:parseFloat(r[4])  || 0,
      curPrice:parseFloat(r[5])  || 0,
      value:   parseFloat(r[6])  || 0,
      yield:   parseFloat(r[7])  || 0,
      weight:  parseFloat(r[8])  || 0,
      memo:    r[9]  || '',
    }));
  }

  async function appendPortfolio(row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    const value = row.qty * row.avgPrice;
    const values = [[
      row.name, row.ticker, row.market,
      row.qty, row.avgPrice, row.curPrice || row.avgPrice,
      value, 0, 0, row.memo || '', now,
    ]];
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: '포트폴리오!A:K',
      valueInputOption: 'RAW',
      resource: { values },
    });
  }

  // ── 매매일지 ──────────────────────────────────────────────────
  async function getTradeLog() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return [];
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: id, range: '매매일지!A2:H',
    });
    return (res.result.values || []).map(r => ({
      date:    r[0] || '',
      name:    r[1] || '',
      type:    r[2] || '',
      qty:     parseFloat(r[3]) || 0,
      price:   parseFloat(r[4]) || 0,
      amount:  parseFloat(r[5]) || 0,
      filter:  r[6] || '',
      memo:    r[7] || '',
    }));
  }

  async function appendTrade(row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const amount = row.qty * row.price;
    const values = [[
      row.date, row.name, row.type, row.qty, row.price, amount, row.filter || '', row.memo || '',
    ]];
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: '매매일지!A:H',
      valueInputOption: 'RAW',
      resource: { values },
    });
  }

  // ── 분석기록 ──────────────────────────────────────────────────
  async function getAnalysisHistory() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return [];
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: id, range: '분석기록!A2:F',
    });
    return (res.result.values || []).map(r => ({
      date:     r[0] || '',
      query:    r[1] || '',
      result:   r[2] || '',
      stocks:   r[3] || '',
      opinion:  r[4] || '',
      duration: r[5] || '',
    }));
  }

  async function appendAnalysis(row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const values = [[
      new Date().toLocaleDateString('ko-KR'),
      row.query, row.result, row.stocks || '', row.opinion || '', row.duration || '',
    ]];
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: '분석기록!A:F',
      valueInputOption: 'RAW',
      resource: { values },
    });
  }

  // ── 3단계 필터 저장 ──────────────────────────────────────────────
  async function appendFilter(row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const values = [[
      new Date().toLocaleDateString('ko-KR'),
      row.signal1, row.signal2, row.signal3, row.verdict, row.memo || '',
    ]];
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: '3단계필터!A:F',
      valueInputOption: 'RAW',
      resource: { values },
    });
  }

  // ── 가챙이 시트 읽기 (월 저축액 가져오기) ────────────────────────
  async function getGachangiMonthlySavings() {
    const id = TOOCHANGI_CONFIG.GACHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return null;
    try {
      // 가챙이 현재 월 시트에서 수입/지출 합계 읽기
      const now = new Date();
      const sheetName = `${now.getMonth() + 1}월`;
      const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: `${sheetName}!A:H`,
      });
      const rows = res.result.values || [];
      let income = 0, expense = 0, savings = 0;
      rows.slice(3).forEach(r => {
        const cat = r[3] || '';
        const amt = parseFloat((r[5] || '0').toString().replace(/,/g, '')) || 0;
        if (cat === '수입') income += amt;
        else if (cat !== '투자/저축') expense += amt;
        else savings += amt;
      });
      return { income, expense, savings, available: income - expense };
    } catch (e) {
      console.warn('[Sheets] 가챙이 시트 읽기 실패:', e);
      return null;
    }
  }

  return {
    setupToochangiSheet,
    getPortfolio, appendPortfolio,
    getTradeLog, appendTrade,
    getAnalysisHistory, appendAnalysis,
    appendFilter,
    getGachangiMonthlySavings,
  };
})();
