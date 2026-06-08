//go:build !windows

package main

import "os/exec"

func configureBackendCmd(cmd *exec.Cmd) {}
