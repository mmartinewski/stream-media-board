//go:build windows

package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const createNoWindow = 0x08000000

func configureBackendCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
}

// unblockDownloadedFile removes the Mark-of-the-Web Zone.Identifier stream so
// Windows does not block launching an installer fetched over HTTP.
func unblockDownloadedFile(path string) {
	_ = os.Remove(path + ":Zone.Identifier")
}

var procShellExecuteW = windows.NewLazySystemDLL("shell32.dll").NewProc("ShellExecuteW")

const swShowNormal = 1

// stageInstallerForLaunch moves (or copies) the downloaded installer into the
// app's install folder before launch. Some AV products (e.g. Kaspersky) block a
// tray app from starting an exe under %APPDATA%\Roaming even when that folder
// is excluded, but allow execution from the install directory.
func stageInstallerForLaunch(installDir, sourcePath string) (string, error) {
	cacheDir := filepath.Join(installDir, "update-cache")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return "", err
	}
	dest := filepath.Join(cacheDir, filepath.Base(sourcePath))
	_ = os.Remove(dest)

	unblockDownloadedFile(sourcePath)

	if err := os.Rename(sourcePath, dest); err != nil {
		if err := copyFile(sourcePath, dest); err != nil {
			return "", err
		}
	}
	unblockDownloadedFile(dest)
	return dest, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	if err != nil {
		_ = os.Remove(dst)
		return err
	}
	return out.Close()
}

func shellExecuteInstall(installerPath string, args []string) error {
	verb, _ := windows.UTF16PtrFromString("open")
	file, err := windows.UTF16PtrFromString(installerPath)
	if err != nil {
		return err
	}
	params, _ := windows.UTF16PtrFromString(strings.Join(args, " "))
	workDir, _ := windows.UTF16PtrFromString(filepath.Dir(installerPath))

	r, _, _ := procShellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(file)),
		uintptr(unsafe.Pointer(params)),
		uintptr(unsafe.Pointer(workDir)),
		swShowNormal,
	)
	if r <= 32 {
		return fmt.Errorf("ShellExecute code %d", r)
	}
	return nil
}

func execInstall(installerPath string, args []string) error {
	cmd := exec.Command(installerPath, args...)
	cmd.Dir = filepath.Dir(installerPath)
	// Do not use configureBackendCmd (CREATE_NO_WINDOW) — that caused Access
	// denied for GUI installers on some machines.
	return cmd.Start()
}

// launchInstaller starts the Inno Setup updater. The installer is staged under
// {installDir}\update-cache when possible, then launched via ShellExecute with
// a plain CreateProcess fallback.
func launchInstaller(installDir, installerPath string, args []string) error {
	launchPath := installerPath
	if staged, err := stageInstallerForLaunch(installDir, installerPath); err == nil {
		launchPath = staged
	} else {
		unblockDownloadedFile(installerPath)
	}

	if err := shellExecuteInstall(launchPath, args); err == nil {
		return nil
	} else if err2 := execInstall(launchPath, args); err2 == nil {
		return nil
	} else {
		return fmt.Errorf("%w; CreateProcess fallback: %v", err, err2)
	}
}
