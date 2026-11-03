# Admin recovery

Use `admin:create --reset` to set a new password for an existing Admin. It preserves the account,
sets `mustChangePassword`, and requires the Admin to change the password after signing in.

In PowerShell, enter the SteamX ID and password for this invocation only:

```powershell
$env:ADMIN_STEAMX_ID = Read-Host "Admin SteamX ID"
$securePassword = Read-Host "Temporary password" -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
try {
  pnpm --filter @steamx/backend admin:create -- --reset
} finally {
  Remove-Item Env:ADMIN_STEAMX_ID, Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Variable securePassword -ErrorAction SilentlyContinue
}
```

The command prints `password reset for <ID>` on success. It does not print the password. The
temporary password must satisfy the password policy and must not contain the Admin's SteamX ID.
