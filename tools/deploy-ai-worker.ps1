$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$nodeRoot = Join-Path $env:LOCALAPPDATA 'Programs\nodejs-portable'
$npx = Join-Path $nodeRoot 'npx.cmd'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object Windows.Forms.Form
$form.Text = 'Deploy PDF portal AI Worker'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object Drawing.Size(620, 165)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

$label = New-Object Windows.Forms.Label
$label.Location = New-Object Drawing.Point(20, 18)
$label.Size = New-Object Drawing.Size(580, 35)
$label.Text = 'Paste the Cloudflare token. It is used only in this process memory.'

$tokenBox = New-Object Windows.Forms.TextBox
$tokenBox.Location = New-Object Drawing.Point(20, 62)
$tokenBox.Size = New-Object Drawing.Size(580, 25)
$tokenBox.UseSystemPasswordChar = $true

$submit = New-Object Windows.Forms.Button
$submit.Location = New-Object Drawing.Point(470, 108)
$submit.Size = New-Object Drawing.Size(130, 32)
$submit.Text = 'Deploy'
$submit.DialogResult = [Windows.Forms.DialogResult]::OK

$form.AcceptButton = $submit
$form.Controls.AddRange(@($label, $tokenBox, $submit))
$form.Add_Shown({ $tokenBox.Focus() })

if ($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { throw 'Deployment was cancelled.' }
$token = $tokenBox.Text.Trim()
if ([string]::IsNullOrWhiteSpace($token)) { throw 'The Cloudflare token is empty.' }

$previousPath = $env:PATH
try {
  $env:PATH = "$nodeRoot;$env:PATH"
  $env:CLOUDFLARE_API_TOKEN = $token
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $npx --yes wrangler deploy --config (Join-Path $root 'worker\wrangler.toml') | Out-Host
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorAction
  if ($exitCode -ne 0) { throw "Deployment failed with exit code $exitCode." }
  Write-Host 'Deployment complete. Return to Codex.' -ForegroundColor Green
} catch {
  Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
} finally {
  $env:CLOUDFLARE_API_TOKEN = $null
  $env:PATH = $previousPath
  $token = $null
}
