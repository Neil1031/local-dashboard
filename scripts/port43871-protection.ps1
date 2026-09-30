[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('before','package','live','final')][string]$Phase)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$out=Join-Path $repo '.tools/port43871'
New-Item -ItemType Directory -Path $out -Force | Out-Null
# Exact known installation/state roots, never a whole-machine inventory.
$roots=@('F:\AI workspace\local-dashboard\dist\LocalDashboard', "$env:LOCALAPPDATA\LocalDashboard",
    ([Environment]::GetFolderPath('Desktop')+'\Local Dashboard.lnk'),
    ([Environment]::GetFolderPath('Desktop')+'\Stop Local Dashboard.lnk'))
$files=@(foreach($root in $roots){
    if(Test-Path -LiteralPath $root){
        $item=Get-Item -LiteralPath $root
        $items=if($item.PSIsContainer){Get-ChildItem -LiteralPath $root -Recurse -File -Force}else{@($item)}
        foreach($file in $items){[pscustomobject]@{Path=$file.FullName;Length=$file.Length;Hash=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}}
    }
})
$tasks=@(Get-ScheduledTask -ErrorAction Stop | Where-Object {$_.TaskName -match 'InsiderTracker|AIStockHunter|LocalDashboard|MarketRegime|PostEarnings'} | ForEach-Object {
    $raw=Export-ScheduledTask -TaskPath $_.TaskPath -TaskName $_.TaskName -ErrorAction Stop
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$hash=[Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($raw)))}finally{$sha.Dispose()}
    $info=$_ | Get-ScheduledTaskInfo -ErrorAction Stop
    [pscustomobject]@{Key=$_.TaskPath+$_.TaskName;Hash=$hash;State=[string]$_.State;LastRunTime=$info.LastRunTime.ToString('o');LastTaskResult=$info.LastTaskResult;NextRunTime=$info.NextRunTime.ToString('o')}
})
$projects=@(foreach($name in @('insider-signal-tracker','ai-stock-hunter','market-regime-sentinel','post-earnings-dislocation')){
    $path=Join-Path 'F:\AI workspace' $name
    if(Test-Path -LiteralPath (Join-Path $path '.git')){
        $head=& git -C $path rev-parse HEAD; if($LASTEXITCODE){throw "Cannot inspect $name"}
        $status=@(& git -C $path status --porcelain=v1); if($LASTEXITCODE){throw "Cannot inspect $name"}
        [pscustomobject]@{Name=$name;Head=$head;Status=$status}
    }
})
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -in 43871,8080 | Select-Object LocalAddress,LocalPort,OwningProcess)
$snapshot=[pscustomobject]@{At=[DateTimeOffset]::UtcNow.ToString('o');Files=$files;Tasks=$tasks;Projects=$projects;Listeners=$listeners}
$snapshot | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$out/protection-$Phase-full.json" -Encoding utf8
if($Phase -eq 'before'){
    [pscustomobject]@{Phase=$Phase;Files=$files.Count;Tasks=$tasks.Count;Projects=$projects.Count;Listeners=$listeners} | ConvertTo-Json -Depth 4
    return
}
$before=Get-Content -LiteralPath "$out/protection-before-full.json" -Raw | ConvertFrom-Json
$fileDiff=@(Compare-Object ($before.Files | Sort-Object Path | ForEach-Object {"$($_.Path)|$($_.Length)|$($_.Hash)"}) ($files | Sort-Object Path | ForEach-Object {"$($_.Path)|$($_.Length)|$($_.Hash)"}))
$definitionDiff=@(Compare-Object ($before.Tasks | Sort-Object Key | ForEach-Object {"$($_.Key)|$($_.Hash)"}) ($tasks | Sort-Object Key | ForEach-Object {"$($_.Key)|$($_.Hash)"}))
function ExecutionKey($task){
    # ConvertFrom-Json can materialize ISO dates as DateTime; compare instants,
    # not formatter-specific fractional seconds/timezone spelling.
    $last=([DateTimeOffset]$task.LastRunTime).UtcTicks
    $next=([DateTimeOffset]$task.NextRunTime).UtcTicks
    "$($task.Key)|$($task.State)|$last|$($task.LastTaskResult)|$next"
}
$executionDiff=@(Compare-Object ($before.Tasks | Sort-Object Key | ForEach-Object {ExecutionKey $_}) ($tasks | Sort-Object Key | ForEach-Object {ExecutionKey $_}))
$projectDiff=@(Compare-Object ($before.Projects | Sort-Object Name | ForEach-Object {$_ | ConvertTo-Json -Compress}) ($projects | Sort-Object Name | ForEach-Object {$_ | ConvertTo-Json -Compress}))
$summary=[pscustomobject]@{Phase=$Phase;FileCount=$files.Count;TaskCount=$tasks.Count;ProjectCount=$projects.Count;FileDrift=$fileDiff.Count;DefinitionDrift=$definitionDiff.Count;ExecutionStateDrift=$executionDiff.Count;ProjectGitDrift=$projectDiff.Count;Listeners=$listeners;At=$snapshot.At}
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$out/protection-$Phase-summary.json" -Encoding utf8
if($fileDiff.Count -or $definitionDiff.Count -or $executionDiff.Count -or $projectDiff.Count){
    @{Files=$fileDiff;Definitions=$definitionDiff;Executions=$executionDiff;Projects=$projectDiff} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$out/protection-$Phase-drift-private.json" -Encoding utf8
}
$summary | ConvertTo-Json -Depth 5
if($fileDiff.Count -or $definitionDiff.Count){throw 'Protected installation/state or task definition drift detected; inspect private evidence.'}
