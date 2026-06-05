/**
 * 투챙이 - Google Sheets API 모듈
 * 투챙이 전용 시트 + 가챙이 시트 읽기
 */
const SheetsAPI = (() => {
  const cfg = () => window.TOOCHANGI_CONFIG || TOOCHANGI_CONFIG;

  function ensureGapiWrapped() {
    if (!window.gapi || !gapi.client || !gapi.client.sheets) return;
    if (gapi.client.sheets._wrapped) return;

    const wrapFunc = (fn) => {
      return async function(...args) {
        let delay = 1000;
        const maxRetries = 5;
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await fn.apply(this, args);
          } catch (err) {
            const status = err.status || (err.result && err.result.error && err.result.error.code);
            if (status === 429 && i < maxRetries - 1) {
              console.warn(`[API Retry] 429 Too Many Requests. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              delay *= 2;
              delay += Math.random() * 500;
              continue;
            }
            throw err;
          }
        }
      };
    };

    const spreadsheets = gapi.client.sheets.spreadsheets;
    if (spreadsheets) {
      if (typeof spreadsheets.create === 'function') spreadsheets.create = wrapFunc(spreadsheets.create);
      if (typeof spreadsheets.get === 'function') spreadsheets.get = wrapFunc(spreadsheets.get);
      if (typeof spreadsheets.batchUpdate === 'function') spreadsheets.batchUpdate = wrapFunc(spreadsheets.batchUpdate);
      
      const values = spreadsheets.values;
      if (values) {
        if (typeof values.get === 'function') values.get = wrapFunc(values.get);
        if (typeof values.update === 'function') values.update = wrapFunc(values.update);
        if (typeof values.append === 'function') values.append = wrapFunc(values.append);
        if (typeof values.batchUpdate === 'function') values.batchUpdate = wrapFunc(values.batchUpdate);
      }
    }

    const driveFiles = gapi.client.drive && gapi.client.drive.files;
    if (driveFiles) {
      if (typeof driveFiles.list === 'function') driveFiles.list = wrapFunc(driveFiles.list);
      if (typeof driveFiles.create === 'function') driveFiles.create = wrapFunc(driveFiles.create);
      if (typeof driveFiles.update === 'function') driveFiles.update = wrapFunc(driveFiles.update);
    }

    gapi.client.sheets._wrapped = true;
    console.log('[API Retry] Google Sheets & Drive API 429 재시도 래퍼 적용 완료');
  }

  // ── 시트 자동 생성 ──────────────────────────────────────────────
  /**
   * 투챙이 전용 스프레드시트가 없으면 자동 생성 후 config에 ID 저장
   */
  async function setupToochangiSheet() {
    const storedId = localStorage.getItem('toochangi_sheet_id');
    if (storedId) {
      TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID = storedId;
      console.log('[Sheets] 기존 투챙이 시트 ID 로드:', storedId);
      await _ensureSheetTabs(storedId);
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
        { properties: { title: '예적금',     index: 4 } },
        { properties: { title: '부동산',     index: 5 } },
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

  async function _ensureSheetTabs(sheetId) {
    try {
      const metaRes = await gapi.client.sheets.spreadsheets.get({
        spreadsheetId: sheetId,
        fields: 'sheets.properties(title,sheetId)'
      });
      const sheets = metaRes.result.sheets || [];
      const titles = sheets.map(s => s.properties.title);

      const requiredTabs = ['포트폴리오', '매매일지', '분석기록', '3단계필터', '예적금', '부동산'];
      const requests = [];

      requiredTabs.forEach(tab => {
        if (!titles.includes(tab)) {
          requests.push({
            addSheet: {
              properties: { title: tab }
            }
          });
        }
      });

      if (requests.length > 0) {
        await gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          resource: { requests }
        });
        console.log('✅ 누락된 시트 탭 추가 완료:', requests.map(r => r.addSheet.properties.title).join(', '));
        
        const headers = {
          '예적금': [['자산명','금융기관','예적금종류','금리(%)','잔액(원)','만기일','자산용도','메모','등록일']],
          '부동산': [['부동산명','매입가(원)','현재평가액(원)','담보대출액(원)','대출금리(%)','전세보증금(원)','연간유지비/이자(원)','자산용도','메모','등록일']]
        };
        
        const batchData = [];
        requiredTabs.forEach(tab => {
          if (!titles.includes(tab) && headers[tab]) {
            batchData.push({
              range: `${tab}!A1`,
              values: headers[tab]
            });
          }
        });
        
        if (batchData.length > 0) {
          await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: sheetId,
            resource: { valueInputOption: 'RAW', data: batchData }
          });
        }
      }
    } catch (e) {
      console.error('[SheetsAPI] 시트 탭 무결성 검사 실패:', e);
    }
  }

  async function _initHeaders(sheetId) {
    const portfolioHeaders = [['종목명','티커','시장','보유수량','평균단가(원)','현재가(원)','평가금액','수익률(%)','비중(%)','메모','최종수정일']];
    const tradeHeaders     = [['날짜','종목명','구분','수량','단가(원)','금액(원)','3단계필터','메모']];
    const analysisHeaders  = [['날짜','질문','AI분석결과','관련종목','투자의견','기간']];
    const filterHeaders    = [['날짜','시장신호','섹터신호','종목신호','최종판단','메모']];
    const savingsHeaders   = [['자산명','금융기관','예적금종류','금리(%)','잔액(원)','만기일','자산용도','메모','등록일']];
    const realEstateHeaders = [['부동산명','매입가(원)','현재평가액(원)','담보대출액(원)','대출금리(%)','전세보증금(원)','연간유지비/이자(원)','자산용도','메모','등록일']];

    const batchData = [
      { range: '포트폴리오!A1', values: portfolioHeaders },
      { range: '매매일지!A1',   values: tradeHeaders },
      { range: '분석기록!A1',   values: analysisHeaders },
      { range: '3단계필터!A1',  values: filterHeaders },
      { range: '예적금!A1',     values: savingsHeaders },
      { range: '부동산!A1',     values: realEstateHeaders },
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
    return (res.result.values || []).map((r, idx) => ({
      rowIndex: idx + 2, // 헤더가 1행이므로 데이터는 2행부터 시작
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

  async function getSavings() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return [];
    try {
      const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: id, range: '예적금!A2:I',
      });
      return (res.result.values || []).map((r, idx) => ({
        rowIndex: idx + 2,
        name:     r[0] || '',
        bank:     r[1] || '',
        type:     r[2] || '',
        rate:     parseFloat(r[3]) || 0,
        balance:  parseFloat(r[4]) || 0,
        maturity: r[5] || '',
        purpose:  r[6] || '',
        memo:     r[7] || '',
        date:     r[8] || '',
      }));
    } catch (e) {
      console.warn('[SheetsAPI] 예적금 로드 실패:', e);
      return [];
    }
  }

  async function getRealEstate() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return [];
    try {
      const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: id, range: '부동산!A2:J',
      });
      return (res.result.values || []).map((r, idx) => ({
        rowIndex: idx + 2,
        name:     r[0] || '',
        purchasePrice: parseFloat(r[1]) || 0,
        currentValue:  parseFloat(r[2]) || 0,
        loanAmount:    parseFloat(r[3]) || 0,
        loanRate:      parseFloat(r[4]) || 0,
        deposit:       parseFloat(r[5]) || 0,
        maintenance:   parseFloat(r[6]) || 0,
        purpose:       r[7] || '',
        memo:          r[8] || '',
        date:          r[9] || '',
      }));
    } catch (e) {
      console.warn('[SheetsAPI] 부동산 로드 실패:', e);
      return [];
    }
  }

  // ── 예적금 CRUD ──────────────────────────────────────────────
  async function backupSavings() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return;
    try {
      const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: '예적금!A1:I',
        valueRenderOption: 'FORMULA'
      });
      const values = res.result.values;
      if (!values || values.length === 0) return;

      const metaRes = await gapi.client.sheets.spreadsheets.get({
        spreadsheetId: id,
        fields: 'sheets.properties(title,sheetId)'
      });
      const sheets = metaRes.result.sheets || [];
      const backupSheet = sheets.find(s => s.properties.title === '예적금_백업');
      
      if (!backupSheet) {
        await gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: id,
          resource: {
            requests: [{
              addSheet: {
                properties: { title: '예적금_백업' }
              }
            }]
          }
        });
      }

      await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: id,
        range: '예적금_백업!A1:I'
      });

      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: '예적금_백업!A1',
        valueInputOption: 'USER_ENTERED',
        resource: { values }
      });
      console.log('✅ 예적금 백업 완료 (예적금_백업)');
    } catch (e) {
      console.warn('⚠️ 예적금 백업 실패:', e);
    }
  }

  async function restoreSavingsFromBackup() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return;
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: '예적금_백업!A1:I',
      valueRenderOption: 'FORMULA'
    });
    const values = res.result.values;
    if (!values || values.length === 0) {
      throw new Error('복원할 백업 데이터가 존재하지 않습니다.');
    }
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: id,
      range: '예적금!A1:I'
    });
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: '예적금!A1',
      valueInputOption: 'USER_ENTERED',
      resource: { values }
    });
    console.log('✅ 백업으로부터 예적금 복원 완료');
  }

  async function appendSavings(row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    await backupSavings();
    const values = [[
      row.name, row.bank, row.type,
      parseFloat(row.rate) || 0, parseFloat(row.balance) || 0, row.maturity || '',
      row.purpose || '', row.memo || '', now
    ]];
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: '예적금!A:I',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  async function updateSavings(rowIndex, row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    await backupSavings();
    const values = [[
      row.name, row.bank, row.type,
      parseFloat(row.rate) || 0, parseFloat(row.balance) || 0, row.maturity || '',
      row.purpose || '', row.memo || '', now
    ]];
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `예적금!A${rowIndex}:I${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  async function deleteSavings(rowIndex) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    await backupSavings();
    const metaRes = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties(title,sheetId)'
    });
    const sheet = (metaRes.result.sheets || []).find(s => s.properties.title === '예적금');
    if (!sheet) throw new Error('예적금 시트를 찾을 수 없습니다.');
    const sheetId = sheet.properties.sheetId;
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      }
    });
  }

  async function updateSavingsRows(updates) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    await backupSavings();
    const data = updates.map(({ rowIndex, row }) => {
      return {
        range: `예적금!A${rowIndex}:I${rowIndex}`,
        values: [[
          row.name, row.bank, row.type,
          parseFloat(row.rate) || 0, parseFloat(row.balance) || 0, row.maturity || '',
          row.purpose || '', row.memo || '', now
        ]]
      };
    });
    await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data
      }
    });
  }

  async function deleteSavingsRows(rowIndices) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    await backupSavings();
    const metaRes = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties(title,sheetId)'
    });
    const sheet = (metaRes.result.sheets || []).find(s => s.properties.title === '예적금');
    if (!sheet) throw new Error('예적금 시트를 찾을 수 없습니다.');
    const sheetId = sheet.properties.sheetId;
    const sortedIndices = [...rowIndices].sort((a, b) => b - a);
    const requests = sortedIndices.map(rIdx => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rIdx - 1,
          endIndex: rIdx
        }
      }
    }));
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      resource: { requests }
    });
  }

  // ── 부동산 CRUD ──────────────────────────────────────────────
  async function appendRealEstate(row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    const values = [[
      row.name,
      parseFloat(row.purchasePrice) || 0,
      parseFloat(row.currentValue) || 0,
      parseFloat(row.loanAmount) || 0,
      parseFloat(row.loanRate) || 0,
      parseFloat(row.deposit) || 0,
      parseFloat(row.maintenance) || 0,
      row.purpose || '',
      row.memo || '',
      now
    ]];
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: '부동산!A:J',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  async function updateRealEstate(rowIndex, row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    const values = [[
      row.name,
      parseFloat(row.purchasePrice) || 0,
      parseFloat(row.currentValue) || 0,
      parseFloat(row.loanAmount) || 0,
      parseFloat(row.loanRate) || 0,
      parseFloat(row.deposit) || 0,
      parseFloat(row.maintenance) || 0,
      row.purpose || '',
      row.memo || '',
      now
    ]];
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `부동산!A${rowIndex}:J${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  async function deleteRealEstate(rowIndex) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const metaRes = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties(title,sheetId)'
    });
    const sheet = (metaRes.result.sheets || []).find(s => s.properties.title === '부동산');
    if (!sheet) throw new Error('부동산 시트를 찾을 수 없습니다.');
    const sheetId = sheet.properties.sheetId;
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      }
    });
  }

  async function updateRealEstateRows(updates) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    const data = updates.map(({ rowIndex, row }) => {
      return {
        range: `부동산!A${rowIndex}:J${rowIndex}`,
        values: [[
          row.name,
          parseFloat(row.purchasePrice) || 0,
          parseFloat(row.currentValue) || 0,
          parseFloat(row.loanAmount) || 0,
          parseFloat(row.loanRate) || 0,
          parseFloat(row.deposit) || 0,
          parseFloat(row.maintenance) || 0,
          row.purpose || '',
          row.memo || '',
          now
        ]]
      };
    });
    await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data
      }
    });
  }

  async function deleteRealEstateRows(rowIndices) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const metaRes = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties(title,sheetId)'
    });
    const sheet = (metaRes.result.sheets || []).find(s => s.properties.title === '부동산');
    if (!sheet) throw new Error('부동산 시트를 찾을 수 없습니다.');
    const sheetId = sheet.properties.sheetId;
    const sortedIndices = [...rowIndices].sort((a, b) => b - a);
    const requests = sortedIndices.map(rIdx => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rIdx - 1,
          endIndex: rIdx
        }
      }
    }));
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      resource: { requests }
    });
  }

  async function appendPortfolio(row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    
    await backupPortfolio();
    
    // 현재 포트폴리오를 읽어 다음에 삽입될 행(ROW) 번호 계산 (헤더가 1행이므로 데이터는 length + 2부터 시작)
    const portfolio = await getPortfolio();
    const nextRow = portfolio.length + 2;

    const fFormula = `=IF(ISBLANK(B${nextRow}), 0, IF(REGEXMATCH(TO_TEXT(B${nextRow}), "^[0-9]{1,6}$"), INT(GOOGLEFINANCE("KRX:"&TEXT(B${nextRow},"000000"))), IF(OR(C${nextRow}="나스닥", C${nextRow}="NYSE"), INT(GOOGLEFINANCE(B${nextRow}) * GOOGLEFINANCE("USDKRW")), INT(GOOGLEFINANCE(B${nextRow})))))`;
    const gFormula = `=D${nextRow}*F${nextRow}`;
    const hFormula = `=IF(E${nextRow}>0, (F${nextRow}-E${nextRow})/E${nextRow}, 0)`;
    const iFormula = `=IF(SUM(G$2:G$100)>0, G${nextRow}/SUM(G$2:G$100), 0)`;

    const values = [[
      row.name, row.ticker, row.market,
      row.qty, row.avgPrice, fFormula,
      gFormula, hFormula, iFormula, row.memo || '구글파이낸스 연동', now,
    ]];

    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: '포트폴리오!A:K',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  async function updatePortfolio(rowIndex, row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');

    await backupPortfolio();

    const fFormula = `=IF(ISBLANK(B${rowIndex}), 0, IF(REGEXMATCH(TO_TEXT(B${rowIndex}), "^[0-9]{1,6}$"), INT(GOOGLEFINANCE("KRX:"&TEXT(B${rowIndex},"000000"))), IF(OR(C${rowIndex}="나스닥", C${rowIndex}="NYSE"), INT(GOOGLEFINANCE(B${rowIndex}) * GOOGLEFINANCE("USDKRW")), INT(GOOGLEFINANCE(B${rowIndex})))))`;
    const gFormula = `=D${rowIndex}*F${rowIndex}`;
    const hFormula = `=IF(E${rowIndex}>0, (F${rowIndex}-E${rowIndex})/E${rowIndex}, 0)`;
    const iFormula = `=IF(SUM(G$2:G$100)>0, G${rowIndex}/SUM(G$2:G$100), 0)`;

    const values = [[
      row.name, row.ticker, row.market,
      row.qty, row.avgPrice, fFormula,
      gFormula, hFormula, iFormula, row.memo || '수동 업데이트', now,
    ]];

    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `포트폴리오!A${rowIndex}:K${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  async function deletePortfolio(rowIndex) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    await backupPortfolio();
    const metaRes = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties(title,sheetId)'
    });
    const sheet = (metaRes.result.sheets || []).find(s => s.properties.title === '포트폴리오');
    if (!sheet) throw new Error('포트폴리오 시트를 찾을 수 없습니다.');
    const sheetId = sheet.properties.sheetId;

    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      }
    });
  }

  async function updatePortfolioRows(updates) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');

    await backupPortfolio();

    const data = updates.map(({ rowIndex, row }) => {
      const fFormula = `=IF(ISBLANK(B${rowIndex}), 0, IF(REGEXMATCH(TO_TEXT(B${rowIndex}), "^[0-9]{1,6}$"), INT(GOOGLEFINANCE("KRX:"&TEXT(B${rowIndex},"000000"))), IF(OR(C${rowIndex}="나스닥", C${rowIndex}="NYSE"), INT(GOOGLEFINANCE(B${rowIndex}) * GOOGLEFINANCE("USDKRW")), INT(GOOGLEFINANCE(B${rowIndex})))))`;
      const gFormula = `=D${rowIndex}*F${rowIndex}`;
      const hFormula = `=IF(E${rowIndex}>0, (F${rowIndex}-E${rowIndex})/E${rowIndex}, 0)`;
      const iFormula = `=IF(SUM(G$2:G$100)>0, G${rowIndex}/SUM(G$2:G$100), 0)`;

      return {
        range: `포트폴리오!A${rowIndex}:K${rowIndex}`,
        values: [[
          row.name, row.ticker, row.market,
          row.qty, row.avgPrice, fFormula,
          gFormula, hFormula, iFormula, row.memo || '수동 업데이트', now,
        ]]
      };
    });

    await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data
      }
    });
  }

  async function deletePortfolioRows(rowIndices) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    await backupPortfolio();
    const metaRes = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties(title,sheetId)'
    });
    const sheet = (metaRes.result.sheets || []).find(s => s.properties.title === '포트폴리오');
    if (!sheet) throw new Error('포트폴리오 시트를 찾을 수 없습니다.');
    const sheetId = sheet.properties.sheetId;

    const sortedIndices = [...rowIndices].sort((a, b) => b - a);

    const requests = sortedIndices.map(rIdx => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rIdx - 1,
          endIndex: rIdx
        }
      }
    }));

    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      resource: { requests }
    });
  }

  async function applyFormulasToPortfolio() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return;

    await backupPortfolio();

    // 현재 포트폴리오 값을 가져와 행의 개수를 파악
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: id, range: '포트폴리오!A2:K',
    });
    const rows = res.result.values || [];
    if (rows.length === 0) return;

    // 배치 업데이트를 위한 범위 및 수식 배열 생성
    const data = [];
    rows.forEach((r, index) => {
      const rowIndex = index + 2; // 2행부터 시작
      const range = `포트폴리오!F${rowIndex}:I${rowIndex}`;
      const fFormula = `=IF(ISBLANK(B${rowIndex}), 0, IF(REGEXMATCH(TO_TEXT(B${rowIndex}), "^[0-9]{1,6}$"), INT(GOOGLEFINANCE("KRX:"&TEXT(B${rowIndex},"000000"))), IF(OR(C${rowIndex}="나스닥", C${rowIndex}="NYSE"), INT(GOOGLEFINANCE(B${rowIndex}) * GOOGLEFINANCE("USDKRW")), INT(GOOGLEFINANCE(B${rowIndex})))))`;
      const gFormula = `=D${rowIndex}*F${rowIndex}`;
      const hFormula = `=IF(E${rowIndex}>0, (F${rowIndex}-E${rowIndex})/E${rowIndex}, 0)`;
      const iFormula = `=IF(SUM(G$2:G$100)>0, G${rowIndex}/SUM(G$2:G$100), 0)`;

      data.push({
        range,
        values: [[fFormula, gFormula, hFormula, iFormula]]
      });
    });

    await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: data
      }
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

  // ── 가챙이 시트 내 자산현황 관리 ──────────────────────────────
  /** 가챙이 시트에 '자산현황' 탭이 없으면 자동 생성 */
  async function setupGachangiAssetSheet() {
    const id = TOOCHANGI_CONFIG.GACHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return;

    try {
      const res = await gapi.client.sheets.spreadsheets.get({
        spreadsheetId: id,
        fields: 'sheets.properties(title,sheetId)'
      });
      const sheets = res.result.sheets || [];
      const hasAssetSheet = sheets.some(s => s.properties.title === TOOCHANGI_CONFIG.SHEET_NAMES.ASSET);
      
      if (!hasAssetSheet) {
        console.log('[Sheets] 가챙이 시트에 자산현황 탭이 없어 새로 생성합니다.');
        await gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: id,
          resource: {
            requests: [
              { addSheet: { properties: { title: TOOCHANGI_CONFIG.SHEET_NAMES.ASSET } } }
            ]
          }
        });

        // 헤더 초기화
        const headers = [['날짜', '자산구분', '자산명', '잔고', '메모', '최종수정일']];
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: id,
          range: `${TOOCHANGI_CONFIG.SHEET_NAMES.ASSET}!A1`,
          valueInputOption: 'RAW',
          resource: { values: headers },
        });
        console.log('✅ 가챙이 시트 자산현황 탭 생성 및 헤더 초기화 완료');
      }
    } catch (e) {
      console.error('[Sheets] 자산현황 탭 확인/생성 실패:', e);
    }
  }

  /** 자산현황 목록 불러오기 */
  async function getAssetStatus() {
    const id = TOOCHANGI_CONFIG.GACHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return [];
    
    await setupGachangiAssetSheet();

    try {
      const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: `${TOOCHANGI_CONFIG.SHEET_NAMES.ASSET}!A2:F`,
      });
      return (res.result.values || []).map((r, idx) => ({
        rowIndex: idx + 2, // 헤더가 1행이므로 데이터는 2행부터 시작
        date:        r[0] || '',
        category:    r[1] || '',
        name:        r[2] || '',
        balance:     parseFloat((r[3] || '0').toString().replace(/,/g, '')) || 0,
        memo:        r[4] || '',
        lastUpdated: r[5] || '',
      }));
    } catch (e) {
      console.error('[Sheets] 자산현황 로드 실패:', e);
      return [];
    }
  }

  /** 신규 자산 추가 */
  async function appendAsset(row) {
    const id = TOOCHANGI_CONFIG.GACHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    const values = [[
      row.date || new Date().toISOString().split('T')[0],
      row.category,
      row.name,
      row.balance,
      row.memo || '',
      now,
    ]];
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${TOOCHANGI_CONFIG.SHEET_NAMES.ASSET}!A:F`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  /** 기존 자산 수정 */
  async function updateAsset(rowIndex, row) {
    const id = TOOCHANGI_CONFIG.GACHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    const values = [[
      row.date,
      row.category,
      row.name,
      row.balance,
      row.memo || '',
      now,
    ]];
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${TOOCHANGI_CONFIG.SHEET_NAMES.ASSET}!A${rowIndex}:F${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  /** 자산 삭제 */
  async function deleteAsset(rowIndex) {
    const id = TOOCHANGI_CONFIG.GACHANGI_SHEET_ID;
    
    const metaRes = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties(title,sheetId)'
    });
    const sheet = (metaRes.result.sheets || []).find(s => s.properties.title === TOOCHANGI_CONFIG.SHEET_NAMES.ASSET);
    if (!sheet) throw new Error('자산현황 시트를 찾을 수 없습니다.');
    const sheetId = sheet.properties.sheetId;

    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      }
    });
  }

  /** 포트폴리오 평가금 자산 DB 동기화 */
  async function syncPortfolioToAssets(domesticVal, foreignVal, targetDate) {
    const assetList = await getAssetStatus();
    
    // 국내주식 동기화
    const domesticItem = assetList.find(a => a.date === targetDate && a.category === '국내주식/투자' && a.name === '투챙이 국내 포트폴리오');
    if (domesticItem) {
      await updateAsset(domesticItem.rowIndex, {
        date: targetDate,
        category: '국내주식/투자',
        name: '투챙이 국내 포트폴리오',
        balance: domesticVal,
        memo: '포트폴리오 실시간 동기화',
      });
    } else if (domesticVal > 0) {
      await appendAsset({
        date: targetDate,
        category: '국내주식/투자',
        name: '투챙이 국내 포트폴리오',
        balance: domesticVal,
        memo: '포트폴리오 실시간 동기화',
      });
    }

    // 해외주식 동기화
    const foreignItem = assetList.find(a => a.date === targetDate && a.category === '해외주식/투자' && a.name === '투챙이 해외 포트폴리오');
    if (foreignItem) {
      await updateAsset(foreignItem.rowIndex, {
        date: targetDate,
        category: '해외주식/투자',
        name: '투챙이 해외 포트폴리오',
        balance: foreignVal,
        memo: '포트폴리오 실시간 동기화',
      });
    } else if (foreignVal > 0) {
      await appendAsset({
        date: targetDate,
        category: '해외주식/투자',
        name: '투챙이 해외 포트폴리오',
        balance: foreignVal,
        memo: '포트폴리오 실시간 동기화',
      });
    }
  }

  async function backupPortfolio() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return;

    try {
      const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: '포트폴리오!A1:K',
        valueRenderOption: 'FORMULA'
      });
      const values = res.result.values;
      if (!values || values.length === 0) return;

      const metaRes = await gapi.client.sheets.spreadsheets.get({
        spreadsheetId: id,
        fields: 'sheets.properties(title,sheetId)'
      });
      const sheets = metaRes.result.sheets || [];
      const backupSheet = sheets.find(s => s.properties.title === '포트폴리오_백업');
      
      if (!backupSheet) {
        await gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: id,
          resource: {
            requests: [{
              addSheet: {
                properties: { title: '포트폴리오_백업' }
              }
            }]
          }
        });
      }

      await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: id,
        range: '포트폴리오_백업!A1:K'
      });

      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: '포트폴리오_백업!A1',
        valueInputOption: 'USER_ENTERED',
        resource: { values }
      });
      console.log('✅ 포트폴리오 백업 완료 (포트폴리오_백업)');
    } catch (e) {
      console.warn('⚠️ 포트폴리오 백업 실패:', e);
    }
  }

  async function restorePortfolioFromBackup() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return;

    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: '포트폴리오_백업!A1:K',
      valueRenderOption: 'FORMULA'
    });
    const values = res.result.values;
    if (!values || values.length === 0) {
      throw new Error('복원할 백업 데이터가 존재하지 않습니다.');
    }

    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: id,
      range: '포트폴리오!A1:K'
    });

    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: '포트폴리오!A1',
      valueInputOption: 'USER_ENTERED',
      resource: { values }
    });
    console.log('✅ 백업으로부터 포트폴리오 복원 완료');
  }

  const api = {
    setupToochangiSheet,
    getPortfolio, appendPortfolio, updatePortfolio, deletePortfolio, updatePortfolioRows, deletePortfolioRows, applyFormulasToPortfolio,
    backupPortfolio, restorePortfolioFromBackup,
    getSavings, appendSavings, updateSavings, deleteSavings, updateSavingsRows, deleteSavingsRows, backupSavings, restoreSavingsFromBackup,
    getRealEstate, appendRealEstate, updateRealEstate, deleteRealEstate, updateRealEstateRows, deleteRealEstateRows,
    getTradeLog, appendTrade,
    getAnalysisHistory, appendAnalysis,
    appendFilter,
    getGachangiMonthlySavings,
    setupGachangiAssetSheet,
    getAssetStatus,
    appendAsset,
    updateAsset,
    deleteAsset,
    syncPortfolioToAssets,
  };

  // 모든 API 호출 전에 ensureGapiWrapped()가 먼저 실행되도록 랩핑
  Object.keys(api).forEach(key => {
    if (typeof api[key] === 'function') {
      const original = api[key];
      api[key] = async function(...args) {
        ensureGapiWrapped();
        return await original.apply(this, args);
      };
    }
  });

  return api;
})();
