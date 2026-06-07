package main

import (
	"context"
	"fmt"
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

// startBackend launches the Node backend (under the bundled node.exe) and waits
// for /api/health. Mirrors desktop/main.cjs startBackend + waitForBackend.
func startBackend(p paths) (*backend, error) {
	port := p.resolvePort()
	url := fmt.Sprintf("http://127.0.0.1:%d", port)

	cmd := exec.Command(p.nodeExe, p.backendEntry)
	cmd.Dir = p.installDir // must be a real directory
	cmd.Env = append(os.Environ(),
		"PERSONAL_CLIP_PLAYER_ROOT="+p.appRoot,
		"NODE_BINARY="+p.nodeExe,
		"YTDLP_JS_RUNTIME="+p.nodeExe,
	)
	cmd.Stdout = prefixWriter{prefix: "[backend] ", w: os.Stdout}
	cmd.Stderr = prefixWriter{prefix: "[backend] ", w: os.Stderr}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start backend: %w", err)
	}

	b := &backend{cmd: cmd, url: url, port: port}

	// Watch for an early exit so we can fail fast instead of polling forever.
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()

	if err := waitForBackend(url, exited); err != nil {
		_ = cmd.Process.Kill()
		return nil, err
	}
	return b, nil
}

func waitForBackend(url string, exited <-chan error) error {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case err := <-exited:
			return fmt.Errorf("backend exited before startup: %v", err)
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
	return fmt.Errorf("backend did not become ready at %s", url)
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

type prefixWriter struct {
	prefix string
	w      *os.File
}

func (pw prefixWriter) Write(p []byte) (int, error) {
	_, _ = pw.w.WriteString(pw.prefix)
	return pw.w.Write(p)
}
