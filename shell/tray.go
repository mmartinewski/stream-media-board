package main

import (
	_ "embed"
	"log"

	"fyne.io/systray"
)

//go:embed assets/play.ico
var iconICO []byte

var (
	mOpen  *systray.MenuItem
	mLogin *systray.MenuItem
	mExit  *systray.MenuItem
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

	mOpen = systray.AddMenuItem("Open in Browser", "Open the dashboard in your browser")
	mOpen.Disable()
	mLogin = systray.AddMenuItem(loginLabel(), "Sign in to YouTube for audio/video downloads")
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
		messageBox(appName, "Backend failed to start:\n\n"+err.Error(), mbOK|mbIconError)
		return
	}
	stateMu.Lock()
	backendRef = b
	stateMu.Unlock()

	systray.SetTooltip(appName)
	mOpen.Enable()

	if pendingAct == "youtube-login" {
		go openYoutubeLogin(appPaths, onYoutubeSaved)
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
