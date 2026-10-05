-- Esquema de la base de datos Pelota (MySQL 8+)
-- Ejecutado por: npm run db:init

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','viewer') NOT NULL DEFAULT 'admin',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leagues (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  season     VARCHAR(40),
  format     ENUM('groups','single') NOT NULL DEFAULT 'groups',
  num_groups INT NOT NULL DEFAULT 1,
  rounds     INT NOT NULL DEFAULT 1,            -- vueltas del round-robin
  status     ENUM('setup','scheduled','in_progress','finished') NOT NULL DEFAULT 'setup',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS league_groups (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  league_id INT NOT NULL,
  name      VARCHAR(60) NOT NULL,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teams (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  league_id  INT NOT NULL,
  group_id   INT NULL,
  name       VARCHAR(120) NOT NULL,
  city       VARCHAR(120),
  color      VARCHAR(20) DEFAULT '#1e5aa8',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES league_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS players (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  team_id    INT NOT NULL,
  name       VARCHAR(120) NOT NULL,
  number     INT,
  position   VARCHAR(10),
  bats       ENUM('R','L','S'),
  throws     ENUM('R','L'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS games (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  league_id    INT NOT NULL,
  group_id     INT NULL,
  round        INT NOT NULL DEFAULT 1,
  game_date    DATE NULL,
  home_team_id INT NOT NULL,
  away_team_id INT NOT NULL,
  home_score   INT NULL,
  away_score   INT NULL,
  status       ENUM('scheduled','final') NOT NULL DEFAULT 'scheduled',
  stage        ENUM('regular','playoff') NOT NULL DEFAULT 'regular',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES league_groups(id) ON DELETE SET NULL,
  FOREIGN KEY (home_team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (away_team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS batting_lines (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  game_id   INT NOT NULL,
  player_id INT NOT NULL,
  team_id   INT NOT NULL,
  ab  INT NOT NULL DEFAULT 0,   -- turnos al bate
  r   INT NOT NULL DEFAULT 0,   -- carreras anotadas
  h   INT NOT NULL DEFAULT 0,   -- hits
  b2  INT NOT NULL DEFAULT 0,   -- dobles
  b3  INT NOT NULL DEFAULT 0,   -- triples
  hr  INT NOT NULL DEFAULT 0,   -- jonrones
  rbi INT NOT NULL DEFAULT 0,   -- carreras impulsadas
  bb  INT NOT NULL DEFAULT 0,   -- bases por bolas
  so  INT NOT NULL DEFAULT 0,   -- ponches
  hbp INT NOT NULL DEFAULT 0,   -- golpeado por lanzamiento
  sf  INT NOT NULL DEFAULT 0,   -- elevado de sacrificio
  sb  INT NOT NULL DEFAULT 0,   -- bases robadas
  UNIQUE KEY uq_bat (game_id, player_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pitching_lines (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  game_id   INT NOT NULL,
  player_id INT NOT NULL,
  team_id   INT NOT NULL,
  outs INT NOT NULL DEFAULT 0,  -- entradas lanzadas expresadas en outs (IP*3)
  h    INT NOT NULL DEFAULT 0,
  r    INT NOT NULL DEFAULT 0,
  er   INT NOT NULL DEFAULT 0,  -- carreras limpias
  bb   INT NOT NULL DEFAULT 0,
  so   INT NOT NULL DEFAULT 0,
  hr   INT NOT NULL DEFAULT 0,
  bf   INT NOT NULL DEFAULT 0,  -- bateadores enfrentados
  win  TINYINT NOT NULL DEFAULT 0,
  loss TINYINT NOT NULL DEFAULT 0,
  save TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_pit (game_id, player_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
