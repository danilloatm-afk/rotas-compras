const SUPABASE_URL = "https://jvfyqvefznkpcvjaerta.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZnlxdmVmem5rcGN2amFlcnRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMTQ4NjgsImV4cCI6MjEwMTc5MDg2OH0.2Ef6LpZ61WM8myHBYeQGo3TuGqk5C3x36ER_sWRNPS4";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Chave publicÃ¡vel do mesmo projeto Supabase, usada sÃ³ pra chamar a Edge
// Function (mesma chave jÃ¡ usada no app AvanÃ§o para Contratos).
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4fZ0DlFJq1ec5xTXurwGSQ_Ke3JELGZ";
// Nome real no Supabase Ã© "rapid-service" (o campo de nome nÃ£o pegou
// "extract-documento" ao publicar pela primeira vez â€” mesma situaÃ§Ã£o da
// function "rapid-action" do AvanÃ§o para Contratos).
const EXTRACT_URL = `${SUPABASE_URL}/functions/v1/rapid-service`;

const TOLERANCIA_VALOR = 0.05;

// ---------- tema claro/escuro ----------
const LS_TEMA = "rl_tema";

function temaEfetivoEscuro(tema) {
  if (tema === "dark") return true;
  if (tema === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function aplicarTema(tema) {
  if (tema === "light" || tema === "dark") {
    document.documentElement.setAttribute("data-theme", tema);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  document.getElementById("btn-theme-toggle").textContent = temaEfetivoEscuro(tema) ? "â˜€ï¸" : "ðŸŒ™";
}

let temaAtual = localStorage.getItem(LS_TEMA) || "auto";
aplicarTema(temaAtual);

document.getElementById("btn-theme-toggle").addEventListener("click", () => {
  temaAtual = temaEfetivoEscuro(temaAtual) ? "light" : "dark";
  localStorage.setItem(LS_TEMA, temaAtual);
  aplicarTema(temaAtual);
});

// Toque manual pra "destravar" o som nesta aba â€” importante numa TV que fica
// ligada o dia todo sem ninguÃ©m tocar na tela (ver falarAlerta mais abaixo).
// DÃ¡ retorno visual IMEDIATO ao apertar (mesmo antes de saber se o som vai
// funcionar) porque em navegadores de TV (ex: o "Browser" da prÃ³pria Samsung)
// Ã s vezes o speak() simplesmente nÃ£o faz nada â€” nem toca, nem dÃ¡ erro â€” daÃ­
// sem esse retorno a pessoa acha que o botÃ£o "nÃ£o fez nada" ao apertar.
document.getElementById("btn-ativar-som").addEventListener("click", () => {
  const btn = document.getElementById("btn-ativar-som");
  if (somAlertaDesbloqueado) return;
  if (!("speechSynthesis" in window)) {
    btn.textContent = "âš ï¸ Som nÃ£o suportado aqui";
    btn.classList.add("som-indisponivel");
    return;
  }
  btn.textContent = "ðŸ”„ Testando som...";
  falarAlerta("Som ativado", 1);
  setTimeout(() => {
    if (!somAlertaDesbloqueado) {
      btn.textContent = "âš ï¸ Som nÃ£o funcionou aqui";
      btn.classList.add("som-indisponivel");
    }
  }, 2500);
});

// ---------- helpers ----------
// alert()/prompt() nativos nÃ£o sÃ£o confiÃ¡veis em vÃ¡rios navegadores/webviews
// (jÃ¡ vimos prompt() falhar em produÃ§Ã£o) â€” este toast substitui os avisos.
function mostrarAviso(mensagem) {
  const toast = document.createElement("div");
  toast.className = "toast-aviso";
  toast.textContent = mensagem;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// O Chrome sÃ³ toca som (inclusive voz sintetizada) numa aba depois de um
// toque/clique real do usuÃ¡rio nela â€” antes disso, speak() falha em
// silÃªncio com erro "not-allowed". Numa TV que fica ligada o dia todo sem
// ninguÃ©m tocar na tela, isso significa que NENHUM alerta toca depois de
// uma recarga de pÃ¡gina. Por isso avisamos visualmente quando isso acontece,
// pra alguÃ©m saber que precisa tocar no botÃ£o "ðŸ”Š Ativar som" uma vez.
let somAlertaDesbloqueado = false;

function marcarSomDesbloqueado() {
  somAlertaDesbloqueado = true;
  const btn = document.getElementById("btn-ativar-som");
  if (btn && !btn.classList.contains("som-ativo")) {
    btn.textContent = "ðŸ”Š Som ativo";
    btn.classList.remove("som-indisponivel");
    btn.classList.add("som-ativo");
  }
  const aviso = document.getElementById("aviso-som-bloqueado");
  if (aviso) aviso.hidden = true;
}

function mostrarAvisoSomBloqueado() {
  const aviso = document.getElementById("aviso-som-bloqueado");
  if (aviso) aviso.hidden = false;
}

// Fala em voz alta usando a sÃ­ntese de voz do prÃ³prio navegador â€” sem custo,
// sem chave de API. Nem todo navegador/dispositivo suporta, entÃ£o falha em
// silÃªncio se nÃ£o tiver (o alerta visual normal continua funcionando igual).
function falarAlerta(texto, vezes = 2) {
  if (!("speechSynthesis" in window)) return;
  try {
    // Fala mais de uma vez de propÃ³sito â€” num ambiente barulhento (pÃ¡tio,
    // oficina) um aviso sÃ³, uma vez, passa despercebido fÃ¡cil. As falas
    // entram na fila do navegador e tocam uma depois da outra sozinhas.
    for (let i = 0; i < vezes; i++) {
      const utterance = new SpeechSynthesisUtterance(texto);
      utterance.lang = "pt-BR";
      utterance.onstart = marcarSomDesbloqueado;
      utterance.onerror = (e) => {
        if (e.error === "not-allowed") mostrarAvisoSomBloqueado();
      };
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    // silencioso de propÃ³sito â€” alerta sonoro Ã© um extra, nunca deve travar o fluxo
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function comTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), ms)),
  ]);
}

// Espera a pessoa parar de digitar antes de buscar de novo â€” sem isso, um
// campo de busca (ex: filtro por fornecedor) dispararia uma consulta ao
// banco a cada letra digitada.
function debounce(fn, ms) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), ms);
  };
}

function apenasDigitos(str) {
  return String(str || "").replace(/\D/g, "");
}

function formatarMoeda(v) {
  if (v == null || v === "") return "â€”";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataHora(iso) {
  if (!iso) return "â€”";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("NÃ£o foi possÃ­vel ler o arquivo"));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}

function extensaoArquivo(file) {
  const porNome = (file.name || "").split(".").pop();
  if (porNome && porNome.length <= 5) return porNome.toLowerCase();
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  return "jpg";
}

async function uploadArquivo(file, bucket) {
  const nome = `${crypto.randomUUID()}.${extensaoArquivo(file)}`;
  const { error } = await db.storage.from(bucket).upload(nome, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  return { path: nome, url: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${nome}` };
}

async function lerComIA(file, tipo) {
  const base64 = await arquivoParaBase64(file);
  const resp = await fetch(EXTRACT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ tipo, file_base64: base64, media_type: file.type || "application/pdf" }),
  });
  const resultado = await resp.json();
  if (!resp.ok || resultado.error) throw new Error(resultado.error || "Falha ao ler o documento.");
  return resultado.data;
}

async function checarPedidoDuplicado(numeroPedido) {
  const aviso = document.getElementById("pedido-duplicado-aviso");
  if (!numeroPedido) {
    aviso.classList.add("hidden");
    return;
  }
  const { data } = await comTimeout(db.from("rl_pedidos").select("criado_em").eq("numero_pedido", numeroPedido).limit(1));
  if (data && data.length) {
    aviso.textContent = `âš ï¸ O pedido NÂº ${numeroPedido} jÃ¡ foi importado antes (em ${formatarDataHora(data[0].criado_em)}). Confira se nÃ£o Ã© duplicado antes de enviar.`;
    aviso.classList.remove("hidden");
  } else {
    aviso.classList.add("hidden");
  }
}

document.getElementById("pedido-numero").addEventListener("change", (e) => checarPedidoDuplicado(e.target.value.trim()));

// ---------- tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "comprador") loadMeusPedidos();
    if (btn.dataset.tab === "motorista") {
      loadDisponiveis();
      loadRotaAtual();
    }
    if (btn.dataset.tab === "indicadores") loadIndicadores();
    if (btn.dataset.tab === "portaria") carregarAvisosPortariaEnviados();
    if (btn.dataset.tab === "recebimento-cif") {
      carregarAvisosPortariaPendentes();
      carregarAvisosLiberadosPendentesConferencia();
      carregarPedidosCifPendentes();
    }
    if (btn.dataset.tab === "historico") {
      carregarFiltrosHistorico();
      loadHistorico();
    }
    if (btn.dataset.tab === "config") renderCadastros();
  });
});

// ---------- caches ----------
let compradoresCache = [];
let motoristasCache = [];
let empresasCache = [];
let almoxarifesCache = [];

async function loadCompradores() {
  const { data, error } = await comTimeout(db.from("rl_compradores").select("*").order("ativo", { ascending: false }).order("nome"));
  compradoresCache = error ? compradoresCache : data || [];
  const sel = document.getElementById("comprador-select");
  const atual = localStorage.getItem("rl_comprador_atual") || sel.value;
  sel.innerHTML =
    `<option value="">â€” selecione â€”</option>` +
    compradoresCache.filter((c) => c.ativo).map((c) => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`).join("");
  if (atual) sel.value = atual;
}

async function loadMotoristas() {
  const { data, error } = await comTimeout(db.from("rl_motoristas").select("*").order("ativo", { ascending: false }).order("nome"));
  motoristasCache = error ? motoristasCache : data || [];
  const sel = document.getElementById("motorista-select");
  const atual = localStorage.getItem("rl_motorista_atual") || sel.value;
  sel.innerHTML =
    `<option value="">â€” selecione â€”</option>` +
    motoristasCache.filter((m) => m.ativo).map((m) => `<option value="${escapeHtml(m.nome)}">${escapeHtml(m.nome)}</option>`).join("");
  if (atual) sel.value = atual;
}

async function loadAlmoxarifes() {
  const { data, error } = await comTimeout(db.from("rl_almoxarifes").select("*").order("ativo", { ascending: false }).order("nome"));
  almoxarifesCache = error ? almoxarifesCache : data || [];
  const opcoes =
    `<option value="">â€” selecione â€”</option>` +
    almoxarifesCache.filter((a) => a.ativo).map((a) => `<option value="${escapeHtml(a.nome)}">${escapeHtml(a.nome)}</option>`).join("");
  const atual = localStorage.getItem("rl_almoxarife_atual");

  // Dois seletores independentes (HistÃ³rico e Recebimento CIF), sincronizados
  // pelo mesmo nome guardado no localStorage â€” a pessoa escolhe o nome uma
  // vez em qualquer um dos dois e ele jÃ¡ aparece certo no outro tambÃ©m.
  const sel = document.getElementById("almoxarife-select");
  sel.innerHTML = opcoes;
  if (atual || sel.value) sel.value = atual || sel.value;

  const selCif = document.getElementById("almoxarife-select-cif");
  if (selCif) {
    selCif.innerHTML = opcoes;
    if (atual || selCif.value) selCif.value = atual || selCif.value;
  }
}

// Tabela cs_condicoes_pagamento jÃ¡ existe no mesmo Supabase, criada pelo
// app "AvanÃ§o para Contratos" (de-para cÃ³digo -> dias mÃ©dios, baseado na
// planilha "cond pag.xlsx" do ERP) â€” reaproveitada aqui sÃ³ de leitura, sem
// duplicar o cadastro.
let condicoesPagamentoCache = new Map();
// A tabela sempre guarda o cÃ³digo com 3 dÃ­gitos (ex: "035"), mas o pedido Ã s
// vezes vem sem o zero Ã  esquerda (ex: "35", quando o ERP imprime assim no
// documento) â€” sem normalizar os dois lados, a busca falhava e toda
// condiÃ§Ã£o "curta" aparecia como "nÃ£o encontrada na tabela", mesmo existindo.
function normalizarCodigoCondicao(codigo) {
  const digitos = String(codigo ?? "").trim().replace(/^0+(?=\d)/, "");
  return digitos;
}

// Muita gente do pedido nÃ£o imprime um cÃ³digo de tabela â€” imprime o prazo
// jÃ¡ por extenso (ex: "28 DIAS", "30 60 DIAS" pra duas parcelas, "30 60 90
// DIAS" pra trÃªs). Quando o cÃ³digo nÃ£o bate com nenhuma linha da tabela,
// tenta ler os dias direto do texto em vez de desistir â€” sÃ³ aceita quando o
// que sobra depois de tirar a palavra "DIAS" Ã© sÃ³ nÃºmeros e espaÃ§o (evita
// interpretar algo tipo "PROX 30-04", que Ã© uma data, nÃ£o uma lista de
// prazos, como se fosse 30 e 4 dias).
function diasEsperadosDeTexto(codigo) {
  const semPalavraDias = String(codigo ?? "")
    .trim()
    .toUpperCase()
    .replace(/\bDIAS?\b/g, "")
    .trim();
  if (!semPalavraDias || !/^[\d\s]+$/.test(semPalavraDias)) return null;
  const numeros = semPalavraDias
    .split(/\s+/)
    .map(Number)
    .filter((n) => !isNaN(n) && n >= 0);
  if (!numeros.length) return null;
  return numeros.reduce((soma, n) => soma + n, 0) / numeros.length;
}
// Tenta algumas vezes com espera entre elas â€” sem isso, uma conexÃ£o ruim no
// exato momento em que o app abre (comum pro motorista no campo) fazia essa
// tabela ficar vazia pro resto da sessÃ£o inteira, mesmo a internet
// melhorando alguns segundos depois, e toda condiÃ§Ã£o de pagamento aparecia
// como "nÃ£o encontrada na tabela" sem motivo real.
async function loadCondicoesPagamento(tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    const { data, error } = await comTimeout(db.from("cs_condicoes_pagamento").select("codigo, dias"));
    if (!error && data && data.length) {
      condicoesPagamentoCache = new Map(data.map((c) => [normalizarCodigoCondicao(c.codigo), c.dias]));
      return;
    }
    if (i < tentativas - 1) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function loadEmpresas() {
  const { data, error } = await comTimeout(db.from("rl_empresas").select("*").order("ativo", { ascending: false }).order("nome"));
  empresasCache = error ? empresasCache : data || [];
  const sel = document.getElementById("pedido-empresa");
  const atual = sel.value;
  sel.innerHTML =
    `<option value="">â€” selecione â€”</option>` +
    empresasCache
      .filter((e) => e.ativo)
      .map((e) => `<option value="${e.id}">${escapeHtml(e.nome)}${e.cnpj ? ` â€” ${escapeHtml(e.cnpj)}` : ""}</option>`)
      .join("");
  if (atual) sel.value = atual;

  const selPortaria = document.getElementById("portaria-empresa");
  const atualPortaria = selPortaria.value;
  selPortaria.innerHTML =
    `<option value="">â€” selecione â€”</option>` +
    empresasCache.filter((e) => e.ativo).map((e) => `<option value="${escapeHtml(e.nome)}">${escapeHtml(e.nome)}</option>`).join("");
  if (atualPortaria) selPortaria.value = atualPortaria;
}

document.getElementById("comprador-select").addEventListener("change", (e) => {
  localStorage.setItem("rl_comprador_atual", e.target.value);
  loadMeusPedidos();
});

document.getElementById("motorista-select").addEventListener("change", (e) => {
  localStorage.setItem("rl_motorista_atual", e.target.value);
  rotaAtualId = null;
  loadRotaAtual();
});

// window.prompt() nÃ£o Ã© confiÃ¡vel em vÃ¡rios navegadores/webviews (em
// especial no celular, onde o motorista vai usar) â€” por isso usamos um
// campo de texto normal na tela em vez de uma caixa de diÃ¡logo nativa.
document.getElementById("btn-novo-comprador").addEventListener("click", () => {
  document.getElementById("form-novo-comprador").classList.remove("hidden");
  const input = document.getElementById("novo-comprador-nome");
  input.value = "";
  input.focus();
});

document.getElementById("btn-cancelar-novo-comprador").addEventListener("click", () => {
  document.getElementById("form-novo-comprador").classList.add("hidden");
});

async function confirmarNovoComprador() {
  const nome = document.getElementById("novo-comprador-nome").value.trim();
  if (!nome) return;
  const existente = compradoresCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
  if (!existente) {
    const { error } = await db.from("rl_compradores").insert({ nome });
    if (error) {
      mostrarAviso("Erro ao cadastrar: " + error.message);
      return;
    }
  }
  await loadCompradores();
  document.getElementById("comprador-select").value = nome;
  localStorage.setItem("rl_comprador_atual", nome);
  document.getElementById("form-novo-comprador").classList.add("hidden");
  loadMeusPedidos();
}

document.getElementById("btn-confirmar-novo-comprador").addEventListener("click", confirmarNovoComprador);
document.getElementById("novo-comprador-nome").addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmarNovoComprador();
});

document.getElementById("btn-novo-motorista").addEventListener("click", () => {
  document.getElementById("form-novo-motorista").classList.remove("hidden");
  const input = document.getElementById("novo-motorista-nome");
  input.value = "";
  input.focus();
});

document.getElementById("btn-cancelar-novo-motorista").addEventListener("click", () => {
  document.getElementById("form-novo-motorista").classList.add("hidden");
});

async function confirmarNovoMotorista() {
  const nome = document.getElementById("novo-motorista-nome").value.trim();
  if (!nome) return;
  const existente = motoristasCache.find((m) => m.nome.toLowerCase() === nome.toLowerCase());
  if (!existente) {
    const { error } = await db.from("rl_motoristas").insert({ nome });
    if (error) {
      mostrarAviso("Erro ao cadastrar: " + error.message);
      return;
    }
  }
  await loadMotoristas();
  document.getElementById("motorista-select").value = nome;
  localStorage.setItem("rl_motorista_atual", nome);
  document.getElementById("form-novo-motorista").classList.add("hidden");
  rotaAtualId = null;
  loadRotaAtual();
}

document.getElementById("btn-confirmar-novo-motorista").addEventListener("click", confirmarNovoMotorista);
document.getElementById("novo-motorista-nome").addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmarNovoMotorista();
});

document.getElementById("btn-novo-almoxarife").addEventListener("click", () => {
  document.getElementById("form-novo-almoxarife").classList.remove("hidden");
  const input = document.getElementById("novo-almoxarife-nome");
  input.value = "";
  input.focus();
});

document.getElementById("btn-cancelar-novo-almoxarife").addEventListener("click", () => {
  document.getElementById("form-novo-almoxarife").classList.add("hidden");
});

async function confirmarNovoAlmoxarife() {
  const nome = document.getElementById("novo-almoxarife-nome").value.trim();
  if (!nome) return;
  const existente = almoxarifesCache.find((a) => a.nome.toLowerCase() === nome.toLowerCase());
  if (!existente) {
    const { error } = await db.from("rl_almoxarifes").insert({ nome });
    if (error) {
      mostrarAviso("Erro ao cadastrar: " + error.message);
      return;
    }
  }
  await loadAlmoxarifes();
  document.getElementById("almoxarife-select").value = nome;
  localStorage.setItem("rl_almoxarife_atual", nome);
  document.getElementById("form-novo-almoxarife").classList.add("hidden");
}

document.getElementById("btn-confirmar-novo-almoxarife").addEventListener("click", confirmarNovoAlmoxarife);
document.getElementById("novo-almoxarife-nome").addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmarNovoAlmoxarife();
});

document.getElementById("almoxarife-select").addEventListener("change", (e) => {
  localStorage.setItem("rl_almoxarife_atual", e.target.value);
  const selCif = document.getElementById("almoxarife-select-cif");
  if (selCif) selCif.value = e.target.value;
});
document.getElementById("almoxarife-select-cif").addEventListener("change", (e) => {
  localStorage.setItem("rl_almoxarife_atual", e.target.value);
  document.getElementById("almoxarife-select").value = e.target.value;
  // Troca de almoxarife pode mudar o filtro por empresa/setor â€” reconfere.
  carregarAvisosPortariaPendentes();
  carregarAvisosLiberadosPendentesConferencia();
  carregarPedidosCifPendentes();
});

// Filtro manual de setor â€” sÃ³ afeta os avisos (que tÃªm setor); a lista geral
// de pedidos nÃ£o tem esse campo, entÃ£o nÃ£o muda com esse filtro.
document.getElementById("filtro-setor-cif").addEventListener("change", () => {
  carregarAvisosPortariaPendentes();
  carregarAvisosLiberadosPendentesConferencia();
});

// O nome de quem pediu jÃ¡ vem escrito no prÃ³prio documento (campo
// "Comprador:") â€” nÃ£o faz sentido pedir de novo pra pessoa que sÃ³ estÃ¡
// anexando o arquivo. Acha o cadastro pelo nome (ignorando maiÃºscula/
// espaÃ§o) ou cria um novo automaticamente, igual o robÃ´ faz.
async function selecionarOuCriarComprador(nomeLido) {
  const nome = (nomeLido || "").trim();
  if (!nome) return;
  const existente = compradoresCache.find((c) => c.nome.trim().toLowerCase() === nome.toLowerCase());
  if (!existente) {
    const { error } = await db.from("rl_compradores").insert({ nome });
    if (error) return;
    await loadCompradores();
  }
  const nomeFinal = existente ? existente.nome : nome;
  document.getElementById("comprador-select").value = nomeFinal;
  localStorage.setItem("rl_comprador_atual", nomeFinal);
  loadMeusPedidos();
}

// ---------- comprador: ler pedido com IA ----------
let pedidoItensExtraidos = null;
let pedidoFornecedorExtraido = null;
let pedidoCondicaoPagamentoExtraida = null;
let pedidoCnpjExtraido = null;

document.getElementById("btn-ler-pedido").addEventListener("click", async () => {
  const input = document.getElementById("pedido-arquivo");
  const feedback = document.getElementById("pedido-ia-feedback");
  const file = input.files && input.files[0];
  if (!file) {
    feedback.textContent = "Selecione um arquivo primeiro.";
    feedback.className = "feedback error";
    return;
  }
  feedback.textContent = "Lendo documento com IA (pode levar alguns segundos)...";
  feedback.className = "feedback";
  try {
    const extraido = await lerComIA(file, "pedido");
    pedidoItensExtraidos = Array.isArray(extraido.itens) && extraido.itens.length ? extraido.itens : null;
    pedidoFornecedorExtraido = extraido.fornecedor_nome || null;
    pedidoCondicaoPagamentoExtraida = extraido.condicao_pagamento_codigo || null;
    if (extraido.valor_total != null) document.getElementById("pedido-valor").value = extraido.valor_total;
    if (extraido.numero_pedido) document.getElementById("pedido-numero").value = extraido.numero_pedido;
    if (extraido.local_retirada) document.getElementById("pedido-local").value = extraido.local_retirada;
    await checarPedidoDuplicado(extraido.numero_pedido);
    await selecionarOuCriarComprador(extraido.solicitante_nome);

    // Guarda o CNPJ REALMENTE impresso neste pedido â€” a Wehrmann tem mais de
    // uma filial (CNPJs diferentes) sob o mesmo nome no cadastro, entÃ£o usar
    // o CNPJ genÃ©rico do cadastro em vez do que foi lido aqui causava
    // divergÃªncia falsa na conferÃªncia com a nota (a nota vem da filial
    // certa, mas o pedido ficava salvo com o CNPJ errado da matriz).
    pedidoCnpjExtraido = extraido.empresa_compradora_cnpj || null;

    const cnpjLido = apenasDigitos(extraido.empresa_compradora_cnpj);
    let empresaEncontrada = null;
    if (cnpjLido) empresaEncontrada = empresasCache.find((e) => apenasDigitos(e.cnpj) === cnpjLido);
    if (!empresaEncontrada && extraido.empresa_compradora_nome) {
      const nomeAlvo = extraido.empresa_compradora_nome.trim().toLowerCase();
      empresaEncontrada = empresasCache.find((e) => e.nome.trim().toLowerCase() === nomeAlvo);
    }

    const info = document.getElementById("pedido-empresa-info");
    if (empresaEncontrada) {
      document.getElementById("pedido-empresa").value = String(empresaEncontrada.id);
      info.textContent =
        cnpjLido && cnpjLido !== apenasDigitos(empresaEncontrada.cnpj)
          ? `âš ï¸ CNPJ lido (${extraido.empresa_compradora_cnpj}) Ã© diferente do cadastrado pra "${empresaEncontrada.nome}" â€” provavelmente outra filial. O CNPJ lido serÃ¡ usado na conferÃªncia.`
          : "";
    } else {
      info.textContent = `IA leu: "${extraido.empresa_compradora_nome || "?"}"${
        extraido.empresa_compradora_cnpj ? ` (CNPJ ${extraido.empresa_compradora_cnpj})` : ""
      } â€” nÃ£o encontrada no cadastro. Selecione manualmente ou cadastre em ConfiguraÃ§Ãµes.`;
    }
    // Frete CIF x FOB Ã© decidido pelo nome do arquivo (mesmo padrÃ£o do robÃ´ e
    // do AvanÃ§o para Contratos, que decide spot x contrato do mesmo jeito).
    if (/fob/i.test(file.name)) {
      feedback.textContent = "Documento lido (nome do arquivo indica frete FOB â€” precisa de coleta). Confira os campos abaixo antes de enviar.";
      feedback.className = "feedback success";
    } else {
      feedback.textContent =
        'âš ï¸ O nome do arquivo nÃ£o tem "FOB" â€” parece ser frete CIF (fornecedor entrega), que normalmente nÃ£o precisa de ' +
        "coleta. Confira antes de enviar; envie mesmo assim sÃ³ se tiver certeza que precisa de rota (ou renomeie o arquivo " +
        'incluindo "FOB" antes de anexar).';
      feedback.className = "feedback error";
    }
  } catch (err) {
    feedback.textContent = "Erro: " + err.message;
    feedback.className = "feedback error";
  }
});

