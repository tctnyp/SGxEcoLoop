param(
  [Parameter(Position = 0)]
  [ValidateSet('Development', 'Beta', 'Production')]
  [string]$Environment = 'Development',

  [Parameter(Position = 1)]
  [ValidateSet('Auto', 'Local', 'Cloud')]
  [string]$Mode = 'Auto',

  [ValidateSet('Android', 'iOS', 'All')]
  [string]$Platform = 'Android',

  [string]$ApiUrl,
  [int]$ServerPort = 4000,
  [string]$JavaHome = $env:NOVO_JAVA_HOME,
  [switch]$SkipServerCheck,
  [switch]$VerifyOnly,
  [switch]$ShowConfig
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $repoRoot 'apps\mobile'
$artifactRoot = Join-Path $repoRoot 'artifacts'
$productionApiUrl = 'https://novo.tancheetiong.com/api'
$betaApiUrl = 'https://novodev.tancheetiong.com/api'

function Get-PrivateAddressRank([string]$Address) {
  if ($Address -match '^192\.168\.') { return 0 }
  if ($Address -match '^10\.') { return 1 }
  if ($Address -match '^172\.(1[6-9]|2\d|3[01])\.') { return 2 }
  return 10
}

function Get-CurrentLanAddress {
  $candidates = foreach ($adapter in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($adapter.OperationalStatus -ne [System.Net.NetworkInformation.OperationalStatus]::Up) { continue }
    $adapterName = "$($adapter.Name) $($adapter.Description)"
    if ($adapterName -match 'Loopback|Bluetooth|Virtual|Hyper-V|VMware|VirtualBox|WSL|Tailscale|VPN') { continue }

    $properties = $adapter.GetIPProperties()
    $hasGateway = @($properties.GatewayAddresses | Where-Object { $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork }).Count -gt 0
    foreach ($address in $properties.UnicastAddresses) {
      if ($address.Address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { continue }
      $ip = [string]$address.Address
      if (-not $ip -or $ip -match '^(127\.|169\.254\.)') { continue }
      [pscustomobject]@{
        Address = $ip
        PrivateRank = Get-PrivateAddressRank $ip
        HasGateway = if ($hasGateway) { 0 } else { 1 }
        AdapterRank = if ($adapterName -match 'Wi-?Fi|Wireless|WLAN') { 0 } elseif ($adapterName -match 'Ethernet') { 1 } else { 2 }
        Interface = $adapter.Name
      }
    }
  }

  $selected = $candidates |
    Where-Object { $_.PrivateRank -lt 10 } |
    Sort-Object HasGateway, AdapterRank, PrivateRank, Interface |
    Select-Object -First 1

  if (-not $selected) {
    throw 'No active private Wi-Fi or Ethernet IPv4 address was found. Connect this computer and phone to the same network, or pass -ApiUrl explicitly.'
  }
  return $selected
}

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

function Get-Sha256Hash([string]$FilePath) {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($FilePath)
  try {
    return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
  } finally {
    $stream.Dispose()
    $sha256.Dispose()
  }
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

$environmentName = $Environment.ToLowerInvariant()
$detectedNetwork = $null
if (-not $ApiUrl) {
  switch ($Environment) {
    'Production' { $ApiUrl = $productionApiUrl }
    'Beta' { $ApiUrl = $betaApiUrl }
    default {
      $detectedNetwork = Get-CurrentLanAddress
      $ApiUrl = "http://$($detectedNetwork.Address):$ServerPort/api"
    }
  }
}

$ApiUrl = $ApiUrl.TrimEnd('/')
if ($ApiUrl -notmatch '^https?://[^\s]+/api$') {
  throw "Invalid API URL '$ApiUrl'. Expected an HTTP(S) URL ending in /api."
}
if ($Environment -in @('Beta', 'Production') -and $ApiUrl -notmatch '^https://') {
  throw "$Environment builds require an HTTPS API URL."
}

$env:NOVO_BUILD_ENV = $environmentName
$env:EXPO_PUBLIC_API_URL = $ApiUrl

$buildAndroid = $Platform -in @('Android', 'All')
$buildIos = $Platform -in @('iOS', 'All')
$androidMode = if ($Mode -eq 'Auto') { if ($Environment -in @('Development', 'Beta')) { 'Local' } else { 'Cloud' } } else { $Mode }
$iosMode = if ($Mode -eq 'Auto') { 'Cloud' } else { $Mode }
if ($buildIos -and $iosMode -eq 'Local') {
  throw 'Local iOS app packaging requires macOS and Xcode. From Windows, use -Mode Cloud (or Auto) so EAS can create the installable iOS build.'
}
if ($buildAndroid -and $Environment -eq 'Development' -and $androidMode -eq 'Cloud') {
  throw 'Development Android builds use this computer''s current LAN address and must be built locally. Use -Mode Local or Auto for Android.'
}

Write-Host "Build environment: $environmentName"
Write-Host "App title: $(if ($Environment -eq 'Development') { 'novo Development' } elseif ($Environment -eq 'Beta') { 'novo Beta' } else { 'novo' })"
Write-Host "Embedded API URL: $ApiUrl"
Write-Host "Requested platform: $($Platform.ToLowerInvariant())"
if ($buildAndroid) { Write-Host "Android builder: $($androidMode.ToLowerInvariant())" }
if ($buildAndroid) { Write-Host "Android signing: $(if ($androidMode -eq 'Local') { 'local development key' } else { 'EAS distribution credentials' })" }
if ($buildIos) { Write-Host "iOS builder: $($iosMode.ToLowerInvariant())" }
if ($detectedNetwork) { Write-Host "Detected adapter: $($detectedNetwork.Interface) ($($detectedNetwork.Address))" }

if ($ShowConfig) { exit 0 }

$androidSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if ($Environment -eq 'Development' -and -not $SkipServerCheck) {
  $serverIsListening = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
    Where-Object { $_.Port -eq $ServerPort } |
    Select-Object -First 1
  if (-not $serverIsListening) {
    throw "The development API is not running on port $ServerPort. Start it in another terminal with 'npm run start:server', leave that terminal open, and build again."
  }

  try {
    $health = Invoke-RestMethod -Method Get -Uri "$ApiUrl/health" -TimeoutSec 5
    if (-not $health.ok) { throw 'The health endpoint did not return ok=true.' }
    Write-Host "Development API health check: reachable ($ApiUrl/health)"
  } catch {
    throw "The development API is listening locally but cannot be reached through $ApiUrl. Check the selected network adapter and Windows Firewall, or pass -ApiUrl explicitly. $($_.Exception.Message)"
  }

  $adbExe = Join-Path $androidSdk 'platform-tools\adb.exe'
  if ($buildAndroid -and (Test-Path -LiteralPath $adbExe)) {
    $physicalDevices = foreach ($line in (& $adbExe devices 2>$null)) {
      if ($line -match '^([^\s]+)\s+device$' -and $Matches[1] -notmatch '^emulator-') { $Matches[1] }
    }
    foreach ($serial in $physicalDevices) {
      $curlPath = (& $adbExe -s $serial shell 'command -v curl' 2>$null | Select-Object -First 1)
      if (-not $curlPath) {
        Write-Warning "Android device $serial is connected, but it does not provide curl; device-side API verification was skipped."
        continue
      }
      $deviceHealth = & $adbExe -s $serial shell curl --silent --show-error --connect-timeout 5 --max-time 8 "$ApiUrl/health" 2>&1
      $deviceHealthText = $deviceHealth -join "`n"
      if ($LASTEXITCODE -ne 0 -or $deviceHealthText -notmatch '"ok"\s*:\s*true') {
        throw "Android device $serial cannot reach $ApiUrl. Confirm that the phone is on the same Wi-Fi, disable client isolation, and allow Node.js or TCP port $ServerPort through Windows Firewall. Device response: $deviceHealthText"
      }
      Write-Host "Android device health check: reachable from $serial"
    }
  }
}

if ($VerifyOnly) {
  Write-Host 'Development connectivity verification completed; no mobile artifact was built.'
  exit 0
}

$selectedJava = $null
if ($buildAndroid -and $androidMode -eq 'Local' -and $JavaHome) {
  $explicitMajor = Get-JavaMajorVersion $JavaHome
  if ($null -eq $explicitMajor) { throw "No Java executable was found under -JavaHome '$JavaHome'." }
  if ($explicitMajor -lt 17 -or $explicitMajor -gt 23) { throw "JDK $explicitMajor at '$JavaHome' is incompatible with Gradle 8.10. Install JDK 17, then pass -JavaHome 'C:\path\to\jdk-17'." }
  $selectedJava = [pscustomobject]@{ Home = $JavaHome; Major = $explicitMajor }
} elseif ($buildAndroid -and $androidMode -eq 'Local') {
  $selectedJava = Find-CompatibleJavaHome
}

New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
Push-Location $mobileRoot
try {
  if ($buildAndroid -and $androidMode -eq 'Local') {
    if (-not $selectedJava) {
      $studioJava = 'C:\Program Files\Android\Android Studio\jbr'
      $studioMajor = Get-JavaMajorVersion $studioJava
      $detail = if ($studioMajor) { " Android Studio currently provides JDK $studioMajor, which cannot run Gradle 8.10." } else { '' }
      throw "A compatible JDK was not found.$detail Install JDK 17 and rerun, or pass -JavaHome 'C:\path\to\jdk-17'."
    }
    if (-not (Test-Path -LiteralPath $androidSdk)) { throw "Android SDK was not found at $androidSdk. Install it from Android Studio or set ANDROID_HOME." }

    $env:JAVA_HOME = $selectedJava.Home
    $env:Path = "$(Join-Path $selectedJava.Home 'bin');$env:Path"
    $env:ANDROID_HOME = $androidSdk
    $env:EXPO_NO_METRO_WORKSPACE_ROOT = '1'
    $env:NODE_ENV = 'production'

    # Do not inherit a machine-wide GRADLE_USER_HOME such as C:\.gradle. That
    # location commonly requires administrator access and makes local builds
    # fail before Gradle can download its wrapper. Keep the cache in the
    # current Windows user's local application data instead.
    $gradleUserHome = Join-Path $env:LOCALAPPDATA 'Novo\Gradle'
    New-Item -ItemType Directory -Force -Path $gradleUserHome | Out-Null
    $env:GRADLE_USER_HOME = $gradleUserHome

    Write-Host 'Builder: local Android toolchain'
    Write-Host "Using JDK $($selectedJava.Major): $($selectedJava.Home)"
    Write-Host "Using Android SDK: $androidSdk"
    Write-Host "Using Gradle cache: $gradleUserHome"
    if ($Environment -eq 'Production') {
      Write-Warning "This local $environmentName APK may use the generated local signing configuration. Use Auto or -Mode Cloud for an EAS-signed distribution APK."
    }
    # The native directory is generated output (and is ignored by Git). A clean
    # prebuild prevents an interrupted previous run from poisoning the next APK.
    $npxCommand = (Get-Command npx.cmd -ErrorAction Stop).Source
    & $npxCommand expo prebuild --platform android --no-install --clean
    $prebuildExitCode = $LASTEXITCODE
    $gradleWrapper = Join-Path $mobileRoot 'android\gradlew.bat'
    if ($prebuildExitCode -ne 0 -or -not (Test-Path -LiteralPath $gradleWrapper)) {
      throw "Expo prebuild failed with exit code $prebuildExitCode."
    }
    $buildStartedAt = Get-Date
    Push-Location (Join-Path $mobileRoot 'android')
    try {
      # Expo public environment variables are compiled into the JavaScript bundle.
      # A plain assembleRelease can reuse a bundle from a previous target because
      # Gradle does not track those shell variables as task inputs.
      # A one-shot daemon prevents Java from carrying a transient negative DNS
      # cache into the next build attempt while still reusing Gradle's files.
      .\gradlew.bat :app:clean :app:assembleRelease --no-build-cache --no-daemon
      if ($LASTEXITCODE -ne 0) { throw 'Gradle APK build failed.' }
    } finally {
      Pop-Location
    }

    $sourceApk = Join-Path $mobileRoot 'android\app\build\outputs\apk\release\app-release.apk'
    if (-not (Test-Path -LiteralPath $sourceApk)) { throw "Gradle completed but no APK was found at $sourceApk." }
    $sourceItem = Get-Item -LiteralPath $sourceApk
    if ($sourceItem.LastWriteTimeUtc -lt $buildStartedAt.ToUniversalTime().AddMinutes(-1)) {
      throw "Gradle returned a stale APK dated $($sourceItem.LastWriteTime). The artifact was not copied."
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $apkArchive = [System.IO.Compression.ZipFile]::OpenRead($sourceApk)
    try {
      $bundleEntry = $apkArchive.GetEntry('assets/index.android.bundle')
      if (-not $bundleEntry) { throw 'The release APK does not contain assets/index.android.bundle.' }
      $bundleReader = New-Object System.IO.StreamReader($bundleEntry.Open())
      try { $bundleText = $bundleReader.ReadToEnd() } finally { $bundleReader.Dispose() }
      if (-not $bundleText.Contains($ApiUrl)) {
        throw "The release APK does not contain the selected API URL $ApiUrl. The artifact was not copied."
      }
      Write-Host "Embedded API verified: $ApiUrl"
    } finally {
      $apkArchive.Dispose()
    }
    $targetApk = Join-Path $artifactRoot "novo-$environmentName.apk"
    Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force
    $sourceHash = Get-Sha256Hash $sourceApk
    $targetHash = Get-Sha256Hash $targetApk
    if ($sourceHash -ne $targetHash) { throw 'The copied APK failed SHA-256 verification.' }
    Write-Host "APK ready: $targetApk"
    Write-Host "Built: $($sourceItem.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host "SHA-256: $targetHash"
  } elseif ($buildAndroid) {
    Write-Host 'Builder: EAS cloud'
    $androidProfile = if ($Environment -eq 'Production') { 'production-apk' } elseif ($Environment -eq 'Beta') { 'beta-android' } else { 'development-android' }
    Write-Host "Starting a signed Android internal-distribution build with profile $androidProfile. EAS may ask you to sign in."
    npx eas-cli build --platform android --profile $androidProfile
    if ($LASTEXITCODE -ne 0) { throw 'EAS APK build failed.' }
  }

  if ($buildIos) {
    $iosProfile = if ($Environment -eq 'Production') { 'production-ios' } elseif ($Environment -eq 'Beta') { 'beta-ios' } else { 'development-ios' }
    Write-Host 'Builder: EAS cloud for iOS'
    Write-Host "Starting an installable iOS internal-distribution build with profile $iosProfile. Apple Developer credentials and registered test devices may be required."
    npx eas-cli build --platform ios --profile $iosProfile
    if ($LASTEXITCODE -ne 0) { throw 'EAS iOS build failed.' }
  }
} finally {
  Pop-Location
}
