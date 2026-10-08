# Собирает подписанный release AAB через общий тулчейн и ключ конкретного
# проекта. Запускать из корня проекта:
#
#   powershell -File tools/build-release.ps1 -ProjectSlug myapp
#
# Перед запуском: иконка в release/creo/icon.png (если уже готова) прописана
# в app.json, `npx expo prebuild --platform android` выполнен.
#
# Ключ создаётся автоматически при первом запуске через общий скрипт
# E:\Programering\APPs\.android-signing\setup-project-keystore.ps1 — один
# keystore на приложение, хранится там же (не внутри проекта).

param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectSlug
)

$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "E:\Programering\dev-deps\jdk"
$env:ANDROID_HOME = "E:\Programering\dev-deps\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = "E:\Programering\dev-deps\gradle"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

$root = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $root "android"
$signingRoot = "E:\Programering\APPs\.android-signing"

if (-not (Test-Path "$androidDir\app\build.gradle")) {
  Write-Error "Не найден $androidDir\app\build.gradle — сначала запусти: npx expo prebuild --platform android"
}

if (-not (Test-Path (Join-Path $androidDir "keystore.properties"))) {
  Write-Host "Ключ для '$ProjectSlug' не настроен — создаю через setup-project-keystore.ps1..."
  powershell -File (Join-Path $signingRoot "setup-project-keystore.ps1") `
    -ProjectSlug $ProjectSlug -AndroidDir $androidDir
  # Дочерний процесс может тихо не долететь (напр. keytool пишет прогресс в
  # stderr, что PowerShell 5.1 иногда трактует как non-terminating ошибку) —
  # без явной проверки exit code сборка молча продолжится и соберёт AAB с
  # debug-подписью, которую Google Play не примет.
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $androidDir "keystore.properties"))) {
    Write-Error "setup-project-keystore.ps1 не создал keystore.properties — сборка остановлена, подпись была бы debug."
  }
}

Write-Host "Building signed AAB ($ProjectSlug)..."
Push-Location $androidDir
try {
  # НЕ вызывать `gradlew clean` — ломает codegen (см. Apexify_Android_шпаргалка.txt §4).
  & .\gradlew.bat bundleRelease
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  $aab = "app\build\outputs\bundle\release\app-release.aab"
  if (Test-Path $aab) {
    $releaseDir = Join-Path $root "release"
    New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
    $out = Join-Path $releaseDir "app-release.aab"
    Copy-Item $aab $out -Force

    # Google Play отклонит AAB, подписанный debug-ключом. Проверяем сразу —
    # это ровно тот сбой, который однажды прошёл незамеченным до сборки.
    $sig = & "$env:JAVA_HOME\bin\jarsigner.exe" -verify -verbose -certs $out 2>&1 | Out-String
    if ($sig -match "CN=Android Debug") {
      Write-Error "AAB подписан debug-ключом, не release! Проверь android/keystore.properties и signingConfigs.release в build.gradle."
    }

    Write-Host ""
    Write-Host "AAB готов и подписан release-ключом: $out" -ForegroundColor Green
  } else {
    Write-Error "Сборка прошла, но $aab не найден."
  }
} finally {
  Pop-Location
}