// ---------- comprador: enviar pedido ----------
document.getElementById("form-pedido").addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.getElementById("pedido-feedback");
  const compradorNome = document.getElementById("comprador-select").value;
  const file = document.getElementById("pedido-arquivo").files[0];
  if (!compradorNome) {
    feedback.textContent = "Selecione seu nome (comprador) primeiro.";
    feedback.className = "feedback error";
    return;
  }
  if (!file) {
    feedback.textContent = "Anexe o arquivo do pedido.";
    feedback.className = "feedback error";
    return;
  }
  feedback.textContent = "Enviando...";
  feedback.className = "feedback";
  try {
    const { url } = await uploadArquivo(file, "rl_pedidos");
    const empresaId = document.getElementById("pedido-empresa").value || null;
    const empresa = empresaId ? empresasCache.find((e) => String(e.id) === empresaId) : null;
    const valor = document.getElementById("pedido-valor").value;

    const { error } = await db.from("rl_pedidos").insert({
      comprador_nome: compradorNome,
      empresa_id: empresaId,
      empresa_nome: empresa ? empresa.nome : null,
      // Prefere o CNPJ REALMENTE lido no pedido (pode ser de uma filial
      // diferente da cadastrada) â€” sÃ³ cai pro CNPJ do cadastro se a IA nÃ£o
      // conseguiu ler nenhum.
      empresa_cnpj: pedidoCnpjExtraido || (empresa ? empresa.cnpj : null),
      numero_pedido: document.getElementById("pedido-numero").value.trim() || null,
      local_retirada: document.getElementById("pedido-local").value.trim() || null,
      arquivo_url: url,
      arquivo_nome: file.name,
      observacao: document.getElementById("pedido-observacao").value.trim() || null,
      // Mesmo padrÃ£o do FOB: decide pelo nome do arquivo, sem exigir campo
      // manual â€” a maioria dos pedidos chega pelo robÃ´, nÃ£o por este formulÃ¡rio.
      retirar_transportadora: /transportadora/i.test(file.name),
      // Sem "FOB" no nome do arquivo, entende-se que o frete Ã© CIF (o
      // fornecedor entrega) â€” esse pedido nÃ£o entra na tela do motorista,
      // fica disponÃ­vel pro almoxarifado conferir quando a entrega chegar.
      frete_fob: /fob/i.test(file.name),
      valor_total: valor ? Number(valor) : null,
      itens: pedidoItensExtraidos,
      fornecedor_nome: pedidoFornecedorExtraido,
      condicao_pagamento_codigo: pedidoCondicaoPagamentoExtraida,
    });
    if (error) throw error;

    feedback.textContent = "Pedido enviado com sucesso!";
    feedback.className = "feedback success";
    document.getElementById("form-pedido").reset();
    document.getElementById("pedido-empresa-info").textContent = "";
    document.getElementById("pedido-ia-feedback").textContent = "";
    document.getElementById("pedido-duplicado-aviso").classList.add("hidden");
    pedidoItensExtraidos = null;
    pedidoFornecedorExtraido = null;
    pedidoCondicaoPagamentoExtraida = null;
    pedidoCnpjExtraido = null;
    loadMeusPedidos();
  } catch (err) {
    feedback.textContent = "Erro: " + err.message;
    feedback.className = "feedback error";
  }
});

function badgeStatus(status) {
  const label = { pendente: "Pendente", na_rota: "Na rota", concluido: "ConcluÃ­do", cancelado: "Cancelado" }[status] || status;
  return `<span class="badge status-${status}">${label}</span>`;
}

async function loadMeusPedidos() {
  const el = document.getElementById("lista-meus-pedidos");
  const compradorNome = document.getElementById("comprador-select").value;
  if (!compradorNome) {
    el.innerHTML = `<p class="empty-state">Selecione seu nome acima para ver seus pedidos.</p>`;
    return;
  }
  const { data, error } = await comTimeout(
    db.from("rl_pedidos").select("*").eq("comprador_nome", compradorNome).order("criado_em", { ascending: false }).limit(50)
  );
  if (error) {
    el.innerHTML = `<p class="empty-state">Erro ao carregar pedidos.</p>`;
    return;
  }
  if (!data.length) {
    el.innerHTML = `<p class="empty-state">Nenhum pedido enviado ainda.</p>`;
    return;
  }
  el.innerHTML = data
    .map(
      (p) => `
    <div class="card-pedido">
      <div class="card-pedido-head">
        <strong>${escapeHtml(p.empresa_nome || "Empresa nÃ£o informada")}</strong>
        ${badgeStatus(p.status)}
      </div>
      ${p.fornecedor_nome ? `<div class="card-fornecedor">ðŸ¢ ${escapeHtml(p.fornecedor_nome)}</div>` : ""}
      ${p.urgente ? `<span class="badge urgente">Urgente</span>` : ""}
      ${p.parcial_esperado ? `<span class="badge parcial">ðŸ“¦ Pode vir parcial</span>` : ""}
      <div class="card-meta">${formatarDataHora(p.criado_em)}${p.numero_pedido ? ` Â· NÂº ${escapeHtml(p.numero_pedido)}` : ""}</div>
      ${p.local_retirada ? `<div class="card-meta">ðŸ“ ${escapeHtml(p.local_retirada)}</div>` : ""}
      <div class="card-linha"><span>Valor esperado</span><strong>${formatarMoeda(p.valor_total)}</strong></div>
      ${p.observacao ? `<div class="card-meta">${escapeHtml(p.observacao)}</div>` : ""}
      <a class="arquivo-link" href="${p.arquivo_url}" target="_blank" rel="noopener">ðŸ“Ž ${escapeHtml(p.arquivo_nome || "arquivo")}</a>
      ${
        p.status === "pendente"
          ? `<button class="link-btn danger" data-cancelar="${p.id}" type="button">Cancelar pedido</button>`
          : ""
      }
    </div>`
    )
    .join("");
}

// confirm() nativo tem o mesmo problema do prompt() em alguns navegadores â€”
// exige clicar duas vezes no prÃ³prio botÃ£o em vez de abrir um diÃ¡logo.
document.getElementById("lista-meus-pedidos").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-cancelar]");
  if (!btn) return;
  if (!btn.dataset.confirmando) {
    btn.dataset.confirmando = "1";
    btn.textContent = "Clique de novo para confirmar";
    setTimeout(() => {
      delete btn.dataset.confirmando;
      btn.textContent = "Cancelar pedido";
    }, 4000);
    return;
  }
  await db.from("rl_pedidos").update({ status: "cancelado" }).eq("id", btn.dataset.cancelar);
  loadMeusPedidos();
});

// ---------- motorista: pedidos disponÃ­veis ----------
// A cidade nÃ£o Ã© um campo separado â€” vem embutida no texto de local_retirada
// (ex: "AV X, BAIRRO Y, GOIANIA, GO, CEP 74463-330"). Extrai o nome da
// cidade procurando o trecho logo antes da sigla de 2 letras do estado.
function extrairCidade(local) {
  if (!local) return null;
  const m = local.match(/,\s*([^,]+?)\s*,\s*[A-Z]{2}\b/);
  return m ? m[1].trim() : null;
}

let disponiveisCache = [];
let cidadesSelecionadas = new Set();

async function loadDisponiveis() {
  const el = document.getElementById("lista-disponiveis");
  // SÃ³ frete FOB precisa de coleta â€” pedidos CIF (fornecedor entrega) nÃ£o
  // entram nessa tela, ficam disponÃ­veis pro almoxarifado conferir na
  // aba Portaria/HistÃ³rico quando a entrega chegar.
  const { data, error } = await comTimeout(
    db
      .from("rl_pedidos")
      .select("*")
      .eq("status", "pendente")
      .eq("frete_fob", true)
      .order("urgente", { ascending: false })
      .order("criado_em")
  );
  if (error) {
    el.innerHTML = `<p class="empty-state">Erro ao carregar pedidos.</p>`;
    return;
  }
  disponiveisCache = data;

  const cidades = [
    ...new Set(data.filter((p) => !p.retirar_transportadora).map((p) => extrairCidade(p.local_retirada)).filter(Boolean)),
  ].sort();
  // Descarta da seleÃ§Ã£o qualquer cidade que nÃ£o existe mais na lista atual.
  cidadesSelecionadas = new Set([...cidadesSelecionadas].filter((c) => cidades.includes(c)));
  const opcoesCidade = document.getElementById("opcoes-filtro-cidade");
  opcoesCidade.innerHTML = cidades
    .map(
      (c) => `
    <label class="filtro-multiplo-item">
      <input type="checkbox" class="filtro-cidade-check" value="${escapeHtml(c)}" ${cidadesSelecionadas.has(c) ? "checked" : ""}>
      ${escapeHtml(c)}
    </label>`
    )
    .join("");
  atualizarBotaoFiltroCidade();

  const naoTransportadora = data.filter((p) => !p.retirar_transportadora);

  const selComprador = document.getElementById("filtro-comprador");
  const compradorAtual = selComprador.value;
  const compradores = [...new Set(naoTransportadora.map((p) => p.comprador_nome).filter(Boolean))].sort();
  selComprador.innerHTML = `<option value="">Todos os compradores</option>` + compradores.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (compradores.includes(compradorAtual)) selComprador.value = compradorAtual;

  const selFornecedor = document.getElementById("filtro-fornecedor");
  const fornecedorAtual = selFornecedor.value;
  const fornecedores = [...new Set(naoTransportadora.map((p) => p.fornecedor_nome).filter(Boolean))].sort();
  selFornecedor.innerHTML =
    `<option value="">Todos os fornecedores</option>` + fornecedores.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
  if (fornecedores.includes(fornecedorAtual)) selFornecedor.value = fornecedorAtual;

  renderDisponiveis();
  renderTransportadora();
}

function atualizarBotaoFiltroCidade() {
  const btn = document.getElementById("btn-filtro-cidade");
  if (cidadesSelecionadas.size === 0) btn.textContent = "Todas as cidades";
  else if (cidadesSelecionadas.size === 1) btn.textContent = [...cidadesSelecionadas][0];
  else btn.textContent = `${cidadesSelecionadas.size} cidades â–¾`;
}

document.getElementById("btn-filtro-cidade").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("opcoes-filtro-cidade").classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".filtro-multiplo")) document.getElementById("opcoes-filtro-cidade").classList.add("hidden");
});
document.getElementById("opcoes-filtro-cidade").addEventListener("change", (e) => {
  const chk = e.target.closest(".filtro-cidade-check");
  if (!chk) return;
  if (chk.checked) cidadesSelecionadas.add(chk.value);
  else cidadesSelecionadas.delete(chk.value);
  atualizarBotaoFiltroCidade();
  renderDisponiveis();
});

function renderDisponiveis() {
  const el = document.getElementById("lista-disponiveis");
  const compradorFiltro = document.getElementById("filtro-comprador").value;
  const fornecedorFiltro = document.getElementById("filtro-fornecedor").value;
  let data = disponiveisCache.filter((p) => !p.retirar_transportadora);
  if (cidadesSelecionadas.size > 0) data = data.filter((p) => cidadesSelecionadas.has(extrairCidade(p.local_retirada)));
  if (compradorFiltro) data = data.filter((p) => p.comprador_nome === compradorFiltro);
  if (fornecedorFiltro) data = data.filter((p) => p.fornecedor_nome === fornecedorFiltro);

  const totalEl = document.getElementById("total-disponiveis");
  totalEl.textContent = `${data.length} pedido${data.length === 1 ? "" : "s"}`;

  if (!data.length) {
    el.innerHTML = `<p class="empty-state">${
      disponiveisCache.length ? "Nenhum pedido pendente com esse filtro." : "Nenhum pedido pendente no momento."
    }</p>`;
    return;
  }
  el.innerHTML = data
    .map(
      (p) => `
    <div class="card-pedido">
      <div class="card-pedido-head">
        <strong>${escapeHtml(p.empresa_nome || "Empresa nÃ£o informada")}</strong>
        ${p.urgente ? `<span class="badge urgente">Urgente</span>` : ""}
        ${p.parcial_esperado ? `<span class="badge parcial">ðŸ“¦ Pode vir parcial</span>` : ""}
      </div>
      ${p.fornecedor_nome ? `<div class="card-fornecedor">ðŸ¢ ${escapeHtml(p.fornecedor_nome)}</div>` : ""}
      <div class="card-meta">Comprador: ${escapeHtml(p.comprador_nome)} Â· ${formatarDataHora(p.criado_em)}${p.numero_pedido ? ` Â· NÂº ${escapeHtml(p.numero_pedido)}` : ""}</div>
      ${p.local_retirada ? `<div class="card-meta">ðŸ“ ${escapeHtml(p.local_retirada)}</div>` : ""}
      <div class="card-linha"><span>Valor esperado</span><strong>${formatarMoeda(p.valor_total)}</strong></div>
      ${p.observacao ? `<div class="card-meta">${escapeHtml(p.observacao)}</div>` : ""}
      <a class="arquivo-link" href="${p.arquivo_url}" target="_blank" rel="noopener">ðŸ“Ž ${escapeHtml(p.arquivo_nome || "arquivo")}</a>
      <label class="selecionar"><input type="checkbox" class="pedido-check" data-id="${p.id}"> Incluir na rota</label>
      <label class="selecionar"><input type="checkbox" class="toggle-urgente" data-id="${p.id}" ${p.urgente ? "checked" : ""}> Urgente</label>
      <label class="selecionar"><input type="checkbox" class="toggle-parcial" data-id="${p.id}" ${p.parcial_esperado ? "checked" : ""}> ðŸ“¦ Pode vir parcial</label>
      <button class="link-btn danger" data-cancelar-disponivel="${p.id}" type="button">Excluir pedido</button>
    </div>`
    )
    .join("");
}

document.getElementById("filtro-comprador").addEventListener("change", renderDisponiveis);
document.getElementById("filtro-fornecedor").addEventListener("change", renderDisponiveis);
document.getElementById("btn-limpar-filtros").addEventListener("click", () => {
  cidadesSelecionadas.clear();
  document.getElementById("filtro-comprador").value = "";
  document.getElementById("filtro-fornecedor").value = "";
  document.querySelectorAll(".filtro-cidade-check").forEach((c) => (c.checked = false));
  atualizarBotaoFiltroCidade();
  renderDisponiveis();
});

// ---------- motorista: retirada em transportadora (sem rota fixa â€” o
// motorista passa lÃ¡ todo dia sem saber de antemÃ£o o que jÃ¡ chegou, entÃ£o
// aqui ele conclui direto, sem passar pelo fluxo de "montar rota") ----------
function renderTransportadora() {
  const el = document.getElementById("lista-transportadora");
  const data = disponiveisCache.filter((p) => p.retirar_transportadora);

  if (!data.length) {
    el.innerHTML = `<p class="empty-state">Nenhum pedido aguardando retirada em transportadora.</p>`;
    return;
  }
  el.innerHTML = data
    .map(
      (p) => `
    <div class="card-pedido">
      <div class="card-pedido-head">
        <strong>${escapeHtml(p.empresa_nome || "Empresa nÃ£o informada")}</strong>
        ${p.urgente ? `<span class="badge urgente">Urgente</span>` : ""}
        ${p.parcial_esperado ? `<span class="badge parcial">ðŸ“¦ Pode vir parcial</span>` : ""}
      </div>
      ${p.fornecedor_nome ? `<div class="card-fornecedor">ðŸ¢ ${escapeHtml(p.fornecedor_nome)}</div>` : ""}
      <div class="card-meta">Comprador: ${escapeHtml(p.comprador_nome)} Â· ${formatarDataHora(p.criado_em)}${p.numero_pedido ? ` Â· NÂº ${escapeHtml(p.numero_pedido)}` : ""}</div>
      <div class="card-linha"><span>Valor esperado</span><strong>${formatarMoeda(p.valor_total)}</strong></div>
      ${p.observacao ? `<div class="card-meta">${escapeHtml(p.observacao)}</div>` : ""}
      <a class="arquivo-link" href="${p.arquivo_url}" target="_blank" rel="noopener">ðŸ“Ž ${escapeHtml(p.arquivo_nome || "arquivo")}</a>
      <label class="selecionar"><input type="checkbox" class="toggle-urgente" data-id="${p.id}" ${p.urgente ? "checked" : ""}> Urgente</label>
      <label class="selecionar"><input type="checkbox" class="toggle-parcial" data-id="${p.id}" ${p.parcial_esperado ? "checked" : ""}> ðŸ“¦ Pode vir parcial</label>
      <button class="btn primary small" type="button" data-concluir-transportadora="${p.id}">ðŸ“¦ Encontrei â€” concluir</button>
      <button class="link-btn danger" data-cancelar-disponivel="${p.id}" type="button">Excluir pedido</button>
    </div>`
    )
    .join("");
}

document.getElementById("lista-transportadora").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-concluir-transportadora]");
  if (!btn) return;
  const motoristaNome = document.getElementById("motorista-select").value;
  if (!motoristaNome) return mostrarAviso("Selecione seu nome (motorista) primeiro.");
  const pedidoId = btn.dataset.concluirTransportadora;
  btn.disabled = true;
  try {
    const rotaId = await getOrCreateRotaAtiva(motoristaNome);
    const baseOrdem = paradasCache.length;
    const { error: errParada } = await db.from("rl_rota_paradas").insert({ rota_id: rotaId, pedido_id: pedidoId, ordem: baseOrdem });
    if (errParada) throw errParada;
    const { error: errPedido } = await db.from("rl_pedidos").update({ status: "na_rota" }).eq("id", pedidoId);
    if (errPedido) throw errPedido;

    await Promise.all([loadDisponiveis(), loadRotaAtual()]);
    const parada = paradasCache.find((p) => p.pedido_id === pedidoId);
    if (parada) abrirModalConcluir(parada);
  } catch (err) {
    mostrarAviso("Erro: " + err.message);
    btn.disabled = false;
  }
});

document.getElementById("btn-atualizar-transportadora").addEventListener("click", loadDisponiveis);

// mesmo padrÃ£o de confirmaÃ§Ã£o por duplo clique usado em "Meus pedidos" â€”
// compartilhado entre "Pedidos disponÃ­veis" e "Retirada em transportadora".
async function excluirPedidoDisponivelClick(e) {
  const btn = e.target.closest("button[data-cancelar-disponivel]");
  if (!btn) return;
  if (!btn.dataset.confirmando) {
    btn.dataset.confirmando = "1";
    btn.textContent = "Clique de novo para confirmar";
    setTimeout(() => {
      delete btn.dataset.confirmando;
      btn.textContent = "Excluir pedido";
    }, 4000);
    return;
  }
  await db.from("rl_pedidos").update({ status: "cancelado" }).eq("id", btn.dataset.cancelarDisponivel);
  loadDisponiveis();
}
document.getElementById("lista-disponiveis").addEventListener("click", excluirPedidoDisponivelClick);
document.getElementById("lista-transportadora").addEventListener("click", excluirPedidoDisponivelClick);

// Urgente/parcial marcados aqui (nÃ£o no formulÃ¡rio de anexar) porque a
// maioria dos pedidos chega pelo robÃ´, sem ninguÃ©m preenchendo formulÃ¡rio.
async function toggleUrgentePartialChange(e) {
  const chkUrgente = e.target.closest("input.toggle-urgente");
  const chkParcial = e.target.closest("input.toggle-parcial");
  if (chkUrgente) {
    await db.from("rl_pedidos").update({ urgente: chkUrgente.checked }).eq("id", chkUrgente.dataset.id);
    await loadDisponiveis();
  }
  if (chkParcial) {
    await db.from("rl_pedidos").update({ parcial_esperado: chkParcial.checked }).eq("id", chkParcial.dataset.id);
    await loadDisponiveis();
  }
}
document.getElementById("lista-disponiveis").addEventListener("change", toggleUrgentePartialChange);
document.getElementById("lista-transportadora").addEventListener("change", (e) => {
  toggleUrgentePartialChange(e);
});

document.getElementById("btn-montar-rota").addEventListener("click", async () => {
  const motoristaNome = document.getElementById("motorista-select").value;
  if (!motoristaNome) return mostrarAviso("Selecione seu nome (motorista) primeiro.");
  const ids = Array.from(document.querySelectorAll(".pedido-check:checked")).map((c) => c.dataset.id);
  if (!ids.length) return mostrarAviso("Selecione ao menos um pedido.");

  const btn = document.getElementById("btn-montar-rota");
  btn.disabled = true;
  try {
    const rotaId = await getOrCreateRotaAtiva(motoristaNome);
    const baseOrdem = paradasCache.length;
    const novasParadas = ids.map((pedido_id, i) => ({ rota_id: rotaId, pedido_id, ordem: baseOrdem + i }));
    const { error: errParadas } = await db.from("rl_rota_paradas").insert(novasParadas);
    if (errParadas) throw errParadas;

    const { error: errPedidos } = await db.from("rl_pedidos").update({ status: "na_rota" }).in("id", ids);
    if (errPedidos) throw errPedidos;

    await loadDisponiveis();
    await loadRotaAtual();
  } catch (err) {
    mostrarAviso("Erro ao montar rota: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- motorista: rota do dia ----------
let rotaAtualId = null;
let paradasCache = [];
let dragIndex = null;
let paradaEmEdicao = null;
let cidadesSelecionadasRota = new Set();

function atualizarBotaoFiltroCidadeRota() {
  const btn = document.getElementById("btn-filtro-cidade-rota");
  if (cidadesSelecionadasRota.size === 0) btn.textContent = "Todas as cidades";
  else if (cidadesSelecionadasRota.size === 1) btn.textContent = [...cidadesSelecionadasRota][0];
  else btn.textContent = `${cidadesSelecionadasRota.size} cidades â–¾`;
}

document.getElementById("btn-filtro-cidade-rota").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("opcoes-filtro-cidade-rota").classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".filtro-multiplo")) document.getElementById("opcoes-filtro-cidade-rota").classList.add("hidden");
});
document.getElementById("opcoes-filtro-cidade-rota").addEventListener("change", (e) => {
  const chk = e.target.closest(".filtro-cidade-check-rota");
  if (!chk) return;
  if (chk.checked) cidadesSelecionadasRota.add(chk.value);
  else cidadesSelecionadasRota.delete(chk.value);
  atualizarBotaoFiltroCidadeRota();
  renderRota();
});
document.getElementById("filtro-comprador-rota").addEventListener("change", renderRota);
document.getElementById("filtro-fornecedor-rota").addEventListener("change", renderRota);
document.getElementById("btn-limpar-filtros-rota").addEventListener("click", () => {
  cidadesSelecionadasRota.clear();
  document.getElementById("filtro-comprador-rota").value = "";
  document.getElementById("filtro-fornecedor-rota").value = "";
  document.querySelectorAll(".filtro-cidade-check-rota").forEach((c) => (c.checked = false));
  atualizarBotaoFiltroCidadeRota();
  renderRota();
});

async function getOrCreateRotaAtiva(motoristaNome) {
  if (rotaAtualId) return rotaAtualId;
  const { data } = await comTimeout(
    db.from("rl_rotas").select("*").eq("motorista_nome", motoristaNome).eq("status", "em_andamento").order("criado_em", { ascending: false }).limit(1)
  );
  if (data && data.length) {
    rotaAtualId = data[0].id;
    return rotaAtualId;
  }
  const { data: nova, error } = await db.from("rl_rotas").insert({ motorista_nome: motoristaNome }).select().single();
  if (error) throw error;
  rotaAtualId = nova.id;
  return rotaAtualId;
}

// paradasCache guarda sÃ³ as paradas AINDA PENDENTES da rota atual â€” assim
// que uma parada Ã© concluÃ­da, ela sai daqui e some da tela "Minha rota de
// hoje" (vai aparecer no HistÃ³rico). O contador de progresso usa uma
// contagem Ã  parte, jÃ¡ que as concluÃ­das nÃ£o ficam mais no array.
let rotaProgresso = { concluidas: 0, total: 0 };

async function loadRotaAtual() {
  const motoristaNome = document.getElementById("motorista-select").value;
  const progresso = document.getElementById("rota-progresso");
  const lista = document.getElementById("lista-rota");
  if (!motoristaNome) {
    progresso.textContent = "";
    lista.innerHTML = `<li class="empty-state">Selecione seu nome acima.</li>`;
    return;
  }
  const { data: rotas } = await comTimeout(
    db.from("rl_rotas").select("*").eq("motorista_nome", motoristaNome).eq("status", "em_andamento").order("criado_em", { ascending: false }).limit(1)
  );
  const btnExcluir = document.getElementById("btn-excluir-rota");
  const btnExcluirSelecionadas = document.getElementById("btn-excluir-selecionadas");
  if (!rotas || !rotas.length) {
    rotaAtualId = null;
    paradasCache = [];
    progresso.textContent = "";
    lista.innerHTML = `<li class="empty-state">Nenhuma rota em andamento. Selecione pedidos acima e clique em "Montar rota".</li>`;
    btnExcluir.classList.add("hidden");
    btnExcluirSelecionadas.classList.add("hidden");
    document.getElementById("btn-abrir-maps").classList.add("hidden");
    return;
  }
  rotaAtualId = rotas[0].id;
  btnExcluir.classList.remove("hidden");

  const { data: todasParadas } = await comTimeout(
    db.from("rl_rota_paradas").select("id, status, rl_pedidos(fornecedor_nome)").eq("rota_id", rotaAtualId)
  );
  // "Parada" de verdade Ã© por fornecedor (mesmo endereÃ§o) â€” vÃ¡rios pedidos
  // do mesmo fornecedor contam como uma parada sÃ³. Uma parada sÃ³ conta como
  // concluÃ­da quando TODOS os pedidos daquele fornecedor jÃ¡ foram concluÃ­dos.
  const gruposPorFornecedor = new Map();
  (todasParadas || []).forEach((p) => {
    const chave = (p.rl_pedidos || {}).fornecedor_nome || `pedido-${p.id}`;
    if (!gruposPorFornecedor.has(chave)) gruposPorFornecedor.set(chave, []);
    gruposPorFornecedor.get(chave).push(p.status);
  });
  rotaProgresso = {
    total: gruposPorFornecedor.size,
    concluidas: [...gruposPorFornecedor.values()].filter((statuses) => statuses.every((s) => s === "concluida")).length,
  };

  const { data: paradas, error } = await comTimeout(
    db.from("rl_rota_paradas").select("*, rl_pedidos(*)").eq("rota_id", rotaAtualId).eq("status", "pendente").order("ordem")
  );
  if (error) {
    lista.innerHTML = `<li class="empty-state">Erro ao carregar rota.</li>`;
    return;
  }
  paradasCache = paradas || [];

  const cidadesRota = [
    ...new Set(paradasCache.map((p) => extrairCidade((p.rl_pedidos || {}).local_retirada)).filter(Boolean)),
  ].sort();
  cidadesSelecionadasRota = new Set([...cidadesSelecionadasRota].filter((c) => cidadesRota.includes(c)));
  document.getElementById("opcoes-filtro-cidade-rota").innerHTML = cidadesRota
    .map(
      (c) => `
    <label class="filtro-multiplo-item">
      <input type="checkbox" class="filtro-cidade-check-rota" value="${escapeHtml(c)}" ${cidadesSelecionadasRota.has(c) ? "checked" : ""}>
      ${escapeHtml(c)}
    </label>`
    )
    .join("");
  atualizarBotaoFiltroCidadeRota();

  const selCompradorRota = document.getElementById("filtro-comprador-rota");
  const compradorRotaAtual = selCompradorRota.value;
  const compradoresRota = [...new Set(paradasCache.map((p) => (p.rl_pedidos || {}).comprador_nome).filter(Boolean))].sort();
  selCompradorRota.innerHTML =
    `<option value="">Todos os compradores</option>` + compradoresRota.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (compradoresRota.includes(compradorRotaAtual)) selCompradorRota.value = compradorRotaAtual;

  const selFornecedorRota = document.getElementById("filtro-fornecedor-rota");
  const fornecedorRotaAtual = selFornecedorRota.value;
  const fornecedoresRota = [...new Set(paradasCache.map((p) => (p.rl_pedidos || {}).fornecedor_nome).filter(Boolean))].sort();
  selFornecedorRota.innerHTML =
    `<option value="">Todos os fornecedores</option>` + fornecedoresRota.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
  if (fornecedoresRota.includes(fornecedorRotaAtual)) selFornecedorRota.value = fornecedorRotaAtual;

  renderRota();
}

