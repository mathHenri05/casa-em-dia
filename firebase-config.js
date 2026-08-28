// ============================================================================
// Configuração do Firebase — Casa em Dia
// ============================================================================
// Depois de criar seu projeto Firebase (veja README.md), cole aqui o objeto
// de configuração que o console do Firebase te dá em:
//   Configurações do projeto > Geral > Seus apps > SDK setup and configuration
//
// Antes de configurar, os valores abaixo são só placeholders — o app funciona
// normalmente, mas mostra um aviso e NÃO salva nem sincroniza nada.
// ============================================================================

window.FIREBASE_CONFIG = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx"
};

// Identificador do "quarto" onde os dados da casa ficam guardados dentro do
// seu banco. Já veio com um código aleatório só seu — pode deixar como está,
// ou trocar por outro texto. Por padrão, quem souber esse texto consegue ler
// e escrever os dados desse caminho, então não publique ele em outro lugar.
window.CASA_APP_ID = "VGIpJ3fddly_PSQuPX_q";
