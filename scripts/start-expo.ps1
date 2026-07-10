$env:Path = "C:\Users\jvesp\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;" + $env:Path
$env:EXPO_NO_TELEMETRY = "1"
$env:EXPO_HOME = "C:\Users\jvesp\Documents\Laundry shop app\.expo-home"
$env:LOCALAPPDATA = "C:\Users\jvesp\Documents\Laundry shop app\.expo-local"
$env:APPDATA = "C:\Users\jvesp\Documents\Laundry shop app\.expo-local"
$env:USERPROFILE = "C:\Users\jvesp\Documents\Laundry shop app\.expo-user"
$env:DOTSLASH_CACHE = "C:\Users\jvesp\Documents\Laundry shop app\.expo-cache"

Set-Location "C:\Users\jvesp\Documents\Laundry shop app"
.\node_modules\.bin\expo.CMD start --localhost --port 8081 *> expo-server.log
