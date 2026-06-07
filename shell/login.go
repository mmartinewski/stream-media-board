package main

import (
	"runtime"
	"sync"

	"github.com/wailsapp/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

const loginClassName = "StreamMediaBoardYoutubeLogin"

// Injected after each navigation completes (mirrors the did-finish-load bar in
// desktop/youtube-auth.cjs). Uses window.external.invoke, which go-webview2 wires
// to window.chrome.webview.postMessage.
const loginBarScript = `
(() => {
  if (document.getElementById('psp-youtube-login-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'psp-youtube-login-bar';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0f172a;color:#e2e8f0;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font:14px Segoe UI,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.35)';
  bar.innerHTML = '<span>Sign in with your Google account, then click <strong>Save session</strong>.</span>';
  const btn = document.createElement('button');
  btn.textContent = 'Save session';
  btn.style.cssText = 'background:#38bdf8;color:#0f172a;border:0;border-radius:6px;padding:8px 14px;font-weight:600;cursor:pointer';
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Saving...';
    window.external.invoke('save');
  });
  bar.appendChild(btn);
  if (document.body) document.body.prepend(bar);
})();
`

type loginSession struct {
	chromium    *edge.Chromium
	hwnd        windows.Handle
	cookiesFile string
	onSaved     func(int)
}

var (
	activeLogin   *loginSession
	loginMu       sync.Mutex
	classOnce     sync.Once
	wndProcPtr    uintptr
	loginBusy     bool
)

// openYoutubeLogin opens the WebView2 login window and blocks until it closes.
// Must run on its own OS thread (STA). Returns when the window is dismissed.
func openYoutubeLogin(p paths, onSaved func(int)) {
	loginMu.Lock()
	if loginBusy {
		// Already open: bring focus is best-effort; just ignore re-entry.
		hwnd := windows.Handle(0)
		if activeLogin != nil {
			hwnd = activeLogin.hwnd
		}
		loginMu.Unlock()
		if hwnd != 0 {
			showWindow(hwnd)
		}
		return
	}
	loginBusy = true
	loginMu.Unlock()

	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	coInitSTA()

	icon := loadIconFromFile(p.iconPath)
	var regErr error
	classOnce.Do(func() {
		wndProcPtr = windows.NewCallback(loginWndProc)
		regErr = registerWindowClass(loginClassName, wndProcPtr, icon)
	})
	if regErr != nil {
		messageBox(appName, "Could not create the login window: "+regErr.Error(), mbOK|mbIconError)
		clearLoginBusy()
		return
	}

	hwnd, err := createWindow(loginClassName, "Sign in to YouTube", 980, 760)
	if err != nil {
		messageBox(appName, "Could not create the login window: "+err.Error(), mbOK|mbIconError)
		clearLoginBusy()
		return
	}

	chromium := edge.NewChromium()
	chromium.DataPath = p.webviewData
	chromium.MessageCallback = func(message string, _ *edge.ICoreWebView2, _ *edge.ICoreWebView2WebMessageReceivedEventArgs) {
		if message == "save" {
			postMessage(hwnd, wmExportCookies)
		}
	}
	chromium.NavigationCompletedCallback = func(_ *edge.ICoreWebView2, _ *edge.ICoreWebView2NavigationCompletedEventArgs) {
		chromium.Eval(loginBarScript)
	}

	loginMu.Lock()
	activeLogin = &loginSession{chromium: chromium, hwnd: hwnd, cookiesFile: p.cookiesFile, onSaved: onSaved}
	loginMu.Unlock()

	chromium.Embed(uintptr(hwnd)) // blocks until the WebView2 controller is ready
	chromium.Resize()
	chromium.Navigate(loginURL)
	showWindow(hwnd)

	runMessageLoop()

	loginMu.Lock()
	activeLogin = nil
	loginMu.Unlock()
	clearLoginBusy()
}

func clearLoginBusy() {
	loginMu.Lock()
	loginBusy = false
	loginMu.Unlock()
}

func loginWndProc(hwnd windows.Handle, message uint32, wParam, lParam uintptr) uintptr {
	switch message {
	case wmSize:
		loginMu.Lock()
		s := activeLogin
		loginMu.Unlock()
		if s != nil && s.chromium != nil {
			s.chromium.Resize()
		}
		return 0
	case wmExportCookies:
		handleExport(hwnd)
		return 0
	case wmDestroy:
		postQuit()
		return 0
	default:
		return defWindowProc(hwnd, message, wParam, lParam)
	}
}

func handleExport(hwnd windows.Handle) {
	loginMu.Lock()
	s := activeLogin
	loginMu.Unlock()
	if s == nil {
		return
	}
	count, err := exportYoutubeCookies(s.chromium, s.cookiesFile)
	if err != nil {
		messageBox("YouTube sign-in", err.Error(), mbOK|mbIconError)
		return
	}
	if s.onSaved != nil {
		s.onSaved(count)
	}
	messageBox("YouTube sign-in", "YouTube session saved. Exported "+itoa(count)+" cookie(s).", mbOK|mbIconInfo)
	destroyWindow(hwnd)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
