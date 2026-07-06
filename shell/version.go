package main

// appVersion is overridden at build time via:
//
//	go build -ldflags "-s -w -X main.appVersion=1.2.3"
//
// scripts/stage-windows-dist.mjs sets this to the root package.json version.
// Falls back to "0.0.0-dev" for `go run .` / unstaged dev builds.
var appVersion = "0.0.0-dev"
