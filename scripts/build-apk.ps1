param(
  [ValidateSet('Auto', 'Local', 'Cloud')]
  [string]$Mode = 'Auto',
  [string]$ApiUrl = $env:EXPO_PUBLIC_API_URL,
  [string]$JavaHome = $env:NOVO_JAVA_HOME
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $repoRoot 'apps\mobile'
$artifactRoot = Join-Path $repoRoot 'artifacts'

function Get-JavaMajorVersion([string]$HomePath) {
  if (-not $HomePath) { return $null }
  $javaExe = Join-Path $HomePath 'bin\java.exe'
  if (-not (Test-Path -LiteralPath $javaExe)) { return $null }
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $javaExe
  $startInfo.Arguments = '-version'
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $versionText = $process.StandardOutput.ReadToEnd() + $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  $process.Dispose()
  if ($versionText -match 'version\s+"(?<major>\d+)') { return [int]$Matches.major }
  return $null
}

function Find-CompatibleJavaHome {
  $candidateHomes = [System.Collections.Generic.List[string]]::new()
  if ($env:JAVA_HOME) { $candidateHomes.Add($env:JAVA_HOME) }

  $pathJava = Get-Command java -ErrorAction SilentlyContinue
  if ($pathJava) { $candidateHomes.Add((Split-Path -Parent (Split-Path -Parent $pathJava.Source))) }

  $searchRoots = @(
    'C:\Program Files\Eclipse Adoptium',
    'C:\Program Files\Microsoft',
    'C:\Program Files\Java',
    (Join-Path $env:USERPROFILE '.jdks'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium')
  )
  foreach ($root in $searchRoots) {
    if (Test-Path -LiteralPath $root) {
      Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '17|21|22|23|jdk' } |
        ForEach-Object { $candidateHomes.Add($_.FullName) }
    }
  }

  $androidStudioJava = 'C:\Program Files\Android\Android Studio\jbr'
  if (Test-Path -LiteralPath $androidStudioJava) { $candidateHomes.Add($androidStudioJava) }

  $compatible = foreach ($candidate in ($candidateHomes | Select-Object -Unique)) {
    $major = Get-JavaMajorVersion $candidate
    if ($null -ne $major -and $major -ge 17 -and $major -le 23) {
      [pscustomobject]@{ Home = $candidate; Major = $major }
    }
  }
  return $compatible | Sort-Object @{ Expression = { if ($_.Major -eq 17) { 0 } elseif ($_.Major -eq 21) { 1 } else { 2 } } }, Major | Select-Object -First 1
}

if (-not $ApiUrl) {
  throw 'Set EXPO_PUBLIC_API_URL or pass -ApiUrl http://YOUR_COMPUTER_LAN_IP:4000/api so the APK can reach the novo server from your phone.'
}

$env:EXPO_PUBLIC_API_URL = $ApiUrl.TrimEnd('/')
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null

$selectedJava = $null
if ($JavaHome) {
  $explicitMajor = Get-JavaMajorVersion $JavaHome
  if ($null -eq $explicitMajor) { throw "No Java executable was found under -JavaHome '$JavaHome'." }
  if ($explicitMajor -lt 17 -or $explicitMajor -gt 23) { throw "JDK $explicitMajor at '$JavaHome' is incompatible with Gradle 8.10. Install JDK 17, then pass -JavaHome 'C:\path\to\jdk-17'." }
  $selectedJava = [pscustomobject]@{ Home = $JavaHome; Major = $explicitMajor }
} else {
  $selectedJava = Find-CompatibleJavaHome
}
$androidSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$canBuildLocal = $null -ne $selectedJava -and (Test-Path $androidSdk)
if ($Mode -eq 'Auto') { $Mode = if ($canBuildLocal) { 'Local' } else { 'Cloud' } }

Push-Location $mobileRoot
try {
  if ($Mode -eq 'Local') {
    if (-not $selectedJava) {
      $studioJava = 'C:\Program Files\Android\Android Studio\jbr'
      $studioMajor = Get-JavaMajorVersion $studioJava
      $detail = if ($studioMajor) { " Android Studio currently provides JDK $studioMajor, which cannot run Gradle 8.10." } else { '' }
      throw "A compatible JDK was not found.$detail Install JDK 17 and rerun, or pass -JavaHome 'C:\path\to\jdk-17'."
    }
    if (-not (Test-Path $androidSdk)) { throw "Android SDK was not found at $androidSdk. Install it from Android Studio or set ANDROID_HOME." }
    $env:JAVA_HOME = $selectedJava.Home
    $env:Path = "$(Join-Path $selectedJava.Home 'bin');$env:Path"
    $env:ANDROID_HOME = $androidSdk
    # Expo's Metro config promotes its server root to the npm workspace root.
    # React Native Gradle passes an entry path relative to apps/mobile on Windows,
    # so native release bundling must retain the mobile project as Metro's root.
    $env:EXPO_NO_METRO_WORKSPACE_ROOT = '1'
    $env:NODE_ENV = 'production'
    Write-Host "Using JDK $($selectedJava.Major): $($selectedJava.Home)"
    Write-Host "Using Android SDK: $androidSdk"
    npx expo prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) { throw 'Expo prebuild failed.' }
    Push-Location (Join-Path $mobileRoot 'android')
    try {
      .\gradlew.bat :app:assembleRelease
      if ($LASTEXITCODE -ne 0) { throw 'Gradle APK build failed.' }
    } finally {
      Pop-Location
    }
    $sourceApk = Join-Path $mobileRoot 'android\app\build\outputs\apk\release\app-release.apk'
    $targetApk = Join-Path $artifactRoot 'novo-android.apk'
    Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force
    Write-Host "APK ready: $targetApk"
  } else {
    Write-Host 'Starting an EAS internal-distribution APK build. EAS will ask you to sign in if needed.'
    Write-Warning 'Cloud builds use the EXPO_PUBLIC_API_URL configured in the EAS preview environment. The -ApiUrl value is used by local builds and must match that EAS value.'
    npx eas-cli build --platform android --profile preview
    if ($LASTEXITCODE -ne 0) { throw 'EAS APK build failed.' }
  }
} finally {
  Pop-Location
}
