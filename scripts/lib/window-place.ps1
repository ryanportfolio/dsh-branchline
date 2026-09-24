<#
  Window placement helper for headed Chrome runs (see scripts/lib/launch-chrome.mjs).

  Modes:
    plan          emit JSON: current foreground hwnd + the working area of a monitor
                  that is NOT the one holding that window (falls back to the same
                  monitor when only one display is attached)
    focus <hwnd>  hand the foreground back to the window that had it before launch
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('plan', 'focus')][string]$Mode,
  [long]$Hwnd = 0
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -Name Win -Namespace Place -MemberDefinition @'
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
public struct RECT { public int Left, Top, Right, Bottom; }
'@

if ($Mode -eq 'focus') {
  [void][Place.Win]::SetForegroundWindow([System.IntPtr]$Hwnd)
  exit 0
}

$fg = [Place.Win]::GetForegroundWindow()
$rect = New-Object Place.Win+RECT
[void][Place.Win]::GetWindowRect($fg, [ref]$rect)
$centerX = [int](($rect.Left + $rect.Right) / 2)
$centerY = [int](($rect.Top + $rect.Bottom) / 2)

$screens = [System.Windows.Forms.Screen]::AllScreens
$current = $screens | Where-Object { $_.Bounds.Contains($centerX, $centerY) } | Select-Object -First 1
if (-not $current) { $current = [System.Windows.Forms.Screen]::PrimaryScreen }
$target = $screens | Where-Object { $_.DeviceName -ne $current.DeviceName } | Select-Object -First 1
$sameScreen = $false
if (-not $target) { $target = $current; $sameScreen = $true }

[pscustomobject]@{
  hwnd        = [long]$fg
  current     = $current.DeviceName
  target      = $target.DeviceName
  sameScreen  = $sameScreen
  x           = $target.WorkingArea.X
  y           = $target.WorkingArea.Y
  width       = $target.WorkingArea.Width
  height      = $target.WorkingArea.Height
} | ConvertTo-Json -Compress
