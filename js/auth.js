/**
 * 투챙이 - Google Auth 모듈
 * 가챙이와 동일한 인증 패턴 (localStorage 토큰 캐싱)
 */
const Auth = (() => {
  let gapiInited = false;
  let gisInited = false;
  let tokenClient = null;
  let accessToken = null;
  let onLoginCallback = null;

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
          if (tokenResponse.error !== undefined) throw tokenResponse;
          accessToken = tokenResponse.access_token;
          const expiry = Date.now() + tokenResponse.expires_in * 1000;
          localStorage.setItem('toochangi_access_token', accessToken);
          localStorage.setItem('toochangi_token_expiry', expiry);
          gapi.client.setToken({ access_token: accessToken });
          console.log('✅ 구글 로그인 완료.');
          if (onLoginCallback) onLoginCallback({ name: '흰챙이' });
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
      gapi.client.setToken({ access_token: accessToken });
      console.log('✅ 캐시 토큰으로 자동 로그인.');
      if (onLoginCallback) onLoginCallback({ name: '흰챙이' });
    } else {
      localStorage.removeItem('toochangi_access_token');
      localStorage.removeItem('toochangi_token_expiry');
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
    if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null;
    localStorage.removeItem('toochangi_access_token');
    localStorage.removeItem('toochangi_token_expiry');
    gapi.client.setToken(null);
    console.log('로그아웃 완료.');
  }

  function getToken() { return accessToken; }
  function isLoggedIn() { return !!accessToken; }
  function onLogin(cb) { onLoginCallback = cb; }

  return { initGapi, initGis, login, logout, getToken, isLoggedIn, onLogin };
})();
