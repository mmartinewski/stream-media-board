package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"time"
)

type backend struct {
	cmd  *exec.Cmd
	url  string
	port int
}

type backendLogWriter struct {
	file *os.File
	buf  *bytes.Buffer
}

func (w *backendLogWriter) Write(p []byte) (int, error) {
	if w.buf != nil {
		_, _ = w.buf.Write(p)
	}
	if w.file != nil {
		_, _ = w.file.Write(p)
	}
	return len(p), nil
}

// startBackend launches the Node backend (under the bundled node.exe) and waits
// for /api/health. Mirrors desktop/main.cjs startBackend + waitForBackend.
func startBackend(p paths) (*backend, error) {
	port := p.resolvePort()
	url := fmt.Sprintf("http://127.0.0.1:%d", port)

	writeShellLog(p, fmt.Sprintf("starting backend port=%d node=%s entry=%s appRoot=%s", port, p.nodeExe, p.backendEntry, p.appRoot))

	logFile, err := openBackendLog(p)
	if err != nil {
		writeShellLog(p, fmt.Sprintf("warning: could not open backend log: %v", err))
	}

	outputBuf := &bytes.Buffer{}
	logWriter := &backendLogWriter{file: logFile, buf: outputBuf}
	if logFile != nil {
		_, _ = fmt.Fprintf(logFile, "\n--- backend start %s ---\n", time.Now().Format(time.RFC3339))
		defer logFile.Close()
	}

	cmd := exec.Command(p.nodeExe, p.backendEntry)
	configureBackendCmd(cmd)
	cmd.Dir = p.installDir // must be a real directory
	cmd.Env = append(os.Environ(),
		"PERSONAL_CLIP_PLAYER_ROOT="+p.appRoot,
		"NODE_BINARY="+p.nodeExe,
		"YTDLP_JS_RUNTIME="+p.nodeExe,
	)
	cmd.Stdout = io.MultiWriter(logWriter)
	cmd.Stderr = io.MultiWriter(logWriter)

	if err := cmd.Start(); err != nil {
		msg := formatBackendStartupError(p, fmt.Errorf("failed to start backend: %w", err), outputBuf.String())
		writeShellLog(p, "backend start failed: "+err.Error())
		return nil, fmt.Errorf("%s", msg)
	}

	b := &backend{cmd: cmd, url: url, port: port}

	// Watch for an early exit so we can fail fast instead of polling forever.
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()

	if err := waitForBackend(url, exited); err != nil {
		_ = cmd.Process.Kill()
		msg := formatBackendStartupError(p, err, outputBuf.String())
		writeShellLog(p, "backend not ready: "+err.Error())
		return nil, fmt.Errorf("%s", msg)
	}

	writeShellLog(p, fmt.Sprintf("backend ready at %s", url))
	return b, nil
}

func waitForBackend(url string, exited <-chan error) error {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case err := <-exited:
			if err != nil {
				return fmt.Errorf("backend exited before startup: %w", err)
			}
			return fmt.Errorf("backend exited before startup")
		default:
		}
		req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, url+"/api/health", nil)
		resp, err := client.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}
		time.Sleep(300 * time.Millisecond)
	}
	return fmt.Errorf("backend did not become ready at %s within 30s (port in use or blocked by antivirus?)", url)
}

func (b *backend) stop() {
	if b == nil || b.cmd == nil || b.cmd.Process == nil {
		return
	}
	done := make(chan struct{})
	go func() {
		_, _ = b.cmd.Process.Wait()
		close(done)
	}()
	// Node on Windows: no graceful SIGTERM; kill the process.
	_ = b.cmd.Process.Kill()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
	}
}
