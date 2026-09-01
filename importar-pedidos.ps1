# importar-pedidos.ps1
#
# Varre a pasta "Processados" do robô do Avanço para Contratos (que já
# processa os pedidos de compra pra rastrear spot x contrato) e, pra cada
# pedido NOVO, manda pra função de extração por IA (extract-documento) e
# registra automaticamente no "Rotas de Compras" — sem o comprador precisar
# abrir nenhum site. O nome do comprador, a empresa, o valor e o local são
# lidos do próprio documento.
#
# FRETE CIF x FOB: decidido pelo NOME DO ARQUIVO (mesma lógica que o robô do
# Avanço para Contratos usa pra decidir spot x contrato). Se o nome do
# arquivo contiver a palavra "FOB" (sem diferenciar maiúsculas/minúsculas),
# o pedido é registrado — só esses precisam de coleta pelo motorista.
# Pedidos sem "FOB" no nome são considerados CIF (fornecedor entrega) e são
# simplesmente ignorados, sem entrar no banco de dados.
#
# Depois de processado, o arquivo é movido para uma subpasta (dentro da
# própria pasta "Processados" monitorada):
#   Roteirizados\            -> importado com sucesso (nome tem "FOB", precisa de rota)
#   Roteirizados-CIF\        -> ignorado (nome sem "FOB" — assume CIF)
#   Roteirizados-Duplicados\ -> pulado porque o número do pedido já tinha sido importado
#   Roteirizados-Erros\      -> deu algum problema (confira o log)
#
# CONFIGURAÇÃO: ajuste $PastaMonitorada se o caminho mudar, e $DataCorte na
# primeira vez que for rodar (evita importar de uma vez todo o histórico
# antigo já acumulado na pasta Processados). Depois, agende esse script no
# Agendador de Tarefas do Windows pra rodar a cada 5-15 minutos.

$ErrorActionPreference = "Stop"

# ---------- CONFIGURAÇÃO — ajuste aqui ----------
$PastaMonitorada = "W:\COMPRAS\ORDENS DE COMPRA\Processados"

# Só processa arquivos modificados a partir desta data — evita reimportar de
# uma vez todo o histórico antigo que já está na pasta Processados. Ajuste
# pra data de hoje a cada nova instalação (não precisa mexer depois disso).
$DataCorte = Get-Date "2026-08-26"
# --------------------------------------------------

$SUPABASE_URL = "https://jvfyqvefznkpcvjaerta.supabase.co"
$SUPABASE_KEY = "sb_publishable_4fZ0DlFJq1ec5xTXurwGSQ_Ke3JELGZ"
# Nome real no Supabase é "rapid-service" (o campo de nome não pegou
# "extract-documento" ao publicar pela primeira vez).
$EXTRACT_URL = "$SUPABASE_URL/functions/v1/rapid-service"

$PastaRoteirizados = Join-Path $PastaMonitorada "Roteirizados"
$PastaCIF = Join-Path $PastaMonitorada "Roteirizados-CIF"
$PastaDuplicados = Join-Path $PastaMonitorada "Roteirizados-Duplicados"
$PastaErros = Join-Path $PastaMonitorada "Roteirizados-Erros"
$LogFile = Join-Path $PastaMonitorada "importacao_rotas_log.txt"

foreach ($p in @($PastaRoteirizados, $PastaCIF, $PastaDuplicados, $PastaErros)) {
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}

function Write-Log($mensagem) {
    $linha = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $mensagem"
    Add-Content -Path $LogFile -Value $linha -Encoding utf8
    Write-Output $linha
}

$HeadersJson = @{
    "apikey"        = $SUPABASE_KEY
    "authorization" = "Bearer $SUPABASE_KEY"
    "content-type"  = "application/json"
}

# Invoke-RestMethod, quando -Body é uma string, não codifica em UTF-8 por
# padrão no Windows PowerShell 5.1 — nomes com acento (fornecedor, endereço)
# corrompiam o JSON enviado e a Supabase respondia "Empty or invalid json"
# (PGRST102). Convertendo a string pra bytes UTF-8 explicitamente antes de
# enviar, o problema não ocorre.
function Invoke-JsonPost($uri, $headers, $jsonBody) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)
    return Invoke-RestMethod -Uri $uri -Headers $headers -Method Post -Body $bytes
}

function Detalhe-Erro($erro) {
    $msg = $erro.Exception.Message
    if ($erro.Exception.Response) {
        try {
            $stream = $erro.Exception.Response.GetResponseStream()
            $stream.Position = 0
            $reader = New-Object System.IO.StreamReader($stream)
            $corpo = $reader.ReadToEnd()
            if ($corpo) { $msg = "$msg | corpo: $corpo" }
        } catch {}
    }
    return $msg
}

