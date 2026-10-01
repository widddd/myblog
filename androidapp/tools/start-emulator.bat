@echo off
REM ============================================================
REM  SmartBlog 开发用模拟器：启动（或复用已在跑的）+ 装最新 debug 包 + 拉起 App
REM
REM  用法：双击本文件；或在终端里跑 androidapp\tools\start-emulator.bat
REM  关闭：直接关模拟器窗口；或在终端里跑 adb -s emulator-5554 emu kill
REM
REM  ?? 本文件必须是 **CRLF 换行 + ANSI/GBK 编码**：
REM     cmd.exe 按系统代码页读 .bat，UTF-8 存会让中文串吞掉后面的字符、脚本直接崩。
REM
REM  换机器时改这几行：EMU / ADB 是 Android SDK 路径，AVD 是虚拟设备名
REM ============================================================
setlocal
set "EMU=D:\AndroidSDK\emulator\emulator.exe"
set "ADB=D:\AndroidSDK\platform-tools\adb.exe"
set "AVD=myblog_test"
set "APK=%~dp0..\app\build\outputs\apk\debug\app-debug.apk"
set "ACT=com.smartblog.app/.MainActivity"

if not exist "%EMU%" goto :noemu

set "SERIAL="
for /f "tokens=1" %%d in ('%ADB% devices 2^>nul ^| findstr /r "^emulator-"') do set "SERIAL=%%d"

if not "%SERIAL%"=="" goto :running
echo [1/3] 启动模拟器 %AVD% ...
start "myblog-emulator" "%EMU%" -avd %AVD% -no-boot-anim -no-audio
goto :waitboot

:running
echo [1/3] 模拟器 %SERIAL% 已经在跑，跳过启动。

:waitboot
echo [2/3] 等待开机完成（冷启动约 30-60 秒，别关这个窗口）...
"%ADB%" wait-for-device
if not "%SERIAL%"=="" goto :bootloop
for /f "tokens=1" %%d in ('%ADB% devices 2^>nul ^| findstr /r "^emulator-"') do set "SERIAL=%%d"

:bootloop
"%ADB%" -s %SERIAL% shell getprop sys.boot_completed 2>nul | findstr /r "^1" >nul
if errorlevel 1 (
  timeout /t 3 /nobreak >nul
  goto :bootloop
)
echo       开机完成。

if not exist "%APK%" goto :noapk
echo [3/3] 安装并启动 SmartBlog ...
"%ADB%" -s %SERIAL% install -r "%APK%" | findstr /r "Success Failure"
"%ADB%" -s %SERIAL% shell am start -n %ACT% >nul
goto :tips

:noapk
echo [3/3] 跳过安装：还没有 debug 包。
echo       先在 androidapp 目录跑：gradlew.bat :app:assembleDebug
goto :tips

:tips
echo.
echo 后续提示：
echo   * 看应用列表 = 在模拟器主屏幕上从底部向上滑（或先按 Home 键再上滑）
echo   * App 叫 SmartBlog，蓝色「和自己对话」气泡图标
echo   * 首次打开要填站点地址，模拟器里填 http://10.0.2.2:3000
echo     （10.0.2.2 是模拟器约定的「宿主机」地址，不是 127.0.0.1）
endlocal
exit /b 0

:noemu
echo [x] 找不到模拟器：%EMU%
echo     确认 SDK 装在那里，或改本文件顶部的 EMU。
pause
endlocal
exit /b 1