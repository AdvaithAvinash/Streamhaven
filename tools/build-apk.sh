#!/usr/bin/env bash
# Builds dist/Streamhaven.apk (Android / Android TV) without Gradle.
# Needs: JDK 8+, aapt, zipalign, apksigner, an android.jar (API 21+) and the dx jar.
#   Ubuntu/Debian: apt-get install aapt apksigner zipalign libandroid-23-java dalvik-exchange
# Signs with android/debug.keystore (a DEBUG key, password "android"). For a release build set
# KEYSTORE, KS_PASS and KEY_ALIAS to your own key.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${OUT:-$ROOT/dist}; W=$(mktemp -d); mkdir -p "$OUT"
trap 'rm -rf "$W"' EXIT
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
DX_JAR=${DX_JAR:-/usr/share/java/com.android.dx.jar}
KEYSTORE=${KEYSTORE:-$ROOT/android/debug.keystore}; KS_PASS=${KS_PASS:-android}; KEY_ALIAS=${KEY_ALIAS:-streamhaven}

if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Streamhaven Debug,O=Streamhaven" 2>/dev/null
fi

"$ROOT/tools/stage-web.sh" "$W/assets/www"

mkdir -p "$W/classes"
javac -nowarn --release 8 -cp "$ANDROID_JAR" -d "$W/classes" $(find "$ROOT/android/src" -name '*.java') 2>&1 | grep -v "^Note:\|Picked up\|warning: \[options\]" || true
(cd "$W" && java -cp "$DX_JAR" com.android.dx.command.Main --dex --output="$W/classes.dex" "$W/classes" 2>&1 | grep -v "Picked up" || true)

aapt package -f -M "$ROOT/android/AndroidManifest.xml" -S "$ROOT/android/res" -A "$W/assets" -I "$ANDROID_JAR" -F "$W/base.apk"
(cd "$W" && aapt add base.apk classes.dex >/dev/null)
zipalign -f -p 4 "$W/base.apk" "$W/aligned.apk"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --ks-key-alias "$KEY_ALIAS" --out "$OUT/Streamhaven.apk" "$W/aligned.apk"
apksigner verify --verbose "$OUT/Streamhaven.apk" | head -4
echo "APK written to $OUT/Streamhaven.apk"
