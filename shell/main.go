package main

import (
	"log"
	"os"
	"sync"
)

var (
	appPaths   paths
	stateMu    sync.Mutex
	backendRef *backend
	pendingAct string // protocol action to run once the backend is ready (cold start)
)

func main() {
	log.SetPrefix("[shell] ")
	log.SetFlags(log.Ltime)

	p, err := resolvePaths()
	if err != nil {
		log.Fatalf("failed to resolve paths: %v", err)
	}
	appPaths = p

	// Headless self-test: start the backend, confirm health, stop, exit.
	// Used to validate the launch path without the tray/UI.
	if os.Getenv("SHELL_SELFTEST") == "1" {
		runSelfTest(p)
		return
	}

	action := parseProtocolAction(os.Args[1:])

	// Single instance: a second launch forwards its action to the running app.
	if !acquireSingleInstance() {
		if action == "" {
			action = "open"
		}
		sendControlAction(action)
		return
	}

	if exe := currentExePath(); exe != "" {
		if err := registerProtocol(exe); err != nil {
			log.Printf("warning: could not register %s:// protocol: %v", protocolScheme, err)
		}
	}

	startControlListener(handleControlAction)

	// If launched cold via the deep link, run it once the backend is ready.
	pendingAct = action

	runTray()
}

func handleControlAction(action string) {
	switch action {
	case "youtube-login":
		go openYoutubeLogin(appPaths, onYoutubeSaved)
	case "open":
		openDashboard()
	}
}

func openDashboard() {
	stateMu.Lock()
	b := backendRef
	stateMu.Unlock()
	if b != nil {
		openBrowser(b.url)
	}
}

func onYoutubeSaved(count int) {
	log.Printf("YouTube session saved (%d cookies)", count)
	refreshTrayMenu()
}

func runSelfTest(p paths) {
	log.Printf("selftest: appRoot=%s node=%s entry=%s", p.appRoot, p.nodeExe, p.backendEntry)
	b, err := startBackend(p)
	if err != nil {
		log.Printf("SELFTEST FAIL: %v", err)
		os.Exit(1)
	}
	log.Printf("SELFTEST OK: backend healthy at %s", b.url)
	b.stop()
	os.Exit(0)
}
