$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& "C:\Users\18059\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "$scriptDir\dist\bin\karen.js" @args
