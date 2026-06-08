package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func ensureLogsDir(p paths) error {
	return os.MkdirAll(p.logsDir, 0o755)
}

func openBackendLog(p paths) (*os.File, error) {
	if err := ensureLogsDir(p); err != nil {
		return nil, err
	}
	return os.OpenFile(p.backendLog, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
}

func writeShellLog(p paths, message string) {
	if err := ensureLogsDir(p); err != nil {
		return
	}
	f, err := os.OpenFile(filepath.Join(p.logsDir, "shell.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	ts := time.Now().Format("2006-01-02 15:04:05")
	_, _ = fmt.Fprintf(f, "%s %s\n", ts, message)
}

func readLogTail(path string, maxBytes int) string {
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return ""
	}
	if len(data) > maxBytes {
		data = data[len(data)-maxBytes:]
	}
	return strings.TrimSpace(string(data))
}

func openFolder(path string) {
	_ = exec.Command("explorer.exe", path).Start()
}

func formatBackendStartupError(p paths, err error, backendOutput string) string {
	var b strings.Builder
	b.WriteString(err.Error())
	b.WriteString("\n\nPaths:")
	b.WriteString(fmt.Sprintf("\n  node: %s", p.nodeExe))
	b.WriteString(fmt.Sprintf("\n  backend: %s", p.backendEntry))
	b.WriteString(fmt.Sprintf("\n  app root: %s", p.appRoot))
	if !fileExists(p.nodeExe) {
		b.WriteString("\n\nMissing node.exe — reinstall or check antivirus quarantine.")
	}
	if !fileExists(p.backendEntry) {
		b.WriteString("\n\nMissing backend entry — reinstall the app.")
	}

	output := strings.TrimSpace(backendOutput)
	if output == "" {
		output = readLogTail(p.latestLog, 4096)
	}
	if output != "" {
		b.WriteString("\n\nRecent backend output:\n")
		b.WriteString(output)
	}

	b.WriteString("\n\nLogs folder:\n  ")
	b.WriteString(p.logsDir)
	b.WriteString("\n\nIf Kaspersky is installed, also exclude that folder and check Quarantine for node.exe.")
	return b.String()
}
