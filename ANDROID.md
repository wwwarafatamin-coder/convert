# Build the Android APK with GitHub (no Android Studio needed)

1. In Lovable, click **Publish** so the website is live.
2. Connect the project to GitHub: **+ menu → GitHub → Connect project → Create Repository**.
3. Open the repository on GitHub → **Actions** tab → enable workflows if asked.
4. Pick **Build Android APK** → **Run workflow** (it also runs automatically on every change).
5. Wait ~10 minutes until the run shows a green check.
6. Open the run → **Artifacts** → download **3gp-converter-apk** and unzip it.
7. Copy `app-debug.apk` to your phone, open it, allow "Install unknown apps", and install.

## Updating
- Website changes: just click **Publish** in Lovable — the app shows them next time it opens.
- Icon/name/native engine changes: GitHub rebuilds the APK automatically; install the new one over the old.

## If the build fails at the video engine download
In `plugins/native-ffmpeg/android/build.gradle`, swap the `com.arthenica:ffmpeg-kit-full` line for the commented JitPack line, then run the workflow again.
