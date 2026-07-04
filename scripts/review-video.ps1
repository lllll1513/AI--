param(
  [Parameter(Mandatory = $true)]
  [string]$VideoPath,

  [string]$OutputDir = "",

  [double]$SampleFps = 1,

  [double]$MotionSampleSeconds = 1,

  [double]$SceneThreshold = 0.28
)

$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $VideoPath -PathType Leaf)) {
  throw "Video file not found: $VideoPath"
}

$resolvedVideo = (Resolve-Path -LiteralPath $VideoPath).Path
$baseName = [IO.Path]::GetFileNameWithoutExtension($resolvedVideo)

if (!$OutputDir) {
  $OutputDir = Join-Path (Get-Location) ("video-review\" + $baseName)
}

$OutputDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDir)
$framesDir = Join-Path $OutputDir "sampled-frames"
$sceneDir = Join-Path $OutputDir "scene-frames"
$reportsDir = Join-Path $OutputDir "reports"
$sheetsDir = Join-Path $OutputDir "contact-sheets"

New-Item -ItemType Directory -Force -Path $framesDir, $sceneDir, $reportsDir, $sheetsDir | Out-Null

$metadataPath = Join-Path $reportsDir "metadata.json"
$motionPath = Join-Path $reportsDir "motion-report.json"

ffprobe -v error -print_format json -show_format -show_streams "$resolvedVideo" | Out-File -FilePath $metadataPath -Encoding utf8

ffmpeg -hide_banner -loglevel error -y -i "$resolvedVideo" -vf "fps=$SampleFps,scale=320:-1" (Join-Path $framesDir "frame_%05d.jpg") | Out-Null

ffmpeg -hide_banner -loglevel error -y -i "$resolvedVideo" -vf "select='gt(scene,$SceneThreshold)',scale=480:-1" -fps_mode vfr (Join-Path $sceneDir "scene_%05d.jpg") | Out-Null

python (Join-Path $PSScriptRoot "video-contact-sheet.py") "$framesDir" "$sheetsDir" 5 6 | Out-Null

python (Join-Path $PSScriptRoot "video-motion-report.py") "$resolvedVideo" "$motionPath" "$MotionSampleSeconds"

Write-Output "Video review created:"
Write-Output $OutputDir
Write-Output "Metadata: $metadataPath"
Write-Output "Motion report: $motionPath"
Write-Output "Contact sheets: $sheetsDir"
