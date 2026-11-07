import { auth, db } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, collection, addDoc, deleteDoc, query, orderBy, onSnapshot,
  writeBatch, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const DOMINIO = "@ffinance.app";
const CATEGORIAS = {
  entrada: ["Salário", "Vendas", "Outros"],
  saida: ["Alimentação", "Transporte", "Moradia", "Lazer", "Saúde", "Outros"]
};

let usuario = "", gid = null, parar = null;
let transacoes = [], tipoForm = "saida", filtroTipo = "todas", salvando = false;

/* ---------- utilidades ---------- */
const brl = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const fmtData = (d) => d.toLocaleDateString("pt-BR") + " " +
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}
function agoraLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
// Aceita "12,50", "1.234,56" e "12.5". Guarda em centavos (inteiro) para não errar contas.
function lerValor(s) {
  s = String(s).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return Math.round(Number(s) * 100);
}
// O total é sempre recalculado a partir da lista: nenhuma movimentação conta duas vezes.
function somar(lista) {
  let e = 0, s = 0;
  for (const t of lista) { if (t.tipo === "entrada") e += t.valorCentavos; else s += t.valorCentavos; }
  return { e, s, liq: e - s };
}
function pintar(el, c, comSinal) {
  el.textContent = (comSinal ? (c > 0 ? "+ " : c < 0 ? "− " : "") : "") + brl(comSinal ? Math.abs(c) : c);
  el.classList.toggle("pos", c >= 0);
  el.classList.toggle("neg", c < 0);
}

/* ---------- navegação ---------- */
function ir(nome) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("ativa", v.id === "view-" + nome));
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("ativa", b.dataset.view === nome));
  window.scrollTo(0, 0);
}
document.querySelectorAll(".nav button").forEach(b => b.addEventListener("click", () => ir(b.dataset.view)));

/* ---------- início ---------- */
function itemHTML(t, comExcluir) {
  const entrada = t.tipo === "entrada";
  return `<div class="item">
    <div class="info"><b>${esc(t.categoria)}</b>${t.obs ? `<span>${esc(t.obs)}</span>` : ""}
      <small>${fmtData(t.data)} · ${esc(t.usuario)}</small></div>
    <div class="dir"><b class="${entrada ? "pos" : "neg"}">${entrada ? "+" : "−"} ${brl(t.valorCentavos)}</b>
      ${comExcluir ? `<button class="lixo" data-id="${t.id}" aria-label="Excluir">🗑</button>` : ""}</div>
  </div>`;
}

function grafico() {
  const dias = 30, hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (dias - 1));
  let saldo = somar(transacoes.filter(t => t.data < inicio)).liq;
  const pts = [];
  for (let i = 0; i < dias; i++) {
    const d0 = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const d1 = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i + 1);
    saldo += somar(transacoes.filter(t => t.data >= d0 && t.data < d1)).liq;
    pts.push(saldo);
  }
  const min = Math.min(...pts), max = Math.max(...pts), faixa = (max - min) || 1;
  const W = 300, H = 110, P = 8;
  const xy = pts.map((v, i) => [P + i * (W - 2 * P) / (dias - 1), H - P - (v - min) / faixa * (H - 2 * P)]);
  const linha = xy.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const ult = xy[xy.length - 1];
  $("grafico").innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" class="svg-graf"><polyline points="${linha}"/>` +
    `<circle cx="${ult[0].toFixed(1)}" cy="${ult[1].toFixed(1)}" r="4"/></svg>`;
}

function renderInicio() {
  const tot = somar(transacoes);
  pintar($("saldo"), tot.liq, false);
  $("tot-ent").textContent = brl(tot.e);
  $("tot-sai").textContent = brl(tot.s);

  const a = new Date();
  const dia = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const sem = new Date(dia); sem.setDate(dia.getDate() - ((dia.getDay() + 6) % 7)); // segunda-feira
  const mes = new Date(a.getFullYear(), a.getMonth(), 1);
  pintar($("res-dia"), somar(transacoes.filter(t => t.data >= dia)).liq, true);
  pintar($("res-sem"), somar(transacoes.filter(t => t.data >= sem)).liq, true);
  pintar($("res-mes"), somar(transacoes.filter(t => t.data >= mes)).liq, true);

  grafico();
  const ult = transacoes.slice(0, 5);
  $("ultimas").innerHTML = ult.length ? ult.map(t => itemHTML(t, false)).join("")
    : `<div class="vazio">Nenhuma movimentação ainda.<br>Toque em ➕ Adicionar.</div>`;
}

