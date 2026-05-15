@echo off
echo Building...
call npm run build
if %ERRORLEVEL% neq 0 (
  echo Build failed!
  pause
  exit /b 1
)
echo Pushing to GitHub...
git add -A
git commit -m "update"
git push
echo Done! Vercel will update in ~1 minute.
pause
