#!/bin/zsh
# ContentFlow OS — monitor operacional do Norte Magnata.
# Não exibe nem lê chaves de API.

set -u

APP_PATH="/Users/viniciusduran/Applications/ContentFlow OS.app"
CHANNEL_NAME="Norte Magnata"

if ! pgrep -f "ContentFlow OS.app/Contents/MacOS/ContentFlow OS" >/dev/null 2>&1; then
  open "$APP_PATH"
  sleep 4
fi

api_port() {
  local pid port
  for pid in $(pgrep -f "ContentFlow OS.app/Contents/MacOS/ContentFlow OS" 2>/dev/null); do
    for port in $(lsof -nP -a -p "$pid" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {sub(/.*:/, "", $9); print $9}'); do
      if curl --silent --fail --max-time 1 "http://127.0.0.1:${port}/api/channels" >/dev/null 2>&1; then
        print -r -- "$port"
        return 0
      fi
    done
  done
  return 1
}

while true; do
  clear
  print "ContentFlow OS — Norte Magnata"
  print "$(date)"
  print ""

  PORT="$(api_port || true)"
  if [[ -z "$PORT" ]]; then
    print "O ContentFlow está abrindo. Aguarde alguns segundos..."
    sleep 3
    continue
  fi

  curl --silent --fail "http://127.0.0.1:${PORT}/api/channels" | \
    /usr/bin/python3 -c '
import json, sys
channels = json.load(sys.stdin)
channel = next((x for x in channels if x.get("name") == "Norte Magnata"), None)
if not channel:
    print("Canal Norte Magnata não encontrado no ContentFlow.")
    raise SystemExit(0)
print("CANAL:", channel.get("name"))
print("PROJETOS ATIVOS:", channel.get("activeProjects", 0))
for process in ("theme", "title", "thumbnail", "script", "narration", "assets", "editing", "publishing"):
    blocks = (channel.get("methods", {}).get(process, {}) or {}).get("blocks", [])
    print(f"{process:12} método: {len(blocks)} bloco(s)")
'

  print ""
  curl --silent --fail "http://127.0.0.1:${PORT}/api/projects" | \
    /usr/bin/python3 -c '
import json, sys
for project in json.load(sys.stdin):
    if project.get("channelId") and "ATUAL" in str(project.get("title", "")):
        print("PROJETO:", project.get("title"))
        print("ETAPA ATUAL:", project.get("currentStage"))
        print("STATUS:", project.get("state"))
        print("PROGRESSO:", str(project.get("progress", 0)) + "%")
        break
'
  print ""
  print "Atualização automática a cada 5 segundos. Ctrl+C para encerrar o monitor."
  sleep 5
done
