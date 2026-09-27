# Cross-platform entry point. The original build-apk script remains the
# implementation and Android-compatible alias for existing developer commands.
& (Join-Path $PSScriptRoot 'build-apk.ps1') @args
exit $LASTEXITCODE
