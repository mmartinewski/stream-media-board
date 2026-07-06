//go:build windows

package main

import (
	"fmt"
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

const swHide = 0

// launchInstaller starts the Inno Setup updater via ShellExecute instead of
// os/exec with CREATE_NO_WINDOW, which can return "Access is denied" for
// downloaded GUI installers on some machines (Defender, MOTW, AV).
func launchInstaller(installerPath string, args []string) error {
	unblockDownloadedFile(installerPath)

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
		swHide,
	)
	// ShellExecute returns a value > 32 on success.
	if r <= 32 {
		return fmt.Errorf("could not start installer (ShellExecute code %d)", r)
	}
	return nil
}