// Paradas ainda pendentes voltam pro estoque de "pedidos disponÃ­veis" (o
// motorista pode ter errado a seleÃ§Ã£o ou precisa recomeÃ§ar). Paradas jÃ¡
// concluÃ­das (com nota fiscal jÃ¡ registrada) NÃƒO sÃ£o mexidas â€” a coleta jÃ¡
// aconteceu de verdade, apagar isso destruiria a conferÃªncia feita e o
// indicador de "coletados por mÃªs". A rota em si vira "cancelada" (some da
// tela) em vez de apagada, preservando o histÃ³rico.
document.getElementById("btn-excluir-rota").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  if (!rotaAtualId) return;
  if (!btn.dataset.confirmando) {
    btn.dataset.confirmando = "1";
    btn.textContent = "Clique de novo para confirmar";
    setTimeout(() => {
      delete btn.dataset.confirmando;
      btn.textContent = "Excluir rota";
    }, 4000);
    return;
  }
  delete btn.dataset.confirmando;
  btn.disabled = true;
  try {
    const pendentesIds = paradasCache.map((p) => p.pedido_id);
    if (pendentesIds.length) {
      const { error: errPedidos } = await db.from("rl_pedidos").update({ status: "pendente" }).in("id", pendentesIds);
      if (errPedidos) throw errPedidos;
    }
    const { error: errRota } = await db.from("rl_rotas").update({ status: "cancelada" }).eq("id", rotaAtualId);
    if (errRota) throw errRota;

    btn.textContent = "Excluir rota";
    rotaAtualId = null;
    paradasCache = [];
    await Promise.all([loadDisponiveis(), loadRotaAtual()]);
  } catch (err) {
    mostrarAviso("Erro ao excluir rota: " + err.message);
    btn.textContent = "Excluir rota";
  } finally {
    btn.disabled = false;
  }
});

// Remove sÃ³ as paradas marcadas (o pedido delas volta pra fila de
// disponÃ­veis) â€” diferente de "Excluir rota", que mexe em todas de uma vez.
document.getElementById("btn-excluir-selecionadas").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const marcadas = Array.from(document.querySelectorAll(".parada-check:checked")).map((c) => c.dataset.paradaId);
  if (!marcadas.length) {
    mostrarAviso("Marque ao menos uma parada pra excluir.");
    return;
  }
  if (!btn.dataset.confirmando) {
    btn.dataset.confirmando = "1";
    btn.textContent = `Clique de novo pra confirmar (${marcadas.length})`;
    setTimeout(() => {
      delete btn.dataset.confirmando;
      btn.textContent = "Excluir selecionadas";
    }, 4000);
    return;
  }
  delete btn.dataset.confirmando;
  btn.disabled = true;
  try {
    const paradasSelecionadas = paradasCache.filter((p) => marcadas.includes(String(p.id)));
    const pedidoIds = paradasSelecionadas.map((p) => p.pedido_id);
    if (pedidoIds.length) {
      const { error: errPedidos } = await db.from("rl_pedidos").update({ status: "pendente" }).in("id", pedidoIds);
      if (errPedidos) throw errPedidos;
    }
    const { error: errParadas } = await db.from("rl_rota_paradas").delete().in("id", marcadas);
    if (errParadas) throw errParadas;

    btn.textContent = "Excluir selecionadas";
    await Promise.all([loadDisponiveis(), loadRotaAtual()]);
  } catch (err) {
    mostrarAviso("Erro ao excluir selecionadas: " + err.message);
    btn.textContent = "Excluir selecionadas";
  } finally {
    btn.disabled = false;
  }
});

// Deep link do Google Maps â€” abre direto no app de navegaÃ§Ã£o do celular,
// sem precisar de nenhuma chave de API. Sem "origin" definido, o prÃ³prio
// Maps usa a localizaÃ§Ã£o atual do motorista como ponto de partida.
//
// O endereÃ§o completo (rua/quadra/lote + bairro + cidade + UF + CEP num
// texto sÃ³) Ã s vezes tem termos que o Maps nÃ£o reconhece â€” testamos e
// confirmamos que usar sÃ³ o CEP Ã© bem mais confiÃ¡vel (encontra certo atÃ©
// em endereÃ§os de quadra/lote de BrasÃ­lia que o texto completo nÃ£o achava),
// entÃ£o preferimos o CEP quando ele existir no texto.
function extrairCEP(local) {
  if (!local) return null;
  const m = local.match(/\d{5}-?\d{3}/);
  return m ? m[0] : null;
}

function enderecoParaMaps(endereco) {
  const cep = extrairCEP(endereco);
  return cep ? `${cep}, Brasil` : endereco;
}

function linkMapsDestino(endereco) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoParaMaps(endereco))}&travelmode=driving`;
}

function linkMapsRota(enderecos) {
  const convertidos = enderecos.map(enderecoParaMaps);
  const destino = convertidos[convertidos.length - 1];
  const waypoints = convertidos.slice(0, -1);
  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
  if (waypoints.length) url += `&waypoints=${waypoints.map(encodeURIComponent).join("|")}`;
  return url;
}

document.getElementById("btn-abrir-maps").addEventListener("click", () => {
  const enderecos = paradasCache.map((p) => (p.rl_pedidos || {}).local_retirada).filter(Boolean);
  if (!enderecos.length) {
    mostrarAviso("Nenhuma parada pendente com endereÃ§o cadastrado.");
    return;
  }
  if (enderecos.length > 9) {
    mostrarAviso("O Google Maps sÃ³ aceita atÃ© 9 paradas de uma vez por esse link â€” abrindo com as 9 primeiras.");
  }
  window.open(linkMapsRota(enderecos.slice(0, 9)), "_blank", "noopener");
});

function renderRota() {
  const progresso = document.getElementById("rota-progresso");
  const lista = document.getElementById("lista-rota");
  const btnExcluirSelecionadas = document.getElementById("btn-excluir-selecionadas");
  const btnAbrirMaps = document.getElementById("btn-abrir-maps");
  btnExcluirSelecionadas.classList.toggle("hidden", !paradasCache.length);
  btnAbrirMaps.classList.toggle("hidden", !paradasCache.length);

  if (!rotaProgresso.total) {
    progresso.textContent = "";
    lista.innerHTML = `<li class="empty-state">Nenhuma parada na rota ainda.</li>`;
    return;
  }
  progresso.textContent = `${rotaProgresso.concluidas} de ${rotaProgresso.total} paradas distintas concluÃ­das.${
    rotaProgresso.concluidas ? " As jÃ¡ concluÃ­das aparecem na aba HistÃ³rico." : ""
  }`;

  if (!paradasCache.length) {
    lista.innerHTML = `<li class="empty-state">Todas as paradas desta rota jÃ¡ foram concluÃ­das. Veja o detalhe na aba HistÃ³rico.</li>`;
    return;
  }

  const compradorFiltroRota = document.getElementById("filtro-comprador-rota").value;
  const fornecedorFiltroRota = document.getElementById("filtro-fornecedor-rota").value;
  // MantÃ©m o Ã­ndice ORIGINAL em paradasCache (nÃ£o a posiÃ§Ã£o no filtro) no
  // data-index, pra arrastar/soltar continuar reordenando a rota de verdade
  // mesmo com o filtro aplicado â€” sÃ³ o nÃºmero mostrado (â‘ â‘¡â‘¢) Ã© sequencial.
  const visiveis = paradasCache
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => {
      const pedido = p.rl_pedidos || {};
      if (cidadesSelecionadasRota.size > 0 && !cidadesSelecionadasRota.has(extrairCidade(pedido.local_retirada))) return false;
      if (compradorFiltroRota && pedido.comprador_nome !== compradorFiltroRota) return false;
      if (fornecedorFiltroRota && pedido.fornecedor_nome !== fornecedorFiltroRota) return false;
      return true;
    });

  // "Parada" de verdade Ã© por fornecedor (mesmo endereÃ§o) â€” vÃ¡rios pedidos
  // do mesmo fornecedor viram um sÃ³ card ainda, entÃ£o o nÃºmero de pedidos e
  // o de paradas reais (fornecedores distintos) podem ser diferentes.
  const fornecedoresDistintos = new Set(visiveis.map(({ p }) => (p.rl_pedidos || {}).fornecedor_nome || `pedido-${p.id}`)).size;
  document.getElementById("total-rota").textContent =
    `${visiveis.length} pedido${visiveis.length === 1 ? "" : "s"} Â· ${fornecedoresDistintos} parada${fornecedoresDistintos === 1 ? "" : "s"} (fornecedores distintos)`;

  if (!visiveis.length) {
    lista.innerHTML = `<li class="empty-state">Nenhuma parada pendente com esse filtro.</li>`;
    return;
  }

  lista.innerHTML = visiveis
    .map(({ p, i }, posicao) => {
      const pedido = p.rl_pedidos || {};
      return `
      <li class="rota-item" draggable="true" data-index="${i}">
        <input type="checkbox" class="parada-check" data-parada-id="${p.id}">
        <span class="drag-handle">â ¿</span>
        <span class="ordem-num">${posicao + 1}</span>
        <div class="rota-item-info">
          <strong>${escapeHtml(pedido.empresa_nome || "Empresa nÃ£o informada")}</strong>
          ${pedido.urgente ? `<span class="badge urgente">Urgente</span>` : ""}
          ${pedido.parcial_esperado ? `<span class="badge parcial">ðŸ“¦ Pode vir parcial</span>` : ""}
          ${pedido.fornecedor_nome ? `<span class="card-fornecedor">ðŸ¢ ${escapeHtml(pedido.fornecedor_nome)}</span>` : ""}
          <span>Comprador: ${escapeHtml(pedido.comprador_nome || "â€”")} Â· Valor esperado: ${formatarMoeda(pedido.valor_total)}</span>
          ${
            pedido.local_retirada
              ? `<span>ðŸ“ ${escapeHtml(pedido.local_retirada)} Â· <a class="arquivo-link" href="${linkMapsDestino(pedido.local_retirada)}" target="_blank" rel="noopener">Navegar</a></span>`
              : ""
          }
          ${pedido.arquivo_url ? `<a class="arquivo-link" href="${pedido.arquivo_url}" target="_blank" rel="noopener">ðŸ“Ž pedido</a>` : ""}
        </div>
        <button class="btn secondary small" type="button" data-concluir="${p.id}">Concluir</button>
      </li>`;
    })
    .join("");
}

// drag and drop pra reordenar a rota
document.getElementById("lista-rota").addEventListener("dragstart", (e) => {
  const li = e.target.closest(".rota-item");
  if (!li) return;
  dragIndex = Number(li.dataset.index);
  li.classList.add("dragging");
});

document.getElementById("lista-rota").addEventListener("dragend", (e) => {
  e.target.closest(".rota-item")?.classList.remove("dragging");
});

document.getElementById("lista-rota").addEventListener("dragover", (e) => e.preventDefault());

document.getElementById("lista-rota").addEventListener("drop", async (e) => {
  e.preventDefault();
  const li = e.target.closest(".rota-item");
  if (!li || dragIndex == null) return;
  const dropIndex = Number(li.dataset.index);
  if (dragIndex === dropIndex) return;
  const item = paradasCache.splice(dragIndex, 1)[0];
  paradasCache.splice(dropIndex, 0, item);
  dragIndex = null;
  renderRota();
  await Promise.all(paradasCache.map((p, i) => db.from("rl_rota_paradas").update({ ordem: i }).eq("id", p.id)));
});

// ---------- concluir parada (modal com conferÃªncia) ----------
// "notaPreLida" (opcional) vem preenchido quando a portaria jÃ¡ anexou e leu
// a nota com IA no aviso â€” nesse caso pula direto pra conferÃªncia, sem pedir
// pra fotografar/ler de novo o mesmo documento.
function abrirModalConcluir(parada, notaPreLida) {
  paradaEmEdicao = parada;
  notaItensExtraidos = notaPreLida ? notaPreLida.itens : null;
  notaTipoDocumento = notaPreLida ? notaPreLida.tipo_documento : null;
  notaEmitenteExtraido = notaPreLida ? notaPreLida.emitente_nome : null;
  notaDataEmissaoExtraida = notaPreLida ? notaPreLida.data_emissao : null;
  notaParcelasExtraidas = notaPreLida ? notaPreLida.parcelas : null;
  notaArquivoUrlPreLido = notaPreLida ? notaPreLida.arquivo_url : null;
  document.getElementById("form-modal-nota").reset();
  // jÃ¡ vem prÃ©-marcado se o comprador/motorista sinalizou antes, em
  // "Pedidos disponÃ­veis", que esse pedido costuma vir em partes.
  document.getElementById("nota-parcial").checked = !!(paradaEmEdicao.rl_pedidos || {}).parcial_esperado;
  document.getElementById("nota-ia-feedback").textContent = "";
  document.getElementById("modal-feedback").textContent = "";
  document.getElementById("conferencia-resultado").classList.add("hidden");

  // Link pro anexo original do pedido de compra â€” Ãºtil pra conferir o
  // documento fonte sem precisar sair do modal (ex: dÃºvida sobre um item).
  const arquivoPedido = (paradaEmEdicao.rl_pedidos || {}).arquivo_url;
  const blocoPedidoAnexo = document.getElementById("bloco-pedido-anexo");
  if (arquivoPedido) {
    document.getElementById("link-pedido-anexo").href = arquivoPedido;
    blocoPedidoAnexo.classList.remove("hidden");
  } else {
    blocoPedidoAnexo.classList.add("hidden");
  }

  const inputNota = document.getElementById("nota-arquivo");
  if (notaPreLida) {
    document.getElementById("nota-valor").value = notaPreLida.valor_total ?? "";
    document.getElementById("nota-cnpj").value = notaPreLida.cnpj || "";
    document.getElementById("nota-numero").value = notaPreLida.numero || "";
    document.getElementById("link-nota-pre-lida").href = notaPreLida.arquivo_url;
    document.getElementById("bloco-nota-pre-lida").classList.remove("hidden");
    document.getElementById("bloco-upload-nota").classList.add("hidden");
    inputNota.required = false;
    atualizarConferencia();
  } else {
    document.getElementById("bloco-nota-pre-lida").classList.add("hidden");
    document.getElementById("bloco-upload-nota").classList.remove("hidden");
    inputNota.required = true;
  }

  document.getElementById("modal-overlay").classList.remove("hidden");
}

document.getElementById("btn-reler-nota").addEventListener("click", () => {
  notaArquivoUrlPreLido = null;
  document.getElementById("bloco-nota-pre-lida").classList.add("hidden");
  document.getElementById("bloco-upload-nota").classList.remove("hidden");
  document.getElementById("nota-arquivo").required = true;
});

document.getElementById("lista-rota").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-concluir]");
  if (!btn) return;
  const parada = paradasCache.find((p) => String(p.id) === btn.dataset.concluir);
  if (!parada) return;
  abrirModalConcluir(parada);
});

document.getElementById("btn-modal-fechar").addEventListener("click", () => {
  document.getElementById("modal-overlay").classList.add("hidden");
  paradaEmEdicao = null;
});

let notaItensExtraidos = null;
let notaTipoDocumento = null;
let notaEmitenteExtraido = null;
let notaDataEmissaoExtraida = null;
let notaParcelasExtraidas = null;
// Preenchido quando a nota jÃ¡ veio lida da portaria (ver iniciarConferenciaCif)
// â€” nesse caso nÃ£o faz sentido pedir upload de novo, sÃ³ reaproveitar a URL.
let notaArquivoUrlPreLido = null;

async function lerNotaComIA() {
  const input = document.getElementById("nota-arquivo");
  const feedback = document.getElementById("nota-ia-feedback");
  const file = input.files && input.files[0];
  if (!file) {
    feedback.textContent = "Selecione/tire a foto da nota primeiro.";
    feedback.className = "feedback error";
    return;
  }
  feedback.textContent = "Lendo nota com IA...";
  feedback.className = "feedback";
  try {
    const extraido = await lerComIA(file, "nota");
    if (extraido.valor_total != null) document.getElementById("nota-valor").value = extraido.valor_total;
    if (extraido.destinatario_cnpj) document.getElementById("nota-cnpj").value = extraido.destinatario_cnpj;
    if (extraido.numero_nota) document.getElementById("nota-numero").value = extraido.numero_nota;
    notaItensExtraidos = Array.isArray(extraido.itens) && extraido.itens.length ? extraido.itens : null;
    notaTipoDocumento = extraido.tipo_documento || null;
    notaEmitenteExtraido = extraido.emitente_nome || null;
    notaDataEmissaoExtraida = extraido.data_emissao || null;
    notaParcelasExtraidas =
      Array.isArray(extraido.parcelas_pagamento) && extraido.parcelas_pagamento.length ? extraido.parcelas_pagamento : null;
    feedback.textContent =
      notaTipoDocumento === "servico"
        ? "Nota de serviÃ§o lida. Confira o tomador, a prestadora e o valor abaixo."
        : "Nota lida. Confira os valores abaixo.";
    feedback.className = "feedback success";
    atualizarConferencia();
  } catch (err) {
    feedback.textContent = "Erro: " + err.message;
    feedback.className = "feedback error";
  }
}

document.getElementById("btn-ler-nota").addEventListener("click", lerNotaComIA);
// Roda sozinho assim que a foto Ã© escolhida â€” sem depender do motorista
// lembrar de clicar em "Ler nota com IA" (na prÃ¡tica, quando ele esquecia,
// a conferÃªncia ficava toda em branco e ele acabava marcando qualquer coisa
// como "Entrega parcial" sÃ³ pra conseguir enviar). O botÃ£o continua aqui
// pra reler manualmente se precisar.
document.getElementById("nota-arquivo").addEventListener("change", lerNotaComIA);

// Casa os itens do pedido com os da nota pelo nome do produto (a ordem pode
// mudar de um documento pro outro). Tenta igualdade exata primeiro, depois
// um item "conter" o outro (nomes costumam variar um pouco entre pedido e
// nota do mesmo produto).
function normalizarProduto(nome) {
  // Sem tirar acento, "QuÃ­mica" (como a portaria/nota Ã s vezes escreve) nÃ£o
  // batia com "QUIMICA" (como a IA Ã s vezes lÃª do pedido) â€” nem em produto
  // nem em nome de fornecedor (normalizarEmpresa usa esta funÃ§Ã£o por baixo).
  return String(nome || "")
    .normalize("NFD")
    .replace(/[Ì€-Í¯]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// O mesmo produto Ã s vezes aparece em mais de uma linha num dos dois
// documentos (ex: pedido lista "FILTRO DE Ã“LEO" em 2 linhas de 5, cada uma
// com um centro de custo/data diferente, e a nota junta tudo numa linha sÃ³
// de 10) â€” sem agrupar antes, a comparaÃ§Ã£o linha-a-linha acusaria
// divergÃªncia de quantidade numa linha e "nÃ£o encontrado" na outra, mesmo
// batendo tudo certo no total. Agrupa por nome antes de comparar, somando
// quantidade e tirando a mÃ©dia do valor unitÃ¡rio ponderada pela quantidade.
function agruparPorProduto(itens) {
  const grupos = new Map();
  itens.forEach((item) => {
    const chave = normalizarProduto(item.produto_nome);
    if (!grupos.has(chave)) grupos.set(chave, { ...item, quantidade: 0, __pesoValor: 0, __pesoQtd: 0 });
    const g = grupos.get(chave);
    const qtd = item.quantidade || 0;
    g.quantidade += qtd;
    if (item.valor_unitario != null) {
      g.__pesoValor += item.valor_unitario * (qtd || 1);
      g.__pesoQtd += qtd || 1;
    }
  });
  return [...grupos.values()].map((g) => {
    const valor_unitario = g.__pesoQtd > 0 ? g.__pesoValor / g.__pesoQtd : g.valor_unitario;
    const { __pesoValor, __pesoQtd, ...resto } = g;
    return { ...resto, valor_unitario };
  });
}

// Fornecedor Ã s vezes vende por embalagem "fechada" (ex: nota em CENTO/CT =
// 100 unidades, DÃšZIA/DZ = 12) enquanto o pedido conta unidade por unidade â€”
// sem converter ANTES de comparar, tanto a quantidade quanto o valor
// unitÃ¡rio da nota ficam numa escala totalmente diferente da do pedido (10
// CT x R$3,50 vs 1000 UN x R$0,09), o que quebra atÃ© o casamento por nome
// parecido/cÃ³digo, porque o preÃ§o "nÃ£o bate nem de longe". Convertendo pra
// unidade individual antes de tentar casar os itens, o valor unitÃ¡rio passa
// a ficar bem prÃ³ximo do esperado e o casamento funciona normal.
const FATORES_EMBALAGEM = { ct: 100, cento: 100, dz: 12, duzia: 12, milheiro: 1000, mil: 1000 };

function converterEmbalagem(item) {
  // Se a coluna "UND" da nota veio no formato "FD/0020/UN" (sigla / fator /
  // sigla-menor), a IA copia essa string inteira pro campo unidade (sem
  // separar em campo prÃ³prio â€” um campo a mais no schema da IA estourou o
  // limite de complexidade da API, "Schema is too complex"). Extrai o fator
  // aqui, Ã© especÃ­fico de cada produto/nota, bem mais confiÃ¡vel que a tabela
  // fixa abaixo (que sÃ³ cobre unidades padronizadas tipo "cento"/"dÃºzia",
  // sempre com o mesmo fator; "fardo" e "caixa" variam de produto pra produto).
  const unidadeOriginal = String(item.unidade || "").trim();
  const matchBarras = unidadeOriginal.match(/^([a-z]+)\s*\/\s*0*(\d+)\s*\/\s*[a-z]+$/i);
  const fator = matchBarras ? Number(matchBarras[2]) : FATORES_EMBALAGEM[unidadeOriginal.toLowerCase()];
  if (!fator) return item;
  return {
    ...item,
    unidade: matchBarras ? matchBarras[1] : item.unidade,
    quantidade: item.quantidade != null ? item.quantidade * fator : item.quantidade,
    valor_unitario: item.valor_unitario != null ? item.valor_unitario / fator : item.valor_unitario,
    __embalagemOriginal: { unidade: unidadeOriginal, quantidade: item.quantidade, fator },
  };
}

function compararItens(pedidoItensBrutos, notaItensBrutos) {
  const pedidoItens = agruparPorProduto(Array.isArray(pedidoItensBrutos) ? pedidoItensBrutos : []);
  const notaItens = agruparPorProduto(
    (Array.isArray(notaItensBrutos) ? notaItensBrutos : []).map(converterEmbalagem)
  );
  if (!pedidoItens.length || !notaItens.length) return { temDados: false, divergente: false, linhas: [] };

  const restantes = notaItens.map((it) => ({ ...it, usado: false }));

  // 1Âª tentativa: nome igual ou um contendo o outro.
  const semMatchPorNome = [];
  const pedidoComMatch = pedidoItens.map((pItem, idx) => {
    const nomeP = normalizarProduto(pItem.produto_nome);
    let match =
      restantes.find((n) => !n.usado && normalizarProduto(n.produto_nome) === nomeP) ||
      restantes.find(
        (n) => !n.usado && nomeP && (normalizarProduto(n.produto_nome).includes(nomeP) || nomeP.includes(normalizarProduto(n.produto_nome)))
      );
    if (match) match.usado = true;
    else semMatchPorNome.push(idx);
    return { pItem, match };
  });

  // 2Âª tentativa, pra quem sobrou: o fornecedor costuma abreviar o nome do
  // produto de um jeito bem diferente do ERP do comprador (ex: "DISJUNTOR
  // TRIPOLAR 40A MDWP40A WEG" vira "DISJ. TRIP 40A MDWP-C40-3 3KA"), entÃ£o o
  // nome sozinho nÃ£o basta â€” e como o pedido pode listar os itens numa
  // ordem e a nota noutra, casar sÃ³ pela POSIÃ‡ÃƒO tambÃ©m dÃ¡ pareamento
  // errado (uma linha "diverge" de outra que nem Ã© o mesmo produto).
  // Usa dois sinais, nessa ordem de prioridade:
  //  1) "cÃ³digos" em comum no nome (ex: 10A, 20A, 40A, 3KA) â€” especÃ­ficos o
  //     bastante pra distinguir itens de preÃ§o quase idÃªntico (ex: dois
  //     disjuntores de amperagens diferentes custando quase a mesma coisa);
  //  2) valor unitÃ¡rio mais PRÃ“XIMO ainda livre, como critÃ©rio de desempate
  //     ou quando nÃ£o hÃ¡ nenhum cÃ³digo em comum.
  function codigosProduto(nome) {
    return new Set((normalizarProduto(nome).match(/\d+[a-z]*/g) || []).filter((c) => c.length >= 2));
  }
  restantes.forEach((n) => (n.__codigos = codigosProduto(n.produto_nome)));
  const candidatos = [];
  semMatchPorNome.forEach((idxPedido) => {
    const pItem = pedidoItens[idxPedido];
    const codigosP = codigosProduto(pItem.produto_nome);
    restantes.forEach((n, idxNota) => {
      if (n.usado) return;
      const codigosComuns = [...codigosP].filter((c) => n.__codigos.has(c)).length;
      const diffPreco = pItem.valor_unitario != null && n.valor_unitario != null ? Math.abs(pItem.valor_unitario - n.valor_unitario) : null;
      if (!codigosComuns && diffPreco == null) return;
      candidatos.push({ idxPedido, idxNota, codigosComuns, diffPreco });
    });
  });
  candidatos.sort((a, b) => {
    if (b.codigosComuns !== a.codigosComuns) return b.codigosComuns - a.codigosComuns;
    if (a.diffPreco == null) return 1;
    if (b.diffPreco == null) return -1;
    return a.diffPreco - b.diffPreco;
  });
  const pedidoUsado = new Set();
  candidatos.forEach(({ idxPedido, idxNota, codigosComuns, diffPreco }) => {
    if (pedidoUsado.has(idxPedido) || restantes[idxNota].usado) return;
    // Sem nenhum cÃ³digo em comum, sÃ³ casa por preÃ§o se estiver de fato
    // perto â€” preÃ§o muito diferente significa que sÃ£o produtos diferentes.
    if (!codigosComuns) {
      if (diffPreco == null) return;
      if (diffPreco > TOLERANCIA_VALOR * 20 && diffPreco > pedidoItens[idxPedido].valor_unitario * 0.3) return;
    }
    pedidoComMatch[idxPedido].match = restantes[idxNota];
    restantes[idxNota].usado = true;
    pedidoUsado.add(idxPedido);
  });

  // 3Âª tentativa, pra quem ainda sobrou: fornecedor Ã s vezes vende por
  // "pacote" (ex: nome do produto vem com "C/100" â€” cento de folhas â€” e a
  // nota lista 5 pacotes a R$64 enquanto o pedido lista 500 folhas a R$0,64)
  // â€” quantidade e valor unitÃ¡rio nunca vÃ£o bater nesse caso, mas o VALOR
  // TOTAL da linha continua sendo o mesmo dinheiro, entÃ£o casa por ele.
  function valorTotalDoItem(item) {
    if (item.valor_total != null) return item.valor_total;
    if (item.quantidade != null && item.valor_unitario != null) return item.quantidade * item.valor_unitario;
    return null;
  }
  const candidatosPorTotal = [];
  pedidoComMatch.forEach(({ pItem, match }, idxPedido) => {
    if (match) return;
    const totalP = valorTotalDoItem(pItem);
    if (totalP == null) return;
    restantes.forEach((n, idxNota) => {
      if (n.usado) return;
      const totalN = valorTotalDoItem(n);
      if (totalN == null) return;
      const diff = Math.abs(totalP - totalN);
      if (diff <= TOLERANCIA_VALOR) candidatosPorTotal.push({ idxPedido, idxNota, diff });
    });
  });
  candidatosPorTotal.sort((a, b) => a.diff - b.diff);
  candidatosPorTotal.forEach(({ idxPedido, idxNota }) => {
    if (pedidoComMatch[idxPedido].match || restantes[idxNota].usado) return;
    pedidoComMatch[idxPedido].match = restantes[idxNota];
    pedidoComMatch[idxPedido].matchPorTotal = true;
    restantes[idxNota].usado = true;
  });

  // 4Âª tentativa: sobrou exatamente 1 item sem casar de cada lado (pedido e
  // nota tÃªm a mesma quantidade de itens, os outros N-1 jÃ¡ bateram) â€” sÃ³
  // pode ser o mesmo item descrito diferente (nome mudou, embalagem mudou,
  // preÃ§o divergiu mais que a tolerÃ¢ncia aceita nas tentativas acima). Como
  // nÃ£o sobra mais nenhum outro candidato pra confundir, casa por
  // eliminaÃ§Ã£o e deixa a comparaÃ§Ã£o de qtd/valor apontar a divergÃªncia real
  // â€” em vez de aparecer como "nÃ£o encontrado" de um lado e "item nÃ£o
  // estava no pedido" do outro, o que esconde que Ã© o mesmo item.
  const semMatchFinal = pedidoComMatch.filter((pc) => !pc.match);
  const notaSemUsoFinal = restantes.filter((n) => !n.usado);
  if (semMatchFinal.length === 1 && notaSemUsoFinal.length === 1) {
    semMatchFinal[0].match = notaSemUsoFinal[0];
    semMatchFinal[0].casadoPorEliminacao = true;
    notaSemUsoFinal[0].usado = true;
  }

  // 5Âª tentativa: o pedido pede uma quantidade fechada de um produto (ex: 12
  // marcadores) e a nota detalha por variaÃ§Ã£o (cor/modelo) em vÃ¡rias linhas
  // â€” cada uma com o MESMO valor unitÃ¡rio, mas nome diferente (ex: "PINCEL
  // P/RETROPROJETOR 1.0 AZ/PT/VD/VM", 3 de cada). O casamento por preÃ§o (2Âª
  // tentativa) jÃ¡ pareou o pedido com UMA dessas linhas; sem agrupar as
  // demais, elas sobram como "item nÃ£o estava no pedido" â€” quando na
  // verdade Ã© tudo a mesma compra, sÃ³ detalhada. SÃ³ agrupa quando a soma das
  // quantidades bate exato com o que o pedido pedia (senÃ£o pode ser mesmo
  // produto diferente, tipo reposiÃ§Ã£o parcial futura), e exige preÃ§o igual
  // (nÃ£o sÃ³ parecido) pra nÃ£o juntar itens que sÃ³ coincidem por acaso.
  pedidoComMatch.forEach((pc) => {
    if (!pc.match || pc.matchPorTotal || pc.casadoPorEliminacao) return;
    const vuPedido = pc.pItem.valor_unitario;
    const qtdPedido = pc.pItem.quantidade;
    if (vuPedido == null || qtdPedido == null) return;
    const qtdJaCasada = pc.match.quantidade || 0;
    if (Math.abs(qtdJaCasada - qtdPedido) < 0.01) return; // jÃ¡ bate, nada a fazer
    const variacoes = restantes.filter((n) => !n.usado && n.valor_unitario != null && Math.abs(n.valor_unitario - vuPedido) <= TOLERANCIA_VALOR);
    if (!variacoes.length) return;
    const qtdVariacoes = variacoes.reduce((soma, n) => soma + (n.quantidade || 0), 0);
    if (Math.abs(qtdJaCasada + qtdVariacoes - qtdPedido) < 0.01) {
      pc.variacoes = variacoes;
      variacoes.forEach((n) => (n.usado = true));
    }
  });

  let divergente = false;
  const linhas = pedidoComMatch.map(({ pItem, match, matchPorTotal, casadoPorEliminacao, variacoes }) => {
    // Casado sÃ³ pelo valor total (embalagem diferente) â€” quantidade e valor
    // unitÃ¡rio nÃ£o vÃ£o bater mesmo, e tudo bem; o que importa Ã© o total.
    if (matchPorTotal) {
      return {
        produto: pItem.produto_nome,
        qtdP: pItem.quantidade,
        qtdN: match.quantidade,
        vuP: pItem.valor_unitario,
        vuN: match.valor_unitario,
        match: true,
        divergente: false,
        obs: "embalagem diferente, mesmo valor total",
      };
    }
    const qtdNEfetiva = variacoes ? (match.quantidade || 0) + variacoes.reduce((soma, n) => soma + (n.quantidade || 0), 0) : match ? match.quantidade : null;
    const qtdOk = match && pItem.quantidade != null && qtdNEfetiva != null ? Math.abs(pItem.quantidade - qtdNEfetiva) < 0.01 : null;
    const vuOk =
      match && pItem.valor_unitario != null && match.valor_unitario != null
        ? Math.abs(pItem.valor_unitario - match.valor_unitario) <= TOLERANCIA_VALOR
        : null;

    const linhaDivergente = !match || qtdOk === false || vuOk === false;
    if (linhaDivergente) divergente = true;

    const embalagem = match && match.__embalagemOriginal;
    return {
      produto: pItem.produto_nome,
      qtdP: pItem.quantidade,
      qtdN: qtdNEfetiva,
      vuP: pItem.valor_unitario,
      vuN: match ? match.valor_unitario : null,
      match: !!match,
      divergente: linhaDivergente,
      obs: embalagem
        ? `nota: ${embalagem.quantidade} ${embalagem.unidade} (1 ${embalagem.unidade} = ${embalagem.fator} un)`
        : casadoPorEliminacao
          ? `nota: "${match.produto_nome}" â€” nome/embalagem diferente, casado por eliminaÃ§Ã£o (Ãºnico item que sobrou dos dois lados)`
          : variacoes
            ? `nota dividiu em variaÃ§Ãµes do mesmo preÃ§o: ${[match, ...variacoes].map((n) => `"${n.produto_nome}" (${n.quantidade})`).join(", ")}`
            : undefined,
    };
  });

  // Item que sobrou na NOTA sem casar com nenhum item do pedido â€” sem isso,
  // ele simplesmente desaparecia da comparaÃ§Ã£o (nem aparecia na tabela, nem
  // contava como divergÃªncia), mesmo sendo um item a mais que ninguÃ©m pediu.
  restantes
    .filter((n) => !n.usado)
    .forEach((n) => {
      divergente = true;
      linhas.push({
        produto: n.produto_nome,
        qtdP: null,
        qtdN: n.quantidade,
        vuP: null,
        vuN: n.valor_unitario,
        match: true,
        divergente: true,
        obs: "item nÃ£o estava no pedido",
      });
    });

  return { temDados: true, divergente, linhas };
}

function renderTabelaItens(resultado) {
  if (!resultado.temDados) return "";
  const linhas = resultado.linhas
    .map(
      (l) => `
    <tr class="${l.divergente ? "linha-divergente" : ""}">
      <td>${escapeHtml(l.produto)}${l.obs ? `<div class="hint">ðŸ“¦ ${escapeHtml(l.obs)}</div>` : ""}</td>
      <td>${l.qtdP ?? "â€”"}</td>
      <td>${l.match ? l.qtdN ?? "â€”" : "nÃ£o encontrado"}</td>
      <td>${formatarMoeda(l.vuP)}</td>
      <td>${l.match ? formatarMoeda(l.vuN) : "â€”"}</td>
      <td>${l.divergente ? "âš ï¸" : "âœ…"}</td>
    </tr>`
    )
    .join("");
  return `
    <table class="tabela-itens">
      <thead><tr><th>Produto</th><th>Qtd. pedido</th><th>Qtd. nota</th><th>Vl. Unit. pedido</th><th>Vl. Unit. nota</th><th></th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

