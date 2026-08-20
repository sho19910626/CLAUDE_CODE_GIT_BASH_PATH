# note 収益化スタジオ セットアップ
#
# setup.bat から呼ばれます。直接開く必要はありません。
#
# やること:
#   1. 鍵を2つ聞く(形が違うものは受け付けない)
#   2. .env を正しい形で書く
#   3. npm install して起動する
#
# 手で .env を編集したり、複数行のコマンドを貼ったりする必要をなくすためのものです。

# npm は警告を標準エラーに書く。Stop にすると、その警告だけで止まってしまう。
# ここでは止めず、要所で Test-Path と $LASTEXITCODE を自分で確かめる。
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

function Line { Write-Host ("-" * 60) -ForegroundColor DarkGray }

Clear-Host
Line
Write-Host "  note 収益化スタジオ セットアップ" -ForegroundColor Cyan
Line
Write-Host ""

# ===== 0. 前提の確認 =====

if (-not (Test-Path "package.json")) {
    Write-Host "[エラー] このファイルは note-studio フォルダの中に置いてください。" -ForegroundColor Red
    Read-Host "Enter で閉じます"
    exit 1
}

try {
    $null = & npm --version 2>$null
} catch {
    Write-Host "[エラー] Node.js が入っていません。" -ForegroundColor Red
    Write-Host "  https://nodejs.org/ から LTS 版を入れてから、もう一度このファイルを実行してください。"
    Read-Host "Enter で閉じます"
    exit 1
}

# ===== 1. すでに設定済みなら聞き直さない =====

$needsSetup = $true
if (Test-Path ".env") {
    $current = Get-Content ".env" -ErrorAction SilentlyContinue
    $hasKey = $current | Where-Object { $_ -match "^ANTHROPIC_API_KEY=sk-ant-" }
    $hasDb  = $current | Where-Object { $_ -match "^DATABASE_URL=postgres" }
    if ($hasKey -and $hasDb) {
        Write-Host "設定ファイル(.env)は、すでに正しく入っています。" -ForegroundColor Green
        $again = Read-Host "入れ直しますか? (y / そのまま使うなら Enter)"
        if ($again -ne "y") { $needsSetup = $false }
    }
}

# ===== 2. 鍵を2つ聞く =====

if ($needsSetup) {
    Write-Host "2つの文字列が必要です。先にコピーしておいてください。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  (1) Anthropic の API キー" -ForegroundColor White
    Write-Host "      https://platform.claude.com/ -> API Keys -> Create Key"
    Write-Host "      sk-ant- で始まる、100文字くらいの文字列です" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  (2) Neon の接続文字列" -ForegroundColor White
    Write-Host "      Neon のプロジェクト画面 -> 右上の Connect"
    Write-Host "      postgresql:// で始まる、100文字くらいの文字列です" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  どちらも「自分で考えるパスワード」ではありません。" -ForegroundColor DarkGray
    Write-Host "  サイトからコピーしてくる長い文字列です。" -ForegroundColor DarkGray
    Write-Host ""
    Line

    # 貼り付けは右クリックでできる。形が違うものは弾いて聞き直す
    do {
        Write-Host ""
        $key = (Read-Host "(1) sk-ant- で始まる文字列を貼って Enter").Trim().Trim('"').Trim("'")
        if ($key -notlike "sk-ant-*") {
            Write-Host "  それは API キーではありません。sk-ant- で始まる文字列です。" -ForegroundColor Yellow
        } elseif ($key.Length -lt 40) {
            Write-Host "  短すぎます。途中で切れていないか確認してください。" -ForegroundColor Yellow
            $key = ""
        }
    } while ($key -notlike "sk-ant-*")

    do {
        Write-Host ""
        $db = (Read-Host "(2) postgresql:// で始まる文字列を貼って Enter").Trim().Trim('"').Trim("'")
        if ($db -notlike "postgres*://*") {
            Write-Host "  それは接続文字列ではありません。postgresql:// で始まる文字列です。" -ForegroundColor Yellow
        } elseif ($db -match "\*\*\*\*") {
            Write-Host "  パスワードが伏せ字(****)のままです。" -ForegroundColor Yellow
            Write-Host "  Neon の画面で Show password を押してからコピーし直してください。" -ForegroundColor Yellow
            $db = ""
        }
    } while ($db -notlike "postgres*://*")

    # ===== 3. 入口のパスワードを自動で作る =====
    # 自分で考えさせると、短いものや使い回しになりやすいので、こちらで作る

    $chars = "abcdefghijkmnpqrstuvwxyz23456789"
    $rand = -join (1..20 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
    $appPassword = "note-" + $rand

    # ===== 4. .env を書く =====
    # ascii で書くのは、先頭に BOM が付くと1行目が読めなくなるため

    @(
        "ANTHROPIC_API_KEY=$key",
        "APP_PASSWORD=$appPassword",
        "DATABASE_URL=$db"
    ) | Set-Content -Encoding ascii ".env"

    Write-Host ""
    Line
    Write-Host "  設定ファイルを作りました。" -ForegroundColor Green
    Line
    Write-Host ""
    Write-Host "  この画面のあと、ブラウザで最初の管理者を作ります。" -ForegroundColor White
    Write-Host "  そのとき「初期設定の合言葉」を聞かれます。答えはこれです:" -ForegroundColor White
    Write-Host ""
    Write-Host "      $appPassword" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  メモしてください(この画面を閉じても .env に残っています)。" -ForegroundColor DarkGray
    Write-Host ""
    Line
    Read-Host "メモしたら Enter を押してください"
}

# ===== 5. ポートの確認 =====

$busy = Get-NetTCPConnection -LocalPort 3003 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Write-Host ""
    Write-Host "[エラー] ポート 3003 がすでに使われています。" -ForegroundColor Red
    Write-Host "  別の黒い画面でこのアプリが動いたままです。" 
    Write-Host "  そちらを閉じてから、もう一度このファイルを実行してください。"
    Read-Host "Enter で閉じます"
    exit 1
}

# ===== 6. 部品を入れる =====

if (-not (Test-Path "node_modules")) {
    Write-Host ""
    Write-Host "部品を入れています。初回は1〜2分かかります..." -ForegroundColor Yellow
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[エラー] npm install に失敗しました。" -ForegroundColor Red
        Read-Host "Enter で閉じます"
        exit 1
    }
}

# ===== 7. 起動 =====

Write-Host ""
Line
Write-Host "  起動します。準備ができたらブラウザが開きます。" -ForegroundColor Green
Write-Host "  この画面は閉じないでください(閉じるとアプリが止まります)。" -ForegroundColor Yellow
Write-Host ""
Write-Host "  開かないときは、自分で開いてください: http://localhost:3003" -ForegroundColor DarkGray
Line
Write-Host ""

# 起動を待ってからブラウザを開く。裏で見張らせる
Start-Job -ScriptBlock {
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep -Seconds 2
        try {
            Invoke-WebRequest -Uri "http://localhost:3003/login" -UseBasicParsing -TimeoutSec 3 | Out-Null
            Start-Process "http://localhost:3003"
            break
        } catch { }
    }
} | Out-Null

& npm run dev

Write-Host ""
Write-Host "アプリが止まりました。" -ForegroundColor Yellow
Read-Host "Enter で閉じます"
