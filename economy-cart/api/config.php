<?php
// Configurações do Banco de Dados e Globais do Economia Inteligente PWA

// Habilitar exibição de erros durante o desenvolvimento
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Configuração do Fuso Horário
date_default_timezone_set('America/Sao_Paulo');

// Definições de CORS e tipo de resposta (JSON)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Trata requisições OPTIONS (Pre-flight do CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Configurações de Banco de Dados (Detecção Automática: Localhost vs Hostinger)
$isLocalhost = in_array($_SERVER['HTTP_HOST'] ?? '', ['localhost', '127.0.0.1', '[::1]']) 
            || (php_sapi_name() === 'cli');

if ($isLocalhost) {
    define('DB_HOST', 'localhost');
    define('DB_NAME', 'economia_inteligente');
    define('DB_USER', 'root');
    define('DB_PASS', '');
} else {
    define('DB_HOST', 'localhost'); // Hostinger padrão é localhost
    define('DB_NAME', 'u861144328_compras');
    define('DB_USER', 'u861144328_compras');
    define('DB_PASS', 'Deus10Deus@');
}

// Chave Secreta para Assinatura do JWT (Defina uma única chave forte em produção)
define('JWT_SECRET', 'EconomiaInteligente_JWT_SuperSecretKey_2026!');

/**
 * Retorna uma conexão PDO com o banco de dados.
 */
function getDatabaseConnection(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            sendResponse(500, ['error' => true, 'message' => 'Erro de conexão com o banco de dados remoto: ' . $e->getMessage()]);
        }
    }
    return $pdo;
}

/**
 * Envia uma resposta JSON e encerra a execução.
 * 
 * @param int $code Código HTTP de resposta.
 * @param array $data Dados a serem retornados.
 */
function sendResponse(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}

/**
 * Classe utilitária para codificação e decodificação de JWT autônomo.
 */
class JWT {
    private static string $secret = JWT_SECRET;

    private static function base64UrlEncode(string $data): string {
        return str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($data));
    }

    private static function base64UrlDecode(string $data): string {
        $padding = strlen($data) % 4;
        if ($padding) {
            $data .= str_repeat('=', 4 - $padding);
        }
        return base64_decode(str_replace(['-', '_'], ['+', '/'], $data));
    }

    /**
     * Gera um Token JWT válido por 30 dias.
     */
    public static function encode(array $payload): string {
        $header = json_encode(['alg' => 'HS256', 'typ' => 'JWT']);
        
        // Define expiração se não configurada (padrão 30 dias)
        if (!isset($payload['exp'])) {
            $payload['exp'] = time() + (30 * 24 * 60 * 60);
        }

        $base64UrlHeader = self::base64UrlEncode($header);
        $base64UrlPayload = self::base64UrlEncode(json_encode($payload));

        $signature = hash_hmac('sha256', "$base64UrlHeader.$base64UrlPayload", self::$secret, true);
        $base64UrlSignature = self::base64UrlEncode($signature);

        return "$base64UrlHeader.$base64UrlPayload.$base64UrlSignature";
    }

    /**
     * Valida um Token JWT e retorna o payload caso seja válido.
     */
    public static function decode(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        list($base64UrlHeader, $base64UrlPayload, $base64UrlSignature) = $parts;

        $signature = self::base64UrlDecode($base64UrlSignature);
        $expectedSignature = hash_hmac('sha256', "$base64UrlHeader.$base64UrlPayload", self::$secret, true);

        if (!hash_equals($signature, $expectedSignature)) {
            return null; // Assinatura inválida
        }

        $payload = json_encode(json_decode(self::base64UrlDecode($base64UrlPayload), true));
        $data = json_decode($payload, true);

        // Verifica tempo de expiração
        if (isset($data['exp']) && $data['exp'] < time()) {
            return null; // Token expirado
        }

        return $data;
    }
}

/**
 * Helper para verificar o JWT nos cabeçalhos HTTP e retornar o usuario_id.
 */
function getAuthorizedUserId(): int {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    
    if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        $token = $matches[1];
        $payload = JWT::decode($token);
        if ($payload && isset($payload['id'])) {
            return (int)$payload['id'];
        }
    }
    
    sendResponse(401, ['error' => true, 'message' => 'Token JWT inválido, expirado ou ausente. Faça login novamente.']);
    return 0; // Inacessível
}
