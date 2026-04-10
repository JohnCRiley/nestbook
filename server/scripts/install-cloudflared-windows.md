# SSH into NestBook from Windows via Cloudflare Tunnel

This guide lets you SSH into your NestBook server from anywhere on Windows —
school networks, VPNs, restrictive firewalls — without needing port 22 open.
All traffic goes through Cloudflare over port 443 (HTTPS).

---

## Prerequisites

- Windows 10 (1809+) or Windows 11
- OpenSSH client installed (it is by default on modern Windows)
- A terminal: Windows Terminal, PowerShell, or Command Prompt

---

## Step 1 — Install cloudflared

### Option A: winget (recommended — Windows 10/11 built-in package manager)

Open PowerShell or Windows Terminal and run:

```powershell
winget install --id Cloudflare.cloudflared -e
```

Close and reopen your terminal after installation so the PATH updates.

Verify it works:
```powershell
cloudflared --version
```

---

### Option B: Direct download

1. Go to: https://github.com/cloudflare/cloudflared/releases/latest
2. Download `cloudflared-windows-amd64.exe`
3. Rename it to `cloudflared.exe`
4. Move it to a permanent location, e.g. `C:\Tools\cloudflared.exe`
5. Add that folder to your PATH:
   - Open **Start** → search **"Environment Variables"**
   - Click **"Edit the system environment variables"**
   - Click **"Environment Variables…"**
   - Under **"User variables"**, select **Path** → **Edit**
   - Click **New** → type `C:\Tools`
   - Click OK on all dialogs
6. Close and reopen your terminal, then verify:
   ```powershell
   cloudflared --version
   ```

---

## Step 2 — Check OpenSSH is installed

OpenSSH should already be installed on Windows 10/11. Verify:

```powershell
ssh -V
```

If you get a version number (e.g. `OpenSSH_for_Windows_9.x`) you're good.

If not, install it:
```powershell
# Run PowerShell as Administrator
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

---

## Step 3 — Configure SSH to use cloudflared as a proxy

Open (or create) your SSH config file:

```powershell
notepad "$env:USERPROFILE\.ssh\config"
```

If the `.ssh` folder doesn't exist, create it first:
```powershell
mkdir "$env:USERPROFILE\.ssh"
```

Add these lines to the file:

```
Host ssh.nestbook.io
    ProxyCommand cloudflared access ssh --hostname %h
    AddressFamily inet
    User root
    IdentityFile ~/.ssh/id_rsa
```

Save and close Notepad.

> **Note:** Replace `~/.ssh/id_rsa` with the path to your actual private key,
> e.g. `C:/Users/YourName/.ssh/id_nestbook` if you use a named key file.
>
> **`AddressFamily inet`** forces SSH to use IPv4 only. This prevents a common
> Windows issue where cloudflared's local proxy listener binds to `::1` (IPv6)
> and the connection is blocked by the local firewall or network policy.

---

## Step 4 — Connect

In any terminal (PowerShell, Windows Terminal, Command Prompt):

```powershell
ssh ssh.nestbook.io
```

That's it. cloudflared handles the proxy automatically.

The first time you connect to a new server, SSH will ask you to confirm the
host fingerprint — type `yes` and press Enter.

---

## Step 5 — (Optional) Copy your SSH key to the server

If you haven't added your Windows SSH public key to the server yet:

1. Check if you have a key:
   ```powershell
   type "$env:USERPROFILE\.ssh\id_rsa.pub"
   ```

2. If no key exists, generate one:
   ```powershell
   ssh-keygen -t ed25519 -C "your-name-windows"
   ```
   Press Enter to accept the default location. Set a passphrase if you want.

3. Copy the public key to the server (run this from PowerShell):
   ```powershell
   $pubkey = Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"
   ssh -o ProxyCommand="cloudflared access ssh --hostname %h" root@ssh.nestbook.io "mkdir -p ~/.ssh && echo '$pubkey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
   ```
   You'll need to enter the server's root password this one time.

   After that, all future connections use your key — no password needed.

---

## Troubleshooting

### `cloudflared: command not found` or `'cloudflared' is not recognized`
- You need to reopen your terminal after installing via winget
- Or the folder containing `cloudflared.exe` is not in your PATH (see Step 1, Option B)

### `ssh: connect to host ssh.nestbook.io port 22: Connection refused`
- Make sure the SSH config file is using `ProxyCommand` correctly
- Check that cloudflared is in your PATH: `cloudflared --version`
- The tunnel on the server may be down: log into the server another way and run `systemctl restart cloudflared`

### `Permission denied (publickey)`
- Your public key hasn't been added to `~/.ssh/authorized_keys` on the server
- Follow Step 5 above to add it

### `Host key verification failed`
- The server's host key has changed (e.g. after a rebuild)
- Remove the old entry: `ssh-keygen -R ssh.nestbook.io`
- Then reconnect and accept the new fingerprint

### The connection is very slow to establish
- Normal on the first connection — cloudflared negotiates with Cloudflare's edge
- Subsequent connections in the same session are fast (SSH multiplexing)
- Add this to your SSH config to reuse connections:
  ```
  Host ssh.nestbook.io
      ControlMaster auto
      ControlPath ~/.ssh/cm-%r@%h:%p
      ControlPersist 10m
  ```

### IPv6 errors — `connect to host ::1`, `Network unreachable`, or connection blocked

On Windows, cloudflared's local proxy listener sometimes binds to `::1` (IPv6
loopback) instead of `127.0.0.1`. If your machine or network blocks IPv6, the
connection fails silently or with a `Network unreachable` error.

**Fix 1 — `AddressFamily inet` in SSH config (try this first)**

Make sure your `~/.ssh/config` entry includes `AddressFamily inet`:

```
Host ssh.nestbook.io
    ProxyCommand cloudflared access ssh --hostname %h
    AddressFamily inet
    User root
    IdentityFile ~/.ssh/id_rsa
