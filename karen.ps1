$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node "$scriptDir\dist\bin\karen.js" @args
