#!/usr/bin/env bash
# Package an existing arm64 .app without changing it, then verify the exact ZIP.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Uso: $0 /caminho/ContentFlow.app /caminho/novo-pacote.zip" >&2
  exit 2
fi

source_app="$1"
output_zip="$2"
if [[ ! -d "$source_app" || "$(basename "$source_app")" != "ContentFlow.app" ]]; then
  echo "Origem deve ser ContentFlow.app existente." >&2
  exit 2
fi
if [[ -e "$output_zip" ]]; then
  echo "Destino já existe; release imutável não será sobrescrita." >&2
  exit 2
fi

output_dir="$(cd "$(dirname "$output_zip")" && pwd)"
output_zip="$output_dir/$(basename "$output_zip")"
staging="$(mktemp -d "$output_dir/.contentflow-package.XXXXXX")"
trap 'rm -rf "$staging"' EXIT

/usr/bin/ditto "$source_app" "$staging/ContentFlow.app"
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$staging/ContentFlow.app/Contents/Info.plist")"
if [[ "$bundle_id" != "com.contentflow.app" ]]; then
  echo "Bundle ID não corresponde ao ContentFlow." >&2
  exit 2
fi
architectures="$(/usr/bin/lipo -archs "$staging/ContentFlow.app/Contents/MacOS/ContentFlow")"
if [[ " $architectures " != *" arm64 "* ]]; then
  echo "Bundle não contém arquitetura arm64." >&2
  exit 2
fi

# electron-builder dir can leave an embedded linker signature without
# _CodeSignature/CodeResources. Sign the copy, never the installed app.
/usr/bin/codesign --force --deep --sign - "$staging/ContentFlow.app"
/usr/bin/codesign --verify --deep --strict "$staging/ContentFlow.app"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$staging/ContentFlow.app" "$output_zip"
/usr/bin/ditto -xk "$output_zip" "$staging/extracted"
/usr/bin/codesign --verify --deep --strict "$staging/extracted/ContentFlow.app"

echo "Versão: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$staging/extracted/ContentFlow.app/Contents/Info.plist")"
echo "Bytes: $(stat -f %z "$output_zip")"
/usr/bin/shasum -a 256 "$output_zip"
