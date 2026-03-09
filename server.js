require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const multer = require('multer');
const { getDB, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// ========== API ENDPOINTS ==========

// Хранилище для загруженных баннеров (img/banners)
const bannersUploadDir = path.join(__dirname, 'img', 'banners');
try {
    if (!fs.existsSync(bannersUploadDir)) {
        fs.mkdirSync(bannersUploadDir, { recursive: true });
    }
} catch (e) {
    console.error('Не удалось создать директорию для баннеров:', e);
}

const bannersStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, bannersUploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
        const base = 'banner_' + Date.now() + '_' + Math.round(Math.random() * 1e6);
        cb(null, base + ext);
    }
});

const bannersUpload = multer({
    storage: bannersStorage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Хранилище для логотипов команд (img/teams)
const teamsUploadDir = path.join(__dirname, 'img', 'teams');
try {
    if (!fs.existsSync(teamsUploadDir)) {
        fs.mkdirSync(teamsUploadDir, { recursive: true });
    }
} catch (e) {
    console.error('Не удалось создать директорию для логотипов команд:', e);
}

const teamsStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, teamsUploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
        const base = 'team_' + Date.now() + '_' + Math.round(Math.random() * 1e6);
        cb(null, base + ext);
    }
});

const teamsUpload = multer({
    storage: teamsStorage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});



// Прокси для картинок (баннеры): решает mixed-content и блокировки hotlink.
// Использование: /api/image-proxy?url=https%3A%2F%2F...
app.get('/api/image-proxy', (req, res) => {
    const raw = (req.query && req.query.url) ? String(req.query.url) : '';
    let parsed;
    try {
        parsed = new URL(raw);
    } catch (e) {
        return res.status(400).send('Invalid url');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).send('Unsupported protocol');
    }

    const host = (parsed.hostname || '').toLowerCase();
    const blockedHosts = new Set(['95.81.122.36', '::1']);
    if (blockedHosts.has(host)) {
        return res.status(403).send('Forbidden');
    }

    // Простая защита от SSRF по приватным IPv4 (без DNS-resolve)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
        const parts = host.split('.').map(n => parseInt(n, 10));
        const [a, b] = parts;
        const isPrivate =
            a === 10 ||
            a === 127 ||
            (a === 192 && b === 168) ||
            (a === 172 && b >= 16 && b <= 31);
        if (isPrivate) return res.status(403).send('Forbidden');
    }

    const maxRedirects = 3;
    const fetchStream = (u, redirectsLeft) => {
        const client = u.protocol === 'https:' ? https : http;
        const request = client.get(
            u,
            {
                headers: {
                    'User-Agent': 'KorvexBannerProxy/1.0',
                    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                    'Referer': `${req.protocol}://${req.get('host')}/`
                },
                timeout: 15000
            },
            (r) => {
                const status = r.statusCode || 0;
                const loc = r.headers && r.headers.location ? String(r.headers.location) : '';
                if ([301, 302, 303, 307, 308].includes(status) && loc && redirectsLeft > 0) {
                    r.resume();
                    let next;
                    try { next = new URL(loc, u); } catch (e) { return res.status(502).send('Bad redirect'); }
                    return fetchStream(next, redirectsLeft - 1);
                }

                if (status < 200 || status >= 300) {
                    r.resume();
                    return res.status(502).send('Upstream error');
                }

                const ct = r.headers['content-type'] ? String(r.headers['content-type']) : '';
                if (ct && !ct.toLowerCase().startsWith('image/')) {
                    r.resume();
                    return res.status(415).send('Not an image');
                }

                res.setHeader('Content-Type', ct || 'image/*');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                r.pipe(res);
            }
        );

        request.on('timeout', () => {
            request.destroy(new Error('timeout'));
        });
        request.on('error', () => {
            if (!res.headersSent) res.status(502).send('Proxy error');
        });
    };

    fetchStream(parsed, maxRedirects);
});

// НОВОСТИ
app.get('/api/news', (req, res) => {
    const db = getDB();
    db.all("SELECT * FROM news ORDER BY date DESC", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

app.post('/api/news', (req, res) => {
    const db = getDB();
    const { title, content, image, tag, date } = req.body;
    const sql = "INSERT INTO news (title, content, image, tag, date) VALUES (?, ?, ?, ?, ?)";
    db.run(sql, [title, content, image || null, tag || null, date || new Date().toISOString()], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID, ...req.body });
        }
    });
});