document.getElementById("nota-valor").addEventListener("input", atualizarConferencia);
document.getElementById("nota-cnpj").addEventListener("input", atualizarConferencia);
document.getElementById("nota-parcial").addEventListener("change", atualizarConferencia);

function calcularDivergencias() {
  const pedido = (paradaEmEdicao && paradaEmEdicao.rl_pedidos) || {};
  const notaValor = document.getElementById("nota-valor").value;
  const notaCnpj = document.getElementById("nota-cnpj").value;

  let msgValor, divergValor;
  if (pedido.valor_total == null) {
    msgValor = "Valor esperado nÃ£o informado no pedido â€” nÃ£o Ã© possÃ­vel conferir.";
    divergValor = false;
  } else if (!notaValor) {
    msgValor = "Informe o valor da nota pra conferir.";
    divergValor = false;
  } else if (Math.abs(Number(pedido.valor_total) - Number(notaValor)) <= TOLERANCIA_VALOR) {
    msgValor = `âœ… Valor confere (${formatarMoeda(notaValor)}).`;
    divergValor = false;
  } else {
    msgValor = `âš ï¸ DivergÃªncia de valor: pedido ${formatarMoeda(pedido.valor_total)} vs nota ${formatarMoeda(notaValor)}.`;
    divergValor = true;
  }

  const cnpjEsperado = apenasDigitos(pedido.empresa_cnpj);
  const cnpjNota = apenasDigitos(notaCnpj);
  let msgCnpj, divergCnpj;
  if (!cnpjEsperado) {
    msgCnpj = "CNPJ da empresa compradora nÃ£o informado no pedido â€” nÃ£o Ã© possÃ­vel conferir.";
    divergCnpj = false;
  } else if (!cnpjNota) {
    msgCnpj = "Informe o CNPJ da nota pra conferir.";
    divergCnpj = false;
  } else if (cnpjEsperado === cnpjNota) {
    msgCnpj = "âœ… CNPJ confere.";
    divergCnpj = false;
  } else {
    msgCnpj = `âš ï¸ CNPJ diferente: pedido esperava ${escapeHtml(pedido.empresa_cnpj)} (${escapeHtml(
      pedido.empresa_nome || ""
    )}), nota informa ${escapeHtml(notaCnpj)}.`;
    divergCnpj = true;
  }

  return { msgValor, divergValor, msgCnpj, divergCnpj };
}

// Nome de empresa varia de documento pra documento no sufixo jurÃ­dico (ex:
// "GRAFICA FORMOSA LTDA" no pedido vs "GRAFICA FORMOSA EIRELI ME" na nota,
// mesma empresa) â€” remove esses sufixos antes de comparar pra nÃ£o acusar
// divergÃªncia falsa por causa sÃ³ disso.
function normalizarEmpresa(nome) {
  return normalizarProduto(nome)
    .replace(/\b(ltda|me|epp|eireli|s\/?a|mei)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Palavras comuns demais pra usar como "assinatura" de fornecedor â€” duas
// empresas diferentes que sÃ³ tÃªm ISSO em comum nÃ£o devem ser consideradas a
// mesma (ex: duas distribuidoras quaisquer nÃ£o sÃ£o a mesma loja).
const PALAVRAS_GENERICAS_FORNECEDOR = new Set([
  "comercio", "comercial", "distribuidora", "distribuicao", "industria", "industrial",
  "solucoes", "produtos", "materiais", "material", "agricola", "agricolas", "brasil",
  "nacional", "regional", "importacao", "exportacao", "representacao", "logistica",
  "servicos", "tecnologia", "tecnologias", "alimentos", "atacadista", "atacado",
  "construcao", "construtora", "transportes", "participacoes", "holding", "grupo",
  "quimica", "quimicos", "equipamentos", "maquinas", "pecas", "acessorios",
]);

function palavrasSignificativas(nome) {
  return normalizarEmpresa(nome)
    .split(" ")
    .filter((p) => p.length >= 4 && !PALAVRAS_GENERICAS_FORNECEDOR.has(p));
}

// Nem sempre o nome bate inteiro de um documento pro outro (ex: a nota vem
// no nome da fÃ¡brica/matriz â€” "SUINOCOP SUINOCULTURA COPACABANA LTDA" â€” e o
// pedido no nome comercial â€” "SUINOCOP ALIMENTOS LTDA"): alÃ©m de "um nome
// conter o outro", considera parecido tambÃ©m quando os dois compartilham
// alguma palavra realmente distintiva (nÃ£o genÃ©rica) em comum.
function fornecedoresParecidos(nomeA, nomeB) {
  const a = normalizarEmpresa(nomeA || "");
  const b = normalizarEmpresa(nomeB || "");
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const palavrasA = new Set(palavrasSignificativas(nomeA));
  return palavrasSignificativas(nomeB).some((p) => palavrasA.has(p));
}

// Nota de serviÃ§o (NFS-e) nÃ£o tem tabela de itens de verdade pra comparar â€”
// em vez disso, confere se a empresa prestadora bate com o fornecedor
// registrado no pedido (comparaÃ§Ã£o de nome, nÃ£o tem CNPJ do fornecedor
// guardado no pedido pra comparar dÃ­gito a dÃ­gito).
function compararPrestador(pedido, emitenteNome) {
  const esperado = normalizarEmpresa(pedido.fornecedor_nome);
  if (!esperado) return { msgPrestador: "Fornecedor nÃ£o informado no pedido â€” nÃ£o Ã© possÃ­vel conferir.", divergPrestador: false };
  if (!emitenteNome) return { msgPrestador: "NÃ£o foi possÃ­vel ler a prestadora na nota.", divergPrestador: false };
  const lido = normalizarEmpresa(emitenteNome);
  const bate = lido === esperado || lido.includes(esperado) || esperado.includes(lido);
  return bate
    ? { msgPrestador: `âœ… Prestadora confere (${escapeHtml(emitenteNome)}).`, divergPrestador: false }
    : {
        msgPrestador: `âš ï¸ Prestadora diferente: pedido esperava ${escapeHtml(pedido.fornecedor_nome)}, nota informa ${escapeHtml(emitenteNome)}.`,
        divergPrestador: true,
      };
}

const TOLERANCIA_DIAS_PAGAMENTO = 5; // absorve vencimento caindo em fim de semana/feriado

// Confere se o prazo de pagamento que saiu na nota bate com a condiÃ§Ã£o
// combinada no pedido (cÃ³digo -> dias mÃ©dios, tabela cs_condicoes_pagamento
// compartilhada com o AvanÃ§o para Contratos). Quando hÃ¡ mais de uma parcela,
// usa a mÃ©dia ponderada pelo valor de cada uma, do mesmo jeito que os dias
// da prÃ³pria tabela foram calculados.
function compararCondicaoPagamento(pedido, dataEmissao, parcelas) {
  const codigo = pedido.condicao_pagamento_codigo;
  if (!codigo) return { msgCondicao: null, divergCondicao: false };
  // Se a tabela nunca carregou de verdade (conexÃ£o ruim na hora que o app
  // abriu), tenta buscar de novo em segundo plano â€” assim a PRÃ“XIMA
  // conferÃªncia jÃ¡ vem certa, sem precisar recarregar a pÃ¡gina inteira.
  if (condicoesPagamentoCache.size === 0) loadCondicoesPagamento();
  let diasEsperados = condicoesPagamentoCache.get(normalizarCodigoCondicao(codigo));
  if (diasEsperados == null) diasEsperados = diasEsperadosDeTexto(codigo);
  if (diasEsperados == null) {
    return {
      msgCondicao: `CondiÃ§Ã£o de pagamento "${escapeHtml(codigo)}" nÃ£o reconhecida (nÃ£o estÃ¡ na tabela de cÃ³digos nem parece uma lista de dias) â€” nÃ£o Ã© possÃ­vel conferir.`,
      divergCondicao: false,
    };
  }
  if (!dataEmissao || !Array.isArray(parcelas) || !parcelas.length) {
    return { msgCondicao: "NÃ£o foi possÃ­vel ler as datas de pagamento da nota â€” nÃ£o Ã© possÃ­vel conferir o prazo.", divergCondicao: false };
  }
  const emissao = new Date(dataEmissao + "T00:00:00");
  const comValor = parcelas.every((p) => p.valor != null);
  const pesoTotal = comValor ? parcelas.reduce((s, p) => s + p.valor, 0) : parcelas.length;
  const diasNota =
    parcelas.reduce((soma, p) => {
      const venc = new Date(p.data_vencimento + "T00:00:00");
      const dias = (venc - emissao) / (1000 * 60 * 60 * 24);
      const peso = comValor ? p.valor : 1;
      return soma + dias * peso;
    }, 0) / pesoTotal;
  // SÃ³ Ã© problema quando a nota dÃ¡ MENOS prazo do que o combinado (a empresa
  // acaba tendo que pagar mais cedo do que devia). Prazo maior Ã© bom pra nÃ³s
  // â€” mais tempo pra pagar â€” entÃ£o nunca conta como divergÃªncia.
  const diferenca = diasEsperados - diasNota;
  return diferenca <= TOLERANCIA_DIAS_PAGAMENTO
    ? { msgCondicao: `âœ… Prazo de pagamento confere (${Math.round(diasNota)} dias, condiÃ§Ã£o ${escapeHtml(codigo)}).`, divergCondicao: false }
    : {
        msgCondicao: `âš ï¸ Prazo de pagamento menor que o esperado: condiÃ§Ã£o ${escapeHtml(codigo)} do pedido espera ~${Math.round(
          diasEsperados
        )} dias, nota saiu com ${Math.round(diasNota)} dias.`,
        divergCondicao: true,
      };
}

function atualizarConferencia() {
  if (!paradaEmEdicao) return;
  const box = document.getElementById("conferencia-resultado");

  // Entrega parcial nunca vai bater com o total do pedido â€” nÃ£o faz sentido
  // (nem Ã© justo com o motorista) rodar a conferÃªncia nesse caso. A
  // conferÃªncia de verdade sÃ³ acontece quando a entrega for marcada completa.
  if (document.getElementById("nota-parcial").checked) {
    box.classList.remove("hidden", "warn");
    box.classList.add("ok");
    box.innerHTML = `<div>ðŸ“¦ Entrega parcial â€” a conferÃªncia de valor/itens sÃ³ Ã© feita quando o pedido for concluÃ­do por completo.</div>`;
    return;
  }

  const { msgValor, divergValor, msgCnpj, divergCnpj } = calcularDivergencias();
  const pedido = paradaEmEdicao.rl_pedidos || {};

  const { msgCondicao, divergCondicao } = compararCondicaoPagamento(pedido, notaDataEmissaoExtraida, notaParcelasExtraidas);
  const msgCondicaoHtml = msgCondicao ? `<div>${msgCondicao}</div>` : "";

  // Nota de serviÃ§o (NFS-e) nÃ£o tem itens de verdade pra comparar â€” confere
  // sÃ³ tomador (CNPJ, jÃ¡ incluso acima), prestadora e valor total.
  if (notaTipoDocumento === "servico") {
    const { msgPrestador, divergPrestador } = compararPrestador(pedido, notaEmitenteExtraido);
    box.classList.remove("hidden", "ok", "warn");
    box.classList.add(divergValor || divergCnpj || divergPrestador || divergCondicao ? "warn" : "ok");
    box.innerHTML = `<div>ðŸ“„ Nota de serviÃ§o.</div><div>${msgValor}</div><div>${msgCnpj}</div><div>${msgPrestador}</div>${msgCondicaoHtml}`;
    return;
  }

  const resultadoItens = compararItens(pedido.itens, notaItensExtraidos);

  box.classList.remove("hidden", "ok", "warn");
  box.classList.add(divergValor || divergCnpj || resultadoItens.divergente || divergCondicao ? "warn" : "ok");
  let html = `<div>${msgValor}</div><div>${msgCnpj}</div>${msgCondicaoHtml}`;
  if (resultadoItens.temDados) {
    html += `<div>${resultadoItens.divergente ? "âš ï¸ DivergÃªncia nos itens (veja a tabela abaixo)." : "âœ… Itens conferem."}</div>`;
    html += renderTabelaItens(resultadoItens);
  } else if (!pedido.itens) {
    html += `<div class="muted">Pedido nÃ£o tem lista de itens registrada â€” nÃ£o Ã© possÃ­vel conferir item a item.</div>`;
  }
  box.innerHTML = html;
}

document.getElementById("form-modal-nota").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!paradaEmEdicao) return;
  const rotaId = paradaEmEdicao.rota_id;
  const feedback = document.getElementById("modal-feedback");
  const file = document.getElementById("nota-arquivo").files[0];
  if (!file && !notaArquivoUrlPreLido) {
    feedback.textContent = "Anexe a foto da nota fiscal.";
    feedback.className = "feedback error";
    return;
  }

  const btnConcluir = document.getElementById("btn-concluir-parada");
  // Sem isso, uma nota que nÃ£o foi lida (foto ruim, motorista esqueceu de
  // esperar a leitura, ou fotografou o documento errado) ia direto pro banco
  // em branco, sem ninguÃ©m perceber â€” sÃ³ aparecia depois, no HistÃ³rico,
  // como "â“ Nota nÃ£o lida". Bloqueia a primeira tentativa e exige confirmar
  // de novo, igual ao padrÃ£o de "clique duas vezes" jÃ¡ usado no resto do app.
  const entregaParcialAgora = document.getElementById("nota-parcial").checked;
  const nadaLido =
    !entregaParcialAgora &&
    !document.getElementById("nota-valor").value &&
    !document.getElementById("nota-cnpj").value.trim() &&
    !notaEmitenteExtraido &&
    (!notaItensExtraidos || !notaItensExtraidos.length);
  if (nadaLido && !btnConcluir.dataset.confirmandoSemDados) {
    btnConcluir.dataset.confirmandoSemDados = "1";
    btnConcluir.textContent = "Nota nÃ£o lida â€” clique de novo pra enviar assim mesmo";
    feedback.textContent = "âš ï¸ NÃ£o conseguimos ler nada da nota (valor, CNPJ e itens em branco). Confira se a foto estÃ¡ nÃ­tida e tente ler de novo, ou clique no botÃ£o acima pra enviar mesmo assim.";
    feedback.className = "feedback error";
    setTimeout(() => {
      delete btnConcluir.dataset.confirmandoSemDados;
      btnConcluir.textContent = "Concluir parada";
    }, 8000);
    return;
  }
  delete btnConcluir.dataset.confirmandoSemDados;
  btnConcluir.textContent = "Concluir parada";

  feedback.textContent = "Salvando...";
  feedback.className = "feedback";
  try {
    const url = file ? (await uploadArquivo(file, "rl_notas")).url : notaArquivoUrlPreLido;
    const entregaParcial = document.getElementById("nota-parcial").checked;
    const notaValor = document.getElementById("nota-valor").value;
    const notaCnpj = document.getElementById("nota-cnpj").value.trim();
    const notaNumero = document.getElementById("nota-numero").value.trim();

    // Entrega parcial nÃ£o passa pela conferÃªncia (o valor/itens dessa nota
    // nÃ£o deve mesmo bater com o total do pedido) e o pedido volta pra fila
    // de disponÃ­veis pra uma prÃ³xima rota buscar o restante.
    let divergValor = false;
    let divergCnpj = false;
    let itensDivergentes = false;
    let divergCondicao = false;
    if (!entregaParcial) {
      ({ divergValor, divergCnpj } = calcularDivergencias());
      // Nota de serviÃ§o nÃ£o tem itens de verdade pra comparar â€” a divergÃªncia
      // de "itens" nesse caso vira divergÃªncia de prestadora (fornecedor).
      if (notaTipoDocumento === "servico") {
        itensDivergentes = compararPrestador(paradaEmEdicao.rl_pedidos || {}, notaEmitenteExtraido).divergPrestador;
      } else {
        itensDivergentes = compararItens((paradaEmEdicao.rl_pedidos || {}).itens, notaItensExtraidos).divergente;
      }
      divergCondicao = compararCondicaoPagamento(
        paradaEmEdicao.rl_pedidos || {},
        notaDataEmissaoExtraida,
        notaParcelasExtraidas
      ).divergCondicao;
    }

    const dadosConclusao = {
      status: "concluida",
      nota_arquivo_url: url,
      nota_numero: notaNumero || null,
      nota_valor_total: notaValor ? Number(notaValor) : null,
      nota_cnpj: notaCnpj || null,
      nota_itens: notaItensExtraidos,
      nota_tipo_documento: notaTipoDocumento,
      nota_emitente_nome: notaEmitenteExtraido,
      nota_data_emissao: notaDataEmissaoExtraida,
      nota_parcelas: notaParcelasExtraidas,
      entrega_parcial: entregaParcial,
      divergencia_valor: divergValor,
      divergencia_cnpj: divergCnpj,
      divergencia_itens: itensDivergentes,
      divergencia_condicao_pagamento: divergCondicao,
      concluido_em: new Date().toISOString(),
    };

    const { error: errParada } = await db.from("rl_rota_paradas").update(dadosConclusao).eq("id", paradaEmEdicao.id);
    if (errParada) throw errParada;

    const { error: errPedido } = await db
      .from("rl_pedidos")
      .update({ status: entregaParcial ? "pendente" : "concluido" })
      .eq("id", paradaEmEdicao.pedido_id);
    if (errPedido) throw errPedido;

    // Nota que cobre mais de um pedido junto (ver iniciarConferenciaCif) â€”
    // aplica a MESMA conferÃªncia e o mesmo resultado nas outras paradas, pra
    // cada pedido real ficar com seu prÃ³prio registro completo no HistÃ³rico.
    const paradasIrmas = paradaEmEdicao._paradasIrmas || [];
    for (const irma of paradasIrmas) {
      await db.from("rl_rota_paradas").update(dadosConclusao).eq("id", irma.paradaId);
      await db.from("rl_pedidos").update({ status: entregaParcial ? "pendente" : "concluido" }).eq("id", irma.pedidoId);
    }

    // Usa a rota DESSA parada (nÃ£o a "rota atual" global do motorista) â€” o
    // mesmo modal tambÃ©m Ã© reaproveitado pra conferÃªncia CIF da portaria, que
    // roda numa rota "virtual" prÃ³pria, diferente da que o motorista tem
    // aberta no momento (se tiver).
    const { data: pendentes } = await db.from("rl_rota_paradas").select("id").eq("rota_id", rotaId).eq("status", "pendente");
    if (!pendentes || !pendentes.length) {
      await db.from("rl_rotas").update({ status: "concluida" }).eq("id", rotaId);
    }

    // Alerta sonoro (voz do navegador, sem custo) na hora que uma divergÃªncia
    // Ã© encontrada â€” pra quem estiver por perto ouvir na hora, sem precisar
    // ficar checando o HistÃ³rico depois.
    const pedidoConcluido = paradaEmEdicao.rl_pedidos || {};
    if (!entregaParcial && (divergValor || divergCnpj || itensDivergentes || divergCondicao)) {
      falarAlerta(
        `AtenÃ§Ã£o! DivergÃªncia encontrada. Comprador ${pedidoConcluido.comprador_nome || "nÃ£o informado"}, ` +
          `pedido ${pedidoConcluido.numero_pedido || "sem nÃºmero"}.`
      );
    }

    document.getElementById("modal-overlay").classList.add("hidden");
    paradaEmEdicao = null;
    // Atualiza o HistÃ³rico/Recebimento CIF, caso a conferÃªncia tenha vindo do
    // fluxo da portaria/almoxarifado, nÃ£o do motorista â€” o pedido que acabou
    // de ser conferido some da lista de "liberados aguardando conferÃªncia".
    carregarAvisosLiberadosPendentesConferencia();
    await Promise.all([
      loadRotaAtual(),
      entregaParcial ? loadDisponiveis() : Promise.resolve(),
      document.getElementById("tab-historico").classList.contains("active") ? loadHistorico() : Promise.resolve(),
      document.getElementById("tab-recebimento-cif").classList.contains("active") ? carregarPedidosCifPendentes() : Promise.resolve(),
    ]);
    renderAvisosPortariaPendentes();
  } catch (err) {
    feedback.textContent = "Erro: " + err.message;
    feedback.className = "feedback error";
  }
});

