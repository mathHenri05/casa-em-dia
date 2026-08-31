# Casa em Dia

App caseiro para uso entre você e sua mãe: lista de compras, tarefas da casa, gastos e contas da casa (com cálculo automático de quem deve o quê), e um financeiro pessoal separado para cada uma.

Este repositório é 100% arquivos estáticos (HTML/CSS/JS puro, sem build). Ele usa o **Firebase Realtime Database** (plano gratuito) só para sincronizar os dados entre os dois celulares — sem isso configurado, o app funciona normalmente, mas nada é salvo nem sincronizado.

## 1. Publicar no GitHub Pages

1. Suba todos os arquivos deste repositório para o GitHub (se ainda não subiu).
2. No repositório, vá em **Settings → Pages**.
3. Em "Build and deployment", escolha **Deploy from a branch**, branch `main` (ou a que você usa), pasta `/ (root)`.
4. Salve. Em alguns minutos o GitHub mostra a URL do site (algo como `https://SEU_USUARIO.github.io/NOME_DO_REPO/`).

Sem configurar o Firebase (próximo passo), o app já abre e funciona nessa URL — só não salva nada entre uma visita e outra.

## 2. Criar o banco gratuito (Firebase)

Leva uns 10 minutos, uma vez só. Você vai precisar de uma conta Google.

1. Acesse **console.firebase.google.com** e clique em **Criar um projeto** (pode desativar o Google Analytics, não é necessário).
2. Dentro do projeto, no menu à esquerda, vá em **Build → Realtime Database** e clique em **Criar banco de dados**.
   - Escolha a localização mais próxima (ex: `us-central1` ou `southamerica-east1`, se disponível).
   - Comece no **modo de teste** (test mode) — vamos ajustar a regra de acesso no passo 4.
3. Ainda no console, clique no ícone de engrenagem (⚙️) → **Configurações do projeto**. Na aba **Geral**, role até "Seus apps" e clique no ícone `</>` (Web) para registrar um app.
   - Dê qualquer apelido (ex: "Casa em Dia") e clique em registrar. **Não** precisa do Firebase Hosting.
   - O Firebase vai mostrar um bloco de código com um objeto `firebaseConfig = { apiKey: ..., ... }`. Copie esses valores.
4. Abra o arquivo **`firebase-config.js`** deste repositório e substitua os valores de `window.FIREBASE_CONFIG` pelos que você copiou. O `window.CASA_APP_ID` já vem com um código aleatório — pode manter.
5. Ainda no console, vá em **Build → Authentication → Sign-in method** (ou a aba "Get started" se for a primeira vez) e **ative o provedor "Email/Password"** (Email/Senha). Sem isso ativado, ninguém consegue entrar no app — é um passo obrigatório.

6. Em **Realtime Database → Regras**, cole isto e publique:

   ```json
   {
     "rules": {
       "casaEmDia": {
         "$appId": {
           ".read": "auth != null",
           ".write": "auth != null"
         }
       },
       "$other": {
         ".read": false,
         ".write": false
       }
     }
   }
   ```

   Isso exige estar **autenticado** (login feito com sucesso) para ler ou escrever qualquer coisa no banco — não basta mais só conhecer o link ou o código do app.

7. Suba o `firebase-config.js` atualizado para o GitHub (commit + push). Depois de alguns instantes, atualize a página no celular — o aviso amarelo de "Firebase não configurado" deve sumir, e a tela de login aparece.

### Sobre a privacidade dessa configuração

Agora o acesso é protegido por **login de verdade** (Firebase Authentication), não mais por um código secreto dentro do código-fonte público. Na primeira vez que abrir o app, cada uma escolhe um dos dois perfis ("Perfil verde" / "Perfil rosa") e cria uma senha — essa senha passa a ser exigida em todos os acessos futuros àquele perfil, em qualquer aparelho. Só quem sabe a senha certa consegue entrar e ver os dados, incluindo o financeiro pessoal. As regras do banco (passo 6 acima) fazem o Firebase recusar qualquer leitura ou escrita de quem não tiver feito login — então mesmo alguém que descubra a URL do site ou olhe o código-fonte no GitHub não consegue acessar os dados sem a senha.

Duas observações importantes:
- Guarde bem as duas senhas (uma para cada perfil) — não existe uma tela de "esqueci minha senha" configurada neste app simples. Se perder a senha de um perfil, o jeito mais fácil é apagar aquele usuário em **Authentication → Users** no console do Firebase e criar de novo (com uma nova senha) na próxima vez que abrir o app.
- Isso é uma segurança "de verdade" (senha exigida por perfil), mas ainda é o nível "confiança entre vocês duas" — não é criptografia de ponta a ponta. Para o uso de vocês duas, isso já resolve o problema de "qualquer pessoa do mundo" conseguir acessar.

## 3. Instalar no iPhone

No Safari (precisa ser o Safari), abra a URL do GitHub Pages, toque no ícone de compartilhar e escolha **Adicionar à Tela de Início**. Cada uma faz isso no seu próprio celular.

Na primeira vez que abrir, o app pergunta quem está usando aquele celular — cada uma escolhe seu perfil e digita o nome uma vez.

## Estrutura dos arquivos

- `index.html` — a página do app.
- `style.css` — todo o visual.
- `app.js` — toda a lógica (listas, gastos, sincronização).
- `firebase-config.js` — suas credenciais do Firebase (edite este arquivo).
- `manifest.json` — configuração de instalação como app.
- `sw.js` — cache simples para abrir mesmo com internet ruim (os dados em si sempre precisam de conexão para sincronizar).
- `icons/` — ícone do app em alguns tamanhos.
