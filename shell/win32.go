package main

import (
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")
	ole32    = windows.NewLazySystemDLL("ole32.dll")

	procRegisterClassExW = user32.NewProc("RegisterClassExW")
	procCreateWindowExW  = user32.NewProc("CreateWindowExW")
	procDefWindowProcW   = user32.NewProc("DefWindowProcW")
	procShowWindow       = user32.NewProc("ShowWindow")
	procUpdateWindow     = user32.NewProc("UpdateWindow")
	procGetMessageW      = user32.NewProc("GetMessageW")
	procTranslateMessage = user32.NewProc("TranslateMessage")
	procDispatchMessageW = user32.NewProc("DispatchMessageW")
	procPostQuitMessage  = user32.NewProc("PostQuitMessage")
	procDestroyWindow    = user32.NewProc("DestroyWindow")
	procGetClientRect    = user32.NewProc("GetClientRect")
	procPostMessageW     = user32.NewProc("PostMessageW")
	procLoadImageW       = user32.NewProc("LoadImageW")
	procLoadCursorW      = user32.NewProc("LoadCursorW")
	procMessageBoxW      = user32.NewProc("MessageBoxW")
	procSetForeground    = user32.NewProc("SetForegroundWindow")

	procGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")

	procCoInitializeEx = ole32.NewProc("CoInitializeEx")

	procGetDiskFreeSpaceExW = kernel32.NewProc("GetDiskFreeSpaceExW")
)

const (
	wsOverlappedWindow = 0x00CF0000
	wsVisible          = 0x10000000
	cwUseDefault       = 0x80000000
	swShow             = 5
	wmSize             = 0x0005
	wmDestroy          = 0x0002
	wmClose            = 0x0010
	wmApp              = 0x8000
	wmExportCookies    = wmApp + 1
	csHRedraw          = 0x0002
	csVRedraw          = 0x0001
	idcArrow           = 32512
	imageIcon          = 1
	lrLoadFromFile     = 0x00000010
	lrDefaultSize      = 0x00000040
	mbOK               = 0x0
	mbOKCancel         = 0x00000001
	mbIconInfo         = 0x40
	mbIconError        = 0x10
	mbIconQuestion     = 0x00000020
	idOK               = 1
	coinitApartment    = 0x2
)

type wndClassExW struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     windows.Handle
	hIcon         windows.Handle
	hCursor       windows.Handle
	hbrBackground windows.Handle
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       windows.Handle
}

type rect struct {
	left, top, right, bottom int32
}

type point struct {
	x, y int32
}

type msg struct {
	hwnd    windows.Handle
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
}

func coInitSTA() {
	_, _, _ = procCoInitializeEx.Call(0, coinitApartment)
}

func getModuleHandle() windows.Handle {
	h, _, _ := procGetModuleHandleW.Call(0)
	return windows.Handle(h)
}

func loadCursorArrow() windows.Handle {
	h, _, _ := procLoadCursorW.Call(0, uintptr(idcArrow))
	return windows.Handle(h)
}

// loadIconFromFile loads an .ico file as an icon handle (best-effort).
func loadIconFromFile(path string) windows.Handle {
	if path == "" {
		return 0
	}
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return 0
	}
	h, _, _ := procLoadImageW.Call(0, uintptr(unsafe.Pointer(p)), imageIcon, 0, 0, lrLoadFromFile|lrDefaultSize)
	return windows.Handle(h)
}

func defWindowProc(hwnd windows.Handle, message uint32, wParam, lParam uintptr) uintptr {
	r, _, _ := procDefWindowProcW.Call(uintptr(hwnd), uintptr(message), wParam, lParam)
	return r
}