// ---------- configuraÃ§Ãµes ----------
document.getElementById("form-empresa").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("empresa-nome").value.trim();
  const cnpj = document.getElementById("empresa-cnpj").value.trim();
  if (!nome) return;
  const { error } = await db.from("rl_empresas").insert({ nome, cnpj: cnpj || null });
  if (error) return mostrarAviso("Erro ao cadastrar: " + error.message);
  document.getElementById("form-empresa").reset();
  await loadEmpresas();
  renderCadastros();
});

// Cadastro direto de almoxarife pela aba ConfiguraÃ§Ãµes â€” antes sÃ³ dava pra
// criar um novo clicando em "+ Novo" ao lado do seletor "Meu nome" (em
// Recebimento CIF/Comprador), o que nÃ£o Ã© um lugar Ã³bvio pra administrar
// usuÃ¡rios. Empresa/setor continuam se ajustando depois, pelos seletores jÃ¡
// existentes na prÃ³pria lista abaixo.
document.getElementById("form-almoxarife").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("almoxarife-nome-novo").value.trim();
  if (!nome) return;
  const existente = almoxarifesCache.find((a) => a.nome.toLowerCase() === nome.toLowerCase());
  if (existente) {
    mostrarAviso(`"${nome}" jÃ¡ estÃ¡ cadastrado.`);
    return;
  }
  const { error } = await db.from("rl_almoxarifes").insert({ nome });
  if (error) return mostrarAviso("Erro ao cadastrar: " + error.message);
  document.getElementById("form-almoxarife").reset();
  await loadAlmoxarifes();
  renderCadastros();
});

function renderCadastros() {
  const listaEmpresas = document.getElementById("lista-empresas");
  listaEmpresas.innerHTML = empresasCache.length
    ? empresasCache
        .map(
          (emp) => `
      <li class="${emp.ativo ? "" : "inativo"}">
        <span>${escapeHtml(emp.nome)}${emp.cnpj ? ` <span class="cadastro-meta">â€” ${escapeHtml(emp.cnpj)}</span>` : ""}</span>
        <button class="link-btn" data-toggle-empresa="${emp.id}" data-ativo="${emp.ativo}" type="button">${emp.ativo ? "Desativar" : "Ativar"}</button>
      </li>`
        )
        .join("")
    : `<li class="empty-state">Nenhuma empresa cadastrada.</li>`;

  const listaCompradores = document.getElementById("lista-compradores-config");
  listaCompradores.innerHTML = compradoresCache.length
    ? compradoresCache
        .map(
          (c) => `
      <li class="${c.ativo ? "" : "inativo"}">
        <span>${escapeHtml(c.nome)}</span>
        <input type="tel" inputmode="tel" class="input-telefone" data-telefone-comprador="${c.id}" placeholder="WhatsApp (opcional)" value="${escapeHtml(c.telefone || "")}">
        <button class="link-btn" data-toggle-comprador="${c.id}" data-ativo="${c.ativo}" type="button">${c.ativo ? "Desativar" : "Ativar"}</button>
      </li>`
        )
        .join("")
    : `<li class="empty-state">Nenhum comprador cadastrado.</li>`;

  const listaMotoristas = document.getElementById("lista-motoristas-config");
  listaMotoristas.innerHTML = motoristasCache.length
    ? motoristasCache
        .map(
          (m) => `
      <li class="${m.ativo ? "" : "inativo"}">
        <span>${escapeHtml(m.nome)}</span>
        <button class="link-btn" data-toggle-motorista="${m.id}" data-ativo="${m.ativo}" type="button">${m.ativo ? "Desativar" : "Ativar"}</button>
      </li>`
        )
        .join("")
    : `<li class="empty-state">Nenhum motorista cadastrado.</li>`;

  const listaAlmoxarifes = document.getElementById("lista-almoxarifes-config");
  listaAlmoxarifes.innerHTML = almoxarifesCache.length
    ? almoxarifesCache
        .map((a) => {
          const ehWehrmann = a.empresa_nome === "AGRICOLA WEHRMANN LTDA";
          return `
      <li class="${a.ativo ? "" : "inativo"}">
        <span>${escapeHtml(a.nome)}</span>
        <select class="select-empresa-almoxarife" data-almoxarife-id="${a.id}">
          <option value="">Todas as empresas</option>
          ${empresasCache
            .filter((e) => e.ativo)
            .map((e) => `<option value="${escapeHtml(e.nome)}" ${a.empresa_nome === e.nome ? "selected" : ""}>${escapeHtml(e.nome)}</option>`)
            .join("")}
        </select>
        <select class="select-setor-almoxarife${ehWehrmann ? "" : " hidden"}" data-almoxarife-id="${a.id}">
          <option value="">Todos os setores</option>
          <option value="Uso e Consumo" ${a.setor === "Uso e Consumo" ? "selected" : ""}>Uso e Consumo</option>
          <option value="Insumos" ${a.setor === "Insumos" ? "selected" : ""}>Insumos</option>
          <option value="Cantina" ${a.setor === "Cantina" ? "selected" : ""}>Cantina</option>
        </select>
        <button class="link-btn" data-toggle-almoxarife="${a.id}" data-ativo="${a.ativo}" type="button">${a.ativo ? "Desativar" : "Ativar"}</button>
      </li>`;
        })
        .join("")
    : `<li class="empty-state">Nenhum almoxarife cadastrado.</li>`;
}

document.getElementById("tab-config").addEventListener("change", async (e) => {
  const selEmpresa = e.target.closest("select.select-empresa-almoxarife");
  if (selEmpresa) {
    const ehWehrmann = selEmpresa.value === "AGRICOLA WEHRMANN LTDA";
    const selSetor = selEmpresa.closest("li").querySelector(".select-setor-almoxarife");
    selSetor.classList.toggle("hidden", !ehWehrmann);
    if (!ehWehrmann) selSetor.value = "";
    await db
      .from("rl_almoxarifes")
      .update({ empresa_nome: selEmpresa.value || null, setor: ehWehrmann ? selSetor.value || null : null })
      .eq("id", selEmpresa.dataset.almoxarifeId);
    await loadAlmoxarifes();
    return;
  }
  const selSetor = e.target.closest("select.select-setor-almoxarife");
  if (selSetor) {
    await db.from("rl_almoxarifes").update({ setor: selSetor.value || null }).eq("id", selSetor.dataset.almoxarifeId);
    await loadAlmoxarifes();
  }
});

document.getElementById("tab-config").addEventListener("click", async (e) => {
  const btnEmp = e.target.closest("button[data-toggle-empresa]");
  const btnComp = e.target.closest("button[data-toggle-comprador]");
  const btnMot = e.target.closest("button[data-toggle-motorista]");
  const btnAlm = e.target.closest("button[data-toggle-almoxarife]");
  // Sem isso, QUALQUER clique dentro de ConfiguraÃ§Ãµes (atÃ© sÃ³ focar o campo
  // de telefone) redesenhava a lista inteira e destruÃ­a o campo, fazendo
  // parecer que sÃ³ dava pra digitar segurando o botÃ£o do mouse pressionado.
  if (!btnEmp && !btnComp && !btnMot && !btnAlm) return;

  if (btnEmp) {
    await db.from("rl_empresas").update({ ativo: btnEmp.dataset.ativo !== "true" }).eq("id", btnEmp.dataset.toggleEmpresa);
    await loadEmpresas();
  }
  if (btnComp) {
    await db.from("rl_compradores").update({ ativo: btnComp.dataset.ativo !== "true" }).eq("id", btnComp.dataset.toggleComprador);
    await loadCompradores();
  }
  if (btnMot) {
    await db.from("rl_motoristas").update({ ativo: btnMot.dataset.ativo !== "true" }).eq("id", btnMot.dataset.toggleMotorista);
    await loadMotoristas();
  }
  if (btnAlm) {
    await db.from("rl_almoxarifes").update({ ativo: btnAlm.dataset.ativo !== "true" }).eq("id", btnAlm.dataset.toggleAlmoxarife);
    await loadAlmoxarifes();
  }
  renderCadastros();
});

// salva o telefone ao sair do campo (sem botÃ£o de salvar separado)
document.getElementById("tab-config").addEventListener(
  "blur",
  async (e) => {
    const input = e.target.closest("input[data-telefone-comprador]");
    if (!input) return;
    const { error } = await db
      .from("rl_compradores")
      .update({ telefone: input.value.trim() || null })
      .eq("id", input.dataset.telefoneComprador);
    if (error) {
      mostrarAviso("Erro ao salvar telefone: " + error.message);
      return;
    }
    await loadCompradores();
    renderCadastros();
  },
  true
);

// ---------- portaria (avisa o almoxarifado que uma entrega chegou) ----------
// Se a portaria tiver o arquivo da nota em mÃ£os, lÃª com IA na hora â€” o
// almoxarifado reaproveita essa leitura na conferÃªncia CIF depois, sem
// fotografar/gastar outra chamada de IA pro mesmo documento. Guarda o File
// (nÃ£o a URL) porque sÃ³ faz sentido subir pro Storage se o aviso for enviado
// de verdade.
let portariaNotaArquivo = null;
let portariaNotaExtraida = null; // { itens, tipo_documento, emitente_nome, data_emissao, parcelas, valor_total, cnpj, numero }
let portariaPedidosCandidatos = [];

// SÃ³ a AGRICOLA WEHRMANN LTDA tem mais de um almoxarifado (Uso e Consumo /
// Insumos / Cantina) â€” o campo "Setor" sÃ³ aparece quando essa empresa Ã© escolhida.
document.getElementById("portaria-empresa").addEventListener("change", (e) => {
  const ehWehrmann = e.target.value === "AGRICOLA WEHRMANN LTDA";
  document.getElementById("label-portaria-setor").classList.toggle("hidden", !ehWehrmann);
  if (!ehWehrmann) document.getElementById("portaria-setor").value = "";
});

function resetPortariaNota() {
  portariaNotaArquivo = null;
  portariaNotaExtraida = null;
  portariaPedidosCandidatos = [];
  document.getElementById("portaria-nota-arquivo").value = "";
  document.getElementById("portaria-nota-ia-feedback").textContent = "";
  document.getElementById("label-portaria-pedido-relacionado").classList.add("hidden");
  document.getElementById("portaria-pedido-relacionado").innerHTML = "";
}

document.getElementById("btn-portaria-ler-nota").addEventListener("click", async () => {
  const input = document.getElementById("portaria-nota-arquivo");
  const feedback = document.getElementById("portaria-nota-ia-feedback");
  const file = input.files && input.files[0];
  if (!file) {
    feedback.textContent = "Anexe o arquivo da nota primeiro.";
    feedback.className = "feedback error";
    return;
  }
  feedback.textContent = "Lendo nota com IA...";
  feedback.className = "feedback";
  try {
    const extraido = await lerComIA(file, "nota");
    portariaNotaArquivo = file;
    portariaNotaExtraida = {
      itens: Array.isArray(extraido.itens) && extraido.itens.length ? extraido.itens : null,
      tipo_documento: extraido.tipo_documento || null,
      emitente_nome: extraido.emitente_nome || null,
      data_emissao: extraido.data_emissao || null,
      parcelas: Array.isArray(extraido.parcelas_pagamento) && extraido.parcelas_pagamento.length ? extraido.parcelas_pagamento : null,
      valor_total: extraido.valor_total != null ? extraido.valor_total : null,
      cnpj: extraido.destinatario_cnpj || null,
      numero: extraido.numero_nota || null,
    };

    if (extraido.emitente_nome && !document.getElementById("portaria-fornecedor").value.trim()) {
      document.getElementById("portaria-fornecedor").value = extraido.emitente_nome;
    }

    // Sugere os pedidos CIF pendentes do mesmo fornecedor (por nome â€” a nota
    // nÃ£o traz o CNPJ de quem emite, sÃ³ de quem recebe) e da mesma empresa,
    // se a portaria jÃ¡ tiver escolhido uma â€” ajuda a desambiguar quando mais
    // de uma empresa do grupo compra do mesmo fornecedor.
    const empresaAlvo = document.getElementById("portaria-empresa").value;
    let queryCandidatos = db.from("rl_pedidos").select("*").eq("status", "pendente").eq("frete_fob", false);
    if (empresaAlvo) queryCandidatos = queryCandidatos.eq("empresa_nome", empresaAlvo);
    const { data } = await comTimeout(queryCandidatos);
    portariaPedidosCandidatos = extraido.emitente_nome
      ? (data || []).filter((p) => fornecedoresParecidos(extraido.emitente_nome, p.fornecedor_nome))
      : [];

    const selPedido = document.getElementById("portaria-pedido-relacionado");
    const labelPedido = document.getElementById("label-portaria-pedido-relacionado");
    if (portariaPedidosCandidatos.length) {
      selPedido.innerHTML = portariaPedidosCandidatos
        .map((p) => `<option value="${p.id}">NÂº ${escapeHtml(p.numero_pedido || "sem nÃºmero")} â€” ${formatarMoeda(p.valor_total)}</option>`)
        .join("");
      labelPedido.classList.remove("hidden");
      feedback.textContent = `Nota lida! Encontramos ${portariaPedidosCandidatos.length} pedido(s) pendente(s) de "${extraido.emitente_nome}" â€” marque qual(is) Ã©(sÃ£o) esse(s) abaixo (a nota pode cobrir mais de um).`;
    } else {
      labelPedido.classList.add("hidden");
      feedback.textContent = `Nota lida! NÃ£o achamos pedido CIF pendente de "${extraido.emitente_nome || "fornecedor nÃ£o identificado"}" â€” o almoxarifado escolhe manualmente depois.`;
    }
    feedback.className = "feedback success";
  } catch (err) {
    feedback.textContent = "Erro: " + err.message;
    feedback.className = "feedback error";
  }
});

