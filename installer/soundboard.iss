; Inno Setup script for Stream Media Board (native Go shell).
; Built by scripts/build-installer-inno.mjs, which stages dist-shell/ first and
; passes the version via /DMyAppVersion=...
;
; Per-user install (no admin). Layout under {app}:
;   StreamMediaBoard.exe
;   runtime\node.exe
;   app\ (backend/dist, frontend/dist, bin, node_modules, config, shell-assets)

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

#define MyAppName "Stream Media Board"
#define MyAppExeName "StreamMediaBoard.exe"
#define MyAppPublisher "mmartinewski"
#define MyAppURL "https://github.com/mmartinewski/stream-media-board"

[Setup]
AppId={{8F2A1C34-5B6D-4E7F-9A0B-1C2D3E4F5A6B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\StreamMediaBoard
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=StreamMediaBoard-Setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\shell\assets\play.ico
UninstallDisplayIcon={app}\app\shell-assets\play.ico
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Code signing is enabled only when build-installer-inno.mjs passes
; /DSIGN_TOOL=mysign together with /Smysign=<signtool command>.
#ifdef SIGN_TOOL
SignTool={#SIGN_TOOL}
SignedUninstaller=yes
#endif

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
Source: "..\dist-shell\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app\shell-assets\play.ico"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\app\shell-assets\play.ico"

[Registry]
Root: HKCU; Subkey: "Software\Classes\soundboard"; ValueType: string; ValueName: ""; ValueData: "URL:Stream Media Board Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\soundboard"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\soundboard\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""

[Run]
Filename: "{app}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; Check: NeedsWebView2; StatusMsg: "Installing the WebView2 runtime (required for YouTube sign-in)..."; Flags: waituntilterminated skipifdoesntexist
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
function WebView2Installed(): Boolean;
var
  v: String;
begin
  Result :=
    RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', v) or
    RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', v) or
    RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', v);
end;

function NeedsWebView2(): Boolean;
begin
  Result := not WebView2Installed() and FileExists(ExpandConstant('{app}\MicrosoftEdgeWebview2Setup.exe'));
end;
