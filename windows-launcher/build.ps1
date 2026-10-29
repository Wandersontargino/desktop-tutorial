$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$release = Get-Content (Join-Path $project '../public/platform-release.json') -Raw | ConvertFrom-Json
$version = [string]$release.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Versao invalida.' }
$build = Join-Path $project 'build'
$output = Join-Path $project 'output'
New-Item -ItemType Directory -Force $build,$output | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe' }
if (-not (Test-Path $compiler)) { throw 'Compilador .NET Framework indisponivel.' }
$assembly = @"
using System.Reflection;
[assembly: AssemblyTitle("Eleitoral Para")]
[assembly: AssemblyDescription("Acesso protegido a plataforma eleitoral central")]
[assembly: AssemblyProduct("Eleitoral Para")]
[assembly: AssemblyVersion("$version.0")]
[assembly: AssemblyFileVersion("$version.0")]
"@
Set-Content -LiteralPath (Join-Path $build 'AssemblyInfo.cs') -Value $assembly -Encoding UTF8
$exe = Join-Path $build 'EleitoralPara.exe'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /utf8output /codepage:65001 "/out:$exe" "/win32icon:$(Join-Path $project 'EleitoralPara.ico')" /reference:System.Windows.Forms.dll (Join-Path $project 'Launcher.cs') (Join-Path $build 'AssemblyInfo.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha na compilacao Windows.' }
$selfTest = Start-Process -FilePath $exe -ArgumentList '--self-test' -PassThru -Wait
if ($selfTest.ExitCode -ne 0) { throw "Autoteste Windows falhou: $($selfTest.ExitCode)" }
$iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6/ISCC.exe'
if (-not (Test-Path $iscc)) { $iscc = (Get-Command ISCC.exe -ErrorAction Stop).Source }
& $iscc "/DAppVersion=$version" (Join-Path $project 'Installer.iss')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao construir instalador Windows.' }
$installer = Join-Path $output "Eleitoral-Para-Windows-Instalador-$version.exe"
$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$testRoot = Join-Path $tempRoot ('eleitoral-smoke-' + [Guid]::NewGuid().ToString('N'))
$install = Start-Process -FilePath $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',"/DIR=`"$testRoot`"" -PassThru -Wait
if ($install.ExitCode -ne 0) { throw "Instalacao de teste falhou: $($install.ExitCode)" }
$installed = Join-Path $testRoot 'EleitoralPara.exe'
if ((Get-FileHash $installed -Algorithm SHA256).Hash -ne (Get-FileHash $exe -Algorithm SHA256).Hash) { throw 'Arquivo instalado diverge da compilacao.' }
$installedTest = Start-Process -FilePath $installed -ArgumentList '--self-test' -PassThru -Wait
if ($installedTest.ExitCode -ne 0) { throw 'Autoteste do programa instalado falhou.' }
$uninstaller = Join-Path $testRoot 'unins000.exe'
if (-not (Test-Path $uninstaller)) { throw 'Desinstalador ausente.' }
$remove = Start-Process -FilePath $uninstaller -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -PassThru -Wait
if ($remove.ExitCode -ne 0) { throw 'Desinstalacao de teste falhou.' }
for ($i = 0; $i -lt 30 -and (Test-Path $installed); $i++) { Start-Sleep -Milliseconds 100 }
if (Test-Path $installed) { throw 'O programa de teste nao foi removido.' }
$metadata = [ordered]@{ version=$version; package='Windows connected installer'; platform_url='https://analise-eleitoral-pa.wanderson-targino.chatgpt.site/'; filename=[IO.Path]::GetFileName($installer); sha256=(Get-FileHash $installer -Algorithm SHA256).Hash.ToLower(); size_bytes=(Get-Item $installer).Length; digital_signature=(Get-AuthenticodeSignature $installer).Status.ToString(); native_windows_build=$true; native_self_test=$true; install_uninstall_smoke_test=$true; physical_device_login_test=$false; embedded_personal_data=$false; admin_required=$false }
$metadata | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $output 'verification-windows.json') -Encoding UTF8
Copy-Item (Join-Path $project 'LEIA-PRIMEIRO.txt') (Join-Path $output 'LEIA-PRIMEIRO-WINDOWS.txt')
Write-Host 'Windows: compilacao, politica de destino, instalacao e desinstalacao verificadas.'