function ApenasDigitos($texto) {
    if ([string]::IsNullOrWhiteSpace($texto)) { return "" }
    return ($texto -replace '\D', '')
}

function MediaTypePorExtensao($extensao) {
    switch ($extensao.ToLower()) {
        "pdf"  { return "application/pdf" }
        "png"  { return "image/png" }
        "jpg"  { return "image/jpeg" }
        "jpeg" { return "image/jpeg" }
        default { return "application/octet-stream" }
    }
}

# ---------- carrega cadastros existentes (pra achar por CNPJ/nome antes de criar novo) ----------
$empresas = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/rl_empresas?select=id,nome,cnpj,ativo&ativo=eq.true" -Headers $HeadersJson -Method Get
$compradores = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/rl_compradores?select=id,nome,ativo&ativo=eq.true" -Headers $HeadersJson -Method Get

function Find-Empresa($nome, $cnpj) {
    $cnpjAlvo = ApenasDigitos $cnpj
    if ($cnpjAlvo) {
        $match = $empresas | Where-Object { (ApenasDigitos $_.cnpj) -eq $cnpjAlvo -and $_.cnpj } | Select-Object -First 1
        if ($match) { return $match }
    }
    if ($nome) {
        $alvo = $nome.Trim().ToLower()
        $match = $empresas | Where-Object { $_.nome.Trim().ToLower() -eq $alvo } | Select-Object -First 1
        if ($match) { return $match }
    }
    return $null
}

function Get-OrCreate-Empresa($nome, $cnpj) {
    if (-not $nome) { return $null }
    $existente = Find-Empresa $nome $cnpj
    if ($existente) { return $existente }

    $body = @{ nome = $nome; cnpj = if ($cnpj) { $cnpj } else { $null } } | ConvertTo-Json
    $headers = $HeadersJson.Clone()
    $headers["Prefer"] = "return=representation"
    $novo = Invoke-JsonPost "$SUPABASE_URL/rest/v1/rl_empresas" $headers $body
    $script:empresas += $novo[0]
    return $novo[0]
}

function Get-OrCreate-Comprador($nome) {
    if ([string]::IsNullOrWhiteSpace($nome)) { $nome = "Importação automática" }
    $alvo = $nome.Trim().ToLower()
    $existente = $compradores | Where-Object { $_.nome.Trim().ToLower() -eq $alvo } | Select-Object -First 1
    if ($existente) { return $existente.nome }

    $body = @{ nome = $nome.Trim() } | ConvertTo-Json
    $headers = $HeadersJson.Clone()
    $headers["Prefer"] = "return=representation"
    $novo = Invoke-JsonPost "$SUPABASE_URL/rest/v1/rl_compradores" $headers $body
    $script:compradores += $novo[0]
    return $novo[0].nome
}

function Test-PedidoJaImportado($numeroPedido) {
    if ([string]::IsNullOrWhiteSpace($numeroPedido)) { return $false }
    $uri = "$SUPABASE_URL/rest/v1/rl_pedidos?select=id&numero_pedido=eq.$([uri]::EscapeDataString($numeroPedido))&limit=1"
    $existe = Invoke-RestMethod -Uri $uri -Headers $HeadersJson -Method Get
    return ($existe.Count -gt 0)
}

function Upload-Arquivo($caminhoArquivo, $nomeDestino, $contentType) {
    $uri = "$SUPABASE_URL/storage/v1/object/rl_pedidos/$nomeDestino"
    $headers = @{
        "apikey"        = $SUPABASE_KEY
        "authorization" = "Bearer $SUPABASE_KEY"
        "content-type"  = $contentType
    }
    Invoke-RestMethod -Uri $uri -Headers $headers -Method Post -InFile $caminhoArquivo | Out-Null
    return "$SUPABASE_URL/storage/v1/object/public/rl_pedidos/$nomeDestino"
}

# ---------- processa os arquivos novos ----------
# Nota: -Include só funciona corretamente com -Path terminando em "\*"
# (sem isso, o PowerShell silenciosamente retorna 0 arquivos mesmo
# havendo arquivos que baterim com o filtro).
$arquivos = Get-ChildItem -Path (Join-Path $PastaMonitorada "*") -Include *.pdf, *.jpg, *.jpeg, *.png -File |
    Sort-Object FullName -Unique |
    Where-Object { $_.LastWriteTime -ge $DataCorte }

if ($arquivos.Count -eq 0) {
    Write-Log "Nenhum arquivo novo encontrado."
    exit 0
}

