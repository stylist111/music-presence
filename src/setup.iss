; Music Presence installer (Inno Setup 6). Built by build.ps1 -> dist\MusicPresence-Setup.exe
#ifndef AppVer
  #define AppVer "0.0.0"
#endif
#ifndef AppDir
  #error Build with src\build.ps1 (passes /DAppDir=<PyInstaller output>)
#endif

[Setup]
AppId={{600C92A5-AF21-4874-99AE-3903AFBAAE43}
AppName=Music Presence
AppVersion={#AppVer}
AppPublisher=beyond
DefaultDirName={%USERPROFILE}\Music Presence
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=MusicPresence-Setup
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\app\music_presence_host.exe
UninstallDisplayName=Music Presence
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
; The only thing that can hold our files is the helper the browser started: [Code] stops it itself.
CloseApplications=no
RestartApplications=no

[Languages]
Name: "ru"; MessagesFile: "compiler:Languages\Russian.isl"

[Messages]
FinishedHeadingLabel=Почти готово!
FinishedLabelNoIcons=Осталось подключить расширение в браузере:%n%n1. Откройте меню браузера ⋮ → Расширения → Управление расширениями.%n2. Включите «Режим разработчика».%n3. Нажмите «Загрузить распакованное расширение», вставьте путь Ctrl+V и нажмите «Выбор папки».%n4. В Discord: Настройки → Конфиденциальность активности → включите «Показывать текущую активность».%n%nПуть к папке расширения уже скопирован в буфер обмена.
FinishedLabel=Осталось подключить расширение в браузере:%n%n1. Откройте меню браузера ⋮ → Расширения → Управление расширениями.%n2. Включите «Режим разработчика».%n3. Нажмите «Загрузить распакованное расширение», вставьте путь Ctrl+V и нажмите «Выбор папки».%n4. В Discord: Настройки → Конфиденциальность активности → включите «Показывать текущую активность».%n%nПуть к папке расширения уже скопирован в буфер обмена.

[Files]
Source: "..\extension\*"; DestDir: "{app}\extension"; Flags: ignoreversion recursesubdirs
Source: "{#AppDir}\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs

[UninstallRun]
Filename: "{app}\app\music_presence_host.exe"; Parameters: "--uninstall"; RunOnceId: "unregister"; Flags: runhidden waituntilterminated

[UninstallDelete]
Type: files; Name: "{app}\host.log"
Type: files; Name: "{app}\host.log.old"
Type: files; Name: "{app}\app\com.musicpresence.host.json"

[Code]
// While music plays the browser keeps music_presence_host.exe running, which locks app\.
// Stop it before installing over it or uninstalling: the browser starts it again when needed.
procedure StopHelper;
var
  Code: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM music_presence_host.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Sleep(500);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopHelper;
  Result := '';
end;

function InitializeUninstall(): Boolean;
begin
  StopHelper;
  Result := True;
end;

// Register the helper in the browsers and copy the extension path to the clipboard.
procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
begin
  if CurStep = ssPostInstall then
    if not Exec(ExpandConstant('{app}\app\music_presence_host.exe'), '--install', '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then
      MsgBox('Не получилось подключить Music Presence к браузерам.' + #13#10 +
             'Подробности: ' + ExpandConstant('{app}\host.log'), mbError, MB_OK);
end;
