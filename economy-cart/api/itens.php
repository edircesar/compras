<?php
// Controlador de Itens de Compras - Economy Cart MVP
require_once __DIR__ . '/config.php';

// Valida token JWT e obtém ID do usuário ativo
$usuarioId = getAuthorizedUserId();
$pdo = getDatabaseConnection();

$method = $_SERVER['REQUEST_METHOD'];

// ROTA: LISTAR ITENS DE UMA COMPRA
if ($method === 'GET') {
    $compraMasterId = (int)($_GET['compra_master_id'] ?? 0);

    if ($compraMasterId <= 0) {
        sendResponse(400, ['error' => true, 'message' => 'Parâmetro compra_master_id inválido ou ausente.']);
    }

    try {
        // Garante que a compra pertence ao usuário ativo para evitar vazamento de dados
        $stmtCheck = $pdo->prepare("SELECT id FROM compras_master WHERE id = ? AND usuario_id = ? LIMIT 1");
        $stmtCheck->execute([$compraMasterId, $usuarioId]);
        if (!$stmtCheck->fetch()) {
            sendResponse(403, ['error' => true, 'message' => 'Você não tem permissão para acessar os itens desta compra.']);
        }

        // Busca os itens
        $stmt = $pdo->prepare("
            SELECT id, id_local, compra_master_id, produto, quantidade, valor_unitario, valor_total 
            FROM compras_itens 
            WHERE compra_master_id = ?
        ");
        $stmt->execute([$compraMasterId]);
        $itens = $stmt->fetchAll();

        // Converte decimais para float/double na saída JSON
        foreach ($itens as &$item) {
            $item['id'] = (int)$item['id'];
            $item['compra_master_id'] = (int)$item['compra_master_id'];
            $item['quantidade'] = (float)$item['quantidade'];
            $item['valor_unitario'] = (float)$item['valor_unitario'];
            $item['valor_total'] = (float)$item['valor_total'];
        }

        sendResponse(200, $itens);

    } catch (PDOException $e) {
        sendResponse(500, ['error' => true, 'message' => 'Erro ao buscar itens: ' . $e->getMessage()]);
    }
}

// ROTA: BATCH SINCRONIZAR ITENS DA COMPRA
elseif ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $compraMasterId = (int)($input['compra_master_id'] ?? 0);
    $itensInput = $input['itens'] ?? [];

    if ($compraMasterId <= 0) {
        sendResponse(400, ['error' => true, 'message' => 'O campo compra_master_id é obrigatório.']);
    }

    try {
        // Garante que a compra pertence ao usuário ativo
        $stmtCheck = $pdo->prepare("SELECT id FROM compras_master WHERE id = ? AND usuario_id = ? LIMIT 1");
        $stmtCheck->execute([$compraMasterId, $usuarioId]);
        if (!$stmtCheck->fetch()) {
            sendResponse(403, ['error' => true, 'message' => 'Você não tem permissão para gerenciar os itens desta compra.']);
        }

        $pdo->beginTransaction();

        $idsLocaisEnviados = [];

        // Insere ou atualiza cada item enviado
        foreach ($itensInput as $item) {
            $idLocal = trim($item['id_local'] ?? '');
            $produto = trim($item['produto'] ?? '');
            $quantidade = (float)($item['quantidade'] ?? 1.000);
            $valorUnitario = (float)($item['valor_unitario'] ?? 0.00);

            if (empty($idLocal) || empty($produto)) {
                continue; // Pula itens inválidos
            }

            $idsLocaisEnviados[] = $idLocal;

            // Verifica se o item já existe com este id_local
            $stmtItemExist = $pdo->prepare("SELECT id FROM compras_itens WHERE id_local = ? LIMIT 1");
            $stmtItemExist->execute([$idLocal]);
            $itemExistente = $stmtItemExist->fetch();

            if ($itemExistente) {
                // Se já existe, atualiza os dados
                $stmtUpdate = $pdo->prepare("
                    UPDATE compras_itens 
                    SET produto = ?, quantidade = ?, valor_unitario = ?
                    WHERE id = ?
                ");
                $stmtUpdate->execute([$produto, $quantidade, $valorUnitario, $itemExistente['id']]);
            } else {
                // Se não existe, cria novo registro
                $stmtInsert = $pdo->prepare("
                    INSERT INTO compras_itens (id_local, compra_master_id, produto, quantidade, valor_unitario) 
                    VALUES (?, ?, ?, ?, ?)
                ");
                $stmtInsert->execute([$idLocal, $compraMasterId, $produto, $quantidade, $valorUnitario]);
            }
        }

        // Limpeza (Delete): Remove itens no banco remoto que não foram enviados nesta sincronização
        // Isso assegura que exclusões feitas offline se propaguem ao servidor
        if (!empty($idsLocaisEnviados)) {
            // Cria placeholders dinâmicos (?,?,?) para IN clause
            $placeholders = implode(',', array_fill(0, count($idsLocaisEnviados), '?'));
            $sqlDelete = "DELETE FROM compras_itens WHERE compra_master_id = ? AND id_local NOT IN ($placeholders)";
            $stmtDelete = $pdo->prepare($sqlDelete);
            $stmtDelete->execute(array_merge([$compraMasterId], $idsLocaisEnviados));
        } else {
            // Se nenhum item foi enviado, remove todos os itens existentes da compra
            $stmtDeleteAll = $pdo->prepare("DELETE FROM compras_itens WHERE compra_master_id = ?");
            $stmtDeleteAll->execute([$compraMasterId]);
        }

        // Atualiza o total geral na tabela master com base nos itens remanescentes
        $stmtSum = $pdo->prepare("SELECT SUM(quantidade * valor_unitario) as total FROM compras_itens WHERE compra_master_id = ?");
        $stmtSum->execute([$compraMasterId]);
        $rowSum = $stmtSum->fetch();
        $totalGeralCalculado = (float)($rowSum['total'] ?? 0.00);

        $stmtUpdateTotal = $pdo->prepare("UPDATE compras_master SET total_geral = ? WHERE id = ?");
        $stmtUpdateTotal->execute([$totalGeralCalculado, $compraMasterId]);

        $pdo->commit();

        sendResponse(200, [
            'error' => false,
            'message' => 'Itens sincronizados com sucesso!',
            'total_geral' => $totalGeralCalculado
        ]);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        sendResponse(500, ['error' => true, 'message' => 'Erro ao sincronizar itens: ' . $e->getMessage()]);
    }
}

// Métodos não suportados
else {
    sendResponse(405, ['error' => true, 'message' => 'Método HTTP não permitido nesta rota.']);
}
