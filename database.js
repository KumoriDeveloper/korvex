const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');

// Одно подключение на весь сервер — иначе данные могут быть не видны сразу после INSERT
let _db = null;

function getDB() {
    if (_db) return _db;
    _db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
            console.error('Ошибка подключения к БД:', err.message);
        } else {
            console.log('Подключено к SQLite БД:', DB_PATH);
        }
    });
    return _db;
}

// Инициализация таблиц
function initDatabase() {
    const db = getDB();
    
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Таблица новостей
            db.run(`CREATE TABLE IF NOT EXISTS news (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                image TEXT,
                tag TEXT,
                date TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) reject(err);
            });

            // Таблица команд (заявки на регистрацию)
            db.run(`CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                captain_name TEXT NOT NULL,
                email TEXT,
                tg_contact TEXT,
                team_name TEXT NOT NULL,
                team_logo TEXT,
                team_description TEXT,
                team_members TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) reject(err);
            });
            db.run("ALTER TABLE teams ADD COLUMN tg_contact TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('teams tg_contact:', err.message);
            });

            // Таблица команд в рейтинге
            db.run(`CREATE TABLE IF NOT EXISTS ranking_teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER,
                team_name TEXT NOT NULL,
                logo TEXT,
                points INTEGER DEFAULT 0,
                matches INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                form TEXT,
                rating REAL DEFAULT 1000,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (team_id) REFERENCES teams(id)
            )`, (err) => {
                if (err) reject(err);
            });
            db.run("ALTER TABLE ranking_teams ADD COLUMN rating REAL DEFAULT 1000", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('ranking_teams rating:', err.message);
            });
            db.run("UPDATE ranking_teams SET rating = 1000 WHERE rating IS NULL", (err) => {
                if (err) console.error('ranking_teams backfill rating:', err.message);
            });

            // Таблица игроков в рейтинге
            db.run(`CREATE TABLE IF NOT EXISTS ranking_players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER,
                player_name TEXT NOT NULL,
                nickname TEXT NOT NULL,
                avatar TEXT,
                rating REAL DEFAULT 0.0,
                kills INTEGER DEFAULT 0,
                deaths INTEGER DEFAULT 0,
                assists INTEGER DEFAULT 0,
                country_code TEXT,
                matches_played INTEGER DEFAULT 0,
                avg_kills REAL DEFAULT 0.0,
                avg_entry_kills REAL DEFAULT 0.0,
                avg_trade_kills REAL DEFAULT 0.0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (team_id) REFERENCES ranking_teams(id)
            )`, (err) => {
                if (err) reject(err);
            });
            db.run("ALTER TABLE ranking_players ADD COLUMN country_code TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('ranking_players country_code:', err.message);
            });
            db.run("ALTER TABLE ranking_players ADD COLUMN matches_played INTEGER DEFAULT 0", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('ranking_players matches_played:', err.message);
            });
            db.run("ALTER TABLE ranking_players ADD COLUMN avg_kills REAL DEFAULT 0.0", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('ranking_players avg_kills:', err.message);
            });
            db.run("ALTER TABLE ranking_players ADD COLUMN avg_entry_kills REAL DEFAULT 0.0", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('ranking_players avg_entry_kills:', err.message);
            });
            db.run("ALTER TABLE ranking_players ADD COLUMN avg_trade_kills REAL DEFAULT 0.0", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('ranking_players avg_trade_kills:', err.message);
            });
            // Таблица баннеров
            db.run(`CREATE TABLE IF NOT EXISTS banners (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                side TEXT NOT NULL,
                image_url TEXT NOT NULL,
                link_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) reject(err);
            });

            // Таблица деталей команд
            db.run(`CREATE TABLE IF NOT EXISTS team_details (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                region TEXT,
                map_stats TEXT,
                achievements TEXT,
                matches TEXT,
                social_links TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (team_id) REFERENCES ranking_teams(id)
            )`, (err) => {
                if (err) reject(err);
            });

            // Таблица организаторов
            db.run(`CREATE TABLE IF NOT EXISTS organizers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                short_info TEXT,
                logo TEXT,
                social_links TEXT,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) reject(err);
            });

            // Таблица матчей (для главной страницы)
            db.run(`CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team1_name TEXT NOT NULL,
                team1_logo TEXT,
                team2_name TEXT NOT NULL,
                team2_logo TEXT,
                score1 INTEGER,
                score2 INTEGER,
                status TEXT NOT NULL DEFAULT 'upcoming',
                date_time TEXT,
                tournament_name TEXT,
                map_name TEXT,
                stream_url TEXT,
                sort_order INTEGER DEFAULT 0,
                organizer_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (organizer_id) REFERENCES organizers(id)
            )`, (err) => {
                if (err) reject(err);
            });

            // Таблица турниров (для главной страницы + форматы/сетки)
            db.run(`CREATE TABLE IF NOT EXISTS tournaments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                prize TEXT,
                date_start TEXT,
                date_end TEXT,
                teams_count INTEGER DEFAULT 16,
                stage TEXT,
                progress_percent INTEGER DEFAULT 0,
                format TEXT DEFAULT 'single_elim',
                bracket_data TEXT,
                sort_order INTEGER DEFAULT 0,
                organizer_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (organizer_id) REFERENCES organizers(id)
            )`, (err) => {
                if (err) reject(err);
            });

            db.run("ALTER TABLE matches ADD COLUMN organizer_id INTEGER", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('matches organizer_id:', err.message);
            });
            db.run("ALTER TABLE matches ADD COLUMN format TEXT DEFAULT 'bo1'", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('matches format:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN organizer_id INTEGER", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments organizer_id:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN format TEXT DEFAULT 'single_elim'", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments format:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN bracket_data TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments bracket_data:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN prize_distribution TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments prize_distribution:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN teams_attending TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments teams_attending:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN formats_description TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments formats_description:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN related_events TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments related_events:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN vrs_date TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments vrs_date:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN vrs_weight TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments vrs_weight:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN map_pool TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments map_pool:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN description TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments description:', err.message);
            });
            db.run("ALTER TABLE tournaments ADD COLUMN extra_info TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('tournaments extra_info:', err.message);
            });

            // Карты матча (для bo1/bo3/bo5)
            db.run(`CREATE TABLE IF NOT EXISTS match_maps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER NOT NULL,
                map_order INTEGER NOT NULL DEFAULT 1,
                map_name TEXT NOT NULL,
                score1 INTEGER,
                score2 INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (match_id) REFERENCES matches(id)
            )`, (err) => {
                if (err) reject(err);
            });

            // Статистика игроков по матчу (K-D, ADR, KAST, Rating)
            db.run(`CREATE TABLE IF NOT EXISTS match_player_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER NOT NULL,
                team_side INTEGER NOT NULL,
                player_name TEXT NOT NULL,
                kills INTEGER DEFAULT 0,
                deaths INTEGER DEFAULT 0,
                adr REAL,
                kast REAL,
                rating_30 REAL,
                country_code TEXT,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (match_id) REFERENCES matches(id)
            )`, (err) => {
                if (err) reject(err);
            });
            db.run("ALTER TABLE match_player_stats ADD COLUMN swing REAL", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_player_stats swing:', err.message);
            });
            db.run("ALTER TABLE match_player_stats ADD COLUMN assists INTEGER DEFAULT 0", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_player_stats assists:', err.message);
            });
            db.run("ALTER TABLE match_player_stats ADD COLUMN e REAL DEFAULT 0", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_player_stats e:', err.message);
            });
            db.run("ALTER TABLE match_player_stats ADD COLUMN t REAL DEFAULT 0", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_player_stats t:', err.message);
            });

            // Изменение очков рейтинга по матчу (для отображения на странице матча)
            db.run(`CREATE TABLE IF NOT EXISTS match_rating_changes (
                match_id INTEGER PRIMARY KEY,
                team1_rating_before REAL,
                team1_rating_after REAL,
                team2_rating_before REAL,
                team2_rating_after REAL,
                team1_is_favorite INTEGER,
                team2_is_favorite INTEGER,
                team1_win INTEGER,
                team2_win INTEGER,
                team1_win_streak INTEGER,
                team1_lose_streak INTEGER,
                team2_win_streak INTEGER,
                team2_lose_streak INTEGER,
                team1_base_delta REAL,
                team2_base_delta REAL,
                team1_streak_bonus REAL,
                team1_streak_penalty REAL,
                team2_streak_bonus REAL,
                team2_streak_penalty REAL,
                format_code TEXT,
                FOREIGN KEY (match_id) REFERENCES matches(id)
            )`, (err) => {
                if (err) reject(err);
            });
            // Добавляем новые поля для уже существующей таблицы (если их нет)
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team1_is_favorite INTEGER", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team1_is_favorite:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team2_is_favorite INTEGER", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team2_is_favorite:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team1_win INTEGER", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team1_win:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team2_win INTEGER", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team2_win:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team1_win_streak INTEGER", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team1_win_streak:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team1_lose_streak INTEGER", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team1_lose_streak:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team2_win_streak INTEGER", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team2_win_streak:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team2_lose_streak INTEGER", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team2_lose_streak:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team1_base_delta REAL", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team1_base_delta:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team2_base_delta REAL", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team2_base_delta:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team1_streak_bonus REAL", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team1_streak_bonus:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team1_streak_penalty REAL", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team1_streak_penalty:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team2_streak_bonus REAL", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team2_streak_bonus:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN team2_streak_penalty REAL", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes team2_streak_penalty:', err.message);
            });
            db.run("ALTER TABLE match_rating_changes ADD COLUMN format_code TEXT", (err) => {
                if (err && !err.message.includes('duplicate')) console.error('match_rating_changes format_code:', err.message);
            });

            // Таблица администраторов
            db.run(`CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) reject(err);
            });

            // Создать админа по умолчанию, если его нет
            db.get("SELECT COUNT(*) as count FROM admins", (err, row) => {
                if (err) {
                    reject(err);
                } else if (row.count === 0) {
                    db.run("INSERT INTO admins (username, password) VALUES ('korvexadmin', 'gkjldfguhrgunfj23243256!!@@!$#')", (err) => {
                        if (err) reject(err);
                        else {
                            // console.log('Создан администратор по умолчанию: admin/admin');
                            resolve();
                        }
                    });
                } else {
                    resolve();
                }
            });
        });
    });
}

// Закрытие соединения
function closeDB(db) {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = { getDB, initDatabase, closeDB };