document.getElementById("btn-avisar-portaria").addEventListener("click", async () => {
  const btn = document.getElementById("btn-avisar-portaria");
  const empresa = document.getElementById("portaria-empresa").value;
  const setor = document.getElementById("portaria-setor").value;
  const cnpj = document.getElementById("portaria-cnpj").value.trim();
  const fornecedor = document.getElementById("portaria-fornecedor").value.trim();
  const pedidoNumero = document.getElementById("portaria-pedido-numero").value.trim();
  const mensagem = document.getElementById("portaria-mensagem").value.trim();
  const pedidoRelacionadoIds = Array.from(document.getElementById("portaria-pedido-relacionado").selectedOptions).map((o) => o.value);
  if (!empresa) {
    mostrarAviso("Selecione a empresa antes de avisar a chegada.");
    return;
  }
  if (empresa === "AGRICOLA WEHRMANN LTDA" && !setor) {
    mostrarAviso("Selecione o setor (Uso e Consumo, Insumos ou Cantina) antes de avisar a chegada.");
    return;
  }
  if (!cnpj && !fornecedor && !pedidoNumero) {
    mostrarAviso("Informe pelo menos o CNPJ, o fornecedor ou o nÃºmero do pedido.");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Enviando...";
  try {
    let notaArquivoUrl = null;
    if (portariaNotaArquivo) {
      const { url } = await uploadArquivo(portariaNotaArquivo, "rl_notas");
      notaArquivoUrl = url;
    }
    const nota = portariaNotaExtraida;
    const { error } = await db.from("rl_avisos_portaria").insert({
      empresa_nome: empresa || null,
      setor: setor || null,
      fornecedor_cnpj: cnpj || null,
      fornecedor_nome: fornecedor || null,
      pedido_numero: pedidoNumero || null,
      mensagem: mensagem || null,
      pedido_ids: pedidoRelacionadoIds.length ? pedidoRelacionadoIds : null,
      nota_arquivo_url: notaArquivoUrl,
      nota_numero: nota ? nota.numero : null,
      nota_valor_total: nota ? nota.valor_total : null,
      nota_cnpj: nota ? nota.cnpj : null,
      nota_itens: nota ? nota.itens : null,
      nota_tipo_documento: nota ? nota.tipo_documento : null,
      nota_emitente_nome: nota ? nota.emitente_nome : null,
      nota_data_emissao: nota ? nota.data_emissao : null,
      nota_parcelas: nota ? nota.parcelas : null,
    });
    if (error) throw error;
    document.getElementById("portaria-cnpj").value = "";
    document.getElementById("portaria-fornecedor").value = "";
    document.getElementById("portaria-pedido-numero").value = "";
    document.getElementById("portaria-mensagem").value = "";
    resetPortariaNota();
    mostrarAviso("Aviso enviado! O almoxarifado vai ser notificado.");
    carregarAvisosPortariaEnviados();
  } catch (err) {
    mostrarAviso("Erro ao enviar aviso: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "ðŸ”” Avisar chegada";
  }
});

async function carregarAvisosPortariaEnviados() {
  const el = document.getElementById("lista-avisos-portaria-enviados");
  const hojeInicio = new Date();
  hojeInicio.setHours(0, 0, 0, 0);
  const { data, error } = await comTimeout(
    db.from("rl_avisos_portaria").select("*").gte("criado_em", hojeInicio.toISOString()).order("criado_em", { ascending: false })
  );
  if (error) {
    el.innerHTML = `<p class="empty-state">Erro ao carregar avisos.</p>`;
    return;
  }
  if (!data || !data.length) {
    el.innerHTML = `<p class="empty-state">Nenhum aviso enviado ainda hoje.</p>`;
    return;
  }
  el.innerHTML = data
    .map(
      (a) => `
    <div class="aviso-portaria-enviado">
      ${a.empresa_nome ? `<span class="badge">${escapeHtml(a.empresa_nome)}${a.setor ? ` Â· ${escapeHtml(a.setor)}` : ""}</span> ` : ""}
      ${a.fornecedor_nome ? `<strong>${escapeHtml(a.fornecedor_nome)}</strong>` : "<strong>Fornecedor nÃ£o informado</strong>"}
      ${a.fornecedor_cnpj ? ` Â· CNPJ ${escapeHtml(a.fornecedor_cnpj)}` : ""}
      ${a.pedido_numero ? ` Â· NÂº ${escapeHtml(a.pedido_numero)}` : ""}
      Â· ${formatarDataHora(a.criado_em)}
      ${a.lido ? ` Â· âœ… acesso liberado por ${escapeHtml(a.lido_por || "â€”")}` : " Â· â³ aguardando liberaÃ§Ã£o"}
      ${a.mensagem ? `<div class="hint">${escapeHtml(a.mensagem)}</div>` : ""}
    </div>`
    )
    .join("");
}

// ---------- indicadores ----------
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function chaveAnoMes(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

async function loadIndicadores() {
  const container = document.getElementById("grafico-coletados");
  const containerLojas = document.getElementById("grafico-lojas-diferentes");
  const containerDivergencias = document.getElementById("grafico-divergencias");
  const containerSemResposta = document.getElementById("tabela-divergencias-sem-resposta");
  const containerFornecedor = document.getElementById("tabela-divergencias-fornecedor");
  const containerTempoResposta = document.getElementById("tabela-tempo-resposta");
  const { data, error } = await comTimeout(
    db
      .from("rl_rota_paradas")
      .select(
        "concluido_em, entrega_parcial, divergencia_valor, divergencia_cnpj, divergencia_itens, divergencia_condicao_pagamento, resolucao_divergencia, resolucao_em, rl_pedidos(comprador_nome, numero_pedido, fornecedor_nome, frete_fob)"
      )
      .eq("status", "concluida")
      .not("concluido_em", "is", null)
  );
  if (error) {
    container.innerHTML = `<p class="empty-state">Erro ao carregar indicador.</p>`;
    containerLojas.innerHTML = `<p class="empty-state">Erro ao carregar indicador.</p>`;
    containerDivergencias.innerHTML = `<p class="empty-state">Erro ao carregar indicador.</p>`;
    containerSemResposta.innerHTML = `<p class="empty-state">Erro ao carregar indicador.</p>`;
    containerFornecedor.innerHTML = `<p class="empty-state">Erro ao carregar indicador.</p>`;
    containerTempoResposta.innerHTML = `<p class="empty-state">Erro ao carregar indicador.</p>`;
    return;
  }

  // Ãºltimos 6 meses, incluindo os que tiverem zero coletas
  const hoje = new Date();
  const meses = [];
  const mesesLojas = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const chave = chaveAnoMes(d);
    const label = `${MESES_ABREV[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
    meses.push({ chave, label, total: 0 });
    mesesLojas.push({ chave, label, lojas: new Set() });
  }
  const porChave = Object.fromEntries(meses.map((m) => [m.chave, m]));
  const porChaveLojas = Object.fromEntries(mesesLojas.map((m) => [m.chave, m]));

  // Um indicador por tipo de divergÃªncia â€” entregas parciais nÃ£o contam
  // como divergÃªncia (o pedido simplesmente nÃ£o veio todo de uma vez).
  const tiposDivergencia = [
    { chave: "divergencia_valor", label: "Valor", total: 0 },
    { chave: "divergencia_cnpj", label: "CNPJ", total: 0 },
    { chave: "divergencia_itens", label: "Itens", total: 0 },
    { chave: "divergencia_condicao_pagamento", label: "Cond. pgto", total: 0 },
  ];

  // DivergÃªncias que ainda nÃ£o tÃªm uma decisÃ£o registrada (resolucao_divergencia
  // vazia), agrupadas por comprador, com os dias corridos desde a conclusÃ£o da
  // parada â€” pra saber quem estÃ¡ devendo resposta e hÃ¡ quanto tempo.
  const semRespostaPorComprador = new Map();
  const divergenciasPorFornecedor = new Map();
  const tempoRespostaPorComprador = new Map();
  const hojeMs = Date.now();

  (data || []).forEach((p) => {
    const chave = chaveAnoMes(new Date(p.concluido_em));
    if (porChave[chave]) porChave[chave].total++;

    // SÃ³ FOB conta como "loja que o motorista passou" â€” CIF Ã© o fornecedor
    // que traz atÃ© o almoxarifado, nÃ£o o motorista que vai atÃ© a loja.
    // Normaliza o nome (mesma funÃ§Ã£o usada pra comparar fornecedor na
    // conferÃªncia) pra nÃ£o contar a mesma loja duas vezes por causa de
    // LTDA/ME/etc ou variaÃ§Ã£o de maiÃºscula no nome.
    const pedidoDaParada = p.rl_pedidos || {};
    if (porChaveLojas[chave] && pedidoDaParada.frete_fob !== false) {
      const nomeLoja = normalizarEmpresa(pedidoDaParada.fornecedor_nome || "") || (pedidoDaParada.fornecedor_nome || "").trim();
      if (nomeLoja) porChaveLojas[chave].lojas.add(nomeLoja);
    }

    if (!p.entrega_parcial) {
      tiposDivergencia.forEach((t) => {
        if (p[t.chave]) t.total++;
      });

      const divergente = p.divergencia_valor || p.divergencia_cnpj || p.divergencia_itens || p.divergencia_condicao_pagamento;
      if (divergente) {
        const fornecedor = (p.rl_pedidos || {}).fornecedor_nome || "â€”";
        divergenciasPorFornecedor.set(fornecedor, (divergenciasPorFornecedor.get(fornecedor) || 0) + 1);

        if (!p.resolucao_divergencia) {
          const comprador = (p.rl_pedidos || {}).comprador_nome || "â€”";
          const numero = (p.rl_pedidos || {}).numero_pedido || "â€”";
          const dias = Math.max(0, Math.floor((hojeMs - new Date(p.concluido_em).getTime()) / 86400000));
          const atual = semRespostaPorComprador.get(comprador) || { comprador, total: 0, diasMax: 0, pedidos: [] };
          atual.total++;
          atual.diasMax = Math.max(atual.diasMax, dias);
          atual.pedidos.push({ numero, dias });
          semRespostaPorComprador.set(comprador, atual);
        } else if (p.resolucao_em) {
          const comprador = (p.rl_pedidos || {}).comprador_nome || "â€”";
          const diasResposta = Math.max(0, (new Date(p.resolucao_em).getTime() - new Date(p.concluido_em).getTime()) / 86400000);
          const atual = tempoRespostaPorComprador.get(comprador) || { comprador, soma: 0, total: 0 };
          atual.soma += diasResposta;
          atual.total++;
          tempoRespostaPorComprador.set(comprador, atual);
        }
      }
    }
  });

  renderGraficoBarras(container, meses, "var(--primary)", (m) => `${m.label}: ${m.total} pedido(s) coletado(s)`);

  const lojasPorMes = mesesLojas.map((m) => ({ chave: m.chave, label: m.label, total: m.lojas.size }));
  renderGraficoBarras(containerLojas, lojasPorMes, "var(--ok)", (m) => `${m.label}: ${m.total} loja(s) diferente(s) visitada(s)`);

  renderGraficoBarras(containerDivergencias, tiposDivergencia, "var(--atrasado)", (t) => `${t.label}: ${t.total} divergÃªncia(s)`);

  const listaSemResposta = Array.from(semRespostaPorComprador.values()).sort((a, b) => b.diasMax - a.diasMax);
  renderTabelaSemResposta(listaSemResposta);

  const listaFornecedor = Array.from(divergenciasPorFornecedor.entries())
    .map(([fornecedor, total]) => ({ fornecedor, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  renderTabelaFornecedor(listaFornecedor);

  const listaTempoResposta = Array.from(tempoRespostaPorComprador.values())
    .map((c) => ({ comprador: c.comprador, total: c.total, mediaDias: c.soma / c.total }))
    .sort((a, b) => b.mediaDias - a.mediaDias);
  renderTabelaTempoResposta(listaTempoResposta);
}

function renderTabelaFornecedor(lista) {
  const container = document.getElementById("tabela-divergencias-fornecedor");
  if (!lista.length) {
    container.innerHTML = `<p class="empty-state">Nenhuma divergÃªncia registrada ainda.</p>`;
    return;
  }
  container.innerHTML = `
    <table class="tabela-itens">
      <thead>
        <tr><th>Fornecedor</th><th>DivergÃªncias</th></tr>
      </thead>
      <tbody>
        ${lista.map((f) => `<tr><td>${escapeHtml(f.fornecedor)}</td><td>${f.total}</td></tr>`).join("")}
      </tbody>
    </table>`;
}

function renderTabelaTempoResposta(lista) {
  const container = document.getElementById("tabela-tempo-resposta");
  if (!lista.length) {
    container.innerHTML = `<p class="empty-state">Nenhuma divergÃªncia respondida ainda.</p>`;
    return;
  }
  container.innerHTML = `
    <table class="tabela-itens">
      <thead>
        <tr><th>Comprador</th><th>DivergÃªncias respondidas</th><th>Tempo mÃ©dio de resposta</th></tr>
      </thead>
      <tbody>
        ${lista
          .map((c) => `<tr><td>${escapeHtml(c.comprador)}</td><td>${c.total}</td><td>${c.mediaDias.toFixed(1)} dia(s)</td></tr>`)
          .join("")}
      </tbody>
    </table>`;
}

function renderTabelaSemResposta(lista) {
  const container = document.getElementById("tabela-divergencias-sem-resposta");
  if (!lista.length) {
    container.innerHTML = `<p class="empty-state">Nenhuma divergÃªncia sem resposta. ðŸŽ‰</p>`;
    return;
  }
  container.innerHTML = `
    <table class="tabela-itens">
      <thead>
        <tr><th>Comprador</th><th>DivergÃªncias sem resposta</th><th>Dias sem resposta (mais antiga)</th></tr>
      </thead>
      <tbody>
        ${lista
          .map((l) => {
            const detalhe = l.pedidos
              .slice()
              .sort((a, b) => b.dias - a.dias)
              .map((pd) => `Pedido ${pd.numero}: ${pd.dias} dia(s)`)
              .join(" | ");
            return `<tr class="${l.diasMax >= 3 ? "linha-atrasada" : ""}" title="${escapeHtml(detalhe)}">
              <td>${escapeHtml(l.comprador)}</td>
              <td>${l.total}</td>
              <td>${l.diasMax} dia(s)</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    <p class="hint">Passe o mouse sobre uma linha pra ver quais pedidos estÃ£o pendentes.</p>`;
}

function renderGraficoBarras(container, itens, cor, tituloFn) {
  const max = Math.max(1, ...itens.map((m) => m.total));
  const larguraBarra = 56;
  const espaco = 28;
  const alturaBarraMax = 160;
  const larguraTotal = itens.length * (larguraBarra + espaco) + espaco;
  const alturaTotal = alturaBarraMax + 56;

  const barras = itens
    .map((m, i) => {
      const x = espaco + i * (larguraBarra + espaco);
      const altura = m.total === 0 ? 0 : Math.max(4, Math.round((m.total / max) * alturaBarraMax));
      const y = alturaBarraMax - altura + 20;
      return `
      <g class="grafico-barra">
        <title>${tituloFn(m)}</title>
        <rect x="${x}" y="${y}" width="${larguraBarra}" height="${altura}" rx="4" fill="${cor}"></rect>
        <text class="grafico-valor" x="${x + larguraBarra / 2}" y="${y - 6}" text-anchor="middle">${m.total}</text>
        <text class="grafico-mes" x="${x + larguraBarra / 2}" y="${alturaBarraMax + 40}" text-anchor="middle">${m.label}</text>
      </g>`;
    })
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${larguraTotal} ${alturaTotal}" width="100%" style="max-width:${larguraTotal}px">
      <line class="grafico-eixo" x1="0" y1="${alturaBarraMax + 20}" x2="${larguraTotal}" y2="${alturaBarraMax + 20}"></line>
      ${barras}
    </svg>`;
}

// ---------- histÃ³rico (rotas concluÃ­das) ----------
// Sem nÃºmero salvo, "" abre o seletor de contato do prÃ³prio WhatsApp (mesmo
// padrÃ£o usado no Painel de OperaÃ§Ãµes).
function linkWhatsapp(numero, mensagem) {
  const digitos = String(numero || "").replace(/\D/g, "");
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

// Mesma lÃ³gica de renderDivergenciasParada, mas em texto puro (sem HTML)
// pra poder entrar direto na mensagem do WhatsApp.
function resumoDivergenciasTexto(parada) {
  const pedido = parada.rl_pedidos || {};
  const linhas = [];
  if (parada.divergencia_valor) {
    linhas.push(`Valor: pedido esperava ${formatarMoeda(pedido.valor_total)}, nota trouxe ${formatarMoeda(parada.nota_valor_total)}.`);
  }
  if (parada.divergencia_cnpj) {
    linhas.push(`CNPJ: pedido esperava ${pedido.empresa_cnpj || "â€”"}, nota trouxe ${parada.nota_cnpj || "â€”"}.`);
  }
  if (parada.divergencia_itens) {
    if (parada.nota_tipo_documento === "servico") {
      linhas.push(
        `Prestadora do serviÃ§o: pedido esperava ${pedido.fornecedor_nome || "â€”"}, nota trouxe ${parada.nota_emitente_nome || "â€”"}.`
      );
    } else {
      linhas.push("Itens com quantidade ou valor unitÃ¡rio diferente do esperado (confira no sistema).");
    }
  }
  if (parada.divergencia_condicao_pagamento) {
    const { msgCondicao } = compararCondicaoPagamento(pedido, parada.nota_data_emissao, parada.nota_parcelas);
    if (msgCondicao) linhas.push(msgCondicao.replace(/^[âš ï¸âœ…]\s*/, ""));
  }
  return linhas.join("\n");
}

function linkAvisoComprador(parada) {
  const pedido = parada.rl_pedidos || {};
  const comprador = compradoresCache.find((c) => c.nome === pedido.comprador_nome) || {};
  const mensagem =
    `OlÃ¡${pedido.comprador_nome ? " " + pedido.comprador_nome : ""}! Encontramos uma divergÃªncia na conferÃªncia do pedido ` +
    `${pedido.numero_pedido ? "NÂº " + pedido.numero_pedido + " " : ""}(${pedido.empresa_nome || "empresa nÃ£o informada"}):\n` +
    resumoDivergenciasTexto(parada) +
    "\n\nPode conferir com o fornecedor?";
  return linkWhatsapp(comprador.telefone, mensagem);
}

// Manda pro comprador a observaÃ§Ã£o que o almoxarifado deixou na conferÃªncia
// do recebimento (ex: avaria, embalagem violada, quantidade a menos).
function linkAvisoObservacaoRecebimento(parada) {
  const pedido = parada.rl_pedidos || {};
  const comprador = compradoresCache.find((c) => c.nome === pedido.comprador_nome) || {};
  const mensagem =
    `OlÃ¡${pedido.comprador_nome ? " " + pedido.comprador_nome : ""}! O almoxarifado deixou uma observaÃ§Ã£o na conferÃªncia do ` +
    `pedido ${pedido.numero_pedido ? "NÂº " + pedido.numero_pedido + " " : ""}(${pedido.empresa_nome || "empresa nÃ£o informada"}):\n\n` +
    `"${parada.recebido_observacao}"`;
  return linkWhatsapp(comprador.telefone, mensagem);
}

// ReconstrÃ³i as mensagens de divergÃªncia a partir do que jÃ¡ ficou salvo na
// parada (nota_valor_total, nota_cnpj, nota_itens) â€” nÃ£o depende de nada
// que sÃ³ existia na tela no momento em que o motorista concluiu a parada.
function renderDivergenciasParada(parada) {
  const pedido = parada.rl_pedidos || {};
  let html = "";
  if (parada.divergencia_valor) {
    html += `<div>âš ï¸ Valor: pedido esperava ${formatarMoeda(pedido.valor_total)}, nota trouxe ${formatarMoeda(parada.nota_valor_total)}.</div>`;
  }
  if (parada.divergencia_cnpj) {
    html += `<div>âš ï¸ CNPJ: pedido esperava ${escapeHtml(pedido.empresa_cnpj || "â€”")}, nota trouxe ${escapeHtml(parada.nota_cnpj || "â€”")}.</div>`;
  }
  if (parada.divergencia_itens) {
    if (parada.nota_tipo_documento === "servico") {
      html += `<div>âš ï¸ Prestadora do serviÃ§o: pedido esperava ${escapeHtml(pedido.fornecedor_nome || "â€”")}, nota trouxe ${escapeHtml(
        parada.nota_emitente_nome || "â€”"
      )}.</div>`;
    } else {
      const resultadoItens = compararItens(pedido.itens, parada.nota_itens);
      html += `<div>âš ï¸ Itens divergentes:</div>${renderTabelaItens(resultadoItens)}`;
    }
  }
  if (parada.divergencia_condicao_pagamento) {
    const { msgCondicao } = compararCondicaoPagamento(pedido, parada.nota_data_emissao, parada.nota_parcelas);
    if (msgCondicao) html += `<div>${msgCondicao}</div>`;
  }
  return html;
}

// Registra o que foi decidido sobre uma divergÃªncia (ex: "fornecedor vai
// reemitir a nota", "confirmado, Ã© a filial certa mesmo") â€” fica visÃ­vel
// pra quem olhar o HistÃ³rico depois, sem precisar perguntar de novo.
let resolucoesEmEdicao = new Set();
function renderResolucaoDivergencia(parada) {
  const jaTemResolucao = !!parada.resolucao_divergencia;
  if (jaTemResolucao && !resolucoesEmEdicao.has(parada.id)) {
    return `<div class="card-meta">ðŸ’¬ DecisÃ£o: ${escapeHtml(parada.resolucao_divergencia)}${
      parada.resolucao_por ? ` â€” ${escapeHtml(parada.resolucao_por)}` : ""
    }${parada.resolucao_em ? `, ${formatarDataHora(parada.resolucao_em)}` : ""} <button class="link-btn" type="button" data-editar-resolucao="${parada.id}">Editar</button></div>`;
  }
  return `<div class="resolucao-form">
    <label class="form-label">âš ï¸ DecisÃ£o sobre a divergÃªncia acima (o que foi combinado com fornecedor/comprador)</label>
    <textarea class="input-resolucao" data-parada-id="${parada.id}" rows="2" placeholder="Ex: fornecedor vai reemitir a nota">${escapeHtml(
      parada.resolucao_divergencia || ""
    )}</textarea>
    <button class="btn secondary small" type="button" data-salvar-resolucao="${parada.id}">Salvar decisÃ£o</button>
  </div>`;
}

const ITENS_POR_PAGINA_HISTORICO = 10;
let paginaHistoricoAtual = 1;
let somenteDivergentesHistorico = false;
// Guarda sÃ³ a pÃ¡gina atual (jÃ¡ filtrada e paginada pelo prÃ³prio banco) â€” nÃ£o
// o histÃ³rico inteiro. Assim a busca sempre alcanÃ§a qualquer registro, nÃ£o
// importa o quÃ£o antigo ou quantos existam no total.
let paginaAtualDados = [];
let algumFiltroAtivoHistorico = false;

function paradaEDivergente(p) {
  return !p.entrega_parcial && (p.divergencia_valor || p.divergencia_cnpj || p.divergencia_itens || p.divergencia_condicao_pagamento);
}

// SÃ³ redesenha com o que jÃ¡ foi buscado (nÃ£o refaz consulta ao banco) â€” usado
// quando o filtro nÃ£o muda, ex: entrar/sair do modo de editar uma decisÃ£o.
function renderHistorico() {
  const el = document.getElementById("lista-historico");
  if (!paginaAtualDados.length) {
    el.innerHTML = `<p class="empty-state">${
      algumFiltroAtivoHistorico ? "Nenhuma parada concluÃ­da com esse filtro." : "Nenhuma parada concluÃ­da ainda."
    }</p>`;
    return;
  }
  renderCardsHistorico(paginaAtualDados);
}

function renderPaginacaoHistorico(totalPaginas) {
  const el = document.getElementById("paginacao-historico");
  if (totalPaginas <= 1) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = Array.from({ length: totalPaginas }, (_, i) => i + 1)
    .map(
      (n) =>
        `<button type="button" class="btn-pagina${n === paginaHistoricoAtual ? " ativa" : ""}" data-pagina-historico="${n}">${n}</button>`
    )
    .join("");
}

document.getElementById("paginacao-historico").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-pagina-historico]");
  if (!btn) return;
  paginaHistoricoAtual = Number(btn.dataset.paginaHistorico);
  loadHistorico();
});

function renderCardsHistorico(paradas) {
  const el = document.getElementById("lista-historico");
  el.innerHTML = paradas
    .map((p) => {
      const pedido = p.rl_pedidos || {};
      const motorista = (p.rl_rotas || {}).motorista_nome || "â€”";
      const divergente = p.divergencia_valor || p.divergencia_cnpj || p.divergencia_itens || p.divergencia_condicao_pagamento;
      // "OK" sÃ³ quando teve dado de verdade pra comparar â€” se a nota nÃ£o foi
      // lida (foto ruim, ilegÃ­vel), nÃ£o teve conferÃªncia nenhuma, entÃ£o nÃ£o
      // pode aparecer como se tivesse batido tudo certinho.
      const notaSemLeitura =
        p.nota_valor_total == null &&
        !p.nota_cnpj &&
        !p.nota_emitente_nome &&
        (!Array.isArray(p.nota_itens) || !p.nota_itens.length);
      const status = p.recebido_por_terceiro
        ? "ðŸ¤ Recebido por terceiro"
        : p.entrega_parcial
          ? "ðŸ“¦ Entrega parcial"
          : divergente
            ? "âš ï¸ DivergÃªncia"
            : notaSemLeitura
              ? "â“ Nota nÃ£o lida"
              : "âœ… OK";
      return `
      <div class="card-pedido historico-parada-card">
        <div class="card-pedido-head">
          <strong>${escapeHtml(pedido.empresa_nome || "Empresa nÃ£o informada")}</strong>
          <span>${status}</span>
        </div>
        ${pedido.fornecedor_nome ? `<div class="card-fornecedor">ðŸ¢ ${escapeHtml(pedido.fornecedor_nome)}</div>` : ""}
        <div class="card-meta">
          ${pedido.numero_pedido ? `NÂº ${escapeHtml(pedido.numero_pedido)} Â· ` : ""}Comprador: ${escapeHtml(pedido.comprador_nome || "â€”")}
          Â· Motorista: ${escapeHtml(motorista)} Â· ConcluÃ­do em ${formatarDataHora(p.concluido_em)}
        </div>
        ${pedido.observacao ? `<div class="card-meta">ðŸ’¬ ObservaÃ§Ã£o do comprador: ${escapeHtml(pedido.observacao)}</div>` : ""}
        ${pedido.arquivo_url ? `<a class="arquivo-link" href="${pedido.arquivo_url}" target="_blank" rel="noopener">ðŸ“Ž pedido</a>` : ""}
        ${p.nota_arquivo_url ? `<a class="arquivo-link" href="${p.nota_arquivo_url}" target="_blank" rel="noopener">ðŸ“Ž nota fiscal</a>` : ""}
        ${
          p.entrega_parcial
            ? `<div class="conferencia-box ok">ðŸ“¦ Entrega parcial â€” o pedido voltou pra fila de disponÃ­veis pra buscar o restante. Confira aqui os dados desta parcial: valor ${formatarMoeda(
                p.nota_valor_total
              )}${p.nota_numero ? `, NÂº nota ${escapeHtml(p.nota_numero)}` : ""}.</div>`
            : divergente
              ? `<div class="conferencia-box warn">${renderDivergenciasParada(p)}<a class="btn secondary small" href="${linkAvisoComprador(
                  p
                )}" target="_blank" rel="noopener">ðŸ“± Avisar comprador</a>${renderResolucaoDivergencia(p)}</div>`
              : ""
        }
        <div class="card-meta">
          ${
            p.recebido_em
              ? `âœ… Recebido por ${escapeHtml(p.recebido_por || "â€”")} em ${formatarDataHora(p.recebido_em)}` +
                (p.recebido_observacao
                  ? `<div class="card-meta">ðŸ’¬ ${escapeHtml(p.recebido_observacao)} <a class="arquivo-link" href="${linkAvisoObservacaoRecebimento(
                      p
                    )}" target="_blank" rel="noopener">ðŸ“± Enviar observaÃ§Ã£o do almoxarifado pro comprador</a></div>`
                  : "") +
                (Array.isArray(p.recebido_fotos) && p.recebido_fotos.length
                  ? `<div class="card-meta">${p.recebido_fotos
                      .map((url, i) => `<a class="arquivo-link" href="${url}" target="_blank" rel="noopener">ðŸ“· foto ${i + 1}</a>`)
                      .join(" ")}</div>`
                  : "")
              : `<div class="recebimento-form">
                  <label class="form-label">ðŸ“¦ ObservaÃ§Ã£o do almoxarifado sobre o recebimento (opcional â€” ex: avaria, embalagem violada, faltou algo)</label>
                  <textarea class="input-obs-recebimento" data-parada-id="${p.id}" rows="2" placeholder="Ex: caixa chegou amassada"></textarea>
                  <input type="file" class="input-fotos-recebimento" data-parada-id="${p.id}" accept="image/*" capture="environment" multiple>
                  <button class="btn secondary small" type="button" data-confirmar-recebimento="${p.id}">âœ… Confirmar recebimento</button>
                </div>`
          }
        </div>
        <button class="link-btn danger" data-excluir-historico="${p.id}" type="button">Excluir</button>
      </div>`;
    })
    .join("");
}

// Detecta divergÃªncias NOVAS entre uma verificaÃ§Ã£o e outra (pra avisar por
// voz sÃ³ o que apareceu agora, nÃ£o repetir o que jÃ¡ tinha sido avisado) â€”
// pensado pro app ficar aberto o dia todo numa TV/tela fixa no setor. Roda
// numa consulta PRÃ“PRIA (nÃ£o a lista visÃ­vel/paginada), porque precisa
// enxergar TODAS as divergÃªncias em aberto, nÃ£o sÃ³ a pÃ¡gina/filtro que a
// pessoa estÃ¡ olhando na hora.
let idsHistoricoConhecidos = null; // null = ainda nÃ£o verificou nenhuma vez
function avisarDivergenciasNovas(paradasDivergentesAtuais) {
  const idsAtuais = new Set(paradasDivergentesAtuais.map((p) => p.id));
  if (idsHistoricoConhecidos) {
    paradasDivergentesAtuais
      .filter((p) => !idsHistoricoConhecidos.has(p.id))
      .forEach((p) => {
        const pedido = p.rl_pedidos || {};
        falarAlerta(
          `AtenÃ§Ã£o! DivergÃªncia encontrada. Comprador ${pedido.comprador_nome || "nÃ£o informado"}, pedido ${
            pedido.numero_pedido || "sem nÃºmero"
          }.`
        );
      });
  }
  idsHistoricoConhecidos = idsAtuais;
}

async function verificarDivergenciasNovas() {
  const { data, error } = await comTimeout(
    db
      .from("rl_rota_paradas")
      .select("id, rl_pedidos(comprador_nome, numero_pedido)")
      .eq("status", "concluida")
      .eq("entrega_parcial", false)
      .or("divergencia_valor.eq.true,divergencia_cnpj.eq.true,divergencia_itens.eq.true,divergencia_condicao_pagamento.eq.true")
  );
  if (error || !data) return;
  avisarDivergenciasNovas(data);
}

// ---------- avisos da portaria pendentes (aparecem no topo do HistÃ³rico) ----------
let idsAvisosPortariaConhecidos = null; // null = ainda nÃ£o verificou nenhuma vez
let avisosPortariaPendentesCache = [];

// O almoxarife selecionado (aba Recebimento CIF) pode estar amarrado a uma
// empresa (e, sÃ³ na Wehrmann, tambÃ©m a um setor: Uso e Consumo/Insumos/Cantina) â€”
// nesse caso sÃ³ vÃª os avisos daquela empresa/setor. Sem empresa definida no
// cadastro dele, continua vendo tudo (comportamento de antes).
function filtrarAvisosPorAlmoxarifeAtual(avisos) {
  const nomeAtual = document.getElementById("almoxarife-select-cif").value;
  const almoxarife = almoxarifesCache.find((a) => a.nome === nomeAtual);
  let resultado = avisos;
  if (almoxarife && almoxarife.empresa_nome) {
    resultado = resultado.filter((a) => {
      if (a.empresa_nome !== almoxarife.empresa_nome) return false;
      if (almoxarife.setor && a.setor !== almoxarife.setor) return false;
      return true;
    });
  }
  // Filtro manual de setor â€” independente do almoxarife escolhido, pra dar
  // pra olhar sÃ³ um setor sem precisar trocar de pessoa (ex: alguÃ©m que
  // enxerga a empresa toda querendo focar sÃ³ na Cantina por um instante).
  const setorFiltro = document.getElementById("filtro-setor-cif")?.value;
  if (setorFiltro) resultado = resultado.filter((a) => a.setor === setorFiltro);
  return resultado;
}

async function carregarAvisosPortariaPendentes() {
  const { data, error } = await comTimeout(
    db.from("rl_avisos_portaria").select("*").eq("lido", false).order("criado_em", { ascending: true })
  );
  if (error || !data) return;

  const avisosVisiveis = filtrarAvisosPorAlmoxarifeAtual(data);

  // Avisa por voz sÃ³ o que apareceu de novo desde a Ãºltima verificaÃ§Ã£o â€”
  // mesmo padrÃ£o jÃ¡ usado pras divergÃªncias (ver avisarDivergenciasNovas).
  // IMPORTANTE: o conjunto de "jÃ¡ conhecidos" usa TODOS os avisos pendentes
  // (nÃ£o sÃ³ os visÃ­veis pro almoxarife selecionado agora) â€” senÃ£o, trocar de
  // almoxarife no mesmo aparelho (empresa/setor diferente) faz um aviso
  // antigo, que sÃ³ ficou fora do filtro atÃ© agora, parecer "novo" de novo e
  // repete o alerta sonoro Ã  toa toda vez que alguÃ©m troca a seleÃ§Ã£o.
  const idsAtuais = new Set(data.map((a) => a.id));
  if (idsAvisosPortariaConhecidos) {
    avisosVisiveis
      .filter((a) => !idsAvisosPortariaConhecidos.has(a.id))
      .forEach((a) => {
        falarAlerta(`AtenÃ§Ã£o! Chegou uma entrega na portaria. Fornecedor ${a.fornecedor_nome || "nÃ£o informado"}.`);
      });
  }
  idsAvisosPortariaConhecidos = idsAtuais;

  avisosPortariaPendentesCache = avisosVisiveis;
  renderAvisosPortariaPendentes();

  const badge = document.getElementById("badge-avisos-portaria");
  if (avisosVisiveis.length) {
    badge.textContent = String(avisosVisiveis.length);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function renderAvisosPortariaPendentes() {
  const el = document.getElementById("avisos-portaria-pendentes");
  if (!el) return;
  if (!avisosPortariaPendentesCache.length) {
    el.innerHTML = `<p class="empty-state">Nenhum aviso pendente no momento.</p>`;
    return;
  }
  el.innerHTML = avisosPortariaPendentesCache
    .map((a) => {
      return `
      <div class="aviso-portaria-card">
        <div>
          ðŸšª ${a.empresa_nome ? `<span class="badge">${escapeHtml(a.empresa_nome)}${a.setor ? ` Â· ${escapeHtml(a.setor)}` : ""}</span> ` : ""}<strong>${escapeHtml(a.fornecedor_nome || "Fornecedor nÃ£o informado")}</strong>
          ${a.fornecedor_cnpj ? ` Â· CNPJ ${escapeHtml(a.fornecedor_cnpj)}` : ""}
          ${a.pedido_numero ? ` Â· NÂº ${escapeHtml(a.pedido_numero)}` : ""}
          Â· ${formatarDataHora(a.criado_em)}
          ${
            a.nota_arquivo_url
              ? `<div class="card-meta">ðŸ“Ž Nota jÃ¡ lida pela portaria${
                  a.pedido_ids && a.pedido_ids.length
                    ? ` e jÃ¡ relacionada a ${a.pedido_ids.length > 1 ? `${a.pedido_ids.length} pedidos` : "um pedido"}`
                    : ""
                } â€” <a href="${a.nota_arquivo_url}" target="_blank" rel="noopener">ver nota</a> â€” a conferÃªncia libera assim que o acesso for liberado.</div>`
              : ""
          }
          ${a.mensagem ? `<div class="hint">${escapeHtml(a.mensagem)}</div>` : ""}
        </div>
        <div style="display:flex; gap:0.5rem; flex-shrink:0;">
          <button type="button" class="btn secondary small" data-dispensar-aviso-portaria="${a.id}">âœ… Liberar acesso</button>
        </div>
      </div>`;
    })
    .join("");
}

// ---------- avisos liberados, aguardando conferÃªncia ----------
// A conferÃªncia sÃ³ fica disponÃ­vel DEPOIS de liberar o acesso â€” de propÃ³sito
// (ordem obrigatÃ³ria: primeiro libera o caminhÃ£o, a conferÃªncia da nota Ã©
// feita com calma depois). Some da lista assim que os pedidos relacionados
// forem conferidos/marcados como recebidos.
let avisosLiberadosPendentesCache = [];
// aviso.id -> lista de pedidos candidatos (com texto de busca jÃ¡ pronto),
// usado pra filtrar sem precisar reconsultar o banco a cada tecla digitada.
let candidatosPorAvisoSemPedido = {};

async function carregarAvisosLiberadosPendentesConferencia() {
  const el = document.getElementById("avisos-liberados-aguardando-conferencia");
  if (!el) return;
  // NÃ£o filtra por pedido_ids aqui: um aviso pode ter sido liberado sem
  // nenhum pedido vinculado (a portaria nÃ£o achou pedido pendente do
  // fornecedor, ou nÃ£o escolheu nenhum) â€” esses precisam continuar
  // aparecendo pro almoxarife vincular manualmente, senÃ£o somem sem deixar
  // rastro (foi exatamente o bug que motivou essa seÃ§Ã£o existir).
  const { data, error } = await comTimeout(
    db.from("rl_avisos_portaria").select("*").eq("lido", true).order("lido_em", { ascending: false }).limit(50)
  );
  if (error || !data) return;

  const avisosVisiveis = filtrarAvisosPorAlmoxarifeAtual(data);
  // pedido_ids null = nunca vinculado ainda (precisa de aÃ§Ã£o); [] = almoxarife
  // jÃ¡ dispensou explicitamente ("nÃ£o tem pedido pra conferir aqui").
  const comPedidos = avisosVisiveis.filter((a) => a.pedido_ids && a.pedido_ids.length);
  const semPedidos = avisosVisiveis.filter((a) => a.pedido_ids == null);

  let comPedidosPendentes = [];
  const idsPedidos = [...new Set(comPedidos.flatMap((a) => a.pedido_ids || []))];
  if (idsPedidos.length) {
    const { data: pedidosPendentes } = await comTimeout(db.from("rl_pedidos").select("id").eq("status", "pendente").in("id", idsPedidos));
    const idsPendentes = new Set((pedidosPendentes || []).map((p) => p.id));

    // Se algum dos pedidos ainda pendentes jÃ¡ teve uma entrega PARCIAL
    // registrada antes (voltou pra fila de propÃ³sito, esperando o resto),
    // sinaliza isso no card â€” senÃ£o o aviso continua aparecendo aqui igual
    // a um que ninguÃ©m tocou ainda, e parece que "nÃ£o saiu do lugar".
    const { data: paradasParciais } = await comTimeout(
      db.from("rl_rota_paradas").select("pedido_id").eq("entrega_parcial", true).in("pedido_id", [...idsPendentes])
    );
    const idsComParcial = new Set((paradasParciais || []).map((p) => p.pedido_id));

    comPedidosPendentes = comPedidos
      .filter((a) => (a.pedido_ids || []).some((id) => idsPendentes.has(id)))
      .map((a) => ({ ...a, _temParcial: (a.pedido_ids || []).some((id) => idsComParcial.has(id)) }));
  }

  let semPedidosComCandidatos = [];
  if (semPedidos.length) {
    // NÃ£o sugere mais uma LISTA automÃ¡tica (ficava grande e poluÃ­a o card) â€”
    // o almoxarife busca e vincula manualmente. Mas continua valendo dar uma
    // dica discreta (no mÃ¡ximo 2 pedidos) quando o fornecedor bate â€” sem
    // isso, um pedido que jÃ¡ estÃ¡ no sistema mas com nome de fornecedor um
    // pouco diferente na nota parecia "nÃ£o vinculÃ¡vel" Ã  toa.
    const { data: pendentesGeral } = await comTimeout(db.from("rl_pedidos").select("*").eq("status", "pendente").eq("frete_fob", false));
    semPedidosComCandidatos = semPedidos.map((a) => {
      const candidatos = a.empresa_nome ? (pendentesGeral || []).filter((p) => p.empresa_nome === a.empresa_nome) : pendentesGeral || [];
      const sugestoes = a.fornecedor_nome ? candidatos.filter((p) => fornecedoresParecidos(a.fornecedor_nome, p.fornecedor_nome)).slice(0, 2) : [];
      return { ...a, _candidatos: candidatos, _sugestoes: sugestoes };
    });
  }

  avisosLiberadosPendentesCache = [...semPedidosComCandidatos, ...comPedidosPendentes];
  renderAvisosLiberadosPendentesConferencia();
}

function renderAvisosLiberadosPendentesConferencia() {
  const el = document.getElementById("avisos-liberados-aguardando-conferencia");
  if (!el) return;
  if (!avisosLiberadosPendentesCache.length) {
    el.innerHTML = `<p class="empty-state">Nenhum acesso liberado aguardando conferÃªncia.</p>`;
    return;
  }
  el.innerHTML = avisosLiberadosPendentesCache
    .map((a) => {
      const cabecalho = `âœ… ${
        a.empresa_nome ? `<span class="badge">${escapeHtml(a.empresa_nome)}${a.setor ? ` Â· ${escapeHtml(a.setor)}` : ""}</span> ` : ""
      }<strong>${escapeHtml(a.fornecedor_nome || "Fornecedor nÃ£o informado")}</strong> Â· liberado ${formatarDataHora(a.lido_em)} por ${escapeHtml(
        a.lido_por || "â€”"
      )}${
        a.nota_arquivo_url
          ? ` Â· <a href="${a.nota_arquivo_url}" target="_blank" rel="noopener">ver nota</a>`
          : ` Â· <span class="hint">nota nÃ£o anexada pela portaria</span>`
      }`;

      if (a._candidatos) {
        // Guarda os candidatos (com o resumo dos produtos e o texto de busca
        // jÃ¡ calculados) num mapa Ã  parte â€” nÃ£o renderiza a lista inteira de
        // cara (sem "sugestÃ£o" prÃ©-carregada poluindo o card); sÃ³ aparece o
        // que a pessoa efetivamente procurar (ou o que bater como sugestÃ£o).
        const candidatosComResumo = a._candidatos.map((p) => {
          const itensArr = Array.isArray(p.itens) ? p.itens : p.itens ? [p.itens] : [];
          const resumoItens = itensArr
            .map((it) => it.produto_nome)
            .filter(Boolean)
            .join(", ");
          return {
            ...p,
            _resumoItens: resumoItens,
            _busca: normalizarProduto(`${p.numero_pedido || ""} ${p.fornecedor_nome || ""} ${resumoItens}`),
          };
        });
        candidatosPorAvisoSemPedido[a.id] = candidatosComResumo;

        const idsResumo = new Map(candidatosComResumo.map((p) => [p.id, p]));
        const sugestoesHtml = (a._sugestoes || [])
          .map((pSemResumo) => {
            const p = idsResumo.get(pSemResumo.id) || pSemResumo;
            const resumoCurto = p._resumoItens && p._resumoItens.length > 80 ? `${p._resumoItens.slice(0, 80)}â€¦` : p._resumoItens;
            return `
            <div class="sugestao-pedido-aviso">
              ðŸ’¡ Pode ser o pedido NÂº ${escapeHtml(p.numero_pedido || "sem nÃºmero")} â€” ${escapeHtml(p.fornecedor_nome || "")} â€” ${formatarMoeda(
              p.valor_total
            )}${resumoCurto ? ` â€” ${escapeHtml(resumoCurto)}` : ""}
              <a href="${p.arquivo_url}" target="_blank" rel="noopener">ver pedido</a>
              <button type="button" class="link-btn" data-usar-sugestao="${a.id}" data-pedido-sugerido="${p.id}">Ã© esse, conferir</button>
            </div>`;
          })
          .join("");
        return `
        <div class="aviso-portaria-card aviso-sem-pedido">
          <div>${cabecalho}<br><span class="hint">NinguÃ©m vinculou um pedido a este aviso ainda.</span></div>
          ${sugestoesHtml}
          <label class="form-label">Vincular pedido manualmente</label>
          <input type="text" class="busca-pedido-manual" data-aviso-id="${a.id}" placeholder="ðŸ”Ž Buscar por nÃºmero, fornecedor ou produto...">
          <div class="resultado-busca-pedido" data-aviso-id="${a.id}"></div>
          <button type="button" class="btn small" data-conferir-vinculando="${a.id}">ðŸ” Conferir selecionados</button>
          <details class="anexar-pedido-novo">
            <summary class="link-btn">ðŸ“Ž NÃ£o achou o pedido? Anexe o arquivo (foto ou PDF) dele aqui</summary>
            <label>
              Arquivo do pedido de compra
              <input type="file" class="anexo-pedido-novo" data-aviso-id="${a.id}" accept="image/*,application/pdf" capture="environment">
            </label>
            <button type="button" class="btn secondary small" data-ler-pedido-novo="${a.id}">ðŸ¤– Ler pedido com IA e vincular</button>
            <p class="feedback" data-feedback-pedido-novo="${a.id}"></p>
          </details>
          <button type="button" class="link-btn" data-dispensar-sem-pedido="${a.id}">NÃ£o tem pedido pra conferir aqui</button>
        </div>`;
      }

      return `
      <div class="aviso-portaria-card">
        <div>${cabecalho}${
        a._temParcial
          ? `<br><span class="hint">ðŸ“¦ JÃ¡ teve uma entrega parcial registrada aqui â€” confira o restante quando chegar (anexe a nota nova, nÃ£o reaproveite a antiga).</span>`
          : ""
      }</div>
        <button type="button" class="btn secondary small" data-conferir-aviso-liberado="${a.id}">${
        a._temParcial ? "ðŸ“¦ Conferir o restante" : a.nota_arquivo_url ? "âœ… Ver conferÃªncia" : "ðŸ” Conferir"
      }</button>
      </div>`;
    })
    .join("");
}

// Busca manual do pedido pra vincular â€” nÃ£o mostra nenhuma sugestÃ£o de cara
// (sÃ³ depois que a pessoa digita algo com 2+ caracteres), pra nÃ£o poluir o
// card com uma lista grande de candidatos que talvez nem sejam o certo.
const MAX_RESULTADOS_BUSCA_PEDIDO = 8;
document.getElementById("avisos-liberados-aguardando-conferencia").addEventListener("input", (e) => {
  const input = e.target.closest("input.busca-pedido-manual");
  if (!input) return;
  const avisoId = input.dataset.avisoId;
  const resultadoEl = document.querySelector(`.resultado-busca-pedido[data-aviso-id="${avisoId}"]`);
  if (!resultadoEl) return;

  const termo = normalizarProduto(input.value.trim());
  if (termo.length < 2) {
    resultadoEl.innerHTML = "";
    return;
  }
  const candidatos = candidatosPorAvisoSemPedido[avisoId] || [];
  const encontrados = candidatos.filter((p) => p._busca.includes(termo)).slice(0, MAX_RESULTADOS_BUSCA_PEDIDO);
  if (!encontrados.length) {
    resultadoEl.innerHTML = `<p class="hint">Nenhum pedido encontrado com "${escapeHtml(input.value.trim())}".</p>`;
    return;
  }
  resultadoEl.innerHTML = encontrados
    .map((p) => {
      const resumoCurto = p._resumoItens.length > 60 ? `${p._resumoItens.slice(0, 60)}â€¦` : p._resumoItens;
      return `
      <div class="resultado-busca-item">
        <label class="checkbox-line">
          <input type="checkbox" value="${p.id}">
          NÂº ${escapeHtml(p.numero_pedido || "sem nÃºmero")} â€” ${escapeHtml(p.fornecedor_nome || "")} â€” ${formatarMoeda(p.valor_total)}${
        resumoCurto ? ` â€” ${escapeHtml(resumoCurto)}` : ""
      }
        </label>
        <a href="${p.arquivo_url}" target="_blank" rel="noopener">ver pedido</a>
      </div>`;
    })
    .join("");
});

// Grava o vÃ­nculo aviso -> pedido(s) e jÃ¡ abre a conferÃªncia â€” usado tanto
// pela busca manual (um ou mais pedidos marcados) quanto pelo atalho de
// sugestÃ£o "Ã© esse, conferir" (um sÃ³, direto).
async function vincularPedidosEConferir(avisoId, ids) {
  const aviso = avisosLiberadosPendentesCache.find((a) => a.id === avisoId);
  if (!aviso) return;
  const { error: errUpdate } = await db.from("rl_avisos_portaria").update({ pedido_ids: ids }).eq("id", avisoId);
  if (errUpdate) {
    mostrarAviso("Erro ao vincular pedido: " + errUpdate.message);
    return;
  }
  const { data: pedidos, error } = await comTimeout(db.from("rl_pedidos").select("*").in("id", ids).eq("status", "pendente"));
  if (error || !pedidos || !pedidos.length) {
    mostrarAviso("Erro ao buscar o(s) pedido(s) selecionado(s).");
    carregarAvisosLiberadosPendentesConferencia();
    return;
  }
  await iniciarConferenciaCif(pedidos, notaPreLidaDoAviso(aviso));
}

document.getElementById("avisos-liberados-aguardando-conferencia").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-conferir-aviso-liberado]");
  if (btn) {
    const aviso = avisosLiberadosPendentesCache.find((a) => a.id === btn.dataset.conferirAvisoLiberado);
    if (!aviso) return;
    const { data: pedidos, error } = await comTimeout(db.from("rl_pedidos").select("*").in("id", aviso.pedido_ids).eq("status", "pendente"));
    if (error || !pedidos || !pedidos.length) {
      mostrarAviso("Erro ao buscar o(s) pedido(s): " + (error ? error.message : "jÃ¡ foram conferidos ou nÃ£o encontrados"));
      carregarAvisosLiberadosPendentesConferencia();
      return;
    }
    await iniciarConferenciaCif(pedidos, notaPreLidaDoAviso(aviso));
    return;
  }

  const btnVincular = e.target.closest("button[data-conferir-vinculando]");
  if (btnVincular) {
    const avisoId = btnVincular.dataset.conferirVinculando;
    const resultadoEl = document.querySelector(`.resultado-busca-pedido[data-aviso-id="${avisoId}"]`);
    const ids = resultadoEl ? Array.from(resultadoEl.querySelectorAll("input[type=checkbox]:checked")).map((cb) => cb.value) : [];
    if (!ids.length) {
      mostrarAviso("Selecione ao menos um pedido pra vincular a este aviso.");
      return;
    }
    await vincularPedidosEConferir(avisoId, ids);
    return;
  }

  const btnSugestao = e.target.closest("button[data-usar-sugestao]");
  if (btnSugestao) {
    await vincularPedidosEConferir(btnSugestao.dataset.usarSugestao, [btnSugestao.dataset.pedidoSugerido]);
    return;
  }

  const btnLerPedidoNovo = e.target.closest("button[data-ler-pedido-novo]");
  if (btnLerPedidoNovo) {
    const avisoId = btnLerPedidoNovo.dataset.lerPedidoNovo;
    const inputArquivo = document.querySelector(`.anexo-pedido-novo[data-aviso-id="${avisoId}"]`);
    const feedback = document.querySelector(`[data-feedback-pedido-novo="${avisoId}"]`);
    const file = inputArquivo && inputArquivo.files[0];
    if (!file) {
      feedback.textContent = "Anexe o arquivo do pedido primeiro.";
      feedback.className = "feedback error";
      return;
    }
    const aviso = avisosLiberadosPendentesCache.find((a) => a.id === avisoId);
    if (!aviso) return;

    btnLerPedidoNovo.disabled = true;
    feedback.textContent = "Lendo pedido com IA (pode levar alguns segundos)...";
    feedback.className = "feedback";
    try {
      const extraido = await lerComIA(file, "pedido");

      if (extraido.numero_pedido) {
        const { data: existente } = await comTimeout(
          db.from("rl_pedidos").select("id").eq("numero_pedido", extraido.numero_pedido).limit(1)
        );
        if (existente && existente.length) {
          throw new Error(
            `Pedido NÂº ${extraido.numero_pedido} jÃ¡ existe no sistema â€” busque por ele no campo de busca acima em vez de anexar de novo.`
          );
        }
      }

      // Acha a empresa pelo CNPJ/nome lido no documento; se a IA nÃ£o achar,
      // cai pra empresa jÃ¡ registrada no prÃ³prio aviso (a portaria jÃ¡
      // informou qual Ã© na hora de avisar a chegada).
      const cnpjLido = apenasDigitos(extraido.empresa_compradora_cnpj);
      let empresa = cnpjLido ? empresasCache.find((e) => apenasDigitos(e.cnpj) === cnpjLido) : null;
      if (!empresa && extraido.empresa_compradora_nome) {
        const nomeAlvo = extraido.empresa_compradora_nome.trim().toLowerCase();
        empresa = empresasCache.find((e) => e.nome.trim().toLowerCase() === nomeAlvo);
      }
      if (!empresa && aviso.empresa_nome) {
        empresa = empresasCache.find((e) => e.nome === aviso.empresa_nome);
      }

      // Acha ou cria o comprador pelo nome lido â€” mesmo padrÃ£o do robÃ´/import
      // automÃ¡tico, sem pedir pra digitar de novo um nome que jÃ¡ veio no
      // prÃ³prio documento.
      const nomeSolicitante = (extraido.solicitante_nome || "").trim();
      let compradorNome = "ImportaÃ§Ã£o automÃ¡tica";
      if (nomeSolicitante) {
        const existenteComprador = compradoresCache.find((c) => c.nome.trim().toLowerCase() === nomeSolicitante.toLowerCase());
        if (existenteComprador) {
          compradorNome = existenteComprador.nome;
        } else {
          const { data: novoComprador, error: errComprador } = await db
            .from("rl_compradores")
            .insert({ nome: nomeSolicitante })
            .select()
            .single();
          if (!errComprador && novoComprador) {
            compradoresCache.push(novoComprador);
            compradorNome = novoComprador.nome;
          }
        }
      }

      const { url } = await uploadArquivo(file, "rl_pedidos");

      const { data: novoPedido, error: errPedido } = await db
        .from("rl_pedidos")
        .insert({
          comprador_nome: compradorNome,
          empresa_id: empresa ? empresa.id : null,
          empresa_nome: empresa ? empresa.nome : extraido.empresa_compradora_nome || aviso.empresa_nome || null,
          empresa_cnpj: extraido.empresa_compradora_cnpj || (empresa ? empresa.cnpj : null),
          numero_pedido: extraido.numero_pedido || null,
          local_retirada: extraido.local_retirada || null,
          arquivo_url: url,
          arquivo_nome: file.name,
          valor_total: extraido.valor_total != null ? extraido.valor_total : null,
          itens: Array.isArray(extraido.itens) && extraido.itens.length ? extraido.itens : null,
          fornecedor_nome: extraido.fornecedor_nome || aviso.fornecedor_nome || null,
          condicao_pagamento_codigo: extraido.condicao_pagamento_codigo || null,
          urgente: false,
          retirar_transportadora: false,
          // Chegou por aqui (conferÃªncia CIF, aviso da portaria) â€” por
          // definiÃ§Ã£o Ã© entrega do fornecedor, nÃ£o precisa de coleta.
          frete_fob: false,
          status: "pendente",
        })
        .select()
        .single();
      if (errPedido) throw errPedido;

      const { error: errAviso } = await db.from("rl_avisos_portaria").update({ pedido_ids: [novoPedido.id] }).eq("id", avisoId);
      if (errAviso) throw errAviso;

      mostrarAviso(`Pedido NÂº ${novoPedido.numero_pedido || "sem nÃºmero"} cadastrado e vinculado a este aviso.`);
      await iniciarConferenciaCif([novoPedido], notaPreLidaDoAviso(aviso));
    } catch (err) {
      feedback.textContent = "Erro: " + err.message;
      feedback.className = "feedback error";
    } finally {
      btnLerPedidoNovo.disabled = false;
    }
    return;
  }

  const btnDispensarSemPedido = e.target.closest("button[data-dispensar-sem-pedido]");
  if (btnDispensarSemPedido) {
    // Mesmo padrÃ£o de confirmaÃ§Ã£o em dois cliques do resto do app â€” dispensar
    // sem vincular pedido nenhum tira o aviso da lista pra sempre.
    if (!btnDispensarSemPedido.dataset.confirmando) {
      btnDispensarSemPedido.dataset.confirmando = "1";
      btnDispensarSemPedido.textContent = "Confirma? Clique de novo";
      setTimeout(() => {
        delete btnDispensarSemPedido.dataset.confirmando;
        btnDispensarSemPedido.textContent = "NÃ£o tem pedido pra conferir aqui";
      }, 4000);
      return;
    }
    const { error } = await db
      .from("rl_avisos_portaria")
      .update({ pedido_ids: [] })
      .eq("id", btnDispensarSemPedido.dataset.dispensarSemPedido);
    if (error) {
      mostrarAviso("Erro ao dispensar aviso: " + error.message);
      return;
    }
    carregarAvisosLiberadosPendentesConferencia();
  }
});

// Arquiva de uma vez os avisos "sem pedido vinculado" mais antigos que 7
// dias â€” pedido do Danilo (2026-09-22): a tela ficou poluÃ­da de avisos de
// uma Ã©poca em que o pedido ainda nÃ£o era anexado no sistema, entÃ£o nunca
// vÃ£o achar um pedido pra vincular. Em vez de dispensar um por um, arquiva
// todos de uma vez (mesmo efeito do botÃ£o individual: pedido_ids vira []).
document.getElementById("btn-arquivar-sem-pedido-antigos").addEventListener("click", async (e) => {
  const btn = e.target;
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const antigos = avisosLiberadosPendentesCache.filter((a) => a._candidatos && new Date(a.lido_em || a.criado_em) < seteDiasAtras);
  if (!antigos.length) {
    mostrarAviso("Nenhum aviso sem pedido vinculado com mais de 7 dias pra arquivar.");
    return;
  }
  if (!btn.dataset.confirmando) {
    btn.dataset.confirmando = "1";
    btn.textContent = `Confirma arquivar ${antigos.length}? Clique de novo`;
    setTimeout(() => {
      delete btn.dataset.confirmando;
      btn.textContent = "ðŸ—„ï¸ Arquivar antigos sem pedido (+7 dias)";
    }, 4000);
    return;
  }
  delete btn.dataset.confirmando;
  btn.textContent = "ðŸ—„ï¸ Arquivar antigos sem pedido (+7 dias)";
  const { error } = await db
    .from("rl_avisos_portaria")
    .update({ pedido_ids: [] })
    .in("id", antigos.map((a) => a.id));
  if (error) {
    mostrarAviso("Erro ao arquivar: " + error.message);
    return;
  }
  mostrarAviso(`${antigos.length} aviso(s) arquivado(s).`);
  carregarAvisosLiberadosPendentesConferencia();
});

// Monta o objeto "notaPreLida" (mesmo formato usado por abrirModalConcluir)
// a partir de um aviso que jÃ¡ veio com a nota lida pela portaria.
function notaPreLidaDoAviso(aviso) {
  if (!aviso.nota_arquivo_url) return null;
  return {
    arquivo_url: aviso.nota_arquivo_url,
    valor_total: aviso.nota_valor_total,
    cnpj: aviso.nota_cnpj,
    numero: aviso.nota_numero,
    itens: aviso.nota_itens,
    tipo_documento: aviso.nota_tipo_documento,
    emitente_nome: aviso.nota_emitente_nome,
    data_emissao: aviso.nota_data_emissao,
    parcelas: aviso.nota_parcelas,
  };
}

// Ãšnico botÃ£o possÃ­vel num aviso ainda pendente: liberar o acesso. A
// conferÃªncia (ver mais abaixo) sÃ³ fica disponÃ­vel DEPOIS disso, de
// propÃ³sito â€” ordem obrigatÃ³ria, nÃ£o Ã© sÃ³ uma sugestÃ£o.
document.getElementById("avisos-portaria-pendentes").addEventListener("click", async (e) => {
  const btnDispensar = e.target.closest("button[data-dispensar-aviso-portaria]");
  if (!btnDispensar) return;
  const almoxarife = document.getElementById("almoxarife-select-cif").value || null;
  const { error } = await db
    .from("rl_avisos_portaria")
    .update({ lido: true, lido_por: almoxarife, lido_em: new Date().toISOString() })
    .eq("id", btnDispensar.dataset.dispensarAvisoPortaria);
  if (error) {
    mostrarAviso("Erro ao dispensar aviso: " + error.message);
    return;
  }
  carregarAvisosPortariaPendentes();
  carregarAvisosLiberadosPendentesConferencia();
});

// Cria uma "rota" mÃ­nima (sÃ³ pra essa entrega) e abre o MESMO modal de
// conferÃªncia que o motorista usa pra concluir uma parada â€” reaproveita 100%
// da leitura de nota por IA e da comparaÃ§Ã£o de itens/valor/CNPJ/condiÃ§Ã£o de
// pagamento, sem duplicar nada disso sÃ³ porque dessa vez quem confere Ã© o
// almoxarifado (entrega CIF), nÃ£o o motorista numa rota de coleta.
// Junta vÃ¡rios pedidos pendentes num sÃ³ "pedido" pra fins de comparaÃ§Ã£o â€”
// usado quando uma nota sÃ³ cobre mais de um pedido do mesmo fornecedor
// (soma o valor esperado, junta os itens de todos).
function mesclarPedidosParaConferencia(pedidos) {
  if (pedidos.length === 1) return pedidos[0];
  return {
    ...pedidos[0],
    numero_pedido: pedidos.map((p) => p.numero_pedido || "s/ nÂº").join(" + "),
    valor_total: pedidos.reduce((soma, p) => soma + (Number(p.valor_total) || 0), 0),
    itens: pedidos.flatMap((p) => (Array.isArray(p.itens) ? p.itens : [])),
  };
}

// "pedidos" Ã© sempre um array â€” normalmente com 1 item, mas pode ter mais de
// um quando o fornecedor manda uma nota sÃ³ cobrindo vÃ¡rios pedidos juntos.
// Cria uma parada por pedido real (pra cada um ficar registrado certinho no
// HistÃ³rico), mas mostra/compara tudo junto numa conferÃªncia sÃ³.
async function iniciarConferenciaCif(pedidos, notaPreLida) {
  const almoxarife = document.getElementById("almoxarife-select-cif").value;
  try {
    const { data: rota, error: errRota } = await db
      .from("rl_rotas")
      .insert({ motorista_nome: `${almoxarife || "Almoxarifado"} (recebimento CIF)`, status: "em_andamento" })
      .select()
      .single();
    if (errRota) throw errRota;

    const { data: paradas, error: errParada } = await db
      .from("rl_rota_paradas")
      .insert(pedidos.map((p, i) => ({ rota_id: rota.id, pedido_id: p.id, ordem: i, status: "pendente" })))
      .select();
    if (errParada) throw errParada;

    const [paradaPrimaria, ...paradasIrmas] = paradas;
    const pedidoMesclado = mesclarPedidosParaConferencia(pedidos);
    abrirModalConcluir(
      {
        ...paradaPrimaria,
        rl_pedidos: pedidoMesclado,
        _paradasIrmas: paradasIrmas.map((par, i) => ({ paradaId: par.id, pedidoId: pedidos[i + 1].id })),
      },
      notaPreLida
    );
  } catch (err) {
    mostrarAviso("Erro ao iniciar conferÃªncia: " + err.message);
  }
}

// ---------- lista geral de pedidos CIF pendentes (independe de aviso da portaria) ----------
let pedidosCifPendentesCache = [];

async function carregarPedidosCifPendentes() {
  const el = document.getElementById("lista-pedidos-cif-pendentes");
  const numeroFiltro = document.getElementById("filtro-numero-cif").value.trim();
  const fornecedorFiltro = document.getElementById("filtro-fornecedor-cif").value.trim();

  let query = db.from("rl_pedidos").select("*").eq("status", "pendente").eq("frete_fob", false).order("criado_em");
  if (numeroFiltro) query = query.ilike("numero_pedido", `%${numeroFiltro}%`);
  if (fornecedorFiltro) query = query.ilike("fornecedor_nome", `%${fornecedorFiltro}%`);

  // Mesma regra dos avisos: almoxarife com empresa cadastrada sÃ³ vÃª pedidos
  // daquela empresa (o pedido nÃ£o tem "setor", sÃ³ a nota/aviso tem).
  const nomeAtual = document.getElementById("almoxarife-select-cif").value;
  const almoxarife = almoxarifesCache.find((a) => a.nome === nomeAtual);
  if (almoxarife && almoxarife.empresa_nome) query = query.eq("empresa_nome", almoxarife.empresa_nome);

  const { data, error } = await comTimeout(query);
  if (error) {
    el.innerHTML = `<p class="empty-state">Erro ao carregar pedidos CIF.</p>`;
    return;
  }
  pedidosCifPendentesCache = data || [];
  renderPedidosCifPendentes();
}

function renderPedidosCifPendentes() {
  const el = document.getElementById("lista-pedidos-cif-pendentes");
  if (!pedidosCifPendentesCache.length) {
    el.innerHTML = `<p class="empty-state">Nenhum pedido CIF pendente.</p>`;
    return;
  }
  el.innerHTML = `
    <table class="tabela-itens">
      <thead><tr><th>Pedido</th><th>Empresa</th><th>Fornecedor</th><th>Comprador</th><th>Valor</th><th></th><th><input type="checkbox" id="chk-todos-terceiro" title="Selecionar todos"></th></tr></thead>
      <tbody>
        ${pedidosCifPendentesCache
          .map(
            (p) => `<tr>
              <td>${escapeHtml(p.numero_pedido || "â€”")}</td>
              <td>${escapeHtml(p.empresa_nome || "â€”")}</td>
              <td>${escapeHtml(p.fornecedor_nome || "â€”")}</td>
              <td>${escapeHtml(p.comprador_nome || "â€”")}</td>
              <td>${formatarMoeda(p.valor_total)}</td>
              <td><button type="button" class="btn small" data-conferir-pedido-cif-geral="${p.id}">ðŸ” Conferir</button></td>
              <td><input type="checkbox" class="chk-recebido-terceiro" data-id="${p.id}"></td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p class="hint">Marque o(s) pedido(s) recebido(s) fora do almoxarifado (sem nota fiscal pra conferir aqui) e use "Recebido por terceiro" acima â€” marca como recebido sem passar pela comparaÃ§Ã£o de divergÃªncia.</p>`;
}

document.getElementById("lista-pedidos-cif-pendentes").addEventListener("click", async (e) => {
  const btnConferir = e.target.closest("button[data-conferir-pedido-cif-geral]");
  if (btnConferir) {
    const pedido = pedidosCifPendentesCache.find((p) => p.id === btnConferir.dataset.conferirPedidoCifGeral);
    if (pedido) await iniciarConferenciaCif([pedido]);
    return;
  }

  if (e.target.id === "chk-todos-terceiro") {
    document.querySelectorAll(".chk-recebido-terceiro").forEach((chk) => (chk.checked = e.target.checked));
  }
});

const btnRecebidoTerceiroSelecionados = document.getElementById("btn-recebido-terceiro-selecionados");
btnRecebidoTerceiroSelecionados.addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".chk-recebido-terceiro:checked")).map((chk) => chk.dataset.id);
  if (!ids.length) {
    mostrarAviso("Selecione ao menos um pedido na lista.");
    return;
  }
  // Mesmo padrÃ£o de confirmaÃ§Ã£o em dois cliques jÃ¡ usado no resto do app
  // (ex: "Excluir" no HistÃ³rico) â€” marcar como recebido sem conferÃªncia nÃ£o
  // tem volta fÃ¡cil, entÃ£o evita clique acidental.
  if (!btnRecebidoTerceiroSelecionados.dataset.confirmando) {
    btnRecebidoTerceiroSelecionados.dataset.confirmando = "1";
    btnRecebidoTerceiroSelecionados.textContent = `Confirma ${ids.length} pedido(s)? Clique de novo`;
    setTimeout(() => {
      delete btnRecebidoTerceiroSelecionados.dataset.confirmando;
      btnRecebidoTerceiroSelecionados.textContent = "ðŸ¤ Recebido por terceiro (selecionados)";
    }, 4000);
    return;
  }
  delete btnRecebidoTerceiroSelecionados.dataset.confirmando;
  btnRecebidoTerceiroSelecionados.textContent = "ðŸ¤ Recebido por terceiro (selecionados)";
  await marcarRecebidoPorTerceiro(ids);
});

// Registra o recebimento sem nenhuma conferÃªncia de nota â€” cria a mesma rota
// "virtual" usada na conferÃªncia normal (sÃ³ pra manter um registro no
// HistÃ³rico), mas jÃ¡ marca concluÃ­do na hora, sem divergÃªncia nenhuma (nÃ£o
// hÃ¡ nota pra comparar). Aceita um ou mais pedidos de uma vez (seleÃ§Ã£o via
// checkbox na lista geral).
async function marcarRecebidoPorTerceiro(pedidoIds) {
  const pedidos = pedidosCifPendentesCache.filter((p) => pedidoIds.includes(p.id));
  if (!pedidos.length) return;
  const almoxarife = document.getElementById("almoxarife-select-cif").value;
  try {
    for (const pedido of pedidos) {
      const { data: rota, error: errRota } = await db
        .from("rl_rotas")
        .insert({ motorista_nome: `${almoxarife || "Almoxarifado"} (recebimento CIF)`, status: "concluida" })
        .select()
        .single();
      if (errRota) throw errRota;

      const { error: errParada } = await db.from("rl_rota_paradas").insert({
        rota_id: rota.id,
        pedido_id: pedido.id,
        ordem: 0,
        status: "concluida",
        recebido_por_terceiro: true,
        recebido_por: almoxarife || null,
        recebido_em: new Date().toISOString(),
        concluido_em: new Date().toISOString(),
      });
      if (errParada) throw errParada;

      const { error: errPedido } = await db.from("rl_pedidos").update({ status: "concluido" }).eq("id", pedido.id);
      if (errPedido) throw errPedido;
    }

    mostrarAviso(pedidos.length > 1 ? `${pedidos.length} pedidos marcados como recebidos por terceiro.` : "Pedido marcado como recebido por terceiro.");
    carregarPedidosCifPendentes();
  } catch (err) {
    mostrarAviso("Erro ao marcar recebimento: " + err.message);
  }
}

document.getElementById("filtro-numero-cif").addEventListener("input", debounce(carregarPedidosCifPendentes, 400));
document.getElementById("filtro-fornecedor-cif").addEventListener("input", debounce(carregarPedidosCifPendentes, 400));
document.getElementById("btn-limpar-filtros-cif").addEventListener("click", () => {
  document.getElementById("filtro-numero-cif").value = "";
  document.getElementById("filtro-fornecedor-cif").value = "";
  carregarPedidosCifPendentes();
});
document.getElementById("btn-atualizar-recebimento-cif").addEventListener("click", () => {
  carregarAvisosPortariaPendentes();
  carregarAvisosLiberadosPendentesConferencia();
  carregarPedidosCifPendentes();
});

// Preenche os filtros de empresa/comprador (dropdown) a partir de TODOS os
// pedidos jÃ¡ cadastrados â€” nÃ£o sÃ³ da pÃ¡gina atual do histÃ³rico â€” pra sempre
// oferecer a lista completa de opÃ§Ãµes, mesmo filtrando por algo raro/antigo.
// SÃ³ Ã© chamado ao abrir a aba (nÃ£o a cada atualizaÃ§Ã£o de 1 min), jÃ¡ que essas
// opÃ§Ãµes mudam bem devagar.
async function carregarFiltrosHistorico() {
  const { data, error } = await comTimeout(db.from("rl_pedidos").select("empresa_nome, comprador_nome"));
  if (error || !data) return;

  const selEmpresa = document.getElementById("filtro-empresa-historico");
  const empresaAtual = selEmpresa.value;
  const empresas = [...new Set(data.map((p) => p.empresa_nome).filter(Boolean))].sort();
  selEmpresa.innerHTML =
    `<option value="">Todas as empresas</option>` + empresas.map((emp) => `<option value="${escapeHtml(emp)}">${escapeHtml(emp)}</option>`).join("");
  if (empresas.includes(empresaAtual)) selEmpresa.value = empresaAtual;

  const selComprador = document.getElementById("filtro-comprador-historico");
  const compradorAtual = selComprador.value;
  const compradores = [...new Set(data.map((p) => p.comprador_nome).filter(Boolean))].sort();
  selComprador.innerHTML =
    `<option value="">Todos os compradores</option>` + compradores.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (compradores.includes(compradorAtual)) selComprador.value = compradorAtual;
}

// Busca sÃ³ a pÃ¡gina atual, jÃ¡ filtrada, direto no banco â€” nunca baixa o
// histÃ³rico inteiro. Por isso qualquer filtro (nÃºmero, empresa, comprador,
// fornecedor, data, sÃ³-divergentes) sempre alcanÃ§a TODO o histÃ³rico, nÃ£o
// importa o quÃ£o antigo o registro seja nem quantos existam no total.
async function loadHistorico() {
  const el = document.getElementById("lista-historico");
  const numeroFiltro = document.getElementById("filtro-numero-historico").value.trim();
  const fornecedorFiltro = document.getElementById("filtro-fornecedor-historico").value.trim();
  const empresaFiltro = document.getElementById("filtro-empresa-historico").value;
  const compradorFiltro = document.getElementById("filtro-comprador-historico").value;
  const dataInicio = document.getElementById("filtro-data-inicio").value;
  const dataFim = document.getElementById("filtro-data-fim").value;

  algumFiltroAtivoHistorico = !!(
    numeroFiltro ||
    fornecedorFiltro ||
    empresaFiltro ||
    compradorFiltro ||
    dataInicio ||
    dataFim ||
    somenteDivergentesHistorico
  );
  // Filtrar por uma coluna do pedido (nÃºmero/empresa/comprador/fornecedor)
  // exige "!inner" no embed â€” sem isso o Supabase filtra sÃ³ o que aparece
  // dentro de rl_pedidos, mas nÃ£o restringe quais paradas voltam.
  const precisaInner = numeroFiltro || empresaFiltro || compradorFiltro || fornecedorFiltro;
  let query = db
    .from("rl_rota_paradas")
    .select(`*, rl_pedidos${precisaInner ? "!inner" : ""}(*), rl_rotas(motorista_nome)`, { count: "exact" })
    .eq("status", "concluida")
    .not("concluido_em", "is", null);

  // "AtÃ©" inclui o dia inteiro (23:59:59), nÃ£o sÃ³ a meia-noite.
  if (dataInicio) query = query.gte("concluido_em", `${dataInicio}T00:00:00`);
  if (dataFim) query = query.lte("concluido_em", `${dataFim}T23:59:59`);
  if (numeroFiltro) query = query.ilike("rl_pedidos.numero_pedido", `%${numeroFiltro}%`);
  if (fornecedorFiltro) query = query.ilike("rl_pedidos.fornecedor_nome", `%${fornecedorFiltro}%`);
  if (empresaFiltro) query = query.eq("rl_pedidos.empresa_nome", empresaFiltro);
  if (compradorFiltro) query = query.eq("rl_pedidos.comprador_nome", compradorFiltro);
  if (somenteDivergentesHistorico) {
    query = query
      .eq("entrega_parcial", false)
      .or("divergencia_valor.eq.true,divergencia_cnpj.eq.true,divergencia_itens.eq.true,divergencia_condicao_pagamento.eq.true");
  }

  query = query.order("concluido_em", { ascending: false });
  const inicio = (paginaHistoricoAtual - 1) * ITENS_POR_PAGINA_HISTORICO;
  query = query.range(inicio, inicio + ITENS_POR_PAGINA_HISTORICO - 1);

  const { data, error, count } = await comTimeout(query);
  if (error) {
    el.innerHTML = `<p class="empty-state">Erro ao carregar histÃ³rico.</p>`;
    return;
  }

  // Se a pÃ¡gina pedida ficou alÃ©m do total (ex: um filtro novo reduziu o
  // total de pÃ¡ginas), volta pra Ãºltima pÃ¡gina vÃ¡lida e busca de novo.
  const totalPaginas = Math.max(1, Math.ceil((count || 0) / ITENS_POR_PAGINA_HISTORICO));
  if (paginaHistoricoAtual > totalPaginas) {
    paginaHistoricoAtual = totalPaginas;
    return loadHistorico();
  }

  // NÃ£o redesenha a tela se alguÃ©m estiver digitando algo no HistÃ³rico agora
  // (ex: a justificativa da divergÃªncia, ou a observaÃ§Ã£o do almoxarifado) â€”
  // sem isso, o refresh automÃ¡tico de 1 em 1 minuto podia cair bem no meio
  // de um texto mais longo (que demora mais pra digitar) e apagar tudo,
  // porque redesenhar a lista destrÃ³i e recria a caixinha de texto.
  const elementoAtivo = document.activeElement;
  const digitandoNoHistorico =
    elementoAtivo && elementoAtivo.matches && elementoAtivo.matches(".input-resolucao, .input-obs-recebimento");
  if (digitandoNoHistorico) return;

  paginaAtualDados = data || [];
  renderPaginacaoHistorico(totalPaginas);
  renderHistorico();
}

const buscarHistoricoDebounced = debounce(() => {
  paginaHistoricoAtual = 1;
  loadHistorico();
}, 400);

document.getElementById("filtro-empresa-historico").addEventListener("change", () => {
  paginaHistoricoAtual = 1;
  loadHistorico();
});
document.getElementById("filtro-comprador-historico").addEventListener("change", () => {
  paginaHistoricoAtual = 1;
  loadHistorico();
});
document.getElementById("filtro-numero-historico").addEventListener("input", buscarHistoricoDebounced);
document.getElementById("filtro-fornecedor-historico").addEventListener("input", buscarHistoricoDebounced);
document.getElementById("filtro-data-inicio").addEventListener("change", () => {
  paginaHistoricoAtual = 1;
  loadHistorico();
});
document.getElementById("filtro-data-fim").addEventListener("change", () => {
  paginaHistoricoAtual = 1;
  loadHistorico();
});
document.getElementById("btn-somente-divergentes").addEventListener("click", (e) => {
  somenteDivergentesHistorico = !somenteDivergentesHistorico;
  e.currentTarget.classList.toggle("ativo", somenteDivergentesHistorico);
  paginaHistoricoAtual = 1;
  loadHistorico();
});
document.getElementById("btn-limpar-filtros-historico").addEventListener("click", () => {
  document.getElementById("filtro-empresa-historico").value = "";
  document.getElementById("filtro-comprador-historico").value = "";
  document.getElementById("filtro-numero-historico").value = "";
  document.getElementById("filtro-fornecedor-historico").value = "";
  document.getElementById("filtro-data-inicio").value = "";
  document.getElementById("filtro-data-fim").value = "";
  somenteDivergentesHistorico = false;
  document.getElementById("btn-somente-divergentes").classList.remove("ativo");
  paginaHistoricoAtual = 1;
  loadHistorico();
});

document.getElementById("lista-historico").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-confirmar-recebimento]");
  if (!btn) return;
  const almoxarife = document.getElementById("almoxarife-select").value;
  if (!almoxarife) {
    mostrarAviso("Selecione seu nome (almoxarifado) primeiro.");
    return;
  }
  const paradaId = btn.dataset.confirmarRecebimento;
  const card = btn.closest(".historico-parada-card");
  const observacao = card.querySelector(".input-obs-recebimento")?.value.trim() || null;
  const inputFotos = card.querySelector(".input-fotos-recebimento");
  const arquivos = inputFotos ? Array.from(inputFotos.files) : [];

  btn.disabled = true;
  btn.textContent = arquivos.length ? "Enviando fotos..." : "Salvando...";
  try {
    const fotosUrls = [];
    for (const arquivo of arquivos) {
      const { url } = await uploadArquivo(arquivo, "rl_recebimentos");
      fotosUrls.push(url);
    }
    const { error } = await db
      .from("rl_rota_paradas")
      .update({
        recebido_por: almoxarife,
        recebido_em: new Date().toISOString(),
        recebido_observacao: observacao,
        recebido_fotos: fotosUrls.length ? fotosUrls : null,
      })
      .eq("id", paradaId);
    if (error) throw error;
    await loadHistorico();
  } catch (err) {
    mostrarAviso("Erro ao confirmar recebimento: " + err.message);
    btn.disabled = false;
    btn.textContent = "âœ… Confirmar recebimento";
  }
});

// mesmo padrÃ£o de confirmaÃ§Ã£o por duplo clique usado em "Meus pedidos"/"Pedidos disponÃ­veis"
document.getElementById("lista-historico").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-excluir-historico]");
  if (!btn) return;
  if (!btn.dataset.confirmando) {
    btn.dataset.confirmando = "1";
    btn.textContent = "Clique de novo para confirmar";
    setTimeout(() => {
      delete btn.dataset.confirmando;
      btn.textContent = "Excluir";
    }, 4000);
    return;
  }
  const { error } = await db.from("rl_rota_paradas").delete().eq("id", btn.dataset.excluirHistorico);
  if (error) {
    mostrarAviso("Erro ao excluir: " + error.message);
    return;
  }
  loadHistorico();
});

