package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
)

const (
	appName        = "Stream Media Board"
	appFolderName  = "LocalSoundboardServer"
	defaultPort    = 3847
	controlPort    = 38473 // loopback channel for single-instance forwarding
	mutexName      = "Global\\StreamMediaBoardSingleInstance"
	protocolScheme = "soundboard"
	loginURL       = "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F"
)

// paths holds the resolved runtime locations for the packaged (or dev) layout.
type paths struct {
	installDir   string // directory containing the shell executable
	appRoot      string // PERSONAL_CLIP_PLAYER_ROOT (backend resolves bin/frontend/config here)
	nodeExe      string // node.exe used to run the backend
	backendEntry string // backend/dist/index.js
	appDataDir   string // %APPDATA%\LocalSoundboardServer
	cookiesFile  string // youtube.cookies.txt
	webviewData  string // isolated WebView2 user-data-folder for the login window
	iconPath     string
}

func resolvePaths() (paths, error) {
	exe, err := os.Executable()
	if err != nil {
		return paths{}, err
	}
	installDir := filepath.Dir(exe)

	// Packaged layout: <InstallDir>/app + <InstallDir>/node/node.exe.
	// Dev/test layout: override via env (PERSONAL_CLIP_PLAYER_ROOT / NODE_BINARY).
	appRoot := os.Getenv("PERSONAL_CLIP_PLAYER_ROOT")
	if appRoot == "" {
		candidate := filepath.Join(installDir, "app")
		if dirExists(candidate) {
			appRoot = candidate
		} else {
			appRoot = installDir
		}
	}

	nodeExe := os.Getenv("NODE_BINARY")
	if nodeExe == "" {
		candidate := filepath.Join(installDir, "runtime", "node.exe")
		if fileExists(candidate) {
			nodeExe = candidate
		} else {
			nodeExe = "node" // fall back to PATH (dev)
		}
	}

	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
	}
	appDataDir := filepath.Join(appData, appFolderName)

	p := paths{
		installDir:   installDir,
		appRoot:      appRoot,
		nodeExe:      nodeExe,
		backendEntry: filepath.Join(appRoot, "backend", "dist", "index.js"),
		appDataDir:   appDataDir,
		cookiesFile:  filepath.Join(appDataDir, "youtube.cookies.txt"),
		webviewData:  filepath.Join(appDataDir, "youtube-login-webview"),
		iconPath:     filepath.Join(appRoot, "shell-assets", "play.ico"),
	}
	return p, nil
}

// resolvePort mirrors desktop/main.cjs resolvePort: read app/config/config.json,
// falling back to the default port.
func (p paths) resolvePort() int {
	configFile := filepath.Join(p.appRoot, "config", "config.json")
	data, err := os.ReadFile(configFile)
	if err != nil {
		return defaultPort
	}
	var parsed struct {
		Port json.Number `json:"port"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return defaultPort
	}
	if parsed.Port == "" {
		return defaultPort
	}
	port, err := strconv.Atoi(parsed.Port.String())
	if err != nil || port < 1 || port > 65535 {
		return defaultPort
	}
	return port
}

func dirExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.IsDir()
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}
