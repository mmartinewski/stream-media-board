package main

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const errorAlreadyExists = 183

var procCreateMutexW = kernel32.NewProc("CreateMutexW")

// acquireSingleInstance creates a named mutex. Returns true if this is the first
// instance, false if another instance already holds it. Retries briefly so a
// silent installer relaunch can wait for the previous process to exit.
func acquireSingleInstance() bool {
	namePtr, err := windows.UTF16PtrFromString(mutexName)
	if err != nil {
		return true
	}
	for attempt := 0; attempt < 6; attempt++ {
		_, _, callErr := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(namePtr)))
		if errno, ok := callErr.(windows.Errno); ok && int(errno) == errorAlreadyExists {
			if attempt < 5 {
				time.Sleep(500 * time.Millisecond)
				continue
			}
			return false
		}
		return true
	}
	return true
}

// registerProtocol writes the soundboard:// handler under HKCU (per-user, no admin).
func registerProtocol(exePath string) error {
	base := `Software\Classes\` + protocolScheme
	k, _, err := registry.CreateKey(registry.CURRENT_USER, base, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	if err := k.SetStringValue("", "URL:Stream Media Board Protocol"); err != nil {
		return err
	}
	if err := k.SetStringValue("URL Protocol", ""); err != nil {
		return err
	}

	cmdKey, _, err := registry.CreateKey(registry.CURRENT_USER, base+`\shell\open\command`, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer cmdKey.Close()
	command := fmt.Sprintf("\"%s\" \"%%1\"", exePath)
	return cmdKey.SetStringValue("", command)
}

// startControlListener listens on a loopback port so second instances can forward
// actions (e.g. the soundboard://youtube-login deep link) to the running app.
func startControlListener(onAction func(string)) {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", controlPort))
	if err != nil {
		return // another listener already up, or port busy; not fatal
	}
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
				line, _ := bufio.NewReader(c).ReadString('\n')
				action := strings.TrimSpace(line)
				if action != "" {
					onAction(action)
				}
			}(conn)
		}
	}()
}

// sendControlAction forwards an action to the running instance. Returns true on success.
func sendControlAction(action string) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", controlPort), 2*time.Second)
	if err != nil {
		return false
	}
	defer conn.Close()
	_, err = conn.Write([]byte(action + "\n"))
	return err == nil
}

// parseProtocolAction extracts the action from a soundboard:// argument, if present.
func parseProtocolAction(args []string) string {
	for _, a := range args {
		if strings.HasPrefix(strings.ToLower(a), protocolScheme+"://") {
			action := a[len(protocolScheme+"://"):]
			return strings.TrimRight(action, "/")
		}
	}
	return ""
}

func openBrowser(url string) {
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

func currentExePath() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return exe
}