document.getElementById("lista-historico").addEventListener("click", async (e) => {
  const btnEditar = e.target.closest("button[data-editar-resolucao]");
  if (btnEditar) {
    resolucoesEmEdicao.add(btnEditar.dataset.editarResolucao);
    renderHistorico();
    return;
  }
  const btnSalvar = e.target.closest("button[data-salvar-resolucao]");
  if (btnSalvar) {
    const paradaId = btnSalvar.dataset.salvarResolucao;
    const textarea = document.querySelector(`.input-resolucao[data-parada-id="${paradaId}"]`);
    const texto = textarea.value.trim();
    if (!texto) {
      mostrarAviso("Escreva o que foi decidido antes de salvar.");
      return;
    }
    const quemRegistrou = document.getElementById("almoxarife-select").value || null;
    const { error } = await db
      .from("rl_rota_paradas")
      .update({ resolucao_divergencia: texto, resolucao_por: quemRegistrou, resolucao_em: new Date().toISOString() })
      .eq("id", paradaId);
    if (error) {
      mostrarAviso("Erro ao salvar: " + error.message);
      return;
    }
    resolucoesEmEdicao.delete(paradaId);
    await loadHistorico();
  }
});

// ---------- botÃµes de atualizar (dados podem mudar por outro comprador/motorista usando o site ao mesmo tempo) ----------
document.getElementById("btn-atualizar-comprador").addEventListener("click", loadMeusPedidos);
document.getElementById("btn-atualizar-motorista").addEventListener("click", () => {
  loadDisponiveis();
  loadRotaAtual();
});
document.getElementById("btn-atualizar-indicadores").addEventListener("click", loadIndicadores);
document.getElementById("btn-atualizar-historico").addEventListener("click", loadHistorico);
document.getElementById("btn-atualizar-config").addEventListener("click", async () => {
  await Promise.all([loadEmpresas(), loadCompradores(), loadMotoristas()]);
  renderCadastros();
});

