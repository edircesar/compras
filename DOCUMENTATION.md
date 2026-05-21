# 🛒 Economia Inteligente — Documentação do Projeto

## 🎯 Objetivo do Aplicativo
O **Economia Inteligente** é um aplicativo focado em auxiliar os usuários no controle financeiro e gestão de listas de compras. Seu principal objetivo é fornecer uma experiência rápida e fluida, permitindo que o usuário registre suas compras, defina limites de gastos, adicione produtos e acompanhe o valor total em tempo real. O aplicativo garante que as compras sejam registradas com segurança, mesmo quando não houver conexão com a internet (Offline-First).

## 🚀 Principais Recursos e Funcionalidades

### 1. 📱 Progressive Web App (PWA) e Mobile-First
- **Acesso rápido e instalação:** Pode ser "instalado" diretamente na tela inicial do smartphone, parecendo um aplicativo nativo.
- **Cache de Assets Estáticos:** Arquivos CSS, JS, HTML e imagens são armazenados em cache no primeiro acesso via **Service Worker (`sw.js`)**, permitindo carregamento instantâneo.
- **Design Responsivo e Mobile-First:** A interface de usuário (UI) foi projetada primariamente para dispositivos móveis, com navegação por *Bottom Nav Bar* (Barra de navegação inferior).

### 2. 📡 Funcionamento Offline-First e Sincronização
- **Banco de Dados Local (IndexedDB):** Usa a biblioteca `idb` para armazenar compras e itens localmente no navegador do usuário, garantindo que o app funcione sem internet.
- **Sincronização em Segundo Plano (Background Sync):** Quando o aplicativo detecta o retorno da conexão com a internet, o Service Worker e o gerenciador de sincronização (`js/sync.js`) acionam automaticamente o envio de todas as compras e exclusões pendentes para o servidor.
- **Mecanismo de Idempotência:** A sincronização utiliza `UUIDs` gerados localmente para garantir que não haja duplicação de dados ao enviar as compras para a API em PHP.

### 3. 🔐 Autenticação Segura
- Sistema de Login e Cadastro processados na API PHP com persistência de tokens JWT (JSON Web Tokens).
- O Token JWT garante o acesso às rotas protegidas da API e é gerido localmente para manter a sessão ativa sem expor credenciais.

### 4. 📝 Gestão de Compras
- **Criação de Compras:** O usuário define o "Local da Compra" (ex: Supermercado), "Data" e pode, opcionalmente, estipular um **Limite de Gastos** (tipo_limite: 'valor_maximo' ou 'livre').
- **Controle em Tempo Real:** Conforme os produtos são adicionados (nome, quantidade e valor unitário), o valor total é calculado. Se houver limite estipulado, o usuário é alertado caso o valor se aproxime ou ultrapasse o orçamento.
- **Edição e Exclusão:** As listas podem ser editadas e excluídas, refletindo a ação tanto localmente quanto remotamente.

### 5. 📊 Estatísticas e Relatórios
- **Dashboard Visual:** Utilização da biblioteca **Chart.js** para fornecer gráficos intuitivos das despesas ao longo do tempo.
- **Exportação (PDF):** Utiliza a biblioteca **html2pdf.js** para que o usuário possa baixar o relatório das compras e estatísticas de forma consolidada e offline.

### 6. 🔔 Notificações e Lembretes
- Gerenciamento de lembretes diários e avisos interativos, utilizando o sistema de **Toasts** e o Notification API nativo do dispositivo.

---

## 🛠 Arquitetura e Tecnologias (Tech Stack)

### Frontend (Client-Side)
- **HTML5 e CSS3 (Vanilla):** Estruturação semântica e estilização global (`css/app.css`) usando variáveis CSS para temas (Dark Mode/Verde Escuro).
- **JavaScript (ES6+):** Lógica da Single Page Application (SPA), roteamento com base em Hash (`#`), e manipulação de DOM (`js/app.js`, `js/compra.js`, `js/historico.js`, etc.).
- **IndexedDB (`idb v8`):** Persistência de dados complexos de forma estruturada no navegador.
- **Bibliotecas Externas:** `Chart.js` (Estatísticas), `html2pdf.js` (Exportação), `idb` (Banco de dados local).

### Backend (Server-Side)
- **PHP 8+:** APIs RESTful que processam autenticação (`api/auth.php`), listagem e sincronização de compras (`api/compras.php`) e itens (`api/itens.php`).
- **MySQL/MariaDB:** Banco de dados relacional para persistência permanente (`database.sql`).
- **Autenticação JWT:** Implementação autônoma de decodificação/codificação de JWT via PHP, sem dependências volumosas no backend.

---

## 📂 Estrutura de Diretórios
- `/economy-cart/` (Raiz do Projeto Frontend)
  - `manifest.json` / `sw.js`: Configurações essenciais para o PWA (Service Worker e Manifesto).
  - `/api/`: Backend PHP (Rotas da API, Configurações de BD, Setup).
  - `/css/`: Estilos da aplicação (`app.css`).
  - `/js/`: Controladores do Frontend (Autenticação, Roteamento, IndexedDB, Sincronização, Estatísticas).
  - `/pages/`: Componentes HTML injetados pelo roteador (login, compras, histórico).
  - `/icons/`: Ícones PWA.

## 🔄 Fluxo de Dados (Data Flow)
1. Usuário faz login -> Token JWT é armazenado localmente.
2. Usuário cria uma compra offline -> Salvo no `IndexedDB` com status `sincronizado = 0`.
3. Usuário conecta-se à internet -> Evento `online` aciona `SyncManager`.
4. `SyncManager` envia as deleções e adições pendentes via `POST/DELETE` para a API PHP.
5. API PHP processa e retorna ID Servidor -> `SyncManager` atualiza o registro local marcando `sincronizado = 1`.
6. Dados em nuvem podem ser consultados por outros dispositivos via requisição `GET`.
