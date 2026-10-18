# v0 is an on-device PWA that calls OpenRouter directly

v0 is an installable web app (PWA) that stores all data on the Student's tablet and calls OpenRouter straight from the browser, so the OpenRouter key lives on the device. We chose this over a native Android app (APK builds and sideloading, less reuse for the v1 cloud service) and over a laptop-hosted web app (keeps the key off the tablets but only works at home while the laptop is on). The exposure is accepted for v0 because each key is only on a family tablet and carries its own spend limit; v1 moves the key behind a server.