/* ---------- histórico ---------- */
function renderHistorico() {
  const q = $("busca").value.trim().toLowerCase();
  const lista = transacoes.filter(t =>
    (filtroTipo === "todas" || t.tipo === filtroTipo) &&
    (!q || (t.categoria + " " + t.obs + " " + t.usuario).toLowerCase().includes(q)));
  $("lista-hist").innerHTML = lista.length ? lista.map(t => itemHTML(t, true)).join("")
    : `<div class="vazio">Nada encontrado.</div>`;
}
$("busca").addEventListener("input", renderHistorico);
document.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
  filtroTipo = c.dataset.f;
  document.querySelectorAll(".chip").forEach(x => x.classList.toggle("ativa", x === c));
  renderHistorico();
}));
$("lista-hist").addEventListener("click", async (e) => {
  const b = e.target.closest(".lixo");
  if (!b) return;
  if (!confirm("Excluir esta movimentação? Não dá para desfazer.")) return;
  try {
    await deleteDoc(doc(db, "groups", gid, "transactions", b.dataset.id));
    toast("Movimentação excluída.");
  } catch (err) { toast("Não foi possível excluir: " + (err.code || err.message)); }
});

function renderTudo() { renderInicio(); renderHistorico(); }

/* ---------- adicionar ---------- */
function montarCategorias() {
  $("categoria").innerHTML = CATEGORIAS[tipoForm].map(c => `<option>${esc(c)}</option>`).join("");
}
function setTipo(t) {
  tipoForm = t;
  $("seg-saida").className = t === "saida" ? "ativa-saida" : "";
  $("seg-entrada").className = t === "entrada" ? "ativa-entrada" : "";
  montarCategorias();
}
$("seg-saida").addEventListener("click", () => setTipo("saida"));
$("seg-entrada").addEventListener("click", () => setTipo("entrada"));

function limparForm() {
  $("valor").value = ""; $("obs").value = ""; $("data").value = agoraLocal();
  $("erro-add").textContent = ""; setTipo("saida");
}

$("btn-salvar").addEventListener("click", async () => {
  if (salvando) return;
  const erro = $("erro-add"); erro.textContent = "";
  const valorCentavos = lerValor($("valor").value);
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) { erro.textContent = "Digite um valor maior que zero."; return; }
  if (valorCentavos > 99999999999) { erro.textContent = "Valor muito alto."; return; }
  const data = new Date($("data").value);
  if (isNaN(data)) { erro.textContent = "Informe a data e o horário."; return; }
  salvando = true; $("btn-salvar").disabled = true;
  try {
    await addDoc(collection(db, "groups", gid, "transactions"), {
      tipo: tipoForm, valorCentavos, categoria: $("categoria").value,
      obs: $("obs").value.trim(), data: Timestamp.fromDate(data),
      uid: auth.currentUser.uid, usuario, criadoEm: serverTimestamp()
    });
    toast("Salvo ✅");
    limparForm(); ir("inicio");
  } catch (e) {
    erro.textContent = "Erro ao salvar: " + (e.code || e.message);
  } finally {
    salvando = false; $("btn-salvar").disabled = false;
  }
});

$("btn-sair").addEventListener("click", () => signOut(auth));

/* ---------- ligar / desligar ---------- */
export async function iniciarApp(user) {
  usuario = (user.email || "").replace(DOMINIO, "");
  $("quem").textContent = "@" + usuario;
  limparForm(); ir("inicio");
  try {
    const uref = doc(db, "users", user.uid);
    const snap = await getDoc(uref);
    gid = snap.exists() ? snap.data().groupId : null;
    if (!gid) { // primeira vez: cria o grupo financeiro (a outra pessoa entra depois, em Gerenciar Membros)
      const gref = doc(collection(db, "groups"));
      const b = writeBatch(db);
      b.set(gref, { ownerUid: user.uid, members: [user.uid], criadoEm: serverTimestamp() });
      b.set(uref, { username: usuario, groupId: gref.id }, { merge: true });
      await b.commit();
      gid = gref.id;
    }
    parar = onSnapshot(
      query(collection(db, "groups", gid, "transactions"), orderBy("data", "desc")),
      (s) => {
        transacoes = s.docs.map(d => {
          const x = d.data();
          return { id: d.id, ...x, data: x.data.toDate() };
        });
        renderTudo();
      },
      (err) => toast("Erro ao carregar: " + (err.code || err.message))
    );
  } catch (e) {
    toast("Erro: " + (e.code || e.message));
  }
}

export function pararApp() {
  if (parar) parar();
  parar = null; gid = null; transacoes = [];
}