```

This tells the SSH client to only use IPv4, which forces the ProxyCommand
invocation to stay on the IPv4 stack.

---

**Fix 2 — Local port-forward mode (most reliable)**

Instead of a ProxyCommand, run cloudflared as a background TCP tunnel that
forwards a local IPv4 port to the remote SSH service:

1. Open a terminal and run:
   ```powershell
   cloudflared access tcp --hostname ssh.nestbook.io --url 127.0.0.1:2222
   ```
   Leave this terminal open — it holds the tunnel.

2. In a second terminal, connect via the local port:
   ```powershell
   ssh -p 2222 root@127.0.0.1
   ```

   Or add a dedicated entry to `~/.ssh/config` so `ssh nestbook-local` works:
   ```
   Host nestbook-local
       HostName 127.0.0.1
       Port 2222
       User root
       IdentityFile ~/.ssh/id_rsa
   ```

Because `127.0.0.1` is an explicit IPv4 address, this completely bypasses the
IPv6 binding issue.

---

**Fix 3 — Prefer IPv4 system-wide via Windows registry (last resort)**

This does not disable IPv6 — it only tells Windows to prefer IPv4 when both
are available. Safe to apply and easily reversed.

1. Open PowerShell **as Administrator** and run:
   ```powershell
   New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters" `
     -Name DisabledComponents -PropertyType DWord -Value 0x20 -Force
   ```

2. Restart your machine for the change to take effect.

   | `DisabledComponents` value | Effect |
   |---|---|
   | `0x00` (default) | IPv6 fully enabled, preferred over IPv4 |
   | `0x20` | Prefer IPv4 over IPv6 (recommended fix) |
   | `0xFF` | Disable IPv6 completely (not recommended) |

3. To revert: set the value back to `0x00`, or delete the key:
   ```powershell
   Remove-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters" `
     -Name DisabledComponents
   ```

---

## Quick reference

| Task | Command |
|---|---|
| Connect to server | `ssh ssh.nestbook.io` |
| Connect (IPv4 port-forward mode) | `cloudflared access tcp --hostname ssh.nestbook.io --url 127.0.0.1:2222` then `ssh -p 2222 root@127.0.0.1` |
| Copy a file to server | `scp myfile.txt ssh.nestbook.io:/root/` |
| Copy a file from server | `scp ssh.nestbook.io:/root/file.txt .` |
| Check tunnel is alive | `ssh ssh.nestbook.io systemctl is-active cloudflared` |
| Restart the app | `ssh ssh.nestbook.io systemctl restart nestbook` |

---

*Uses Cloudflare Tunnel — all traffic goes through Cloudflare over HTTPS (port 443).
Works on any network, including those that block port 22.*
