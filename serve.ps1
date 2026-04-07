$port = 3000
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://localhost:' + $port + '/')
$listener.Start()

Write-Host ''
Write-Host '  Billing App DR Simulator' -ForegroundColor Green
Write-Host '  ------------------------' -ForegroundColor DarkGray
Write-Host ('  Local:  http://localhost:' + $port) -ForegroundColor Cyan
Write-Host ''
Write-Host '  Press Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''

$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
}

# Open browser automatically
Start-Process ('http://localhost:' + $port)

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response

  $urlPath = $req.Url.LocalPath
  if ($urlPath -eq '/' -or $urlPath -eq '') { $urlPath = '/index.html' }

  $filePath = Join-Path $root ($urlPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar))

  if (Test-Path $filePath -PathType Leaf) {
    $ext  = [System.IO.Path]::GetExtension($filePath).ToLower()
    $mime = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $res.ContentType     = $mime
    $res.ContentLength64 = $bytes.Length
    $res.StatusCode      = 200
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    Write-Host ('  200  ' + $urlPath) -ForegroundColor DarkGray
  } else {
    $body = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found: ' + $urlPath)
    $res.StatusCode      = 404
    $res.ContentType     = 'text/plain'
    $res.ContentLength64 = $body.Length
    $res.OutputStream.Write($body, 0, $body.Length)
    Write-Host ('  404  ' + $urlPath) -ForegroundColor Red
  }
  $res.OutputStream.Close()
}
