# VAULT OCR worker

Runs EasyOCR (Arabic + English) on your home PC and exposes it to the Railway
deploy through Tailscale Funnel. Railway's `/api/ocr/parse-invoice` is just
a proxy to this service, so the ~2 GB torch dependency never ships to Railway.

```
phone ──► Railway (vault)  ──► Tailscale Funnel ──► this PC :8765 ──► EasyOCR
          app/routers/ocr.py                         ocr_service/main.py
```

## 1. One-time setup on the PC

The worker shares the main app's `requirements.txt` and `.env` — nothing
separate to manage. The EasyOCR/torch lines in `requirements.txt` carry a
`platform_system == "Windows"` marker, so they install on this PC and are
skipped on Railway's Linux build.

From the `vault/` folder in PowerShell:

```powershell
pip install -r requirements.txt
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Add the generated string to `vault/.env` as `OCR_SHARED_SECRET=...`.
You'll set the **same value** on Railway in step 3.

Start the worker (from `vault/ocr_service/`):

```powershell
.\run.ps1
```

First start downloads the EasyOCR models (~300 MB) once; they're cached under
`~/.EasyOCR`. Check it's alive at <http://127.0.0.1:8765/health>.

## 2. Expose it with Tailscale Funnel

Funnel gives the PC a stable public HTTPS hostname
(`https://<pc-name>.<tailnet>.ts.net`) with no domain to buy or DNS to manage.
Tailscale runs as a Windows service, so the tunnel survives reboots.

```powershell
winget install tailscale.tailscale
```

Sign in when the Tailscale window opens (Google login is fine). Then, in a new
PowerShell window (so `tailscale` is on PATH):

```powershell
tailscale funnel --bg 8765
```

The first run prints a link to enable Funnel for your tailnet — open it, click
**Enable**, and re-run the command. It then prints the public URL, e.g.
`https://desktop-abc123.tail1234.ts.net`. Public port 443 is forwarded to the
worker on `127.0.0.1:8765`.

Verify from any device (phone works — it's public):
`https://<pc-name>.<tailnet>.ts.net/health` → `{"ok":true,"engine_loaded":true}`

The `--bg` flag persists the funnel across reboots. To check or stop it:

```powershell
tailscale funnel status
tailscale funnel reset
```

> The URL is public, but `/parse-invoice` rejects any request without the
> shared secret, and `/health` reveals nothing sensitive.

Also make the worker itself start on boot — the simplest way is Task Scheduler:
trigger *At log on*, action `powershell.exe -File "<path>\ocr_service\run.ps1"`.
And disable sleep in Windows power settings, or the phone will get
"scanner offline" whenever the PC dozes.

## 3. Railway variables

In the vault service on Railway add:

| Variable            | Value                                      |
|---------------------|--------------------------------------------|
| `OCR_SERVICE_URL`   | `https://<pc-name>.<tailnet>.ts.net` (no trailing `/`) |
| `OCR_SHARED_SECRET` | same string as in `vault/.env` on the PC   |

Redeploy. Scanning from the phone now round-trips through your PC.

## Troubleshooting

| Symptom on phone                          | Cause                                          |
|-------------------------------------------|------------------------------------------------|
| "Invoice scanner is not configured"       | Railway env vars missing                       |
| "Invoice scanner is offline"              | PC asleep/off, worker not running, tunnel down |
| "Invoice scanner rejected the request"    | Secrets don't match between Railway and `vault/.env` |
| "Scan timed out"                          | CPU OCR took >60 s — try a smaller screenshot  |

Check the worker directly (from the PC):

```powershell
curl.exe http://127.0.0.1:8765/health
```
