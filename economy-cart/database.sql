-- Banco de Dados para o Economia Inteligente (MVP)

CREATE DATABASE IF NOT EXISTS economia_inteligente CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE economia_inteligente;

-- Tabela de Usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tabela Mestre de Compras (com id_local para idempotência)
CREATE TABLE IF NOT EXISTS compras_master (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_local VARCHAR(36) NOT NULL UNIQUE, -- UUID v4 gerado no cliente
  usuario_id INT UNSIGNED NOT NULL,
  local_compra VARCHAR(150) NOT NULL,
  data_compra DATE NOT NULL,
  tipo_limite ENUM('valor_maximo','livre') NOT NULL DEFAULT 'livre',
  valor_limite DECIMAL(10,2) DEFAULT NULL,
  total_geral DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  sincronizado TINYINT(1) NOT NULL DEFAULT 1, -- Na nuvem, já está sincronizado
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_usuario_data (usuario_id, data_compra DESC)
) ENGINE=InnoDB;

-- Tabela de Itens das Compras (com id_local para identificar itens unicamente)
CREATE TABLE IF NOT EXISTS compras_itens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_local VARCHAR(36) NOT NULL UNIQUE, -- UUID v4 gerado no cliente para o item
  compra_master_id INT UNSIGNED NOT NULL,
  produto VARCHAR(200) NOT NULL,
  quantidade DECIMAL(8,3) NOT NULL DEFAULT 1.000,
  valor_unitario DECIMAL(10,2) NOT NULL,
  valor_total DECIMAL(10,2) GENERATED ALWAYS AS (quantidade * valor_unitario) STORED,
  FOREIGN KEY (compra_master_id) REFERENCES compras_master(id) ON DELETE CASCADE,
  INDEX idx_compra_master (compra_master_id)
) ENGINE=InnoDB;