// ---------- inicializaÃ§Ã£o ----------
(async function init() {
  await Promise.all([loadCompradores(), loadMotoristas(), loadEmpresas(), loadAlmoxarifes(), loadCondicoesPagamento()]);
  loadMeusPedidos();

  // Verifica divergÃªncias e avisos da portaria em aberto assim que a pÃ¡gina
  // carrega, pra jÃ¡ conhecer o que existe agora e sÃ³ avisar por voz do que
  // aparecer DEPOIS disso (ver avisarDivergenciasNovas/carregarAvisosPortariaPendentes).
  verificarDivergenciasNovas();
  carregarAvisosPortariaPendentes();
  carregarAvisosLiberadosPendentesConferencia();

  // AtualizaÃ§Ã£o automÃ¡tica a cada 1 min â€” pensado pro app ficar aberto o dia
  // todo (ex: numa TV do setor): reconfere se surgiu alguma divergÃªncia ou
  // aviso da portaria novo em qualquer lugar (nÃ£o sÃ³ na pÃ¡gina/filtro visÃ­vel
  // agora) e atualiza a lista visÃ­vel, sem precisar de ninguÃ©m clicar em nada.
  setInterval(() => {
    verificarDivergenciasNovas();
    carregarAvisosPortariaPendentes();
    carregarAvisosLiberadosPendentesConferencia();
    loadHistorico();
  }, 60000);
})();
