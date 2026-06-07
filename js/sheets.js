/**
 * 투챙이 - Google Sheets API 모듈
 * 투챙이 전용 시트 + 가챙이 시트 읽기
 */
const SheetsAPI = (() => {
  const cfg = () => window.TOOCHANGI_CONFIG || TOOCHANGI_CONFIG;
  const DEFAULT_GACHANGI_SHEET_ID = '1RahTa8uculzZR_nv9lmKnSOYJiqBQ6eco2NYaUh18qo';
  const SAVINGS_SHEET = '\uC608\uC801\uAE08';
  const SAVINGS_HEADER_RANGE = `${SAVINGS_SHEET}!A1:N1`;
  const SAVINGS_HEADERS = [[
    '\uC790\uC0B0\uBA85',
    '\uAE08\uC735\uAE30\uAD00',
    '\uBA85\uC758',
    '\uACC4\uC88C\uBC88\uD638',
    '\uC608\uC801\uAE08\uC885\uB958',
    '\uAE08\uB9AC(%)',
    '\uC794\uC561(\uC6D0)',
    '\uB9CC\uAE30\uC77C',
    '\uC790\uC0B0\uC6A9\uB3C4',
    '\uBA54\uBAA8',
    '\uB4F1\uB85D\uC77C',
    '\uC6D4\uB0A9\uC785\uC561(\uC6D0)',
    '\uB0A9\uC785\uAE30\uC900\uC77C',
    '\uB0A9\uC785\uC2DC\uC791\uC77C'
  ]];
  const REAL_ESTATE_SHEET = '\uBD80\uB3D9\uC0B0';
  const REAL_ESTATE_HEADER_RANGE = `${REAL_ESTATE_SHEET}!A1:L1`;
  const REAL_ESTATE_HEADERS = [[
    '\uBD80\uB3D9\uC0B0\uBA85',
    '\uB9E4\uC785\uAC00(\uC6D0)',
    '\uD604\uC7AC\uD3C9\uAC00\uC561(\uC6D0)',
    '\uB2F4\uBCF4\uB300\uCD9C\uC561(\uC6D0)',
    '\uB300\uCD9C\uAE08\uB9AC(%)',
    '\uC804\uC138\uBCF4\uC99D\uAE08(\uC6D0)',
    '\uC5F0\uAC04 \uC0C1\uD658\uC561(\uC6D0\uB9AC\uAE08)',
    '\uC790\uC0B0\uC6A9\uB3C4',
    '\uBA54\uBAA8',
    '\uB300\uCD9C\uC2E4\uD589\uC77C',
    '\uC0C1\uD658\uB144\uC218',
    '\uB4F1\uB85D\uC77C'
  ]];

  // 시트 셀 숫자 파싱 (천 단위 콤마 제거 — 기본 FORMATTED_VALUE로 "1,234,567"이 와도 안전)
  function _num(v) { return parseFloat(String(v == null ? '' : v).replace(/,/g, '')) || 0; }
  function _int(v) { return parseInt(String(v == null ? '' : v).replace(/,/g, ''), 10) || 0; }

  async function ensureRealEstateSheet(spreadsheetId) {
    const metaRes = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(title)'
    });
    const titles = (metaRes.result.sheets || []).map(s => s.properties.title);
    if (!titles.includes(REAL_ESTATE_SHEET)) {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{ addSheet: { properties: { title: REAL_ESTATE_SHEET } } }]
        }
      });
    }

    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: REAL_ESTATE_HEADER_RANGE,
      valueInputOption: 'RAW',
      resource: { values: REAL_ESTATE_HEADERS }
    });
  }

  async function getGachangiAccounts() {
    const id = getGachangiSheetId();
    if (!id || id.startsWith('YOUR_')) return [];

    try {
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: '보유 통장/자산!A2:G100'
      });
      const rows = response.result.values || [];
      const accounts = [];
      rows.forEach((row, i) => {
        const type = row[1] || '';
        const owner = row[2] || '';
        const purpose = row[3] || '';
        const accountName = row[4] || '';
        const accountNumber = row[5] || '';
        const ownerName = row[6] || '';
        const looksLikeHeader = [type, accountName, accountNumber, ownerName].join(' ').includes('계좌명') || [type, accountName, accountNumber, ownerName].join(' ').includes('계좌번호');
        if (i === 0 && looksLikeHeader) return;
        if (!type && !owner && !accountName) return;
        accounts.push({
          rowIndex: 2 + i,
          type,
          owner,
          purpose,
          accountName,
          accountNumber,
          ownerName
        });
      });
      return accounts;
    } catch (e) {
      console.warn('[Sheets] 가챙이 보유 계좌 로드 실패:', e);
      return [];
    }
  }

  function getGachangiSheetId() {
    const id = (TOOCHANGI_CONFIG.GACHANGI_SHEET_ID || '').trim();
    if (!id || id.startsWith('YOUR_')) return DEFAULT_GACHANGI_SHEET_ID;
    return id;
  }

  async function ensureSavingsSheet(spreadsheetId) {
    const metaRes = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(title)'
    });
    const titles = (metaRes.result.sheets || []).map(s => s.properties.title);
    if (!titles.includes(SAVINGS_SHEET)) {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{ addSheet: { properties: { title: SAVINGS_SHEET } } }]
        }
      });
    }

    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: SAVINGS_HEADER_RANGE,
      valueInputOption: 'RAW',
      resource: { values: SAVINGS_HEADERS }
    });
  }

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
          '예적금': [['자산명','금융기관','명의','계좌번호','예적금종류','금리(%)','잔액(원)','만기일','자산용도','메모','등록일','월납입액(원)','납입기준일','납입시작일']],
          '부동산': [['부동산명','매입가(원)','현재평가액(원)','담보대출액(원)','대출금리(%)','전세보증금(원)','연간 상환액(원리금)','자산용도','메모','대출실행일','상환년수','등록일']]
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
    const portfolioHeaders = [['종목명','티커','시장','보유수량','평균단가(원)','현재가(원)','평가금액','수익률(%)','비중(%)','명의','메모','최종수정일']];
    const tradeHeaders     = [['날짜','종목명','구분','수량','단가(원)','금액(원)','3단계필터','메모']];
    const analysisHeaders  = [['날짜','질문','AI분석결과','관련종목','투자의견','기간']];
    const filterHeaders    = [['날짜','시장신호','섹터신호','종목신호','최종판단','메모']];
    const savingsHeaders   = [['자산명','금융기관','명의','계좌번호','예적금종류','금리(%)','잔액(원)','만기일','자산용도','메모','등록일','월납입액(원)','납입기준일','납입시작일']];
    const realEstateHeaders = [['부동산명','매입가(원)','현재평가액(원)','담보대출액(원)','대출금리(%)','전세보증금(원)','연간 상환액(원리금)','자산용도','메모','대출실행일','상환년수','등록일']];

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
      spreadsheetId: id, range: '포트폴리오!A2:L',
    });
    return (res.result.values || []).map((r, idx) => {
      const hasOwnerColumns = r.length >= 12;
      return {
      rowIndex: idx + 2, // 헤더가 1행이므로 데이터는 2행부터 시작
      name:    r[0]  || '',
      ticker:  r[1]  || '',
      market:  r[2]  || '',
      qty:     _num(r[3]),
      avgPrice:_num(r[4]),
      curPrice:_num(r[5]),
      value:   _num(r[6]),
      yield:   _num(r[7]),
      weight:  _num(r[8]),
      owner:   hasOwnerColumns ? (r[9] || '') : '',
      memo:    hasOwnerColumns ? (r[10] || '') : (r[9] || ''),
      date:    hasOwnerColumns ? (r[11] || '') : (r[10] || ''),
    };
    });
  }

  async function getSavings() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return [];
    try {
      await ensureSavingsSheet(id);
      const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: id, range: '예적금!A2:N',
      });
      return (res.result.values || []).map((r, idx) => {
        const schema = r.length >= 11 ? 'owner_account' : (r.length >= 10 ? 'owner_only' : 'legacy');
        return {
          rowIndex: idx + 2,
          name:     r[0] || '',
          bank:     r[1] || '',
          owner:    schema === 'legacy' ? '' : (r[2] || ''),
          accountNumber: schema === 'owner_account' ? (r[3] || '') : '',
          type:     schema === 'owner_account' ? (r[4] || '') : (schema === 'owner_only' ? (r[3] || '') : (r[2] || '')),
          rate:     _num(schema === 'owner_account' ? r[5] : (schema === 'owner_only' ? r[4] : r[3])),
          balance:  _num(schema === 'owner_account' ? r[6] : (schema === 'owner_only' ? r[5] : r[4])),
          maturity: schema === 'owner_account' ? (r[7] || '') : (schema === 'owner_only' ? (r[6] || '') : (r[5] || '')),
          purpose:  schema === 'owner_account' ? (r[8] || '') : (schema === 'owner_only' ? (r[7] || '') : (r[6] || '')),
          memo:     schema === 'owner_account' ? (r[9] || '') : (schema === 'owner_only' ? (r[8] || '') : (r[7] || '')),
          date:     schema === 'owner_account' ? (r[10] || '') : (schema === 'owner_only' ? (r[9] || '') : (r[8] || '')),
          // 자동 납입(누적) 메타 — owner_account 스키마(L·M·N열)에서만 존재
          monthlyDeposit:   schema === 'owner_account' ? _num(r[11]) : 0,
          depositDay:       schema === 'owner_account' ? _int(r[12]) : 0,
          depositStartDate: schema === 'owner_account' ? (r[13] || '') : '',
        };
      });
    } catch (e) {
      console.warn('[SheetsAPI] 예적금 로드 실패:', e);
      return [];
    }
  }

  async function getRealEstate() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return [];
    try {
      await ensureRealEstateSheet(id);
      const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: id, range: '부동산!A2:L',
      });
      return (res.result.values || []).map((r, idx) => {
        const hasLoanMeta = r.length >= 12 || (r[10] && `${r[10]}`.trim() !== '');
        return {
        rowIndex: idx + 2,
        name:     r[0] || '',
        purchasePrice: _num(r[1]),
        currentValue:  _num(r[2]),
        loanAmount:    _num(r[3]),
        loanRate:      _num(r[4]),
        deposit:       _num(r[5]),
        maintenance:   _num(r[6]),
        purpose:       r[7] || '',
        memo:          r[8] || '',
        loanStartDate: hasLoanMeta ? (r[9] || '') : '',
        loanTermYears: hasLoanMeta ? _int(r[10]) : 0,
        date:          hasLoanMeta ? (r[11] || '') : (r[9] || ''),
        };
      });
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
      await ensureSavingsSheet(id);
      const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: '예적금!A1:N',
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
        range: '예적금_백업!A1:N'
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
    await ensureSavingsSheet(id);
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: '예적금_백업!A1:N',
      valueRenderOption: 'FORMULA'
    });
    const values = res.result.values;
    if (!values || values.length === 0) {
      throw new Error('복원할 백업 데이터가 존재하지 않습니다.');
    }
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: id,
      range: '예적금!A1:N'
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
    await ensureSavingsSheet(id);
    await backupSavings();
    const values = [[
      row.name, row.bank, row.owner || '', row.accountNumber || '', row.type,
      parseFloat(row.rate) || 0, parseFloat(row.balance) || 0, row.maturity || '',
      row.purpose || '', row.memo || '', now,
      parseFloat(row.monthlyDeposit) || 0, parseInt(row.depositDay, 10) || 0, row.depositStartDate || ''
    ]];
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: '예적금!A:N',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  async function updateSavings(rowIndex, row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    await ensureSavingsSheet(id);
    await backupSavings();
    const values = [[
      row.name, row.bank, row.owner || '', row.accountNumber || '', row.type,
      parseFloat(row.rate) || 0, parseFloat(row.balance) || 0, row.maturity || '',
      row.purpose || '', row.memo || '', now,
      parseFloat(row.monthlyDeposit) || 0, parseInt(row.depositDay, 10) || 0, row.depositStartDate || ''
    ]];
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `예적금!A${rowIndex}:N${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  async function deleteSavings(rowIndex) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    await ensureSavingsSheet(id);
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
    await ensureSavingsSheet(id);
    await backupSavings();
    const data = updates.map(({ rowIndex, row }) => {
      return {
        range: `예적금!A${rowIndex}:N${rowIndex}`,
        values: [[
          row.name, row.bank, row.owner || '', row.accountNumber || '', row.type,
          parseFloat(row.rate) || 0, parseFloat(row.balance) || 0, row.maturity || '',
          row.purpose || '', row.memo || '', now,
          parseFloat(row.monthlyDeposit) || 0, parseInt(row.depositDay, 10) || 0, row.depositStartDate || ''
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
    await ensureSavingsSheet(id);
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
    await ensureRealEstateSheet(id);
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
      row.loanStartDate || '',
      parseInt(row.loanTermYears, 10) || 0,
      now
    ]];
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: '부동산!A:L',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  async function updateRealEstate(rowIndex, row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    await ensureRealEstateSheet(id);
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
      row.loanStartDate || '',
      parseInt(row.loanTermYears, 10) || 0,
      now
    ]];
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `부동산!A${rowIndex}:L${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  async function deleteRealEstate(rowIndex) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    await ensureRealEstateSheet(id);
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
    await ensureRealEstateSheet(id);
    const data = updates.map(({ rowIndex, row }) => {
      return {
        range: `부동산!A${rowIndex}:L${rowIndex}`,
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
          row.loanStartDate || '',
          parseInt(row.loanTermYears, 10) || 0,
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
    await ensureRealEstateSheet(id);
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

  // KRX 숫자 티커는 앞자리 0 보존을 위해 텍스트(아포스트로피 접두)로 시트에 저장. 미국 등 문자 티커는 그대로.
  function tickerCell(ticker) {
    const t = String(ticker || '').trim();
    return /^\d+$/.test(t) ? `'${t.padStart(6, '0')}` : t;
  }

  async function appendPortfolio(row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');
    
    await backupPortfolio();
    
    // 현재 포트폴리오를 읽어 다음에 삽입될 행(ROW) 번호 계산 (헤더가 1행이므로 데이터는 length + 2부터 시작)
    const portfolio = await getPortfolio();
    const nextRow = portfolio.length + 2;

    const fFormula = `=IF(ISBLANK(B${nextRow}), 0, IF(OR(C${nextRow}="나스닥", C${nextRow}="NYSE"), INT(GOOGLEFINANCE(B${nextRow}) * GOOGLEFINANCE("USDKRW")), INT(GOOGLEFINANCE("KRX:" & IF(ISNUMBER(B${nextRow}), TEXT(B${nextRow},"000000"), TO_TEXT(B${nextRow}))))))`;
    const gFormula = `=D${nextRow}*F${nextRow}`;
    const hFormula = `=IF(E${nextRow}>0, (F${nextRow}-E${nextRow})/E${nextRow}, 0)`;
    const iFormula = `=IF(SUM(G$2:G$100)>0, G${nextRow}/SUM(G$2:G$100), 0)`;

    const values = [[
      row.name, tickerCell(row.ticker), row.market,
      row.qty, row.avgPrice, fFormula,
      gFormula, hFormula, iFormula, row.owner || '', row.memo || '구글파이낸스 연동', now,
    ]];

    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: '포트폴리오!A:L',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  }

  async function updatePortfolio(rowIndex, row) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    const now = new Date().toLocaleDateString('ko-KR');

    await backupPortfolio();

    const fFormula = `=IF(ISBLANK(B${rowIndex}), 0, IF(OR(C${rowIndex}="나스닥", C${rowIndex}="NYSE"), INT(GOOGLEFINANCE(B${rowIndex}) * GOOGLEFINANCE("USDKRW")), INT(GOOGLEFINANCE("KRX:" & IF(ISNUMBER(B${rowIndex}), TEXT(B${rowIndex},"000000"), TO_TEXT(B${rowIndex}))))))`;
    const gFormula = `=D${rowIndex}*F${rowIndex}`;
    const hFormula = `=IF(E${rowIndex}>0, (F${rowIndex}-E${rowIndex})/E${rowIndex}, 0)`;
    const iFormula = `=IF(SUM(G$2:G$100)>0, G${rowIndex}/SUM(G$2:G$100), 0)`;

    const values = [[
      row.name, tickerCell(row.ticker), row.market,
      row.qty, row.avgPrice, fFormula,
      gFormula, hFormula, iFormula, row.owner || '', row.memo || '수동 업데이트', now,
    ]];

    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `포트폴리오!A${rowIndex}:L${rowIndex}`,
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
      const fFormula = `=IF(ISBLANK(B${rowIndex}), 0, IF(OR(C${rowIndex}="나스닥", C${rowIndex}="NYSE"), INT(GOOGLEFINANCE(B${rowIndex}) * GOOGLEFINANCE("USDKRW")), INT(GOOGLEFINANCE("KRX:" & IF(ISNUMBER(B${rowIndex}), TEXT(B${rowIndex},"000000"), TO_TEXT(B${rowIndex}))))))`;
      const gFormula = `=D${rowIndex}*F${rowIndex}`;
      const hFormula = `=IF(E${rowIndex}>0, (F${rowIndex}-E${rowIndex})/E${rowIndex}, 0)`;
      const iFormula = `=IF(SUM(G$2:G$100)>0, G${rowIndex}/SUM(G$2:G$100), 0)`;

      return {
        range: `포트폴리오!A${rowIndex}:L${rowIndex}`,
        values: [[
          row.name, tickerCell(row.ticker), row.market,
          row.qty, row.avgPrice, fFormula,
          gFormula, hFormula, iFormula, row.owner || '', row.memo || '수동 업데이트', now,
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
      spreadsheetId: id, range: '포트폴리오!A2:L',
    });
    const rows = res.result.values || [];
    if (rows.length === 0) return;

    // 배치 업데이트를 위한 범위 및 수식 배열 생성
    const data = [];
    rows.forEach((r, index) => {
      const rowIndex = index + 2; // 2행부터 시작
      const range = `포트폴리오!F${rowIndex}:I${rowIndex}`;
      const fFormula = `=IF(ISBLANK(B${rowIndex}), 0, IF(OR(C${rowIndex}="나스닥", C${rowIndex}="NYSE"), INT(GOOGLEFINANCE(B${rowIndex}) * GOOGLEFINANCE("USDKRW")), INT(GOOGLEFINANCE("KRX:" & IF(ISNUMBER(B${rowIndex}), TEXT(B${rowIndex},"000000"), TO_TEXT(B${rowIndex}))))))`;
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
      qty:     _num(r[3]),
      price:   _num(r[4]),
      amount:  _num(r[5]),
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

  // ── AI 추천 기록 (자동 투자 추천 결과를 클라우드에 영구 저장) ──────────
  const REC_SHEET = 'AI추천기록';
  async function ensureRecommendationSheet(id) {
    const metaRes = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties(title)' });
    const titles = (metaRes.result.sheets || []).map(s => s.properties.title);
    if (!titles.includes(REC_SHEET)) {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: id, resource: { requests: [{ addSheet: { properties: { title: REC_SHEET } } }] },
      });
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: id, range: `${REC_SHEET}!A1:C1`, valueInputOption: 'RAW',
        resource: { values: [['생성시각', '추천JSON', '요약']] },
      });
    }
  }
  async function appendRecommendation(generatedAt, items, text) {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return;
    await ensureRecommendationSheet(id);
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id, range: `${REC_SHEET}!A:C`, valueInputOption: 'RAW',
      resource: { values: [[generatedAt || '', JSON.stringify(items || []), (text || '').slice(0, 45000)]] },
    });
    await _trimRecommendationSheet(id, 30); // 최근 30건만 유지
  }
  // 추천기록을 최근 `keep`건만 남기고 가장 오래된 행부터 삭제
  async function _trimRecommendationSheet(id, keep) {
    try {
      const res = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${REC_SHEET}!A2:A` });
      const count = (res.result.values || []).length;
      if (count <= keep) return;
      const meta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties(title,sheetId)' });
      const sheet = (meta.result.sheets || []).find(s => s.properties.title === REC_SHEET);
      if (!sheet) return;
      const removeCount = count - keep;
      // 데이터는 2행(0-based index 1)부터 → 가장 오래된 removeCount행 삭제
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        resource: { requests: [{ deleteDimension: { range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 1 + removeCount } } }] },
      });
    } catch (e) {
      console.warn('[Sheets] AI추천기록 정리 실패:', e);
    }
  }
  async function getLatestRecommendation() {
    const id = TOOCHANGI_CONFIG.TOOCHANGI_SHEET_ID;
    if (!id || id.startsWith('YOUR_')) return null;
    try {
      await ensureRecommendationSheet(id);
      const res = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${REC_SHEET}!A2:C` });
      const rows = res.result.values || [];
      if (rows.length === 0) return null;
      const last = rows[rows.length - 1];
      let items = [];
      try { items = JSON.parse(last[1] || '[]'); } catch (_) {}
      return { generatedAt: last[0] || '', items: Array.isArray(items) ? items : [], text: last[2] || '' };
    } catch (e) {
      console.warn('[Sheets] AI추천기록 로드 실패:', e);
      return null;
    }
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
    const id = getGachangiSheetId();
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
    const id = getGachangiSheetId();
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
    const id = getGachangiSheetId();
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
    const id = getGachangiSheetId();
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
    const id = getGachangiSheetId();
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
    const id = getGachangiSheetId();
    
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
        range: '포트폴리오!A1:L',
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
        range: '포트폴리오_백업!A1:L'
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
      range: '포트폴리오_백업!A1:L',
      valueRenderOption: 'FORMULA'
    });
    const values = res.result.values;
    if (!values || values.length === 0) {
      throw new Error('복원할 백업 데이터가 존재하지 않습니다.');
    }

    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: id,
      range: '포트폴리오!A1:L'
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
    getGachangiAccounts,
    setupGachangiAssetSheet,
    getAssetStatus,
    appendAsset,
    updateAsset,
    deleteAsset,
    syncPortfolioToAssets,
    appendRecommendation,
    getLatestRecommendation,
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
