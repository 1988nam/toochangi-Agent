/**
 * 투챙이 - Google Auth 모듈
 * 가챙이와 동일한 인증 패턴 (localStorage 토큰 캐싱)
 */
const Auth = (() => {
  let gapiInited = false;
  let gisInited = false;
  let tokenClient = null;
  let accessToken = null;
  let grantedScopes = '';   // 현재 토큰이 실제로 부여받은 scope(공백 구분 문자열)
  let onLoginCallback = null;
  let _refreshTimer = null;  // 만료 전 자동 갱신 타이머
  let _silentRefresh = false; // 무음 갱신 중 표시(재렌더 트리거 방지)

  // 액세스 토큰을 만료 5분 전 무음으로 재발급 예약 → 1시간 만료로 인한 401 방지
  function _scheduleTokenRefresh(expiryMs) {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    const delay = Math.max(expiryMs - Date.now() - 5 * 60 * 1000, 20 * 1000);
    _refreshTimer = setTimeout(() => {
      if (!tokenClient) return;
      _silentRefresh = true;
      try { tokenClient.requestAccessToken({ prompt: '' }); }
      catch (e) { _silentRefresh = false; console.warn('[Auth] 토큰 자동 갱신 실패:', e); }
    }, delay);
  }

  /** GAPI 초기화 */
  function initGapi() {
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          apiKey: window.TOOCHANGI_CONFIG.API_KEY,
          discoveryDocs: [
            'https://sheets.googleapis.com/$discovery/rest?version=v4',
            'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
          ],
        });
        gapiInited = true;
        console.log('[Auth] GAPI 초기화 완료.');
        _tryLocalLogin();
      } catch (error) {
        console.error('[Auth] GAPI 초기화 실패:', error);
      }
    });
  }

  /** GIS 초기화 */
  function initGis() {
    try {
      const cfg = window.TOOCHANGI_CONFIG || TOOCHANGI_CONFIG || {};
      if (!cfg.CLIENT_ID || cfg.CLIENT_ID.indexOf('YOUR_') === 0) {
        console.warn('[Auth] CLIENT_ID가 설정되지 않았습니다.');
        return;
      }
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        console.error('[Auth] Google Identity Services (GSI) 라이브러리가 존재하지 않습니다.');
        return;
      }
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: cfg.CLIENT_ID,
        scope: cfg.SCOPES,
        callback: (tokenResponse) => {
          if (tokenResponse.error !== undefined) {
            _silentRefresh = false;
            console.warn('[Auth] 토큰 요청 오류:', tokenResponse.error);
            return;
          }
          accessToken = tokenResponse.access_token;
          grantedScopes = tokenResponse.scope || grantedScopes;
          const expiry = Date.now() + (tokenResponse.expires_in || 3600) * 1000;
          localStorage.setItem('toochangi_access_token', accessToken);
          localStorage.setItem('toochangi_token_expiry', expiry);
          localStorage.setItem('toochangi_token_scope', grantedScopes);
          gapi.client.setToken({ access_token: accessToken });
          _scheduleTokenRefresh(expiry);
          if (_silentRefresh) {
            _silentRefresh = false;
            console.log('🔄 액세스 토큰 자동 갱신 완료.');
          } else {
            console.log('✅ 구글 로그인 완료.');
            if (onLoginCallback) onLoginCallback({ name: '흰챙이' });
          }
        },
      });
      gisInited = true;
      console.log('[Auth] GIS 초기화 완료.');
      _tryLocalLogin();
    } catch (e) {
      console.error('[Auth] GIS 초기화 중 예외 발생:', e);
    }
  }

  function _tryLocalLogin() {
    if (!gapiInited || !gisInited) return;
    const storedToken = localStorage.getItem('toochangi_access_token');
    const expiry = localStorage.getItem('toochangi_token_expiry');
    if (storedToken && expiry && parseInt(expiry, 10) > Date.now()) {
      accessToken = storedToken;
      grantedScopes = localStorage.getItem('toochangi_token_scope') || '';
      gapi.client.setToken({ access_token: accessToken });
      _scheduleTokenRefresh(parseInt(expiry, 10));
      console.log('✅ 캐시 토큰으로 자동 로그인.');
      if (onLoginCallback) onLoginCallback({ name: '흰챙이' });
    } else {
      localStorage.removeItem('toochangi_access_token');
      localStorage.removeItem('toochangi_token_expiry');
      localStorage.removeItem('toochangi_token_scope');
    }
  }

  function login() {
    if (tokenClient) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
      return;
    }
    let retries = 0;
    const interval = setInterval(() => {
      retries++;
      if (tokenClient) {
        clearInterval(interval);
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } else if (retries >= 5) {
        clearInterval(interval);
        alert('⚠️ Google 인증 모듈 로드 실패\n\n인터넷 연결을 확인하거나 페이지를 새로고침(F5) 해주세요.');
      }
    }, 600);
  }

  function logout() {
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
    if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null;
    grantedScopes = '';
    localStorage.removeItem('toochangi_access_token');
    localStorage.removeItem('toochangi_token_expiry');
    localStorage.removeItem('toochangi_token_scope');
    gapi.client.setToken(null);
    console.log('로그아웃 완료.');
  }

  function getToken() { return accessToken; }
  function getTokenScopes() { return grantedScopes; }      // 현재 토큰이 부여받은 scope 문자열
  // 부분 식별자 매칭(의도적): 호출부가 'generative-language'·'cloud-platform' 같은 축약 키로 조회함
  // (전체 scope URL 'https://.../auth/generative-language.retriever' 안에 포함되는지 확인)
  function hasScope(s) { return !!grantedScopes && grantedScopes.indexOf(s) !== -1; }
  function isLoggedIn() { return !!accessToken; }
  // 콜백 등록 시 로컬 캐시 로그인을 즉시 재확인한다.
  // (스크립트 onload가 DOMContentLoaded보다 먼저 뛰어 initGis/initGapi의 _tryLocalLogin이
  //  onLoginCallback=null 상태로 지나가면, 콜백을 여기서 다시 태워야 리다이렉트가 걸린다.
  //  이게 없으면 캐시 토큰이 있어도 로그인 화면에 갇혀 수동 새로고침을 해야 했다.)
  function onLogin(cb) { onLoginCallback = cb; _tryLocalLogin(); }

  return { initGapi, initGis, login, logout, getToken, getTokenScopes, hasScope, isLoggedIn, onLogin };
})();
