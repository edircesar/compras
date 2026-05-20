<?php
// Controlador de Compras (Master) - Economy Cart MVP
require_once __DIR__ . '/config.php';

// Valida token JWT e obtém ID do usuário ativo
$usuarioId = getAuthorizedUserId();
$pdo = getDatabaseConnection();

$method = $_SERVER['REQUEST_METHOD'];

// ROTA: LISTAR COMPRAS DO USUÁRIO
if ($method === 'GET') {
    try {
        $stmt = $pdo->prepare("
            SELECT id, id_local, local_compra, data_compra, tipo_limite, valor_limite, total_geral, sincronizado 
            FROM compras_master 
            WHERE usuario_id = ? 
            ORDER BY data_compra DESC, criado_em DESC
        ");
        $stmt->execute([$usuarioId]);
        $compras = $stmt->fetchAll();

        // Converte decimais para float/double na saída JSON para ficar mais amigável
        foreach ($compras as &$c) {
            $c['id'] = (int)$c['id'];
            $c['valor_limite'] = $c['valor_limite'] !== null ? (float)$c['valor_limite'] : null;
            $c['total_geral'] = (float)$c['total_geral'];
            $c['sincronizado'] = (int)$c['sincronizado'];
        }

        sendResponse(200, $compras);

    } catch (PDOException $e) {
        sendResponse(500, ['error' => true, 'message' => 'Erro ao listar compras: ' . $e->getMessage()]);
    }
}

// ROTA: SINCRONIZAR/CRIAR COMPRA MESTRE
elseif ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    $idLocal = trim($input['id_local'] ?? '');
    $localCompra = trim($input['local_compra'] ?? '');
    $dataCompra = trim($input['data_compra'] ?? '');
    $tipoLimite = trim($input['tipo_limite'] ?? 'livre');
    $valorLimite = isset($input['valor_limite']) ? (float)$input['valor_limite'] : null;
    $totalGeral = isset($input['total_geral']) ? (float)$input['total_geral'] : 0.00;

    // Validações básicas
    if (empty($idLocal) || empty($localCompra) || empty($dataCompra)) {
        sendResponse(400, ['error' => true, 'message' => 'Os campos id_local, local_compra e data_compra são obrigatórios.']);
    }

    if (!in_array($tipoLimite, ['valor_maximo', 'livre'])) {
        $tipoLimite = 'livre';
    }

    try {
        // --- MECANISMO DE IDEMPOTÊNCIA ---
        // Verifica se esta compra já foi sincronizada anteriormente
        $stmt = $pdo->prepare("SELECT id FROM compras_master WHERE id_local = ? AND usuario_id = ? LIMIT 1");
        $stmt->execute([$idLocal, $usuarioId]);
        $compraExistente = $stmt->fetch();

        if ($compraExistente) {
            // Se já existe, apenas atualiza os dados em caso de alteração local (Last Write Wins) e retorna o id_servidor
            $stmtUpdate = $pdo->prepare("
                UPDATE compras_master 
                SET local_compra = ?, data_compra = ?, tipo_limite = ?, valor_limite = ?, total_geral = ?, sincronizado = 1
                WHERE id = ?
            ");
            $stmtUpdate->execute([$localCompra, $dataCompra, $tipoLimite, $valorLimite, $totalGeral, $compraExistente['id']]);

            sendResponse(200, [
                'error' => false,
                'message' => 'Compra já sincronizada anteriormente. Dados atualizados.',
                'id_servidor' => (int)$compraExistente['id'],
                'id_local' => $idLocal
            ]);
        }

        // Insere a nova compra mestre
        $stmt = $pdo->prepare("
            INSERT INTO compras_master (id_local, usuario_id, local_compra, data_compra, tipo_limite, valor_limite, total_geral, sincronizado) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ");
        $stmt->execute([$idLocal, $usuarioId, $localCompra, $dataCompra, $tipoLimite, $valorLimite, $totalGeral]);
        $idServidor = $pdo->lastInsertId();

        sendResponse(210, [
            'error' => false,
            'message' => 'Compra mestre sincronizada com sucesso!',
            'id_servidor' => (int)$idServidor,
            'id_local' => $idLocal
        ]);

    } catch (PDOException $e) {
        sendResponse(500, ['error' => true, 'message' => 'Erro ao sincronizar compra mestre: ' . $e->getMessage()]);
    }
}

// ROTA: DELETAR COMPRA MESTRE
elseif ($method === 'DELETE') {
    // ID local (UUID) enviado na query parameter (ex: api/compras.php?id_local=UUID)
    $idLocal = trim($_GET['id_local'] ?? '');

    if (empty($idLocal)) {
        sendResponse(400, ['error' => true, 'message' => 'O campo id_local é obrigatório para exclusão.']);
    }

    try {
        // Verifica se a compra existe e pertence ao usuário ativo
        $stmtCheck = $pdo->prepare("SELECT id FROM compras_master WHERE id_local = ? AND usuario_id = ? LIMIT 1");
        $stmtCheck->execute([$idLocal, $usuarioId]);
        $compra = $stmtCheck->fetch();

        if (!$compra) {
            // Se já não existe no servidor, retorna sucesso (idempotência)
            sendResponse(200, [
                'error' => false,
                'message' => 'Compra não encontrada no servidor ou já excluída.'
            ]);
        }

        // Deleta a compra mestre (MySQL cuidará de deletar os itens na tabela compras_itens via ON DELETE CASCADE)
        $stmtDelete = $pdo->prepare("DELETE FROM compras_master WHERE id = ?");
        $stmtDelete->execute([$compra['id']]);

        sendResponse(200, [
            'error' => false,
            'message' => 'Compra e seus itens associados foram excluídos do servidor com sucesso.'
        ]);

    } catch (PDOException $e) {
        sendResponse(500, ['error' => true, 'message' => 'Erro ao excluir compra no servidor: ' . $e->getMessage()]);
    }
}

// Métodos não suportados
else {
    sendResponse(405, ['error' => true, 'message' => 'Método HTTP não permitido nesta rota.']);
}
