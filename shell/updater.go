package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"fyne.io/systray"
)

// errDevEnvironment is returned when the shell is not running from a real
// Inno Setup install (see paths.isPackaged). Auto-update never touches the
// network in that case.
var errDevEnvironment = errors.New("auto-update is unavailable outside a packaged install")

// errNoReleases is returned when the GitHub repo has no releases yet (404).
// Treated as "no update available", not an error worth surfacing.
var errNoReleases = errors.New("no releases found")

// errUpdateCancelled is returned when the user declines the confirm dialog
// in ApplyUpdate. Not a failure — the caller should just leave the tray item
// ready for a retry.
var errUpdateCancelled = errors.New("update cancelled by user")

// rateLimitError carries the GitHub API rate-limit reset time so callers can
// persist a backoff instead of hammering the API on every check.
type rateLimitError struct {
	resetAt time.Time
}

func (e *rateLimitError) Error() string {
	return fmt.Sprintf("github api rate limit exceeded (resets at %s)", e.resetAt.Format(time.RFC3339))
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

type githubRelease struct {
	TagName    string        `json:"tag_name"`
	Draft      bool          `json:"draft"`
	Prerelease bool          `json:"prerelease"`
	Assets     []githubAsset `json:"assets"`
	HTMLURL    string        `json:"html_url"`
}

// updateInfo describes an update that is newer than the running appVersion.
type updateInfo struct {
	Version       string
	InstallerURL  string
	InstallerName string
	InstallerSize int64
	ChecksumURL   string // "" if the release has no .sha256 asset published
}

// updateState is persisted to paths.updateStateFile so throttling and
// rate-limit backoff survive app restarts.
type updateState struct {
	LastCheckedAt    time.Time `json:"lastCheckedAt"`
	LastError        string    `json:"lastError,omitempty"`
	RateLimitedUntil time.Time `json:"rateLimitedUntil,omitempty"`
}

var semverPattern = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)$`)

// parseSemver parses a strict MAJOR.MINOR.PATCH version (optionally prefixed
// with "v"). ok is false for anything else (pre-release suffixes, malformed
// tags, etc.) so callers can safely skip instead of crashing.
func parseSemver(v string) (major, minor, patch int, ok bool) {
	m := semverPattern.FindStringSubmatch(strings.TrimSpace(v))
	if m == nil {
		return 0, 0, 0, false
	}
	major, _ = strconv.Atoi(m[1])
	minor, _ = strconv.Atoi(m[2])
	patch, _ = strconv.Atoi(m[3])
	return major, minor, patch, true
}

// compareSemver returns -1/0/1 as a < b, a == b, a > b. Unparsable input on
// either side is treated as "not newer" (returns 0) and logged, rather than
// risking a false-positive update prompt.
func compareSemver(a, b string) int {
	aMaj, aMin, aPatch, aOK := parseSemver(a)
	bMaj, bMin, bPatch, bOK := parseSemver(b)
	if !aOK || !bOK {
		writeShellLog(appPaths, fmt.Sprintf("update: could not compare versions (a=%q ok=%v, b=%q ok=%v)", a, aOK, b, bOK))
		return 0
	}
	if aMaj != bMaj {
		return sign(aMaj - bMaj)
	}
	if aMin != bMin {
		return sign(aMin - bMin)
	}
	return sign(aPatch - bPatch)
}

func sign(n int) int {
	switch {
	case n < 0:
		return -1
	case n > 0:
		return 1
	default:
		return 0
	}
}

func loadUpdateState(p paths) updateState {
	data, err := os.ReadFile(p.updateStateFile)
	if err != nil {
		return updateState{}
	}
	var s updateState
	if err := json.Unmarshal(data, &s); err != nil {
		writeShellLog(p, "update: corrupt state file, resetting: "+err.Error())
		return updateState{}
	}
	return s
}

func saveUpdateState(p paths, s updateState) {
	if err := os.MkdirAll(p.updatesDir, 0o755); err != nil {
		writeShellLog(p, "update: could not create updates dir: "+err.Error())
		return
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return
	}
	if err := os.WriteFile(p.updateStateFile, data, 0o644); err != nil {
		writeShellLog(p, "update: could not save state: "+err.Error())
	}
}

func fetchLatestRelease(ctx context.Context) (*githubRelease, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", updateRepoOwner, updateRepoName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "StreamMediaBoard-Updater/"+appVersion)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("github request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, errNoReleases
	}
	if resp.StatusCode == http.StatusForbidden && resp.Header.Get("X-RateLimit-Remaining") == "0" {
		resetAt := time.Now().Add(1 * time.Hour)
		if resetHeader := resp.Header.Get("X-RateLimit-Reset"); resetHeader != "" {
			if unixSec, err := strconv.ParseInt(resetHeader, 10, 64); err == nil {
				resetAt = time.Unix(unixSec, 0)
			}
		}
		return nil, &rateLimitError{resetAt: resetAt}
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("github api returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var rel githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, fmt.Errorf("could not parse github release response: %w", err)
	}
	return &rel, nil
}

var installerAssetPattern = regexp.MustCompile(`^` + regexp.QuoteMeta(updateAssetPrefix) + `\d+\.\d+\.\d+` + regexp.QuoteMeta(updateAssetSuffix) + `$`)

// pickInstallerAsset finds the Windows installer asset (and its optional
// .sha256 sibling) in a release. installer is nil if the release has no
// matching Windows asset yet (e.g. still uploading).
func pickInstallerAsset(rel *githubRelease) (installer *githubAsset, checksum *githubAsset) {
	for i := range rel.Assets {
		a := &rel.Assets[i]
		if installerAssetPattern.MatchString(a.Name) {
			installer = a
			break
		}
	}
	if installer == nil {
		return nil, nil
	}
	checksumName := installer.Name + ".sha256"
	for i := range rel.Assets {
		if rel.Assets[i].Name == checksumName {
			checksum = &rel.Assets[i]
			break
		}
	}
	return installer, checksum
}

// CheckForUpdate consults GitHub for the latest release and compares it
// against appVersion. manual=true bypasses throttling/rate-limit backoff
// (used by the "Check for Updates" tray click). Returns (nil, nil) when
// already up to date; never blocks longer than ~10s.
func CheckForUpdate(p paths, manual bool) (*updateInfo, error) {
	if !p.isPackaged {
		return nil, errDevEnvironment
	}

	state := loadUpdateState(p)

	if !manual {
		if !state.LastCheckedAt.IsZero() && time.Since(state.LastCheckedAt) < updateCheckThrottle {
			return nil, nil
		}
		if !state.RateLimitedUntil.IsZero() && time.Now().Before(state.RateLimitedUntil) {
			return nil, nil
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rel, err := fetchLatestRelease(ctx)
	if err != nil {
		var rl *rateLimitError
		if errors.As(err, &rl) {
			state.RateLimitedUntil = rl.resetAt
			state.LastError = err.Error()
			saveUpdateState(p, state)
			return nil, err
		}
		if errors.Is(err, errNoReleases) {
			state.LastCheckedAt = time.Now()
			state.LastError = ""
			saveUpdateState(p, state)
			return nil, nil
		}
		state.LastError = err.Error()
		saveUpdateState(p, state)
		return nil, err
	}

	state.LastCheckedAt = time.Now()
	state.LastError = ""

	if rel.Draft || rel.Prerelease {
		saveUpdateState(p, state)
		return nil, nil
	}

	latest := strings.TrimPrefix(rel.TagName, "v")
	if compareSemver(latest, appVersion) <= 0 {
		saveUpdateState(p, state)
		return nil, nil
	}

	installer, checksum := pickInstallerAsset(rel)
	if installer == nil {
		writeShellLog(p, "update: release "+rel.TagName+" has no matching Windows installer asset yet")
		saveUpdateState(p, state)
		return nil, nil
	}

	saveUpdateState(p, state)

	info := &updateInfo{
		Version:       latest,
		InstallerURL:  installer.BrowserDownloadURL,
		InstallerName: installer.Name,
		InstallerSize: installer.Size,
	}
	if checksum != nil {
		info.ChecksumURL = checksum.BrowserDownloadURL
	}
	return info, nil
}

// progressWriter reports download progress in ~5% increments without
// spamming the caller on every chunk.
type progressWriter struct {
	total      int64
	written    int64
	lastPct    int
	onProgress func(pct int)
}

func (w *progressWriter) Write(p []byte) (int, error) {
	n := len(p)
	w.written += int64(n)
	if w.total > 0 && w.onProgress != nil {
		pct := int(w.written * 100 / w.total)
		if pct >= w.lastPct+5 || pct >= 100 {
			w.lastPct = pct
			w.onProgress(pct)
		}
	}
	return n, nil
}

func downloadFile(ctx context.Context, url, destPath string, onProgress func(pct int)) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "StreamMediaBoard-Updater/"+appVersion)

	// No overall client timeout: the installer can be 100+ MB on a slow link.
	// The caller's context deadline is what actually bounds this.
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return err
	}
	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	pw := &progressWriter{total: resp.ContentLength, onProgress: onProgress}
	if _, err := io.Copy(out, io.TeeReader(resp.Body, pw)); err != nil {
		return fmt.Errorf("download interrupted: %w", err)
	}
	return nil
}

// fetchChecksum downloads a small sha256sum-format text file ("<hex>  <name>")
// and returns the lowercase hex digest.
func fetchChecksum(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "StreamMediaBoard-Updater/"+appVersion)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("checksum request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("checksum download failed with status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return "", err
	}
	fields := strings.Fields(string(body))
	if len(fields) == 0 {
		return "", fmt.Errorf("checksum file is empty")
	}
	return strings.ToLower(fields[0]), nil
}

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// cleanStaleUpdateFiles removes leftover installers/partial downloads from a
// previous attempt, keeping the updates folder from growing unbounded.
func cleanStaleUpdateFiles(p paths, keepPath string) {
	entries, err := os.ReadDir(p.updatesDir)
	if err != nil {
		return
	}
	keepName := filepath.Base(keepPath)
	for _, e := range entries {
		if e.IsDir() || e.Name() == keepName {
			continue
		}
		lower := strings.ToLower(e.Name())
		if strings.HasSuffix(lower, ".exe") || strings.HasSuffix(lower, ".download") || strings.HasSuffix(lower, ".sha256") {
			_ = os.Remove(filepath.Join(p.updatesDir, e.Name()))
		}
	}
}

// DownloadUpdate downloads the installer for info, verifies its size and
// (when published) SHA256 checksum, and returns the path to the verified
// local file. onProgress is called with 0-100 as the download advances.
func DownloadUpdate(p paths, info *updateInfo, onProgress func(pct int)) (string, error) {
	if err := os.MkdirAll(p.updatesDir, 0o755); err != nil {
		return "", fmt.Errorf("could not create updates folder: %w", err)
	}

	finalPath := filepath.Join(p.updatesDir, info.InstallerName)

	if info.InstallerSize > 0 {
		free, err := freeDiskSpaceBytes(p.updatesDir)
		if err != nil {
			writeShellLog(p, "update: could not check free disk space: "+err.Error())
		} else {
			required := uint64(info.InstallerSize) * 2
			if free < required {
				return "", fmt.Errorf(
					"not enough free disk space to download the update: needs ~%d MB, only %d MB available",
					required/1024/1024, free/1024/1024,
				)
			}
		}
	}

	cleanStaleUpdateFiles(p, finalPath)

	tmpPath := finalPath + ".download"
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	if err := downloadFile(ctx, info.InstallerURL, tmpPath, onProgress); err != nil {
		_ = os.Remove(tmpPath)
		return "", err
	}

	fi, err := os.Stat(tmpPath)
	if err != nil {
		_ = os.Remove(tmpPath)
		return "", err
	}
	if info.InstallerSize > 0 && fi.Size() != info.InstallerSize {
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("downloaded file size mismatch (expected %d bytes, got %d)", info.InstallerSize, fi.Size())
	}

	if info.ChecksumURL != "" {
		checksumCtx, checksumCancel := context.WithTimeout(context.Background(), 15*time.Second)
		expected, checksumErr := fetchChecksum(checksumCtx, info.ChecksumURL)
		checksumCancel()
		if checksumErr != nil {
			writeShellLog(p, "update: could not fetch checksum, proceeding without verification: "+checksumErr.Error())
		} else {
			actual, hashErr := sha256File(tmpPath)
			if hashErr != nil {
				_ = os.Remove(tmpPath)
				return "", fmt.Errorf("could not verify checksum: %w", hashErr)
			}
			if !strings.EqualFold(actual, expected) {
				_ = os.Remove(tmpPath)
				return "", fmt.Errorf("checksum mismatch: expected %s, got %s", expected, actual)
			}
		}
	} else {
		writeShellLog(p, "update: no checksum asset published for this release, skipping integrity verification")
	}

	if err := os.Rename(tmpPath, finalPath); err != nil {
		return "", fmt.Errorf("could not finalize downloaded installer: %w", err)
	}
	unblockDownloadedFile(finalPath)
	return finalPath, nil
}

// ApplyUpdate confirms with the user, stops the backend, launches the silent
// installer, and exits the shell so Inno Setup can replace the running exe
// and relaunch it. Returns errUpdateCancelled if the user declines; any
// other non-nil error means the app is still running normally (backend
// restarted best-effort).
func ApplyUpdate(p paths, installerPath, version string) error {
	if !confirmBox(
		appName,
		fmt.Sprintf(
			"A new version (v%s) is ready to install.\n\n%s will close and restart automatically.\n\nContinue?",
			version, appName,
		),
	) {
		return errUpdateCancelled
	}

	stateMu.Lock()
	b := backendRef
	stateMu.Unlock()
	if b != nil {
		b.stop()
	}

	if err := ensureLogsDir(p); err != nil {
		writeShellLog(p, "update: could not ensure logs dir before install: "+err.Error())
	}
	logPath := filepath.Join(p.logsDir, "installer-"+version+".log")

	installArgs := []string{
		"/VERYSILENT",
		"/SUPPRESSMSGBOXES",
		"/NORESTART",
		"/CLOSEAPPLICATIONS",
		"/autoupdate=1",
		"/LOG=" + logPath,
	}

	if err := launchInstaller(installerPath, installArgs); err != nil {
		writeShellLog(p, "update: failed to launch installer: "+err.Error())

		// Best-effort: the backend is already stopped, so try to bring it back
		// rather than leaving the app half-broken because of a failed update.
		if restarted, restartErr := startBackend(p); restartErr == nil {
			stateMu.Lock()
			backendRef = restarted
			stateMu.Unlock()
		} else {
			writeShellLog(p, "update: could not restart backend after failed install launch: "+restartErr.Error())
		}

		messageBox(
			appName,
			"Could not launch the update installer:\n\n"+err.Error()+
				"\n\nThe downloaded installer was kept at:\n"+installerPath+
				"\n\nIf you have Kaspersky or another antivirus installed, check its quarantine — "+
				"it may have blocked the file. You can also run the installer manually from the path above.",
			mbOK|mbIconError,
		)
		return err
	}

	writeShellLog(p, "launching update installer v"+version+", exiting for upgrade")
	systray.Quit()
	os.Exit(0)
	return nil
}

// scheduleUpdateChecks runs for the lifetime of the app: an initial delayed
// check (so it never competes with startup) followed by a periodic re-check.
// Only started for packaged installs (see startupBackend in tray.go).
func scheduleUpdateChecks(p paths) {
	defer func() { _ = recover() }() // this goroutine must never take the app down

	time.Sleep(updateInitialDelay)
	runAutoCheck(p)

	ticker := time.NewTicker(updateRecheckPeriod)
	defer ticker.Stop()
	for range ticker.C {
		runAutoCheck(p)
	}
}

func runAutoCheck(p paths) {
	defer func() { _ = recover() }()
	info, err := CheckForUpdate(p, false)
	if err != nil {
		writeShellLog(p, "update check failed: "+err.Error())
		return
	}
	if info != nil {
		writeShellLog(p, "update available: v"+info.Version)
		onUpdateAvailable(info)
	}
}
