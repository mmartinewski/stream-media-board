//go:build !windows

package main

import (
	"fmt"
	"os/exec"
)

func configureBackendCmd(cmd *exec.Cmd) {}

func unblockDownloadedFile(path string) {}

func launchInstaller(installerPath string, args []string) error {
	return fmt.Errorf("auto-update installer launch is only supported on Windows")
}
