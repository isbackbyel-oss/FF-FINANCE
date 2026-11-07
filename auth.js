import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const DOMINIO = "@ffinance.app"; // e-mail interno invisível: o usuário só digita o nome

const el = {
  loading: $("loading"), login: $("tela-login"), app: $("tela-app"),
  usuario: $("usuario"), senha: $("senha"), senha2: $("senha2"),
  confWrap: $("confirmar-wrap"), erro: $("erro"),
  entrar: $("btn-entrar"), criar: $("btn-criar"), esqueci: $("btn-esqueci"),
  sair: $("btn-sair"), nome: $("nome-logado"), olho: $("ver-senha"), toast: $("toast")
};

let modoCriar = false;

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  setTimeout(() => el.toast.classList.remove("show"), 3500);
}
function mostrarErro(msg) { el.erro.textContent = msg || ""; }

function limparUsuario() { return el.usuario.value.trim().toLowerCase(); }
function validarUsuario(u) {
  if (!/^[a-z0-9_]{3,20}$/.test(u))
    return "Usuário: 3 a 20 caracteres, só letras, números e _ (sem espaço).";
  return null;
}
function traduzirErro(e) {
  switch (e.code) {
    case "auth/email-already-in-use": return "Esse nome de usuário já está em uso.";
    case "auth/weak-password": return "Senha fraca: use pelo menos 6 caracteres.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-login-credentials": return "Usuário ou senha incorretos.";
    case "auth/too-many-requests": return "Muitas tentativas. Aguarde um pouco e tente de novo.";
    case "auth/network-request-failed": return "Sem conexão com a internet.";
    case "auth/operation-not-allowed": return "Login por senha não está ativado no Firebase.";
    default: return "Erro inesperado: " + (e.code || e.message);
  }
}
function carregando(on) {
  el.entrar.disabled = el.criar.disabled = on;
}

function alternarModo(criar) {
  modoCriar = criar;
  el.confWrap.classList.toggle("hidden", !criar);
  el.entrar.textContent = criar ? "Cadastrar" : "Entrar";
  el.criar.textContent = criar ? "Voltar ao login" : "Criar conta";
  el.senha.autocomplete = criar ? "new-password" : "current-password";
  mostrarErro("");
}

async function entrar() {
  const u = limparUsuario(), s = el.senha.value;
  const v = validarUsuario(u);
  if (v) return mostrarErro(v);
  if (!s) return mostrarErro("Digite a senha.");
  mostrarErro(""); carregando(true);
  try {
    if (modoCriar) {
      if (s !== el.senha2.value) { mostrarErro("As senhas não são iguais."); return; }
      const cred = await createUserWithEmailAndPassword(auth, u + DOMINIO, s);
      await setDoc(doc(db, "users", cred.user.uid), {
        username: u, criadoEm: serverTimestamp()
      });
      toast("Conta criada! Bem-vindo(a).");
    } else {
      await signInWithEmailAndPassword(auth, u + DOMINIO, s);
    }
  } catch (e) {
    mostrarErro(traduzirErro(e));
  } finally {
    carregando(false);
  }
}

el.entrar.addEventListener("click", entrar);
el.criar.addEventListener("click", () => alternarModo(!modoCriar));
el.esqueci.addEventListener("click", () =>
  toast("Como não usamos e-mail, a redefinição será feita pelo administrador (etapa futura)."));
el.sair.addEventListener("click", () => signOut(auth));
el.olho.addEventListener("click", () => {
  el.senha.type = el.senha.type === "password" ? "text" : "password";
});
[el.usuario, el.senha, el.senha2].forEach(i =>
  i.addEventListener("keydown", e => { if (e.key === "Enter") entrar(); }));

// Mantém a sessão: se já estiver logado, vai direto para o app
onAuthStateChanged(auth, (user) => {
  el.loading.classList.add("hidden");
  if (user) {
    el.nome.textContent = (user.email || "").replace(DOMINIO, "");
    el.login.classList.add("hidden");
    el.app.classList.remove("hidden");
    el.senha.value = el.senha2.value = "";
  } else {
    el.app.classList.add("hidden");
    el.login.classList.remove("hidden");
    alternarModo(false);
  }
});
