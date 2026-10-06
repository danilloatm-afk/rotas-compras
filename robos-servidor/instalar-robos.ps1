# instalar-robos.ps1
#
# REDUNDÂNCIA: instala os dois robôs de importação de pedidos neste computador,
# pra rodarem EM PARALELO com o computador original. Se um estiver desligado, o
# outro continua importando. Os dois robôs já sabem dividir o trabalho: cada
# arquivo é "reivindicado" por uma máquina só, e cada máquina grava o seu
# próprio log.
#
# Como usar: abra o PowerShell "como Administrador", entre nesta pasta e rode:
#     Set-ExecutionPolicy -Scope Process Bypass
#     .\instalar-robos.ps1

$ErrorActionPreference = "Stop"

$Origem  = Split-Path -Parent $MyInvocation.MyCommand.Path
$Destino = "C:\Robos"
$Rede    = "\\192.168.0.228\wehrmann\COMPRAS\ORDENS DE COMPRA"
$Tarefas = @(
    @{ Nome = "Importar Pedidos - Rotas de Compras";        Arquivo = "importar-pedidos-rotas.ps1" },
    @{ Nome = "Importar Pedidos - Avanco para Contratos";   Arquivo = "importar-pedidos-avanco.ps1" }
)

$ehAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $ehAdmin) { throw "Abra o PowerShell como Administrador (botão direito > Executar como administrador) e rode de novo." }

Write-Host "1/5 Conferindo acesso à pasta de rede..."
if (-not (Test-Path $Rede)) {
    throw "Este computador não enxerga $Rede. Confira a rede e o acesso desse usuário à pasta e rode de novo."
}
Write-Host "    OK: pasta de rede acessível."

Write-Host "2/5 Conferindo a internet (leitura por IA / banco)..."
try {
    Invoke-WebRequest -Uri "https://jvfyqvefznkpcvjaerta.supabase.co" -UseBasicParsing -TimeoutSec 20 | Out-Null
} catch {
    # qualquer resposta HTTP (mesmo erro 4xx) prova que chegou lá; só falha se não houver conexão
    if (-not $_.Exception.Response) { throw "Sem acesso à internet / ao Supabase a partir deste computador." }
}
Write-Host "    OK: internet acessível."

Write-Host "3/5 Copiando os robôs para $Destino ..."
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
foreach ($t in $Tarefas) {
    $origemArquivo = Join-Path $Origem $t.Arquivo
    if (-not (Test-Path $origemArquivo)) { throw "Arquivo não encontrado ao lado do instalador: $($t.Arquivo)" }
    Copy-Item $origemArquivo (Join-Path $Destino $t.Arquivo) -Force
}
Write-Host "    OK: robôs copiados."

Write-Host "4/5 Criando as tarefas agendadas (a cada 15 minutos)..."
$cred = Get-Credential -UserName "$env:USERDOMAIN\$env:USERNAME" -Message "Usuário que tem acesso à pasta de rede. A tarefa vai rodar com ele, mesmo sem ninguém logado. A senha fica guardada pelo Windows."
$senha = $cred.GetNetworkCredential().Password
foreach ($t in $Tarefas) {
    $acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $Destino $t.Arquivo))
    $gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
    $config = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $t.Nome -Action $acao -Trigger $gatilho -Settings $config -User $cred.UserName -Password $senha -Force | Out-Null
    Write-Host "    Criada e ligada: $($t.Nome)"
}

Write-Host "5/5 Rodando uma vez cada tarefa pra testar (aguarde 90 segundos)..."
foreach ($t in $Tarefas) { Start-ScheduledTask -TaskName $t.Nome }
Start-Sleep -Seconds 90
foreach ($t in $Tarefas) {
    $i = Get-ScheduledTaskInfo -TaskName $t.Nome
    Write-Host ("    {0} -> última execução: {1} | resultado: {2} (0 = ok)" -f $t.Nome, $i.LastRunTime, $i.LastTaskResult)
}
$logs = @(
    (Join-Path $Rede ("Processados\importacao_rotas_log_{0}.txt" -f $env:COMPUTERNAME)),
    (Join-Path $Rede ("importacao_log_{0}.txt" -f $env:COMPUTERNAME))
)
foreach ($log in $logs) {
    Write-Host "`n--- $log"
    if (Test-Path $log) { Get-Content $log -Tail 6 -Encoding UTF8 } else { Write-Host "(ainda sem log - confira o resultado das tarefas acima)" }
}

Write-Host "`nPRONTO. Os dois computadores agora trabalham juntos. Nada precisa ser desativado no computador original."