foreach ($arquivo in $arquivos) {
    Write-Log "Processando: $($arquivo.Name)"
    try {
        $extensao = $arquivo.Extension.TrimStart(".")
        $mediaType = MediaTypePorExtensao $extensao

        $bytes = [System.IO.File]::ReadAllBytes($arquivo.FullName)
        $base64 = [System.Convert]::ToBase64String($bytes)
        $payload = @{ tipo = "pedido"; file_base64 = $base64; media_type = $mediaType } | ConvertTo-Json

        # Tenta até 3 vezes — erros passageiros do servidor não devem jogar
        # o arquivo pra pasta de Erros de primeira.
        $resposta = $null
        $ultimoErro = $null
        for ($tentativa = 1; $tentativa -le 3; $tentativa++) {
            try {
                $resposta = Invoke-RestMethod -Uri $EXTRACT_URL -Headers $HeadersJson -Method Post -Body $payload -TimeoutSec 120
                $ultimoErro = $null
                break
            } catch {
                $ultimoErro = $_
                Write-Log "  Tentativa $tentativa falhou ($(Detalhe-Erro $_))$(if ($tentativa -lt 3) { ', tentando de novo em 10s...' })"
                if ($tentativa -lt 3) { Start-Sleep -Seconds 10 }
            }
        }
        if ($ultimoErro) { throw $ultimoErro }
        if ($resposta.error) { throw "Extração falhou: $($resposta.error)" }
        $dados = $resposta.data

        # Frete CIF x FOB é decidido pelo NOME DO ARQUIVO (mesmo padrão do robô
        # do Avanço para Contratos, que decide spot x contrato do mesmo jeito).
        $ehFob = $arquivo.Name -imatch "FOB"

        # Pedidos que o fornecedor despacha pra uma transportadora (o motorista
        # retira lá, não no próprio fornecedor) também são identificados pelo
        # nome do arquivo — vão pra uma tela separada, já que o motorista passa
        # na transportadora todo dia sem saber de antemão o que já chegou.
        $retirarTransportadora = $arquivo.Name -imatch "transportadora"

        if (-not $ehFob) {
            Write-Log "  Sem 'FOB' no nome do arquivo — assumindo CIF (fornecedor entrega), não roteirizado. Movido para Roteirizados-CIF."
            Move-Item -Path $arquivo.FullName -Destination (Join-Path $PastaCIF $arquivo.Name) -Force
            continue
        }

        if (Test-PedidoJaImportado $dados.numero_pedido) {
            Write-Log "  Pedido Nº $($dados.numero_pedido) já importado antes — pulando (movido para Roteirizados-Duplicados)."
            Move-Item -Path $arquivo.FullName -Destination (Join-Path $PastaDuplicados $arquivo.Name) -Force
            continue
        }

        $empresa = Get-OrCreate-Empresa $dados.empresa_compradora_nome $dados.empresa_compradora_cnpj
        $compradorNome = Get-OrCreate-Comprador $dados.solicitante_nome

        $nomeArquivoStorage = "$([guid]::NewGuid().ToString()).$extensao"
        $arquivoUrl = Upload-Arquivo $arquivo.FullName $nomeArquivoStorage $mediaType

        $pedido = @{
            comprador_nome  = $compradorNome
            empresa_id      = if ($empresa) { $empresa.id } else { $null }
            empresa_nome    = if ($empresa) { $empresa.nome } else { $dados.empresa_compradora_nome }
            empresa_cnpj    = if ($empresa) { $empresa.cnpj } else { $dados.empresa_compradora_cnpj }
            fornecedor_nome = if ($dados.fornecedor_nome) { $dados.fornecedor_nome } else { $null }
            numero_pedido   = if ($dados.numero_pedido) { $dados.numero_pedido } else { $null }
            local_retirada  = if ($dados.local_retirada) { $dados.local_retirada } else { $null }
            arquivo_url     = $arquivoUrl
            arquivo_nome    = $arquivo.Name
            valor_total     = if ($null -ne $dados.valor_total) { $dados.valor_total } else { $null }
            itens           = if ($dados.itens) { $dados.itens } else { $null }
            urgente         = $false
            retirar_transportadora = $retirarTransportadora
            status          = "pendente"
        } | ConvertTo-Json -Depth 6
        Invoke-JsonPost "$SUPABASE_URL/rest/v1/rl_pedidos" $HeadersJson $pedido | Out-Null

        Write-Log "  OK (FOB$(if ($retirarTransportadora) { ', transportadora' })): comprador '$compradorNome', empresa '$($dados.empresa_compradora_nome)', valor=$($dados.valor_total), pedido=$($dados.numero_pedido)"
        Move-Item -Path $arquivo.FullName -Destination (Join-Path $PastaRoteirizados $arquivo.Name) -Force
    }
    catch {
        Write-Log "  ERRO: $(Detalhe-Erro $_)"
        if (Test-Path $arquivo.FullName) {
            Move-Item -Path $arquivo.FullName -Destination (Join-Path $PastaErros $arquivo.Name) -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Log "Execução concluída."
