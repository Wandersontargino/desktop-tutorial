#ifndef AppVersion
  #error AppVersion must be supplied by build.ps1
#endif
[Setup]
AppId=EleitoralParaConectado
AppName=Eleitoral Pará
AppVersion={#AppVersion}
AppPublisher=Eleitoral Pará
AppPublisherURL=https://analise-eleitoral-pa.wanderson-targino.chatgpt.site/
DefaultDirName={localappdata}\EleitoralParaConectado
DefaultGroupName=Eleitoral Pará
PrivilegesRequired=lowest
MinVersion=10.0
WizardStyle=modern
SetupIconFile={#SourcePath}\EleitoralPara.ico
UninstallDisplayIcon={app}\EleitoralPara.exe
OutputDir={#SourcePath}\output
OutputBaseFilename=Eleitoral-Para-Windows-Instalador-{#AppVersion}
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
DisableProgramGroupPage=yes
InfoBeforeFile={#SourcePath}\LEIA-PRIMEIRO.txt

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"

[Files]
Source: "{#SourcePath}\build\EleitoralPara.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourcePath}\EleitoralPara.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourcePath}\LEIA-PRIMEIRO.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Eleitoral Pará"; Filename: "{app}\EleitoralPara.exe"; IconFilename: "{app}\EleitoralPara.ico"
Name: "{group}\Abrir no navegador"; Filename: "{app}\EleitoralPara.exe"; Parameters: "--browser"; IconFilename: "{app}\EleitoralPara.ico"
Name: "{group}\Central de Qualidade"; Filename: "{app}\EleitoralPara.exe"; Parameters: "--quality"; IconFilename: "{app}\EleitoralPara.ico"
Name: "{group}\Cadastros arquivados"; Filename: "{app}\EleitoralPara.exe"; Parameters: "--archives"; IconFilename: "{app}\EleitoralPara.ico"
Name: "{group}\Saúde e backups"; Filename: "{app}\EleitoralPara.exe"; Parameters: "--health"; IconFilename: "{app}\EleitoralPara.ico"
Name: "{group}\Ajuda do aplicativo"; Filename: "{app}\EleitoralPara.exe"; Parameters: "--about"
Name: "{userdesktop}\Eleitoral Pará"; Filename: "{app}\EleitoralPara.exe"; IconFilename: "{app}\EleitoralPara.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\EleitoralPara.exe"; Description: "Abrir Eleitoral Pará"; Flags: nowait postinstall skipifsilent
