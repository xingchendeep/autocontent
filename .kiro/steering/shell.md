# Shell Environment

This project runs on **Windows with PowerShell**.

## Command Rules
- NEVER use `&&` to chain commands — PowerShell does not support it
- Always use `;` to chain multiple commands on one line
- Example: `git add .; git commit -m "msg"; git push`

## curl 注意事项
- PowerShell 中 `curl` 是 `Invoke-WebRequest` 的别名，不是 Linux 的 curl
- NEVER use Linux curl syntax like `curl -X OPTIONS url -i` — it will fail
- Always use `Invoke-WebRequest` with PowerShell syntax:
  ```powershell
  # GET request
  Invoke-WebRequest -Uri "https://example.com/api" -UseBasicParsing

  # POST with JSON body
  Invoke-WebRequest -Uri "https://example.com/api" -Method POST -ContentType "application/json" -Body '{"key":"value"}' -UseBasicParsing

  # OPTIONS preflight test
  Invoke-WebRequest -Uri "https://example.com/api" -Method OPTIONS -Headers @{"Origin"="https://test.com";"Access-Control-Request-Method"="POST"} -UseBasicParsing
  ```
