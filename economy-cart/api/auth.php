<?php
// Controlador de Autenticação - Economy Cart MVP
require_once __DIR__ . '/config.php';

$pdo = getDatabaseConnection();

// Obter dados da requisição (JSON)
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $_GET['action'] ?? $input['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(405, ['error' => true, 'message' => 'Método não permitido. Utilize POST para autenticação.']);
}

// ROTA: REGISTRAR (Cadastro de Usuário)
if ($action === 'register') {
    $nome = trim($input['nome'] ?? '');
    $email = trim($input['email'] ?? '');
    $senha = $input['senha'] ?? '';

    // Validações básicas
    if (empty($nome) || empty($email) || empty($senha)) {
        sendResponse(400, ['error' => true, 'message' => 'Todos os campos (nome, email, senha) são obrigatórios.']);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendResponse(400, ['error' => true, 'message' => 'O formato do e-mail é inválido.']);
    }

    if (strlen($senha) < 6) {
        sendResponse(400, ['error' => true, 'message' => 'A senha deve possuir no mínimo 6 caracteres.']);
    }

    try {
        // Verifica se o e-mail já existe
        $stmt = $pdo->prepare("SELECT id FROM usuarios WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            sendResponse(409, ['error' => true, 'message' => 'Este e-mail já está cadastrado no sistema.']);
        }

        // Criptografa a senha com hash seguro (BCrypt por padrão)
        $senhaHash = password_hash($senha, PASSWORD_DEFAULT);

        // Insere o novo usuário
        $stmt = $pdo->prepare("INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)");
        $stmt->execute([$nome, $email, $senhaHash]);
        $usuarioId = $pdo->lastInsertId();

        // Gera token JWT de sessão automática
        $token = JWT::encode([
            'id' => $usuarioId,
            'nome' => $nome,
            'email' => $email
        ]);

        sendResponse(201, [
            'error' => false,
            'message' => 'Usuário cadastrado com sucesso!',
            'token' => $token,
            'user' => [
                'id' => (int)$usuarioId,
                'nome' => $nome,
                'email' => $email
            ]
        ]);

    } catch (PDOException $e) {
        sendResponse(500, ['error' => true, 'message' => 'Erro interno ao cadastrar usuário: ' . $e->getMessage()]);
    }
}

// ROTA: LOGIN
elseif ($action === 'login') {
    $email = trim($input['email'] ?? '');
    $senha = $input['senha'] ?? '';

    if (empty($email) || empty($senha)) {
        sendResponse(400, ['error' => true, 'message' => 'E-mail e senha são obrigatórios para login.']);
    }

    try {
        // Busca o usuário
        $stmt = $pdo->prepare("SELECT id, nome, email, senha_hash FROM usuarios WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $usuario = $stmt->fetch();

        // Valida se usuário existe e se a senha confere
        if (!$usuario || !password_verify($senha, $usuario['senha_hash'])) {
            sendResponse(401, ['error' => true, 'message' => 'E-mail ou senha incorretos.']);
        }

        // Gera token JWT
        $token = JWT::encode([
            'id' => $usuario['id'],
            'nome' => $usuario['nome'],
            'email' => $usuario['email']
        ]);

        sendResponse(200, [
            'error' => false,
            'message' => 'Login efetuado com sucesso!',
            'token' => $token,
            'user' => [
                'id' => (int)$usuario['id'],
                'nome' => $usuario['nome'],
                'email' => $usuario['email']
            ]
        ]);

    } catch (PDOException $e) {
        sendResponse(500, ['error' => true, 'message' => 'Erro interno ao realizar login: ' . $e->getMessage()]);
    }
}

// Ação desconhecida
else {
    sendResponse(400, ['error' => true, 'message' => 'Ação de autenticação inválida ou não especificada (use register ou login).']);
}
