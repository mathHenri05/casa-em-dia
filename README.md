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
5. De volta no console do Firebase, em **Realtime Database → Regras**, cole isto (trocando `TROQUE_AQUI` pelo mesmo valor que está em `CASA_APP_ID` no arquivo `firebase-config.js`) e publique:

   ```json
   {
     "rules": {
       "casaEmDia": {
         "TROQUE_AQUI": {
           ".read": true,
           ".write": true
         }
       },
       "$other": {
         ".read": false,
         ".write": false
       }
     }
   }
   ```

   Isso restringe a leitura/escrita só ao "caminho" do seu app dentro do banco — o resto fica bloqueado.

6. Suba o `firebase-config.js` atualizado para o GitHub (commit + push). Depois de alguns instantes, atualize a página no celular — o aviso amarelo de "Firebase não configurado" deve sumir, e as duas passam a ver as mesmas listas.

### Sobre a privacidade dessa configuração

As regras acima deixam esse caminho do banco de dados **legível e gravável por qualquer pessoa que souber o valor de `CASA_APP_ID`** (não por qualquer pessoa do mundo, mas não é uma senha de verdade — é mais como uma URL secreta). Para um app doméstico entre vocês duas isso costuma ser suficiente. Se um dia quiser mais segurança, o passo natural é ativar o **Firebase Authentication** (ex: login por e-mail) e trocar a regra para exigir `auth != null` — é um passo a mais que posso te ajudar a fazer depois, se quiser.

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
