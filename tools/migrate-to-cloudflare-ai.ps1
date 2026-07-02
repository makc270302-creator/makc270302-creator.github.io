$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$nodeRoot = Join-Path $env:LOCALAPPDATA 'Programs\nodejs-portable'
$npx = Join-Path $nodeRoot 'npx.cmd'
$npm = Join-Path $nodeRoot 'npm.cmd'
$chunksFile = Join-Path $root '.ai-chunks.json'
$workerUrl = 'https://pdf-portal-ai.makc270302.workers.dev'
$indexName = 'pdf-portal-documents'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object Windows.Forms.Form
$form.Text = 'Migrate PDF portal to Cloudflare AI'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object Drawing.Size(620, 165)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

$label = New-Object Windows.Forms.Label
$label.Location = New-Object Drawing.Point(20, 18)
$label.Size = New-Object Drawing.Size(580, 35)
$label.Text = 'Paste a token with Workers Scripts Write and Vectorize Write permissions.'

$tokenBox = New-Object Windows.Forms.TextBox
$tokenBox.Location = New-Object Drawing.Point(20, 62)
$tokenBox.Size = New-Object Drawing.Size(580, 25)
$tokenBox.UseSystemPasswordChar = $true

$submit = New-Object Windows.Forms.Button
$submit.Location = New-Object Drawing.Point(450, 108)
$submit.Size = New-Object Drawing.Size(150, 32)
$submit.Text = 'Start migration'
$submit.DialogResult = [Windows.Forms.DialogResult]::OK

$form.AcceptButton = $submit
$form.Controls.AddRange(@($label, $tokenBox, $submit))
$form.Add_Shown({ $tokenBox.Focus() })

if ($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) {
  throw 'Migration was cancelled.'
}

$cloudflareToken = $tokenBox.Text.Trim()
if ([string]::IsNullOrWhiteSpace($cloudflareToken)) {
  throw 'The Cloudflare API token is empty.'
}

function Invoke-Wrangler {
  param([string[]]$Arguments)
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $npx --yes wrangler @Arguments | Out-Host
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorAction
  return $exitCode
}

$previousPath = $env:PATH
try {
  $env:PATH = "$nodeRoot;$env:PATH"
  $env:CLOUDFLARE_API_TOKEN = $cloudflareToken

  Write-Host '1/6 Building searchable PDF chunks...' -ForegroundColor Cyan
  & $npm run build:ai-chunks
  if ($LASTEXITCODE -ne 0) { throw 'PDF text extraction failed.' }
  $chunks = Get-Content -Raw -Encoding UTF8 -LiteralPath $chunksFile | ConvertFrom-Json
  Write-Host "Prepared chunks: $($chunks.Count)" -ForegroundColor Green

  Write-Host ''
  Write-Host '2/6 Creating or checking the Vectorize index...' -ForegroundColor Cyan
  $getExitCode = Invoke-Wrangler @('vectorize', 'get', $indexName, '--config', (Join-Path $root 'worker\wrangler.toml'))
  if ($getExitCode -ne 0) {
    $createExitCode = Invoke-Wrangler @(
      'vectorize', 'create', $indexName, '--dimensions=1024', '--metric=cosine',
      '--config', (Join-Path $root 'worker\wrangler.toml')
    )
    if ($createExitCode -ne 0) {
      throw 'Could not create the Vectorize index. Check that the token has Vectorize Write permission.'
    }
  }

  $secretBytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($secretBytes)
  $rng.Dispose()
  $indexSecret = [Convert]::ToBase64String($secretBytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')

  Write-Host ''
  Write-Host '3/6 Saving the private indexing secret...' -ForegroundColor Cyan
  $indexSecret | & $npx --yes wrangler secret put INDEX_SECRET --config (Join-Path $root 'worker\wrangler.toml')
  if ($LASTEXITCODE -ne 0) { throw 'Could not save the indexing secret.' }

  Write-Host ''
  Write-Host '4/6 Deploying the Cloudflare AI Worker...' -ForegroundColor Cyan
  $deployExitCode = Invoke-Wrangler @('deploy', '--config', (Join-Path $root 'worker\wrangler.toml'))
  if ($deployExitCode -ne 0) { throw 'Worker deployment failed.' }

  Write-Host ''
  Write-Host '5/6 Uploading chunks to Vectorize...' -ForegroundColor Cyan
  $batchSize = 10
  for ($offset = 0; $offset -lt $chunks.Count; $offset += $batchSize) {
    $last = [Math]::Min($offset + $batchSize - 1, $chunks.Count - 1)
    $batch = @($chunks[$offset..$last])
    $body = @{ chunks = $batch } | ConvertTo-Json -Depth 8 -Compress
    $response = Invoke-RestMethod -Uri "$workerUrl/admin/index" -Method Post `
      -Headers @{ Authorization = "Bearer $indexSecret" } `
      -ContentType 'application/json; charset=utf-8' `
      -Body ([Text.Encoding]::UTF8.GetBytes($body)) `
      -TimeoutSec 120
    Write-Progress -Activity 'Indexing PDF chunks' -Status "$($last + 1) / $($chunks.Count)" `
      -PercentComplete ((($last + 1) / $chunks.Count) * 100)
  }
  Write-Progress -Activity 'Indexing PDF chunks' -Completed

  Write-Host ''
  Write-Host '6/6 Verifying the service...' -ForegroundColor Cyan
  Start-Sleep -Seconds 15
  $health = Invoke-RestMethod -Uri "$workerUrl/health" -TimeoutSec 30
  if (-not $health.configured -or $health.provider -ne 'cloudflare-workers-ai') {
    throw 'The Worker health check did not confirm Cloudflare AI.'
  }

  Write-Host ''
  Write-Host "Migration complete. Indexed chunks: $($chunks.Count)" -ForegroundColor Green
  Write-Host "Worker: $workerUrl" -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Keep this window open and report the error text.' -ForegroundColor Yellow
} finally {
  $env:CLOUDFLARE_API_TOKEN = $null
  $env:PATH = $previousPath
  $cloudflareToken = $null
  $indexSecret = $null
}
