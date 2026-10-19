@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo 请先安装 Node.js 20.19+ 或 22.12+，然后重新打开此文件。
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo 正在安装首次运行所需的依赖，请保持联网……
  call npm ci
  if errorlevel 1 (
    echo 安装未完成。请检查网络后重试。
    pause
    exit /b 1
  )
)
echo 正在启动见微。浏览器将自动打开 http://127.0.0.1:5173/
echo 请保留此窗口。结束使用时按 Ctrl+C；关闭前记得导出 JSON 备份。
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "$targetUrl = 'http://127.0.0.1:5173/'; for ($attempt = 0; $attempt -lt 45; $attempt++) { try { $response = Invoke-WebRequest -Uri $targetUrl -UseBasicParsing -TimeoutSec 1; if ($response.StatusCode -eq 200 -and [System.Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()).Contains('货盘组现场研究助手')) { Start-Process $targetUrl; break } } catch {}; Start-Sleep -Seconds 1 }"
call npm run dev
if errorlevel 1 (
  echo 启动未成功。如果 5173 端口已占用，请先检查是否已有助手窗口正在运行。
  pause
)
