# Dot-source from PowerShell: . ./tools/windows/env.ps1 [-QtRoot C:/Qt/6.11.2/msvc2022_64]
param(
    [string]$QtRoot = $env:QT_ROOT_DIR,
    [string]$MsvcRoot = $env:WISP_MSVC_ROOT
)

$ErrorActionPreference = 'Stop'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vsPath = $null
if (Test-Path -LiteralPath $vswhere) {
    $vsPath = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
if ($vsPath -and -not $MsvcRoot) {
    Import-Module (Join-Path $vsPath 'Common7/Tools/Microsoft.VisualStudio.DevShell.dll')
    Enter-VsDevShell -VsInstallPath $vsPath -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64'
} else {
    if (-not $MsvcRoot) {
        $MsvcRoot = Join-Path $env:LOCALAPPDATA 'wisp/portable-toolchain/msvc'
    }
    $vc = Get-ChildItem (Join-Path $MsvcRoot 'VC/Tools/MSVC') -Directory -ErrorAction SilentlyContinue |
        Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    $sdk = Get-ChildItem (Join-Path $MsvcRoot 'Windows Kits/10/Include') -Directory -ErrorAction SilentlyContinue |
        Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    if (-not $vc -or -not $sdk) {
        throw 'Install Desktop development with C++ and a Windows SDK, or pass -MsvcRoot for an extracted MSVC/SDK toolchain.'
    }
    $sdkRoot = Join-Path $MsvcRoot 'Windows Kits/10'
    $env:VSCMD_ARG_HOST_ARCH = 'x64'
    $env:VSCMD_ARG_TGT_ARCH = 'x64'
    $env:VCToolsVersion = $vc.Name
    $env:VCToolsInstallDir = "$($vc.FullName)\"
    $env:WindowsSdkDir = "$sdkRoot\"
    $env:WindowsSDKVersion = "$($sdk.Name)\"
    $env:WindowsSdkBinPath = "$sdkRoot\bin\"
    $env:INCLUDE = "$($vc.FullName)\include;$($sdk.FullName)\ucrt;$($sdk.FullName)\shared;$($sdk.FullName)\um;$($sdk.FullName)\winrt"
    $env:LIB = "$($vc.FullName)\lib\x64;$sdkRoot\Lib\$($sdk.Name)\ucrt\x64;$sdkRoot\Lib\$($sdk.Name)\um\x64"
    $env:PATH = "$($vc.FullName)\bin\Hostx64\x64;$sdkRoot\bin\$($sdk.Name)\x64;$env:PATH"
    $env:CC = 'cl.exe'
    $env:CXX = 'cl.exe'
    $env:CMAKE_GENERATOR = 'Ninja'
}

if ($QtRoot) {
    $env:QMAKE = Join-Path $QtRoot 'bin/qmake.exe'
} elseif (-not $env:QMAKE) {
    $env:QMAKE = Join-Path $env:LOCALAPPDATA 'wisp/Qt/6.11.2/msvc2022_64/bin/qmake.exe'
}
if (-not (Test-Path -LiteralPath $env:QMAKE)) {
    throw 'Set QMAKE to Qt 6.11.2 MSVC 2022 x64 bin/qmake.exe, or pass -QtRoot.'
}
$env:QMAKE = (Resolve-Path -LiteralPath $env:QMAKE).Path
$qtBin = Split-Path $env:QMAKE
$toolBin = Join-Path $env:LOCALAPPDATA 'wisp/build-tools/Scripts'
$env:PATH = "$qtBin;$env:USERPROFILE\.cargo\bin;$toolBin;$env:PATH"
if (-not $env:LIBCLANG_PATH) {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'LLVM/bin'),
        (Join-Path $env:LOCALAPPDATA 'wisp/build-tools/Lib/site-packages/clang/native')
    )
    if ($vsPath) {
        $candidates = @((Join-Path $vsPath 'VC/Tools/Llvm/x64/bin')) + $candidates
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'libclang.dll')) {
            $env:LIBCLANG_PATH = $candidate
            break
        }
    }
}
if (-not $env:LIBCLANG_PATH) {
    throw 'Install the C++ Clang tools component in Visual Studio, or set LIBCLANG_PATH to the directory containing libclang.dll.'
}
Write-Host "Wisp build environment ready. Qt $(& $env:QMAKE -query QT_VERSION), MSVC x64."