func registerWindowClass(className string, wndProc uintptr, icon windows.Handle) error {
	classNamePtr, err := windows.UTF16PtrFromString(className)
	if err != nil {
		return err
	}
	wc := wndClassExW{
		style:         csHRedraw | csVRedraw,
		lpfnWndProc:   wndProc,
		hInstance:     getModuleHandle(),
		hIcon:         icon,
		hCursor:       loadCursorArrow(),
		hbrBackground: windows.Handle(6), // COLOR_WINDOW+1
		lpszClassName: classNamePtr,
		hIconSm:       icon,
	}
	wc.cbSize = uint32(unsafe.Sizeof(wc))
	r, _, e := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	if r == 0 {
		return e
	}
	return nil
}

func createWindow(className, title string, width, height int32) (windows.Handle, error) {
	classNamePtr, err := windows.UTF16PtrFromString(className)
	if err != nil {
		return 0, err
	}
	titlePtr, err := windows.UTF16PtrFromString(title)
	if err != nil {
		return 0, err
	}
	h, _, e := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(classNamePtr)),
		uintptr(unsafe.Pointer(titlePtr)),
		wsOverlappedWindow|wsVisible,
		uintptr(cwUseDefault), uintptr(cwUseDefault),
		uintptr(width), uintptr(height),
		0, 0,
		uintptr(getModuleHandle()),
		0,
	)
	if h == 0 {
		return 0, e
	}
	return windows.Handle(h), nil
}

func showWindow(hwnd windows.Handle) {
	_, _, _ = procShowWindow.Call(uintptr(hwnd), swShow)
	_, _, _ = procUpdateWindow.Call(uintptr(hwnd))
	_, _, _ = procSetForeground.Call(uintptr(hwnd))
}

func getClientRect(hwnd windows.Handle) rect {
	var r rect
	_, _, _ = procGetClientRect.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&r)))
	return r
}

func postMessage(hwnd windows.Handle, message uint32) {
	_, _, _ = procPostMessageW.Call(uintptr(hwnd), uintptr(message), 0, 0)
}

func postQuit() {
	_, _, _ = procPostQuitMessage.Call(0)
}

func destroyWindow(hwnd windows.Handle) {
	_, _, _ = procDestroyWindow.Call(uintptr(hwnd))
}

// runMessageLoop pumps the standard Win32 message loop until WM_QUIT.
func runMessageLoop() {
	var m msg
	for {
		r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 { // 0 = WM_QUIT, -1 = error
			break
		}
		_, _, _ = procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		_, _, _ = procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
}

func messageBox(title, text string, flags uint32) {
	titlePtr, _ := windows.UTF16PtrFromString(title)
	textPtr, _ := windows.UTF16PtrFromString(text)
	_, _, _ = procMessageBoxW.Call(0, uintptr(unsafe.Pointer(textPtr)), uintptr(unsafe.Pointer(titlePtr)), uintptr(flags))
}

// confirmBox shows an OK/Cancel dialog and reports whether the user clicked OK.
// Used before applying an auto-update, since it stops the backend and restarts
// the app.
func confirmBox(title, text string) bool {
	titlePtr, _ := windows.UTF16PtrFromString(title)
	textPtr, _ := windows.UTF16PtrFromString(text)
	r, _, _ := procMessageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(textPtr)),
		uintptr(unsafe.Pointer(titlePtr)),
		uintptr(mbOKCancel|mbIconQuestion),
	)
	return int32(r) == idOK
}

// freeDiskSpaceBytes returns the number of bytes available to the current user
// on the volume containing dir. Used to refuse downloading an update when
// there is not enough room for it.
func freeDiskSpaceBytes(dir string) (uint64, error) {
	dirPtr, err := windows.UTF16PtrFromString(dir)
	if err != nil {
		return 0, err
	}
	var freeAvail, total, totalFree uint64
	r, _, e := procGetDiskFreeSpaceExW.Call(
		uintptr(unsafe.Pointer(dirPtr)),
		uintptr(unsafe.Pointer(&freeAvail)),
		uintptr(unsafe.Pointer(&total)),
		uintptr(unsafe.Pointer(&totalFree)),
	)
	if r == 0 {
		return 0, e
	}
	return freeAvail, nil
}

var _ = syscall.Handle(0)
