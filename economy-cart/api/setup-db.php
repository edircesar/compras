<?php
// Script de Instalação e Criação das Tabelas do Banco de Dados
// Caminho: economy-cart/api/setup-db.php

// Carrega as configurações (com a detecção de ambiente local/produção)
require_once 'config.php';

// Limpa qualquer saída anterior para poder retornar HTML customizado e bonito
ob_clean();

$status = [];
$errorOccurred = false;

try {
    $pdo = getDatabaseConnection();
    $status['conexao'] = [
        'success' => true,
        'message' => 'Conexão com o banco de dados estabelecida com sucesso!',
        'details' => 'Conectado a ' . DB_NAME . ' em ' . DB_HOST
    ];
} catch (Exception $e) {
    $status['conexao'] = [
        'success' => false,
        'message' => 'Falha na conexão com o banco de dados.',
        'details' => $e->getMessage()
    ];
    $errorOccurred = true;
}

if (!$errorOccurred) {
    // 1. Tabela de Usuários
    try {
        $sqlUsuarios = "CREATE TABLE IF NOT EXISTS usuarios (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            email VARCHAR(150) NOT NULL UNIQUE,
            senha_hash VARCHAR(255) NOT NULL,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        
        $pdo->exec($sqlUsuarios);
        $status['tabela_usuarios'] = [
            'success' => true,
            'message' => 'Tabela "usuarios" criada ou já existente.',
            'details' => 'Armazena credenciais e perfis dos usuários.'
        ];
    } catch (PDOException $e) {
        $status['tabela_usuarios'] = [
            'success' => false,
            'message' => 'Erro ao criar tabela "usuarios".',
            'details' => $e->getMessage()
        ];
        $errorOccurred = true;
    }

    // 2. Tabela Mestre de Compras
    try {
        $sqlComprasMaster = "CREATE TABLE IF NOT EXISTS compras_master (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            id_local VARCHAR(36) NOT NULL UNIQUE,
            usuario_id INT UNSIGNED NOT NULL,
            local_compra VARCHAR(150) NOT NULL,
            data_compra DATE NOT NULL,
            tipo_limite ENUM('valor_maximo','livre') NOT NULL DEFAULT 'livre',
            valor_limite DECIMAL(10,2) DEFAULT NULL,
            total_geral DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            sincronizado TINYINT(1) NOT NULL DEFAULT 1,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
            INDEX idx_usuario_data (usuario_id, data_compra DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        
        $pdo->exec($sqlComprasMaster);
        $status['tabela_compras_master'] = [
            'success' => true,
            'message' => 'Tabela "compras_master" criada ou já existente.',
            'details' => 'Armazena o cabeçalho das listas de compras.'
        ];
    } catch (PDOException $e) {
        $status['tabela_compras_master'] = [
            'success' => false,
            'message' => 'Erro ao criar tabela "compras_master".',
            'details' => $e->getMessage()
        ];
        $errorOccurred = true;
    }

    // 3. Tabela de Itens de Compras
    try {
        $sqlComprasItens = "CREATE TABLE IF NOT EXISTS compras_itens (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            id_local VARCHAR(36) NOT NULL UNIQUE,
            compra_master_id INT UNSIGNED NOT NULL,
            produto VARCHAR(200) NOT NULL,
            quantidade DECIMAL(8,3) NOT NULL DEFAULT 1.000,
            valor_unitario DECIMAL(10,2) NOT NULL,
            valor_total DECIMAL(10,2) GENERATED ALWAYS AS (quantidade * valor_unitario) STORED,
            FOREIGN KEY (compra_master_id) REFERENCES compras_master(id) ON DELETE CASCADE,
            INDEX idx_compra_master (compra_master_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        
        $pdo->exec($sqlComprasItens);
        $status['tabela_compras_itens'] = [
            'success' => true,
            'message' => 'Tabela "compras_itens" criada ou já existente.',
            'details' => 'Armazena os itens adicionados a cada lista.'
        ];
    } catch (PDOException $e) {
        $status['tabela_compras_itens'] = [
            'success' => false,
            'message' => 'Erro ao criar tabela "compras_itens".',
            'details' => $e->getMessage()
        ];
        $errorOccurred = true;
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Instalação de Banco de Dados — Economia Inteligente</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0b0f19;
            --card-bg: rgba(20, 28, 48, 0.65);
            --border-color: rgba(255, 255, 255, 0.08);
            --primary: #4f46e5;
            --primary-glow: rgba(79, 70, 229, 0.4);
            --success: #10b981;
            --success-glow: rgba(16, 185, 129, 0.2);
            --danger: #ef4444;
            --danger-glow: rgba(239, 68, 68, 0.2);
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            overflow-x: hidden;
            position: relative;
        }

        /* Fundos Abstratos com Gradientes */
        body::before {
            content: '';
            position: absolute;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, rgba(0,0,0,0) 70%);
            top: -100px;
            left: -100px;
            z-index: 0;
            pointer-events: none;
        }

        body::after {
            content: '';
            position: absolute;
            width: 500px;
            height: 500px;
            background: radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(0,0,0,0) 70%);
            bottom: -150px;
            right: -150px;
            z-index: 0;
            pointer-events: none;
        }

        .container {
            width: 100%;
            max-width: 640px;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 40px;
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
            z-index: 10;
            position: relative;
            animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        header {
            text-align: center;
            margin-bottom: 36px;
        }

        .logo-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 64px;
            height: 64px;
            border-radius: 16px;
            background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);
            box-shadow: 0 8px 24px var(--primary-glow);
            margin-bottom: 20px;
        }

        .logo-icon svg {
            width: 32px;
            height: 32px;
            fill: none;
            stroke: white;
            stroke-width: 2.5;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        h1 {
            font-family: 'Outfit', sans-serif;
            font-weight: 800;
            font-size: 28px;
            letter-spacing: -0.5px;
            background: linear-gradient(to right, #ffffff, #d1d5db);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }

        .env-badge {
            display: inline-block;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            padding: 4px 12px;
            border-radius: 50px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: var(--text-muted);
            margin-top: 4px;
        }

        .env-badge.production {
            background: rgba(16, 185, 129, 0.1);
            border-color: rgba(16, 185, 129, 0.25);
            color: #34d399;
            text-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
        }

        .env-badge.local {
            background: rgba(79, 70, 229, 0.15);
            border-color: rgba(79, 70, 229, 0.3);
            color: #818cf8;
            text-shadow: 0 0 10px rgba(79, 70, 229, 0.4);
        }

        .status-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-bottom: 36px;
        }

        .status-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            padding: 20px;
            display: flex;
            align-items: flex-start;
            gap: 16px;
            transition: all 0.3s ease;
        }

        .status-card:hover {
            border-color: rgba(255, 255, 255, 0.1);
            transform: translateX(4px);
        }

        .status-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 50px;
            flex-shrink: 0;
            margin-top: 2px;
        }

        .status-card.success .status-icon {
            background: rgba(16, 185, 129, 0.12);
            color: var(--success);
            border: 1px solid rgba(16, 185, 129, 0.25);
            box-shadow: 0 0 15px var(--success-glow);
        }

        .status-card.danger .status-icon {
            background: rgba(239, 68, 68, 0.12);
            color: var(--danger);
            border: 1px solid rgba(239, 68, 68, 0.25);
            box-shadow: 0 0 15px var(--danger-glow);
        }

        .status-info {
            flex-grow: 1;
        }

        .status-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .status-card.success .status-title {
            color: #ffffff;
        }

        .status-card.danger .status-title {
            color: #fca5a5;
        }

        .status-desc {
            font-size: 13px;
            color: var(--text-muted);
            line-height: 1.4;
        }

        .cta-container {
            text-align: center;
        }

        .btn-primary {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            width: 100%;
            background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
            border: none;
            border-radius: 16px;
            padding: 18px 24px;
            color: white;
            font-family: 'Outfit', sans-serif;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            box-shadow: 0 10px 25px var(--primary-glow);
            transition: all 0.3s ease;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 30px rgba(79, 70, 229, 0.6);
            background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
        }

        .btn-primary:active {
            transform: translateY(0);
        }

        .footer-note {
            text-align: center;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.25);
            margin-top: 24px;
        }
    </style>
