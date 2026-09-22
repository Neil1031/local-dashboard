[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
. "$PSScriptRoot/windows-principal.ps1"
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$tokenSid=$identity.User.Value
$fromName=Resolve-CanonicalSid $identity.Name
$fromSid=Resolve-CanonicalSid $tokenSid
$invalidClosed=$false
try { $null=Resolve-CanonicalSid ($env:COMPUTERNAME+'\codex-nonexistent-'+[guid]::NewGuid().ToString('N')) }
catch { $invalidClosed=$_.Exception.Message -eq 'IDENTITY_TRANSLATION_FAILED' }
$emptyClosed=$false
try { $null=Resolve-CanonicalSid '' } catch { $emptyClosed=$_.Exception.Message -eq 'IDENTITY_TRANSLATION_FAILED' }
$result=@{currentAccountNameMatchesToken=($fromName -ceq $tokenSid);sidInputUnchanged=($fromSid -ceq $tokenSid);
    invalidAccountFailsClosed=$invalidClosed;emptyIdentityFailsClosed=$emptyClosed;
    canonicalSidHash=(Get-CanonicalSidHash $fromName);processCanonicalSidHash=(Get-CanonicalSidHash $tokenSid);tests=4}
$result|ConvertTo-Json
if (!$result.currentAccountNameMatchesToken -or !$result.sidInputUnchanged -or !$invalidClosed -or !$emptyClosed) {exit 1}
