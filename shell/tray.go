package main

import (
	_ "embed"
	"errors"
	"fmt"
	"log"

	"fyne.io/systray"
)

//go:embed assets/play.ico
var iconICO []byte

var (
	mOpen          *systray.MenuItem
	mLogin         *systray.MenuItem
	mCheckUpdate   *systray.MenuItem
	mInstallUpdate *systray.MenuItem
	mLogs          *systray.MenuItem
	mExit          *systray.MenuItem
)

// pendingUpdate and updateInProgress are guarded by stateMu (declared in
// main.go alongside backendRef) so tray clicks, the background scheduler, and
// the manual "Check for Updates" click never race each other.
var (
	pendingUpdate    *updateInfo
	updateInProgress bool
)

func runTray() {
	systray.Run(onTrayReady, onTrayExit)
}

func onTrayReady() {
	if len(iconICO) > 0 {
		systray.SetIcon(iconICO)
	}
	systray.SetTitle(appName)
	systray.SetTooltip(appName + " starting...")

	// Windows: without SetOnTapped, left-click opens the context menu (library default).
	systray.SetOnTapped(func() {
		openDashboard()
	})

	mOpen = systray.AddMenuItem("Open in Browser", "Open the dashboard in your browser")
	mOpen.Disable()
	mLogin = systray.AddMenuItem(loginLabel(), "Sign in to YouTube for audio/video downloads")

	systray.AddSeparator()
	mCheckUpdate = systray.AddMenuItem("Check for Updates", "Check GitHub for a new version")
	mInstallUpdate = systray.AddMenuItem("No update available", "Download and install the latest version")
	mInstallUpdate.Disable()
	if !appPaths.isPackaged {
		mCheckUpdate.Disable()
		mCheckUpdate.SetTitle("Check for Updates (unavailable in dev)")
	}

	mLogs = systray.AddMenuItem("Open logs folder", "Open diagnostic logs (useful if startup fails)")
	systray.AddSeparator()
	mExit = systray.AddMenuItem("Exit", "Quit Stream Media Board")

	go handleTrayClicks()
	go startupBackend()
}

func handleTrayClicks() {
	for {
		select {
		case <-mOpen.ClickedCh:
			openDashboard()
		case <-mLogin.ClickedCh:
			go openYoutubeLogin(appPaths, onYoutubeSaved)
		case <-mCheckUpdate.ClickedCh:
			go handleCheckForUpdatesClick()
		case <-mInstallUpdate.ClickedCh:
			go handleInstallUpdateClick()
		case <-mLogs.ClickedCh:
			_ = ensureLogsDir(appPaths)
			openFolder(appPaths.logsDir)
		case <-mExit.ClickedCh:
			quitApp()
			return
		}
	}
}

func startupBackend() {
	b, err := startBackend(appPaths)
	if err != nil {
		log.Printf("backend failed to start: %v", err)
		systray.SetTooltip(appName + " - startup failed")
		messageBox(appName, "Backend failed to start:\n\n"+err.Error()+"\n\nTray → Open logs folder for details.", mbOK|mbIconError)
		return
	}
	stateMu.Lock()
	backendRef = b
	stateMu.Unlock()

	systray.SetTooltip(fmt.Sprintf("%s v%s — left-click to open dashboard", appName, appVersion))
	mOpen.Enable()

	if pendingAct == "youtube-login" {
		go openYoutubeLogin(appPaths, onYoutubeSaved)
	}

	if appPaths.isPackaged {
		go scheduleUpdateChecks(appPaths)
	}
}

func onTrayExit() {
	stateMu.Lock()
	b := backendRef
	stateMu.Unlock()
	if b != nil {
		b.stop()
	}
}

func quitApp() {
	stateMu.Lock()
	b := backendRef
	stateMu.Unlock()
	if b != nil {
		b.stop()
	}
	systray.Quit()
}

func loginLabel() string {
	if fileExists(appPaths.cookiesFile) {
		return "Refresh YouTube sign-in"
	}
	return "Sign in to YouTube"
}

func refreshTrayMenu() {
	if mLogin != nil {
		mLogin.SetTitle(loginLabel())
	}
}

// handleCheckForUpdatesClick runs a manual (throttle-bypassing) update check
// and reports the outcome to the user. Always runs in its own goroutine so it
// never blocks the tray's click-handling loop.
func handleCheckForUpdatesClick() {
	mCheckUpdate.Disable()
	mCheckUpdate.SetTitle("Checking for updates…")
	defer func() {
		mCheckUpdate.SetTitle("Check for Updates")
		mCheckUpdate.Enable()
	}()

	info, err := CheckForUpdate(appPaths, true)
	if err != nil {
		messageBox(
			appName,
			"Could not check for updates:\n\n"+err.Error()+"\n\nTray → Open logs folder for details.",
			mbOK|mbIconError,
		)
		return
	}
	if info == nil {
		messageBox(appName, fmt.Sprintf("You're already on the latest version (v%s).", appVersion), mbOK|mbIconInfo)
		return
	}

	onUpdateAvailable(info)
	messageBox(
		appName,
		fmt.Sprintf("Update v%s is available.\n\nUse \"Update to v%s\" in the tray menu to download and install it.", info.Version, info.Version),
		mbOK|mbIconInfo,
	)
}

// onUpdateAvailable records the newest known update and reflects it in the
// tray menu. Called from both the background scheduler and manual checks.
func onUpdateAvailable(info *updateInfo) {
	stateMu.Lock()
	pendingUpdate = info
	stateMu.Unlock()

	mInstallUpdate.SetTitle("Update to v" + info.Version)
	mInstallUpdate.Enable()
}

// handleInstallUpdateClick downloads (if needed) and applies the pending
// update. Safe to click repeatedly: re-entrant clicks are ignored while a
// download/apply is already in flight, and a previously verified download is
// reused instead of being fetched again.
func handleInstallUpdateClick() {
	stateMu.Lock()
	if updateInProgress {
		stateMu.Unlock()
		return
	}
	updateInProgress = true
	info := pendingUpdate
	stateMu.Unlock()

	defer func() {
		stateMu.Lock()
		updateInProgress = false
		stateMu.Unlock()
	}()

	if info == nil {
		mInstallUpdate.Disable()
		mInstallUpdate.SetTitle("No update available")
		return
	}

	mInstallUpdate.Disable()
	mInstallUpdate.SetTitle("Downloading update…")

	localPath, err := DownloadUpdate(appPaths, info, func(pct int) {
		mInstallUpdate.SetTitle(fmt.Sprintf("Downloading update… %d%%", pct))
	})
	if err != nil {
		writeShellLog(appPaths, "update: download failed: "+err.Error())
		messageBox(
			appName,
			"Could not download the update:\n\n"+err.Error()+"\n\nYou can try again from the tray menu.",
			mbOK|mbIconError,
		)
		mInstallUpdate.SetTitle("Retry update to v" + info.Version)
		mInstallUpdate.Enable()
		return
	}

	if err := ApplyUpdate(appPaths, localPath, info.Version); err != nil {
		if errors.Is(err, errUpdateCancelled) {
			mInstallUpdate.SetTitle("Update to v" + info.Version + " (ready)")
			mInstallUpdate.Enable()
			return
		}
		// ApplyUpdate already showed an error dialog and restarted the backend
		// best-effort; keep the already-downloaded installer usable for retry.
		mInstallUpdate.SetTitle("Update to v" + info.Version + " (ready)")
		mInstallUpdate.Enable()
		return
	}
	// On success ApplyUpdate exits the process; this line is unreachable.
}