</head>
<body>

<div class="container">
    <header>
        <div class="logo-icon">
            <svg viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
        </div>
        <h1>Banco de Dados</h1>
        <?php if ($isLocalhost): ?>
            <span class="env-badge local">Ambiente Local</span>
        <?php else: ?>
            <span class="env-badge production">Ambiente Hostinger</span>
        <?php endif; ?>
    </header>

    <div class="status-list">
        <!-- Conexão -->
        <div class="status-card <?php echo $status['conexao']['success'] ? 'success' : 'danger'; ?>">
            <div class="status-icon">
                <?php if ($status['conexao']['success']): ?>
                    ✓
                <?php else: ?>
                    ✕
                <?php endif; ?>
            </div>
            <div class="status-info">
                <div class="status-title"><?php echo $status['conexao']['message']; ?></div>
                <div class="status-desc"><?php echo $status['conexao']['details']; ?></div>
            </div>
        </div>

        <?php if (!$errorOccurred): ?>
            <!-- Tabela Usuários -->
            <div class="status-card <?php echo $status['tabela_usuarios']['success'] ? 'success' : 'danger'; ?>">
                <div class="status-icon">
                    <?php if ($status['tabela_usuarios']['success']): ?>
                        ✓
                    <?php else: ?>
                        ✕
                    <?php endif; ?>
                </div>
                <div class="status-info">
                    <div class="status-title"><?php echo $status['tabela_usuarios']['message']; ?></div>
                    <div class="status-desc"><?php echo $status['tabela_usuarios']['details']; ?></div>
                </div>
            </div>

            <!-- Tabela Compras Master -->
            <div class="status-card <?php echo $status['tabela_compras_master']['success'] ? 'success' : 'danger'; ?>">
                <div class="status-icon">
                    <?php if ($status['tabela_compras_master']['success']): ?>
                        ✓
                    <?php else: ?>
                        ✕
                    <?php endif; ?>
                </div>
                <div class="status-info">
                    <div class="status-title"><?php echo $status['tabela_compras_master']['message']; ?></div>
                    <div class="status-desc"><?php echo $status['tabela_compras_master']['details']; ?></div>
                </div>
            </div>

            <!-- Tabela Compras Itens -->
            <div class="status-card <?php echo $status['tabela_compras_itens']['success'] ? 'success' : 'danger'; ?>">
                <div class="status-icon">
                    <?php if ($status['tabela_compras_itens']['success']): ?>
                        ✓
                    <?php else: ?>
                        ✕
                    <?php endif; ?>
                </div>
                <div class="status-info">
                    <div class="status-title"><?php echo $status['tabela_compras_itens']['message']; ?></div>
                    <div class="status-desc"><?php echo $status['tabela_compras_itens']['details']; ?></div>
                </div>
            </div>
        <?php endif; ?>
    </div>

    <div class="cta-container">
        <?php if (!$errorOccurred): ?>
            <a href="../#login" class="btn-primary">
                Acessar Economia Inteligente
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 2px;">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
            </a>
        <?php else: ?>
            <button onclick="window.location.reload();" class="btn-primary" style="background: linear-gradient(135deg, #4b5563 0%, #374151 100%); box-shadow: none;">
                Tentar Novamente
            </button>
        <?php endif; ?>
    </div>

    <div class="footer-note">
        Economia Inteligente PWA &copy; 2026. Todos os direitos reservados.
    </div>
</div>

</body>
</html>