app.put('/api/news/:id', (req, res) => {
    const db = getDB();
    const { title, content, image, tag, date } = req.body;
    const sql = "UPDATE news SET title = ?, content = ?, image = ?, tag = ?, date = ? WHERE id = ?";
    db.run(sql, [title, content, image || null, tag || null, date || new Date().toISOString(), req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

app.delete('/api/news/:id', (req, res) => {
    const db = getDB();
    db.run("DELETE FROM news WHERE id = ?", [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// Преобразование team_members: JSON массив [{name}] или старая строка "a,b,c"
function parseTeamMembers(raw) {
    if (!raw) return [];
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
        try {
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.map(m => typeof m === 'object' && m && 'name' in m ? { name: m.name || '' } : { name: String(m) }) : [];
        } catch (e) { return []; }
    }
    if (typeof raw === 'string') {
        return raw.split(',').map(s => ({ name: s.trim() })).filter(m => m.name);
    }
    if (Array.isArray(raw)) {
        return raw.map(m => typeof m === 'object' && m && 'name' in m ? { name: m.name || '' } : { name: String(m) });
    }
    return [];
}

function serializeTeamMembers(members) {
    const arr = parseTeamMembers(members);
    return JSON.stringify(arr);
}

// КОМАНДЫ (заявки)
app.get('/api/teams', (req, res) => {
    const db = getDB();
    db.all("SELECT * FROM teams ORDER BY created_at DESC", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            const teams = rows.map(team => ({
                ...team,
                team_members: parseTeamMembers(team.team_members)
            }));
            res.json(teams);
        }
    });
});

// Экспорт заявок команд в CSV (удобно для импорта в Google Sheets)
app.get('/api/teams/export.csv', (req, res) => {
    const db = getDB();
    db.all("SELECT * FROM teams ORDER BY created_at DESC", (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        function csvCell(v) {
            const s = (v == null) ? '' : String(v);
            const escaped = s.replace(/"/g, '""');
            return `"${escaped}"`;
        }

        const header = [
            'id',
            'created_at',
            'status',
            'team_name',
            'captain_name',
            'tg_contact',
            'email',
            'team_logo',
            'team_description',
            'team_members'
        ].join(',');

        const lines = (rows || []).map(r => {
            const members = parseTeamMembers(r.team_members);
            const memberNames = (members || []).map(m => (m && typeof m === 'object' && 'name' in m) ? (m.name || '') : String(m)).filter(Boolean);
            return [
                csvCell(r.id),
                csvCell(r.created_at),
                csvCell(r.status),
                csvCell(r.team_name),
                csvCell(r.captain_name),
                csvCell(r.tg_contact),
                csvCell(r.email),
                csvCell(r.team_logo),
                csvCell(r.team_description),
                csvCell(memberNames.join('; '))
            ].join(',');
        }).join('\r\n');

        const csv = '\ufeff' + header + '\r\n' + lines + (lines ? '\r\n' : '');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="teams.csv"');
        return res.send(csv);
    });
});

app.post('/api/teams', teamsUpload.single('teamLogo'), (req, res) => {
    const db = getDB();
    const isJson = (req.headers['content-type'] || '').includes('application/json');

    let captainName, email, tg_contact, teamName, teamLogo, teamDescription, teamMembers, status;

    if (isJson) {
        ({ captainName, email, tg_contact, teamName, teamLogo, teamDescription, teamMembers, status } = req.body || {});
    } else {
        const body = req.body || {};
        captainName = body.captainName;
        email = body.email;
        tg_contact = body.tg_contact;
        teamName = body.teamName;
        teamDescription = body.teamDescription;
        status = body.status || 'pending';
        try {
            teamMembers = body.teamMembers ? JSON.parse(body.teamMembers) : [];
        } catch (e) {
            teamMembers = [];
        }
        teamLogo = body.teamLogo;
    }

    // Если загружен файл логотипа — используем его относительный путь
    if (req.file) {
        teamLogo = '/img/teams/' + req.file.filename;
    }

    const membersStr = serializeTeamMembers(teamMembers);
    const sql = "INSERT INTO teams (captain_name, email, tg_contact, team_name, team_logo, team_description, team_members, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    db.run(sql, [captainName || '', email || '', tg_contact || null, teamName, teamLogo || null, teamDescription || null, membersStr, status || 'pending'], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID, ...req.body });
        }
    });
});

app.put('/api/teams/:id', (req, res) => {
    const db = getDB();
    const { captainName, email, tg_contact, teamName, teamLogo, teamDescription, teamMembers, status } = req.body;
    const membersStr = serializeTeamMembers(teamMembers);
    const sql = "UPDATE teams SET captain_name = ?, email = ?, tg_contact = ?, team_name = ?, team_logo = ?, team_description = ?, team_members = ?, status = ? WHERE id = ?";
    db.run(sql, [captainName || '', email || '', tg_contact || null, teamName, teamLogo || null, teamDescription || null, membersStr, status, req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

app.delete('/api/teams/:id', (req, res) => {
    const db = getDB();
    db.run("DELETE FROM teams WHERE id = ?", [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// РЕЙТИНГ КОМАНД
app.get('/api/ranking/teams', (req, res) => {
    const db = getDB();
    db.all("SELECT * FROM ranking_teams ORDER BY COALESCE(rating, 1000) DESC", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            const teams = rows.map(team => ({
                ...team,
                form: team.form ? team.form.split(',') : []
            }));
            res.json(teams);
        }
    });
});

app.post('/api/ranking/teams', (req, res) => {
    const db = getDB();
    const { teamId, teamName, logo, points, matches, wins, form, rating } = req.body;
    const formStr = Array.isArray(form) ? form.join(',') : form;
    const ratingVal = rating != null ? Number(rating) : 500;
    const sql = "INSERT INTO ranking_teams (team_id, team_name, logo, points, matches, wins, form, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    db.run(sql, [teamId || null, teamName, logo || null, points || 500, matches || 0, wins || 0, formStr || '', ratingVal], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID, ...req.body });
        }
    });
});

app.put('/api/ranking/teams/:id', (req, res) => {
    const db = getDB();
    const { teamName, logo, points, matches, wins, form, rating } = req.body;
    const formStr = Array.isArray(form) ? form.join(',') : form;
    const ratingVal = rating != null ? Number(rating) : undefined;
    const sql = ratingVal !== undefined
        ? "UPDATE ranking_teams SET team_name = ?, logo = ?, points = ?, matches = ?, wins = ?, form = ?, rating = ? WHERE id = ?"
        : "UPDATE ranking_teams SET team_name = ?, logo = ?, points = ?, matches = ?, wins = ?, form = ? WHERE id = ?";
    const params = ratingVal !== undefined
        ? [teamName, logo || null, points, matches, wins, formStr, ratingVal, req.params.id]
        : [teamName, logo || null, points, matches, wins, formStr, req.params.id];
    db.run(sql, params, (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

app.delete('/api/ranking/teams/:id', (req, res) => {
    const db = getDB();
    db.run("DELETE FROM ranking_teams WHERE id = ?", [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// РЕЙТИНГ ИГРОКОВ
app.get('/api/ranking/players', (req, res) => {
    const db = getDB();
    db.all("SELECT * FROM ranking_players ORDER BY rating DESC", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

app.post('/api/ranking/players', (req, res) => {
    const db = getDB();
    const { teamId, playerName, nickname, avatar, rating, kills, deaths, assists, countryCode } = req.body;
    const sql = "INSERT INTO ranking_players (team_id, player_name, nickname, avatar, rating, kills, deaths, assists, country_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
    db.run(sql, [teamId || null, playerName, nickname, avatar || null, rating || 0, kills || 0, deaths || 0, assists || 0, countryCode || null], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID, ...req.body });
        }
    });
});

app.put('/api/ranking/players/:id', (req, res) => {
    const db = getDB();
    const { playerName, nickname, avatar, rating, kills, deaths, assists, teamId, countryCode } = req.body;
    const sql = "UPDATE ranking_players SET player_name = ?, nickname = ?, avatar = ?, rating = ?, kills = ?, deaths = ?, assists = ?, team_id = ?, country_code = ? WHERE id = ?";
    db.run(sql, [playerName, nickname, avatar || null, rating, kills, deaths, assists, teamId || null, countryCode || null, req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

app.delete('/api/ranking/players/:id', (req, res) => {
    const db = getDB();
    db.run("DELETE FROM ranking_players WHERE id = ?", [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// БАННЕРЫ
app.get('/api/banners', (req, res) => {
    const db = getDB();
    db.all("SELECT * FROM banners", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            // поддерживаем три позиции: левый, правый и нижний блок
            const banners = { left: [], right: [], bottom: [] };
            rows.forEach(banner => {
                if (banner.side === 'left') {
                    banners.left.push(banner);
                } else if (banner.side === 'right') {
                    banners.right.push(banner);
                } else if (banner.side === 'bottom') {
                    banners.bottom.push(banner);
                }
            });
            res.json(banners);
        }
    });
});

app.post('/api/banners', (req, res) => {
    const db = getDB();
    const { side, imageUrl, linkUrl } = req.body;
    const sql = "INSERT INTO banners (side, image_url, link_url) VALUES (?, ?, ?)";
    db.run(sql, [side, imageUrl, linkUrl || null], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID, side, image: imageUrl, link: linkUrl });
        }
    });
});

// Загрузка баннера как файла (multipart/form-data)
app.post('/api/banners/upload', bannersUpload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'File is required' });
    }
    const db = getDB();
    const side = (req.body.side || 'left').toString();
    const linkUrl = req.body.linkUrl || null;
    const relativePath = '/img/banners/' + req.file.filename;
    const sql = "INSERT INTO banners (side, image_url, link_url) VALUES (?, ?, ?)";
    db.run(sql, [side, relativePath, linkUrl || null], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({
                id: this.lastID,
                side,
                image_url: relativePath,
                link_url: linkUrl
            });
        }
    });
});

app.delete('/api/banners/:id', (req, res) => {
    const db = getDB();
    db.run("DELETE FROM banners WHERE id = ?", [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// ДЕТАЛИ КОМАНД
app.get('/api/team-details/:teamId', (req, res) => {
    const db = getDB();
    db.get("SELECT * FROM team_details WHERE team_id = ?", [req.params.teamId], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else if (row) {
            const details = {
                region: row.region,
                mapStats: row.map_stats ? JSON.parse(row.map_stats) : {},
                achievements: row.achievements ? JSON.parse(row.achievements) : [],
                matches: row.matches ? JSON.parse(row.matches) : [],
                social: row.social_links ? JSON.parse(row.social_links) : {}
            };
            res.json(details);
        } else {
            res.json({});
        }
    });
});

app.post('/api/team-details/:teamId', (req, res) => {
    const db = getDB();
    const { mapStats, achievements, matches, social, region } = req.body;
    
    const achievementsJson = JSON.stringify(achievements || []);
    const matchesJson = JSON.stringify(matches || []);

    const insertSql = `INSERT INTO team_details 
        (team_id, region, map_stats, achievements, matches, social_links, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;

    // ВАЖНО: сначала удаляем все старые записи для этой команды,
    // чтобы не оставалось "старых" матчей/достижений
    db.serialize(() => {
        db.run(
            'DELETE FROM team_details WHERE team_id = ?',
            [req.params.teamId],
            function (deleteErr) {
                if (deleteErr) {
                    console.error('Ошибка удаления старых деталей команды из БД:', deleteErr);
                    return res.status(500).json({ error: deleteErr.message });
                }

                db.run(
                    insertSql,
                    [
                        req.params.teamId,
                        region || null,
                        JSON.stringify(mapStats || {}),
                        achievementsJson,
                        matchesJson,
                        JSON.stringify(social || {})
                    ],
                    function (insertErr) {
                        if (insertErr) {
                            console.error('Ошибка сохранения в БД:', insertErr);
                            return res.status(500).json({ error: insertErr.message });
                        }
                        return res.json({ success: true });
                    }
                );
            }
        );
    });
});

// ОРГАНИЗАТОРЫ
app.get('/api/organizers', (req, res) => {
    const db = getDB();
    db.all("SELECT * FROM organizers ORDER BY sort_order ASC, name ASC", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});



app.get('/api/organizers/:id', (req, res) => {
    const db = getDB();
    db.get("SELECT * FROM organizers WHERE id = ?", [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else if (!row) {
            res.status(404).json({ error: 'Not found' });
        } else {
            res.json(row);
        }
    });
});

app.post('/api/organizers', (req, res) => {
    const db = getDB();
    const { name, short_info, logo, social_links, sort_order } = req.body;
    const linksStr = typeof social_links === 'string' ? social_links : (social_links ? JSON.stringify(social_links) : null);
    const sql = "INSERT INTO organizers (name, short_info, logo, social_links, sort_order) VALUES (?, ?, ?, ?, ?)";
    db.run(sql, [name || '', short_info || null, logo || null, linksStr, sort_order != null ? sort_order : 0], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID, name, short_info, logo, social_links: linksStr, sort_order });
        }
    });
});

app.put('/api/organizers/:id', (req, res) => {
    const db = getDB();
    const { name, short_info, logo, social_links, sort_order } = req.body;
    const linksStr = typeof social_links === 'string' ? social_links : (social_links ? JSON.stringify(social_links) : null);
    const sql = "UPDATE organizers SET name = ?, short_info = ?, logo = ?, social_links = ?, sort_order = ? WHERE id = ?";
    db.run(sql, [name || '', short_info || null, logo || null, linksStr, sort_order != null ? sort_order : 0, req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

app.delete('/api/organizers/:id', (req, res) => {
    const db = getDB();
    db.run("DELETE FROM organizers WHERE id = ?", [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// МАТЧИ (главная страница)
app.get('/api/matches', (req, res) => {
    const db = getDB();
    db.all("SELECT * FROM matches ORDER BY sort_order ASC, created_at DESC", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

app.post('/api/matches', (req, res) => {
    const db = getDB();
    const { team1_name, team1_logo, team2_name, team2_logo, score1, score2, status, date_time, tournament_name, map_name, stream_url, sort_order, organizer_id, format, maps } = req.body;
    const fmt = (format === 'bo3' || format === 'bo5') ? format : 'bo1';
    const sql = `INSERT INTO matches (team1_name, team1_logo, team2_name, team2_logo, score1, score2, status, date_time, tournament_name, map_name, stream_url, sort_order, organizer_id, format)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [
        team1_name || '', team1_logo || null, team2_name || '', team2_logo || null,
        score1 != null ? score1 : null, score2 != null ? score2 : null,
        status || 'upcoming', date_time || null, tournament_name || null, map_name || null, stream_url || null,
        sort_order != null ? sort_order : 0,
        organizer_id != null && organizer_id !== '' ? parseInt(organizer_id, 10) : null,
        fmt
    ], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            const matchId = this.lastID;
            const mapList = Array.isArray(maps) && maps.length ? maps : [{ map_name: map_name || '', score1: score1, score2: score2 }];
            const stmt = db.prepare("INSERT INTO match_maps (match_id, map_order, map_name, score1, score2) VALUES (?, ?, ?, ?, ?)");
            let done = 0;
            const statusStr = (status || '').toString().trim().toLowerCase();
            const isFinished = statusStr === 'finished' || statusStr === 'завершён';
            const sendResponse = () => res.json({ id: matchId, ...req.body });
            mapList.forEach((m, i) => {
                stmt.run([matchId, i + 1, m.map_name || '', m.score1 != null ? m.score1 : null, m.score2 != null ? m.score2 : null], (e) => {
                    done++;
                    if (done === mapList.length) {
                        stmt.finalize();
                        if (isFinished) applyMatchFinishedStats(db, matchId, sendResponse);
                        else sendResponse();
                    }
                });
            });
            if (mapList.length === 0) {
                if (isFinished) applyMatchFinishedStats(db, matchId, sendResponse);
                else sendResponse();
            }
        }
    });
});

app.put('/api/matches/:id', (req, res) => {
    const db = getDB();
    const matchId = req.params.id;
    const { team1_name, team1_logo, team2_name, team2_logo, score1, score2, status, date_time, tournament_name, map_name, stream_url, sort_order, organizer_id, format, maps } = req.body;
    const fmt = (format === 'bo3' || format === 'bo5') ? format : 'bo1';
    const sql = `UPDATE matches SET team1_name=?, team1_logo=?, team2_name=?, team2_logo=?, score1=?, score2=?, status=?, date_time=?, tournament_name=?, map_name=?, stream_url=?, sort_order=?, organizer_id=?, format=? WHERE id=?`;
    db.run(sql, [
        team1_name || '', team1_logo || null, team2_name || '', team2_logo || null,
        score1 != null ? score1 : null, score2 != null ? score2 : null,
        status || 'upcoming', date_time || null, tournament_name || null, map_name || null, stream_url || null,
        sort_order != null ? sort_order : 0,
        organizer_id != null && organizer_id !== '' ? parseInt(organizer_id, 10) : null,
        fmt,
        matchId
    ], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            db.run("DELETE FROM match_maps WHERE match_id = ?", [matchId], (e) => {
                const mapList = Array.isArray(maps) && maps.length ? maps : [{ map_name: map_name || '', score1: score1, score2: score2 }];
                const statusStr = (status || '').toString().trim().toLowerCase();
                const isFinished = statusStr === 'finished' || statusStr === 'завершён';
                const sendResponse = () => res.json({ success: true });
                const insertMaps = () => {
                    if (mapList.length === 0) {
                        if (isFinished) applyMatchFinishedStats(db, matchId, sendResponse);
                        else sendResponse();
                        return;
                    }
                    const stmt = db.prepare("INSERT INTO match_maps (match_id, map_order, map_name, score1, score2) VALUES (?, ?, ?, ?, ?)");
                    let done = 0;
                    mapList.forEach((m, i) => {
                        stmt.run([matchId, i + 1, m.map_name || '', m.score1 != null ? m.score1 : null, m.score2 != null ? m.score2 : null], () => {
                            done++;
                            if (done === mapList.length) {
                                stmt.finalize();
                                if (isFinished) applyMatchFinishedStats(db, matchId, sendResponse);
                                else sendResponse();
                            }
                        });
                    });
                };
                insertMaps();
            });
        }
    });
});

// Нормализация названия команды для сравнения (без пробелов, нижний регистр) — чтобы "Korvex Team" и "KorvexTeam" совпадали
function normTeamName(s) {
    return (s || '').toString().trim().toLowerCase().replace(/\s+/g, '');
}

// Формат матча → строка "BO1" | "BO3" | "BO5"
function getFormatCode(format) {
    const f = (format || '').toString().trim().toLowerCase();
    if (f === 'bo3') return 'BO3';
    if (f === 'bo5') return 'BO5';
    return 'BO1';
}

// Нормализация названия карты к одному из ключей статистики
// (mirage, inferno, nuke, dust2, overpass, ancient, anubis)
function normMapKey(name) {
    const n = (name || '').toString().trim().toLowerCase();
    if (!n) return null;
    if (n.includes('mirage')) return 'mirage';
    if (n.includes('inferno')) return 'inferno';
    if (n.includes('nuke')) return 'nuke';
    if (n.includes('dust2') || n.includes('dust 2')) return 'dust2';
    if (n.includes('overpass')) return 'overpass';
    if (n.includes('ancient')) return 'ancient';
    if (n.includes('anubis')) return 'anubis';
    return null;
}

// Подсчёт вин/луз-стрика по строке формы (формат: "W,L,W,...", последние матчи, от старого к новому)
function getStreak(formStr, isWin) {
    const items = (formStr || '').toString().split(',').filter(Boolean);
    if (!items.length) return 0;
    let streak = 0;
    for (let i = items.length - 1; i >= 0; i--) {
        const v = items[i].trim().toUpperCase();
        if (isWin && v === 'W') streak++;
        else if (!isWin && v === 'L') streak++;
        else break;
    }
    return streak;
}

// Новый рейтинг по заданной формуле
// Если передан объект details, в него будет записан разбор: baseDelta, streakBonus, streakPenalty, totalDelta.
function computeTeamRatingNew(teamRating, win, formatCode, isFavorite, winStreak, loseStreak, details) {
    const tr = Number(teamRating);
    const baseRating = Number.isFinite(tr) ? tr : 500;
    const winFlag = win === 1 ? 1 : 0;
    const fav = isFavorite === 1 ? 1 : 0;
    const fmt = formatCode === 'BO3' || formatCode === 'BO5' ? formatCode : 'BO1';

    let baseDelta = 0;
    if (winFlag === 1) {
        if (fav === 1) {
            baseDelta = fmt === 'BO1' ? 20 : (fmt === 'BO3' ? 35 : 50);
        } else {
            baseDelta = fmt === 'BO1' ? 30 : (fmt === 'BO3' ? 45 : 65);
        }
    } else {
        if (fav === 1) {
            baseDelta = fmt === 'BO1' ? -30 : (fmt === 'BO3' ? -45 : -55);
        } else {
            baseDelta = fmt === 'BO1' ? -20 : (fmt === 'BO3' ? -35 : -45);
        }
    }

    const ws = Number(winStreak) || 0;
    const ls = Number(loseStreak) || 0;

    const streakBonus = ws >= 2 ? 4 * (ws - 1) : 0;
    const streakPenalty = ls >= 2 ? 3 * (ls - 1) : 0;

    const totalDelta = baseDelta + streakBonus - streakPenalty;
    const newRating = baseRating + totalDelta;

    if (details && typeof details === 'object') {
        details.baseDelta = baseDelta;
        details.streakBonus = streakBonus;
        details.streakPenalty = streakPenalty;
        details.totalDelta = totalDelta;
    }

    return Math.round(newRating);
}

// При статусе «Завершён»: загружаем матч из БД и обновляем рейтинг команд + агрегируем статистику игроков.
// onDone — вызывается после записи рейтинга команд в БД.
// options.ratingOnly — если true (например при «Синхр. в профили»), обновляем только rating/points, не трогая matches/wins/form.
function applyMatchFinishedStats(db, matchId, onDone, options) {
    const done = typeof onDone === 'function' ? onDone : () => {};
    const ratingOnly = options && options.ratingOnly === true;
    db.get("SELECT team1_name, team2_name, team1_logo, team2_logo, score1, score2, status, format FROM matches WHERE id = ?", [matchId], (err, match) => {
        if (err || !match) {
            done();
            return;
        }
        const statusNorm = (match.status || '').toString().trim().toLowerCase();
        if (statusNorm !== 'finished' && statusNorm !== 'завершён') {
            done();
            return;
        }
        const team1_name = (match.team1_name || '').trim();
        const team2_name = (match.team2_name || '').trim();
        const score1 = match.score1, score2 = match.score2;
        const s1 = Number(score1) || 0, s2 = Number(score2) || 0;
        const team1Won = s1 > s2;
        const formKeep = 5;

        const norm1 = normTeamName(team1_name);
        const norm2 = normTeamName(team2_name);
        if (!norm1 || !norm2) {
            done();
            return;
        }

        // Получить или создать команду в рейтинге (если матч завершён — команды попадают в рейтинг)
        function getOrCreateRankingTeam(teamName, logo, norm, cb) {
            db.get("SELECT id, matches, wins, form, rating FROM ranking_teams WHERE LOWER(REPLACE(TRIM(team_name), ' ', '')) = ?", [norm], (e, row) => {
                if (row) return cb(row);
                db.run(
                    "INSERT INTO ranking_teams (team_name, logo, points, matches, wins, form, rating) VALUES (?, ?, 500, 0, 0, '', 500)",
                    [teamName, logo || null],
                    function(insErr) {
                        if (insErr) return cb(null);
                        cb({ id: this.lastID, matches: 0, wins: 0, form: '', rating: 500 });
                    }
                );
            });
        }

        getOrCreateRankingTeam(team1_name, match.team1_logo, norm1, (row1) => {
            getOrCreateRankingTeam(team2_name, match.team2_logo, norm2, (row2) => {
                if (!row1 || !row2) {
                    done();
                    return;
                }
                const r1 = (row1.rating != null) ? Number(row1.rating) : 500;
                const r2 = (row2.rating != null) ? Number(row2.rating) : 500;
                const formatCode = getFormatCode(match.format);

                const isFavorite1 = r1 >= r2 ? 1 : 0;
                const isFavorite2 = r2 >= r1 ? 1 : 0;

                const winStreak1 = team1Won ? getStreak(row1.form, true) : 0;
                const loseStreak1 = team1Won ? 0 : getStreak(row1.form, false);
                const winStreak2 = team1Won ? 0 : getStreak(row2.form, true);
                const loseStreak2 = team1Won ? getStreak(row2.form, false) : 0;

                const details1 = {};
                const details2 = {};
                const newRating1 = computeTeamRatingNew(r1, team1Won ? 1 : 0, formatCode, isFavorite1, winStreak1, loseStreak1, details1);
                const newRating2 = computeTeamRatingNew(r2, team1Won ? 0 : 1, formatCode, isFavorite2, winStreak2, loseStreak2, details2);

                let pending = 3;
                function whenDone() {
                    if (--pending === 0) done();
                }

                function updateTeam(row, won, newRating) {
                    if (!row) return;
                    const pointsRounded = Math.round(newRating);
                    if (ratingOnly) {
                        db.run("UPDATE ranking_teams SET rating = ?, points = ? WHERE id = ?", [newRating, pointsRounded, row.id], function(updateErr) {
                            if (updateErr) console.error('applyMatchFinishedStats: UPDATE ranking_teams (rating only) failed', updateErr.message, 'id=', row.id);
                            whenDone();
                        });
                    } else {
                        const matches = (row.matches || 0) + 1;
                        const wins = (row.wins || 0) + (won ? 1 : 0);
                        const prevForm = (row.form || '').toString().split(',').filter(Boolean).slice(0, formKeep - 1);
                        const newForm = [(won ? 'W' : 'L'), ...prevForm].slice(0, formKeep).join(',');
                        db.run("UPDATE ranking_teams SET matches = ?, wins = ?, form = ?, rating = ?, points = ? WHERE id = ?", [matches, wins, newForm, newRating, pointsRounded, row.id], function(updateErr) {
                            if (updateErr) console.error('applyMatchFinishedStats: UPDATE ranking_teams failed', updateErr.message, 'id=', row.id, 'newRating=', newRating);
                            whenDone();
                        });
                    }
                }
                updateTeam(row1, team1Won, newRating1);
                updateTeam(row2, !team1Won, newRating2);

                // Обновить винрейт по картам (не ждём завершения)
                recomputeTeamMapStats(db, row1, norm1);
                recomputeTeamMapStats(db, row2, norm2);

                db.run(`INSERT OR REPLACE INTO match_rating_changes (
                            match_id,
                            team1_rating_before, team1_rating_after,
                            team2_rating_before, team2_rating_after,
                            team1_is_favorite, team2_is_favorite,
                            team1_win, team2_win,
                            team1_win_streak, team1_lose_streak,
                            team2_win_streak, team2_lose_streak,
                            team1_base_delta, team2_base_delta,
                            team1_streak_bonus, team1_streak_penalty,
                            team2_streak_bonus, team2_streak_penalty,
                            format_code
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        matchId,
                        r1, newRating1,
                        r2, newRating2,
                        isFavorite1, isFavorite2,
                        team1Won ? 1 : 0, team1Won ? 0 : 1,
                        winStreak1, loseStreak1,
                        winStreak2, loseStreak2,
                        details1.baseDelta || 0, details2.baseDelta || 0,
                        details1.streakBonus || 0, details1.streakPenalty || 0,
                        details2.streakBonus || 0, details2.streakPenalty || 0,
                        formatCode
                    ], function(insErr) {
                        if (insErr && /no column named team1_is_favorite/i.test(insErr.message || '')) {
                            // Старый формат таблицы: сохраняем базовые поля без объяснений
                            db.run(
                                "INSERT OR REPLACE INTO match_rating_changes (match_id, team1_rating_before, team1_rating_after, team2_rating_before, team2_rating_after) VALUES (?, ?, ?, ?, ?)",
                                [matchId, r1, newRating1, r2, newRating2],
                                function (fallbackErr) {
                                    if (fallbackErr) {
                                        console.error('applyMatchFinishedStats: fallback match_rating_changes insert failed', fallbackErr.message);
                                    }
                                    whenDone();
                                }
                            );
                        } else {
                            if (insErr) console.error('applyMatchFinishedStats: match_rating_changes insert failed', insErr.message);
                            whenDone();
                        }
                    });

                // Агрегировать: суммарные kills/deaths/assists и средний рейтинг за все завершённые матчи игрока (не ждём)
                db.all("SELECT * FROM match_player_stats WHERE match_id = ?", [matchId], (err, stats) => {
            if (err || !stats || stats.length === 0) return;
            const playerKeys = new Set();
            stats.forEach(s => {
                const teamName = (s.team_side === 1 ? team1_name : team2_name) || '';
                const name = (s.player_name || '').trim();
                if (teamName && name) playerKeys.add(teamName + '\0' + name);
            });
            playerKeys.forEach(key => {
                const idx = key.indexOf('\0');
                if (idx < 0) return;
                const teamName = key.slice(0, idx);
                const playerName = key.slice(idx + 1);
                const teamNorm = normTeamName(teamName);
                db.get("SELECT id FROM ranking_teams WHERE LOWER(REPLACE(TRIM(team_name), ' ', '')) = ?", [teamNorm], (e, teamRow) => {
                    if (e || !teamRow) return;
                    const teamId = teamRow.id;
                    const pn = (playerName || '').trim().toLowerCase();
                    db.get("SELECT id FROM ranking_players WHERE team_id = ? AND (LOWER(TRIM(player_name)) = ? OR LOWER(TRIM(nickname)) = ?)", [teamId, pn, pn], (e2, playerRow) => {
                        if (e2 || !playerRow) return;
                        // Все завершённые матчи этого игрока в этой команде (сопоставление команд без учёта пробелов)
                        db.all(
                            `SELECT mps.match_id, mps.kills, mps.deaths, mps.assists, mps.rating_30, mps.e, mps.t
                             FROM match_player_stats mps
                             JOIN matches m ON m.id = mps.match_id
                               AND (LOWER(TRIM(m.status)) = 'finished' OR LOWER(TRIM(m.status)) = 'завершён')
                             WHERE (
                               (LOWER(REPLACE(TRIM(m.team1_name), ' ', '')) = ? AND mps.team_side = 1) OR
                               (LOWER(REPLACE(TRIM(m.team2_name), ' ', '')) = ? AND mps.team_side = 2)
                             ) AND LOWER(TRIM(mps.player_name)) = ?
                             ORDER BY m.id`,
                            [teamNorm, teamNorm, pn],
                            (e3, rows) => {
                                if (e3 || !rows || rows.length === 0) return;
                                let totalK = 0, totalD = 0, totalA = 0, totalE = 0, totalT = 0;
                                let sumRating = 0, countRating = 0;
                                const matchIds = new Set();
                                rows.forEach(r => {
                                    matchIds.add(r.match_id);
                                    totalK += Number(r.kills) || 0;
                                    totalD += Number(r.deaths) || 0;
                                    totalA += Number(r.assists) || 0;
                                    totalE += Number(r.e) || 0;
                                    totalT += Number(r.t) || 0;
                                    if (r.rating_30 != null) { sumRating += Number(r.rating_30); countRating++; }
                                });
                                const matchesPlayed = matchIds.size || rows.length;
                                const avgRating = countRating > 0 ? Math.round((sumRating / countRating) * 100) / 100 : 1.0;
                                const avgKills = matchesPlayed > 0 ? Math.round((totalK / matchesPlayed) * 100) / 100 : 0;
                                const avgEntry = matchesPlayed > 0 ? Math.round((totalE / matchesPlayed) * 100) / 100 : 0;
                                const avgTrade = matchesPlayed > 0 ? Math.round((totalT / matchesPlayed) * 100) / 100 : 0;
                                db.run("UPDATE ranking_players SET kills = ?, deaths = ?, assists = ?, rating = ?, matches_played = ?, avg_kills = ?, avg_entry_kills = ?, avg_trade_kills = ? WHERE id = ?",
                                    [totalK, totalD, totalA, avgRating, matchesPlayed, avgKills, avgEntry, avgTrade, playerRow.id]);
                            }
                        );
                    });
                });
            });
                });
            });
        });
    });
}

// Пересчитать винрейт по картам для команды (teamRankingRow.id, normTeam)
function recomputeTeamMapStats(db, teamRankingRow, normTeam) {
    if (!teamRankingRow || !teamRankingRow.id || !normTeam) return;
    const teamId = teamRankingRow.id;
    db.all(
        `SELECT m.id as match_id, m.team1_name, m.team2_name, mm.map_name, mm.score1, mm.score2
         FROM matches m
         JOIN match_maps mm ON mm.match_id = m.id
         WHERE (LOWER(TRIM(m.status)) = 'finished' OR LOWER(TRIM(m.status)) = 'завершён')
           AND (
             LOWER(REPLACE(TRIM(m.team1_name), ' ', '')) = ?
             OR LOWER(REPLACE(TRIM(m.team2_name), ' ', '')) = ?
           )`,
        [normTeam, normTeam],
        (err, rows) => {
            if (err || !rows) {
                if (err) console.error('recomputeTeamMapStats query error:', err.message);
                return;
            }
            const keys = ['mirage','inferno','nuke','dust2','overpass','ancient','anubis'];
            const agg = {};
            keys.forEach(k => { agg[k] = { w: 0, t: 0 }; });
            rows.forEach(r => {
                const key = normMapKey(r.map_name);
                if (!key || !agg[key]) return;
                const team1Norm = normTeamName(r.team1_name);
                const isTeam1 = team1Norm === normTeam;
                const s1 = Number(r.score1);
                const s2 = Number(r.score2);
                if (!Number.isFinite(s1) || !Number.isFinite(s2)) return;
                agg[key].t += 1;
                const won = (isTeam1 && s1 > s2) || (!isTeam1 && s2 > s1);
                if (won) agg[key].w += 1;
            });
            const mapStats = {};
            keys.forEach(k => {
                const { w, t } = agg[k];
                mapStats[k] = t > 0 ? Math.round((w / t) * 100) : 0;
            });
            db.get("SELECT region, achievements, matches, social_links FROM team_details WHERE team_id = ?", [teamId], (e2, row) => {
                if (e2) {
                    console.error('recomputeTeamMapStats load details error:', e2.message);
                    return;
                }
                const region = row ? row.region : null;
                const achievements = row && row.achievements != null ? row.achievements : '[]';
                const matchesJson = row && row.matches != null ? row.matches : '[]';
                const social = row && row.social_links != null ? row.social_links : '{}';
                db.serialize(() => {
                    db.run("DELETE FROM team_details WHERE team_id = ?", [teamId], delErr => {
                        if (delErr) {
                            console.error('recomputeTeamMapStats delete error:', delErr.message);
                            return;
                        }
                        db.run(
                            `INSERT INTO team_details (team_id, region, map_stats, achievements, matches, social_links, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                            [teamId, region, JSON.stringify(mapStats), achievements, matchesJson, social],
                            insErr => {
                                if (insErr) console.error('recomputeTeamMapStats insert error:', insErr.message);
                            }
                        );
                    });
                });
            });
        }
    );
}

app.get('/api/matches/:id', (req, res) => {
    const db = getDB();
    db.get("SELECT * FROM matches WHERE id = ?", [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else if (!row) {
            res.status(404).json({ error: 'Match not found' });
        } else {
            db.all("SELECT * FROM match_maps WHERE match_id = ? ORDER BY map_order ASC", [req.params.id], (e, maps) => {
                let mapList = (e ? [] : (maps || []));
                if (mapList.length === 0 && (row.map_name || row.score1 != null || row.score2 != null)) {
                    mapList = [{ map_name: row.map_name || '', score1: row.score1, score2: row.score2 }];
                }
                const match = { ...row, maps: mapList };
                res.json(match);
            });
        }
    });
});

app.delete('/api/matches/:id', (req, res) => {
    const db = getDB();
    db.run("DELETE FROM matches WHERE id = ?", [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

app.get('/api/matches/:id/stats', (req, res) => {
    const db = getDB();
    db.all("SELECT * FROM match_player_stats WHERE match_id = ? ORDER BY team_side ASC, sort_order ASC", [req.params.id], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

app.get('/api/matches/:id/rating-changes', (req, res) => {
    const db = getDB();
    db.get("SELECT * FROM match_rating_changes WHERE match_id = ?", [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else if (!row) {
            res.json(null);
        } else {
            const d1 = (row.team1_rating_after != null && row.team1_rating_before != null) ? Math.round(row.team1_rating_after - row.team1_rating_before) : null;
            const d2 = (row.team2_rating_after != null && row.team2_rating_before != null) ? Math.round(row.team2_rating_after - row.team2_rating_before) : null;
            res.json({
                team1_change: d1,
                team2_change: d2,
                team1_rating_before: row.team1_rating_before,
                team1_rating_after: row.team1_rating_after,
                team2_rating_before: row.team2_rating_before,
                team2_rating_after: row.team2_rating_after,
                team1_is_favorite: row.team1_is_favorite,
                team2_is_favorite: row.team2_is_favorite,
                team1_win: row.team1_win,
                team2_win: row.team2_win,
                team1_win_streak: row.team1_win_streak,
                team1_lose_streak: row.team1_lose_streak,
                team2_win_streak: row.team2_win_streak,
                team2_lose_streak: row.team2_lose_streak,
                team1_base_delta: row.team1_base_delta,
                team2_base_delta: row.team2_base_delta,
                team1_streak_bonus: row.team1_streak_bonus,
                team1_streak_penalty: row.team1_streak_penalty,
                team2_streak_bonus: row.team2_streak_bonus,
                team2_streak_penalty: row.team2_streak_penalty,
                format_code: row.format_code
            });
        }
    });
});

// Принудительная синхронизация статистики матча в профили (рейтинг, K/D). Вызывать после сохранения статистики или при статусе «Завершён».
app.post('/api/matches/:id/sync-profile-stats', (req, res) => {
    const db = getDB();
    const matchId = req.params.id;
    applyMatchFinishedStats(db, matchId, () => {
        res.json({ success: true, message: 'Синхронизация выполнена. Рейтинг команд обновлён.' });
    }, { ratingOnly: true });
});

// Рейтинг за матч: + 0.20*((K/max(D,1))-1) — K/D. Итог: clamp(1 + ... + 0.20*((K/max(D,1))-1), 0.60, 1.60)
function computeMatchRating(K, D, A, ADR, E, T, R) {
    const r = Math.max(Number(R) || 1, 1);
    const k = Number(K) || 0, d = Number(D) || 0, a = Number(A) || 0;
    const adr = Number(ADR) || 70;
    const e = Number(E) || 0, t = Number(T) || 0;
    const kdTerm = 0.20 * ((k / Math.max(d, 1)) - 1);
    let rating = 1
        + 0.45 * ((k - d) / r)
        + 0.30 * (e / r)
        + 0.25 * (t / r)
        + 0.20 * (a / r)
        + 0.003 * (adr - 70)
        + kdTerm;
    return Math.max(0.60, Math.min(1.60, Math.round(rating * 100) / 100));
}

app.post('/api/matches/:id/stats', (req, res) => {
    const db = getDB();
    const matchId = req.params.id;
    const body = req.body || {};
    const stats = Array.isArray(body) ? body : (body.stats || []);
    const roundsFromBody = body.rounds != null ? Number(body.rounds) : null;
    db.serialize(() => {
        db.run("DELETE FROM match_player_stats WHERE match_id = ?", [matchId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (stats.length === 0) return res.json({ success: true, stats: [] });
            function doInsert(R) {
                const stmt = db.prepare(`INSERT INTO match_player_stats (match_id, team_side, player_name, kills, deaths, assists, adr, e, t, kast, rating_30, swing, country_code, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                let done = 0;
                stats.forEach((s, i) => {
                    const team_side = s.team_side != null ? s.team_side : (i < 5 ? 1 : 2);
                    const K = s.kills != null ? s.kills : 0, D = s.deaths != null ? s.deaths : 0;
                    const A = s.assists != null ? s.assists : 0, ADR = s.adr != null ? s.adr : 70;
                    const E = s.e != null ? s.e : 0, T = s.t != null ? s.t : 0;
                    const rating_30 = computeMatchRating(K, D, A, ADR, E, T, R);
                    stmt.run([
                        matchId, team_side, s.player_name || '',
                        K, D, A, ADR != null ? ADR : null, E, T,
                        s.kast != null ? s.kast : null, rating_30,
                        s.swing != null ? s.swing : null, s.country_code || null,
                        s.sort_order != null ? s.sort_order : i
                    ], (err) => {
                        if (err) console.error('match_player_stats insert:', err);
                        done++;
                        if (done === stats.length) {
                            stmt.finalize();
                            db.get("SELECT team1_name, team2_name, score1, score2, status FROM matches WHERE id = ?", [matchId], (er, m) => {
                                if (!er && m && m.status === 'finished') applyMatchFinishedStats(db, matchId);
                                db.all("SELECT * FROM match_player_stats WHERE match_id = ? ORDER BY team_side ASC, sort_order ASC", [matchId], (e, rows) => {
                                    res.json({ success: true, stats: rows || [] });
                                });
                            });
                        }
                    });
                });
            }
            const R = roundsFromBody > 0 ? roundsFromBody : null;
            if (R != null && R > 0) {
                doInsert(R);
                return;
            }
            db.get("SELECT score1, score2 FROM matches WHERE id = ?", [matchId], (err, match) => {
                let rounds = 24;
                if (!err && match) {
                    const s1 = Number(match.score1) || 0, s2 = Number(match.score2) || 0;
                    if (s1 + s2 > 0) rounds = s1 + s2;
                }
                db.all("SELECT score1, score2 FROM match_maps WHERE match_id = ? ORDER BY map_order", [matchId], (e, maps) => {
                    if (!e && maps && maps.length > 0) {
                        const total = maps.reduce((sum, m) => sum + (Number(m.score1) || 0) + (Number(m.score2) || 0), 0);
                        if (total > 0) rounds = total;
                    }
                    doInsert(rounds);
                });
            });
        });
    });
});

// ТУРНИРЫ — парсинг JSON-полей страницы ожидания
function parseTournamentJsonFields(row) {
    if (!row) return row;
    const out = { ...row };
    ['prize_distribution', 'teams_attending', 'related_events', 'map_pool'].forEach(field => {
        if (row[field] != null && row[field] !== '') {
            try {
                out[field] = JSON.parse(row[field]);
            } catch (e) {
                out[field] = field === 'prize_distribution' ? {} : [];
            }
        } else {
            out[field] = field === 'prize_distribution' ? {} : [];
        }
    });
    return out;
}

// ТУРНИРЫ (главная страница + форматы/сетки)
app.get('/api/tournaments', (req, res) => {
    const db = getDB();
    db.all("SELECT * FROM tournaments ORDER BY sort_order ASC, created_at DESC", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            // format/bracket_data – новые поля, bracket_data не парсим в списке
            const tournaments = rows.map(t => ({
                ...t,
                format: t.format || 'single_elim'
            }));
            res.json(tournaments);
        }
    });
});

// Один турнир с данными сетки и страницы ожидания
app.get('/api/tournaments/:id', (req, res) => {
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);
    if (isNaN(id) || id < 1) {
        return res.status(400).json({ error: 'Invalid tournament id' });
    }
    const db = getDB();
    db.get("SELECT * FROM tournaments WHERE id = ?", [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        let bracket = null;
        if (row.bracket_data) {
            try {
                bracket = JSON.parse(row.bracket_data);
            } catch (e) {
                bracket = null;
            }
        }
        const parsed = parseTournamentJsonFields(row);
        const { bracket_data, ...rest } = parsed;
        const format = row.format || 'single_elim';
        const count = parseInt(rest.teams_count, 10) || 8;
        if ((!bracket || !bracket.rounds) && rest.teams_count) {
            bracket = format === 'double_elim'
                ? generateBracketDoubleElim(count, rest.teams_attending || [])
                : generateBracketSingleElim(count, rest.teams_attending || []);
            db.run("UPDATE tournaments SET bracket_data = ? WHERE id = ?", [JSON.stringify(bracket), id], () => {});
        } else if (bracket && bracket.rounds && format === 'double_elim' && count === 8) {
            const hasLower = bracket.rounds.some(r => (r.name || '').toLowerCase().includes('lower'));
            if (!hasLower) {
                bracket = generateBracketDoubleElim(count, rest.teams_attending || []);
                db.run("UPDATE tournaments SET bracket_data = ? WHERE id = ?", [JSON.stringify(bracket), id], () => {});
            }
        }
        res.json({
            ...rest,
            format,
            bracket: bracket || null
        });
    });
});

// Генерация сетки: победитель идёт в winnerTo (slot winnerSlot), проигравший — в loserTo/loserSlot (double elim)
function generateBracketSingleElim(teamsCount, teamsAttending) {
    const n = Math.max(4, Math.min(32, parseInt(teamsCount, 10) || 8));
    const teams = Array.isArray(teamsAttending) ? teamsAttending : [];
    const roundNames = n >= 16 ? ['1/8 финала', '1/4 финала', 'Полуфинал', 'Финал'] : ['1/4 финала', 'Полуфинал', 'Финал'];
    const rounds = [];
    let numMatches = n / 2;
    let roundIndex = 0;
    while (numMatches >= 1) {
        const matches = [];
        for (let m = 0; m < numMatches; m++) {
            const matchId = roundIndex + '-' + m;
            const nextRound = roundIndex + 1;
            const nextMatch = Math.floor(m / 2);
            const nextSlot = (m % 2) + 1;
            const winnerTo = nextRound + '-' + nextMatch;
            const isFirstRound = roundIndex === 0;
            const teamIndex1 = m * 2;
            const teamIndex2 = m * 2 + 1;
            const team1 = isFirstRound && teams[teamIndex1] ? { name: teams[teamIndex1].name || teams[teamIndex1].team_name || 'TBD', seed: teamIndex1 + 1 } : (isFirstRound ? { name: 'TBD', seed: teamIndex1 + 1 } : null);
            const team2 = isFirstRound && teams[teamIndex2] ? { name: teams[teamIndex2].name || teams[teamIndex2].team_name || 'TBD', seed: teamIndex2 + 1 } : (isFirstRound ? { name: 'TBD', seed: teamIndex2 + 1 } : null);
            matches.push({
                id: matchId,
                team1: team1,
                team2: team2,
                score1: null,
                score2: null,
                winnerTo: numMatches > 1 ? winnerTo : null,
                winnerSlot: numMatches > 1 ? nextSlot : null
            });
        }
        rounds.push({ name: roundNames[roundIndex] || 'Раунд ' + (roundIndex + 1), matches });
        roundIndex++;
        numMatches = numMatches / 2;
    }
    return { format: 'single_elim', rounds };
}

function generateBracketDoubleElim(teamsCount, teamsAttending) {
    // Поддерживаем 8-командный Double Elimination (как на примере).
    const n = Math.max(4, Math.min(32, parseInt(teamsCount, 10) || 8));
    if (n !== 8) {
        // fallback: старое поведение (упрощённое)
        const base = generateBracketSingleElim(teamsCount, teamsAttending);
        base.format = 'double_elim';
        return base;
    }

    const base = generateBracketSingleElim(8, teamsAttending);
    base.format = 'double_elim';

    const ur1 = (base.rounds[0] && base.rounds[0].matches) || [];
    const ur2 = (base.rounds[1] && base.rounds[1].matches) || [];
    const ur3 = (base.rounds[2] && base.rounds[2].matches) || [];
    const upperFinalId = (ur3[0] && ur3[0].id) ? String(ur3[0].id) : '2-0';

    // Lower bracket matches
    const lr1 = [
        { id: 'L1-0', team1: null, team2: null, score1: null, score2: null, winnerTo: 'L2-0', winnerSlot: 1 },
        { id: 'L1-1', team1: null, team2: null, score1: null, score2: null, winnerTo: 'L2-1', winnerSlot: 1 }
    ];
    const lr2 = [
        { id: 'L2-0', team1: null, team2: null, score1: null, score2: null, winnerTo: 'L3-0', winnerSlot: 1 },
        { id: 'L2-1', team1: null, team2: null, score1: null, score2: null, winnerTo: 'L3-0', winnerSlot: 2 }
    ];
    const lsemi = [
        { id: 'L3-0', team1: null, team2: null, score1: null, score2: null, winnerTo: 'L4-0', winnerSlot: 1 }
    ];
    const lfinal = [
        { id: 'L4-0', team1: null, team2: null, score1: null, score2: null, winnerTo: 'GF-0', winnerSlot: 2 }
    ];
    const grandFinal = [
        { id: 'GF-0', team1: null, team2: null, score1: null, score2: null, winnerTo: null, winnerSlot: null }
    ];

    // Losers of upper round 1 -> lower round 1
    ur1.forEach((m, idx) => {
        m.loserTo = 'L1-' + Math.floor(idx / 2);
        m.loserSlot = (idx % 2) + 1;
    });

    // Losers of upper semi-finals -> lower round 2 (as team2)
    // UR2[0] loser -> L2-0 slot 2, UR2[1] loser -> L2-1 slot 2
    if (ur2[0]) { ur2[0].loserTo = 'L2-0'; ur2[0].loserSlot = 2; }
    if (ur2[1]) { ur2[1].loserTo = 'L2-1'; ur2[1].loserSlot = 2; }

    // Loser of upper final -> lower final slot 2
    if (ur3[0]) { ur3[0].loserTo = 'L4-0'; ur3[0].loserSlot = 2; }

    // Winner of upper final -> grand final slot 1
    if (ur3[0]) { ur3[0].winnerTo = 'GF-0'; ur3[0].winnerSlot = 1; }

    // Push lower rounds + grand final as extra rounds
    base.rounds.push({ name: 'Lower round 1', matches: lr1 });
    base.rounds.push({ name: 'Lower round 2', matches: lr2 });
    base.rounds.push({ name: 'Lower semi-finals', matches: lsemi });
    base.rounds.push({ name: 'Lower final', matches: lfinal });
    base.rounds.push({ name: 'Grand final', matches: grandFinal });

    return base;
}

function findMatchInBracket(bracket, matchId) {
    if (!bracket || !bracket.rounds) return null;
    for (let r = 0; r < bracket.rounds.length; r++) {
        const matches = bracket.rounds[r].matches || [];
        for (let m = 0; m < matches.length; m++) {
            if (String(matches[m].id) === String(matchId)) return { roundIndex: r, matchIndex: m, match: matches[m] };
        }
    }
    return null;
}

function setTeamInMatch(bracket, matchId, slot, teamObj) {
    const found = findMatchInBracket(bracket, matchId);
    if (!found) return false;
    const m = found.match;
    if (slot === 1) m.team1 = teamObj; else m.team2 = teamObj;
    return true;
}

function applyMatchResult(bracket, matchId, score1, score2) {
    const found = findMatchInBracket(bracket, matchId);
    if (!found) return { ok: false, error: 'Match not found' };
    const { roundIndex, matchIndex, match } = found;
    const s1 = parseInt(score1, 10);
    const s2 = parseInt(score2, 10);
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) return { ok: false, error: 'Invalid scores' };
    if (match.team1 == null && match.team2 == null) return { ok: false, error: 'Match has no teams' };
    match.score1 = s1;
    match.score2 = s2;
    const winner = s1 > s2 ? (match.team1 || { name: 'TBD' }) : (match.team2 || { name: 'TBD' });
    const loser = s1 > s2 ? (match.team2 || { name: 'TBD' }) : (match.team1 || { name: 'TBD' });
    const winnerObj = typeof winner === 'object' ? { ...winner } : { name: String(winner) };
    const loserObj = typeof loser === 'object' ? { ...loser } : { name: String(loser) };
    if (match.winnerTo && match.winnerSlot) {
        setTeamInMatch(bracket, match.winnerTo, match.winnerSlot, winnerObj);
    }
    if (match.loserTo && match.loserSlot) {
        setTeamInMatch(bracket, match.loserTo, match.loserSlot, loserObj);
    }
    return { ok: true };
}

function serializeTournamentWaitingFields(body) {
    const jsonFields = ['prize_distribution', 'teams_attending', 'related_events', 'map_pool'];
    const out = {};
    jsonFields.forEach(f => {
        const v = body[f];
        if (v == null) out[f] = null;
        else if (typeof v === 'string') out[f] = v.trim() ? v : null;
        else try { out[f] = JSON.stringify(v); } catch (e) { out[f] = null; }
    });
    out.formats_description = body.formats_description != null ? String(body.formats_description) : null;
    out.vrs_date = body.vrs_date != null ? String(body.vrs_date) : null;
    out.vrs_weight = body.vrs_weight != null ? String(body.vrs_weight) : null;
    return out;
}

app.post('/api/tournaments', (req, res) => {
    const db = getDB();
    const { title, prize, date_start, date_end, teams_count, stage, progress_percent, sort_order, organizer_id, format, bracket, bracket_data, description, extra_info } = req.body;
    const wait = serializeTournamentWaitingFields(req.body);

    const safeFormat = format || 'single_elim';
    let bracketJson = null;
    let rawBracket = bracket_data != null ? bracket_data : bracket;
    if (rawBracket == null || (typeof rawBracket === 'object' && !rawBracket.rounds)) {
        const teamsAttending = req.body.teams_attending;
        const count = teams_count != null ? parseInt(teams_count, 10) : 8;
        rawBracket = safeFormat === 'double_elim'
            ? generateBracketDoubleElim(count, teamsAttending)
            : generateBracketSingleElim(count, teamsAttending);
    }
    if (rawBracket != null) {
        try {
            bracketJson = typeof rawBracket === 'string' ? rawBracket : JSON.stringify(rawBracket);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid bracket JSON' });
        }
    }

    const sql = `INSERT INTO tournaments (title, prize, date_start, date_end, teams_count, stage, progress_percent, format, bracket_data, sort_order, organizer_id, prize_distribution, teams_attending, formats_description, related_events, vrs_date, vrs_weight, map_pool, description, extra_info)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [
        title || '', prize || null, date_start || null, date_end || null,
        teams_count != null ? teams_count : 16, stage || null, progress_percent != null ? progress_percent : 0,
        safeFormat,
        bracketJson,
        sort_order != null ? sort_order : 0,
        organizer_id != null && organizer_id !== '' ? parseInt(organizer_id, 10) : null,
        wait.prize_distribution, wait.teams_attending, wait.formats_description, wait.related_events, wait.vrs_date, wait.vrs_weight, wait.map_pool,
        description != null ? String(description) : null, extra_info != null ? String(extra_info) : null
    ], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const newId = this.lastID;
        db.get("SELECT * FROM tournaments WHERE id = ?", [newId], (err2, row) => {
            if (err2 || !row) {
                return res.status(201).json({ id: newId, title: req.body.title, format: safeFormat });
            }
            let bracket = null;
            if (row.bracket_data) {
                try { bracket = JSON.parse(row.bracket_data); } catch (e) {}
            }
            const parsed = parseTournamentJsonFields(row);
            const { bracket_data, ...rest } = parsed;
            res.status(201).json({ ...rest, format: row.format || 'single_elim', bracket });
        });
    });
});

app.put('/api/tournaments/:id', (req, res) => {
    const db = getDB();
    const id = req.params.id;
    const { title, prize, date_start, date_end, teams_count, stage, progress_percent, sort_order, organizer_id, format, bracket, bracket_data, description, extra_info } = req.body;
    const wait = serializeTournamentWaitingFields(req.body);

    const safeFormat = format || 'single_elim';
    let bracketJson = undefined;
    const rawBracket = bracket_data != null ? bracket_data : bracket;
    if (rawBracket != null) {
        try {
            bracketJson = typeof rawBracket === 'string' ? rawBracket : JSON.stringify(rawBracket);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid bracket JSON' });
        }
    }

    db.get("SELECT bracket_data FROM tournaments WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Tournament not found' });
        const finalBracket = bracketJson !== undefined ? bracketJson : row.bracket_data;

        const sql = `UPDATE tournaments SET title=?, prize=?, date_start=?, date_end=?, teams_count=?, stage=?, progress_percent=?, format=?, bracket_data=?, sort_order=?, organizer_id=?, prize_distribution=?, teams_attending=?, formats_description=?, related_events=?, vrs_date=?, vrs_weight=?, map_pool=?, description=?, extra_info=? WHERE id=?`;
        db.run(sql, [
            title || '', prize || null, date_start || null, date_end || null,
            teams_count != null ? teams_count : 16, stage || null, progress_percent != null ? progress_percent : 0,
            safeFormat,
            finalBracket,
            sort_order != null ? sort_order : 0,
            organizer_id != null && organizer_id !== '' ? parseInt(organizer_id, 10) : null,
            wait.prize_distribution, wait.teams_attending, wait.formats_description, wait.related_events, wait.vrs_date, wait.vrs_weight, wait.map_pool,
            description != null ? String(description) : null, extra_info != null ? String(extra_info) : null,
            id
        ], (err2) => {
            if (err2) {
                res.status(500).json({ error: err2.message });
            } else {
                res.json({ success: true });
            }
        });
    });
});

// Обновление только сетки турнира
app.post('/api/tournaments/:id/bracket', (req, res) => {
    const db = getDB();
    const rawBracket = req.body && (req.body.bracket != null ? req.body.bracket : req.body);
    let bracketJson = null;

    if (rawBracket != null) {
        try {
            bracketJson = typeof rawBracket === 'string' ? rawBracket : JSON.stringify(rawBracket);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid bracket JSON' });
        }
    }

    db.run("UPDATE tournaments SET bracket_data = ? WHERE id = ?", [bracketJson, req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// Ввод результата матча: сетка сама продвигает победителя (и проигравшего в нижнюю сетку при double elim)
app.post('/api/tournaments/:id/bracket/result', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid tournament id' });
    const { matchId, score1, score2 } = req.body || {};
    if (matchId == null || score1 == null || score2 == null) return res.status(400).json({ error: 'matchId, score1, score2 required' });

    const db = getDB();
    db.get("SELECT bracket_data, format FROM tournaments WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Tournament not found' });
        let bracket = null;
        if (row.bracket_data) {
            try { bracket = JSON.parse(row.bracket_data); } catch (e) {}
        }
        if (!bracket || !bracket.rounds) {
            const teamsCount = 8;
            bracket = (row.format === 'double_elim') ? generateBracketDoubleElim(teamsCount, []) : generateBracketSingleElim(teamsCount, []);
        }
        const result = applyMatchResult(bracket, matchId, score1, score2);
        if (!result.ok) return res.status(400).json({ error: result.error || 'Cannot apply result' });
        const bracketJson = JSON.stringify(bracket);
        db.run("UPDATE tournaments SET bracket_data = ? WHERE id = ?", [bracketJson, id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true, bracket });
        });
    });
});

app.delete('/api/tournaments/:id', (req, res) => {
    const db = getDB();
    db.run("DELETE FROM tournaments WHERE id = ?", [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// АДМИНИСТРАТОРЫ
app.post('/api/admin/login', (req, res) => {
    const db = getDB();
    const { username, password } = req.body;
    db.get("SELECT * FROM admins WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else if (row) {
            res.json({ success: true, admin: { id: row.id, username: row.username } });
        } else {
            res.status(401).json({ error: 'Неверные учетные данные' });
        }
    });
});

// Запуск сервера после инициализации БД
initDatabase()
    .then(() => {
        console.log('База данных инициализирована');
        app.listen(PORT, () => {
            console.log(`Сервер запущен на http://95.81.122.36:${PORT}`);
        });
    })
    .catch(err => {
        console.error('Ошибка инициализации БД:', err);
        process.exit(1);
    });

