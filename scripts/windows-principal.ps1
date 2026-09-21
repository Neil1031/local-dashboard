# No scheduler I/O. Never return the input as a fallback on translation failure.
function Resolve-CanonicalSid([string]$Identity) {
    if ([string]::IsNullOrWhiteSpace($Identity)) { throw 'IDENTITY_TRANSLATION_FAILED' }
    try { return ([Security.Principal.SecurityIdentifier]::new($Identity)).Value } catch {}
    try {
        $account=[Security.Principal.NTAccount]::new($Identity)
        return ($account.Translate([Security.Principal.SecurityIdentifier])).Value
    } catch {
        # Deliberately omit the input and exception text, which can disclose accounts.
        throw 'IDENTITY_TRANSLATION_FAILED'
    }
}
function Get-CanonicalSidHash([string]$CanonicalSid) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($CanonicalSid)))).Replace('-','') }
    finally { $sha.Dispose() }
}
