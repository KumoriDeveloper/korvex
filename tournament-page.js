// Страница отдельного турнира: отображение сетки (single / double / swiss)

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const container = document.getElementById('bracketContainer');

    if (!id) {
        if (container) container.innerHTML = '';
        return;
    }

    try {
        let tournament = null;
        const fresh = sessionStorage.getItem('tournament_fresh_' + id);
        if (fresh) {
            try {
                tournament = JSON.parse(fresh);
                sessionStorage.removeItem('tournament_fresh_' + id);
            } catch (e) {}
        }
        if (!tournament) {
            tournament = await tournamentsAPI.getOne(id);
        }
        if (tournament) {
            initTournamentPage(tournament);
        }
    } catch (e) {
        console.error('Ошибка загрузки турнира:', e);
        if (container) container.innerHTML = '';
    }
});

async function loadTournamentListFallback(container, failedId) {
    try {
        const list = await tournamentsAPI.getAll();
        const tournaments = Array.isArray(list) ? list : [];
        if (tournaments.length === 0) {
            container.innerHTML = '<p class="bracket-error-msg">Турнир с ID ' + escapeHtmlSafe(String(failedId)) + ' не найден. Турниров пока нет. <a href="admin.html">Создать турнир в админ-панели</a> или <a href="index.html">на главную</a>.</p>';
        } else {
            const links = tournaments.slice(0, 15).map(t => '<a href="tournament.html?id=' + encodeURIComponent(t.id) + '">' + escapeHtmlSafe(t.title || 'Турнир #' + t.id) + '</a>').join(' · ');
            container.innerHTML = '<p class="bracket-error-msg">Турнир с ID ' + escapeHtmlSafe(String(failedId)) + ' не найден.</p><p class="bracket-error-msg" style="margin-top: 0.75rem;">Откройте турнир: ' + links + '</p><p class="bracket-error-msg" style="margin-top: 0.5rem;"><a href="index.html#tournaments">Все турниры на главной</a></p>';
        }
    } catch (err) {
        container.innerHTML = '<p class="bracket-error-msg">Турнир с ID ' + escapeHtmlSafe(String(failedId)) + ' не найден. <a href="index.html#tournaments">Вернуться к списку на главной</a></p>';
    }
}

function getTournamentStatus(tournament) {
    const now = Date.now();
    const startStr = tournament.date_start;
    const endStr = tournament.date_end;
    if (!startStr || String(startStr).trim() === '') return { key: 'upcoming', label: 'До начала' };
    const start = new Date(startStr).getTime();
    if (isNaN(start)) return { key: 'upcoming', label: tournament.stage || 'До начала' };
    if (now < start) return { key: 'upcoming', label: 'До начала' };
    if (endStr) {
        const end = new Date(endStr).getTime();
        if (!isNaN(end) && now > end) return { key: 'finished', label: 'Завершён' };
    }
    return { key: 'live', label: 'Идёт' };
}

function initTournamentPage(tournament) {
    const titleEl = document.getElementById('tournamentTitle');
    const metaEl = document.getElementById('tournamentMeta');
    const container = document.getElementById('bracketContainer');
    if (!container) return;

    if (titleEl) titleEl.textContent = tournament.title || 'Турнир';
    if (metaEl) {
        const prize = tournament.prize || '—';
        const formatLabel = formatToLabel(tournament.format);
        metaEl.textContent = [prize ? 'Приз: ' + prize : '', formatLabel, tournament.teams_count ? tournament.teams_count + ' команд' : ''].filter(Boolean).join(' · ');
    }

    renderTournamentInfoBlock(tournament);
    renderTournamentStatus(tournament);
    fillTournamentSections(tournament);

    // Сетка отключена
    container.innerHTML = '';
}

function renderTournamentInfoBlock(tournament) {
    const el = document.getElementById('tournamentInfoContent');
    if (!el) return;
    const formatLabel = formatToLabel(tournament.format);
    const teams = tournament.teams_count != null ? tournament.teams_count + ' команд' : '—';
    const start = tournament.date_start ? formatEventDate(tournament.date_start) : '—';
    const end = tournament.date_end ? formatEventDate(tournament.date_end) : '—';
    const desc = tournament.description || '';
    const extra = tournament.extra_info || '';
    el.innerHTML =
        '<div class="tournament-info-row"><span class="tournament-info-label">Формат</span><span>' + escapeHtmlSafe(formatLabel) + '</span></div>' +
        '<div class="tournament-info-row"><span class="tournament-info-label">Команд</span><span>' + escapeHtmlSafe(String(teams)) + '</span></div>' +
        '<div class="tournament-info-row"><span class="tournament-info-label">Дата начала</span><span>' + escapeHtmlSafe(start) + '</span></div>' +
        '<div class="tournament-info-row"><span class="tournament-info-label">Дата окончания</span><span>' + escapeHtmlSafe(end) + '</span></div>' +
        (desc ? '<div class="tournament-info-desc">' + escapeHtmlSafe(desc) + '</div>' : '') +
        (extra ? '<div class="tournament-info-extra">' + escapeHtmlSafe(extra).replace(/\n/g, '<br>') + '</div>' : '');
}

function renderTournamentStatus(tournament) {
    const el = document.getElementById('tournamentStatus');
    if (!el) return;
    const status = getTournamentStatus(tournament);
    const stage = tournament.stage || '';
    const percent = tournament.progress_percent != null ? Math.min(100, Math.max(0, tournament.progress_percent)) : 0;
    el.innerHTML =
        '<div class="tournament-status-badge tournament-status-badge--' + status.key + '">' + escapeHtmlSafe(status.label) + '</div>' +
        (stage ? '<p class="tournament-status-stage">' + escapeHtmlSafe(stage) + '</p>' : '') +
        '<div class="tournament-status-progress"><div class="progress-bar"><div class="progress-bar__fill" style="width:' + percent + '%"></div></div><span>' + percent + '%</span></div>';
}

function fillTournamentSections(tournament) {
    const prizeDist = tournament.prize_distribution;
    const defaultPlaces = ['1st', '2nd', '3rd', '4th', '5-6th', '5-6th', '7-8th', '7-8th'];
    let prizeValues = [];
    if (Array.isArray(prizeDist)) {
        prizeValues = prizeDist.map(p => typeof p === 'object' && p && 'value' in p ? p.value : p);
    } else if (prizeDist && typeof prizeDist === 'object') {
        prizeValues = [
            prizeDist['1st'], prizeDist['2nd'], prizeDist['3rd'], prizeDist['4th'],
            (prizeDist['5-6th'] && prizeDist['5-6th'][0]), (prizeDist['5-6th'] && prizeDist['5-6th'][1]),
            (prizeDist['7-8th'] && prizeDist['7-8th'][0]), (prizeDist['7-8th'] && prizeDist['7-8th'][1])
        ];
    }
    const prizeEl = document.getElementById('prizeDistribution');
    if (prizeEl) {
        prizeEl.innerHTML = defaultPlaces.map((place, i) => {
            const val = prizeValues[i] != null ? String(prizeValues[i]) : '';
            return '<div class="prize-grid__item"><span class="prize-grid__place">' + escapeHtmlSafe(place) + '</span><span class="prize-grid__value">' + escapeHtmlSafe(val) + '</span></div>';
        }).join('');
    }

    const teams = tournament.teams_attending || [];
    const teamsEl = document.getElementById('teamsAttending');
    if (teamsEl) {
        if (teams.length === 0) {
            teamsEl.innerHTML = '<p class="tournament-empty">Участники не добавлены</p>';
        } else {
            teamsEl.innerHTML = teams.map(t => {
                const name = t.name || t.team_name || '—';
                const logo = t.logo || t.team_logo || '';
                const region = t.region || t.qualifier || '';
                const seedLeft = t.seed_left != null ? t.seed_left : '';
                const seedRight = t.seed_right != null ? t.seed_right : '';
                return '<div class="team-attend-card">' +
                    (seedLeft ? '<span class="team-attend-card__seed team-attend-card__seed--left">' + escapeHtmlSafe(String(seedLeft)) + '</span>' : '') +
                    (seedRight ? '<span class="team-attend-card__seed team-attend-card__seed--right">' + escapeHtmlSafe(String(seedRight)) + '</span>' : '') +
                    '<img class="team-attend-card__logo" src="' + escapeHtmlSafe(logo || 'img/avatar/avatar.png') + '" alt="" onerror="this.src=\'img/avatar/avatar.png\'">' +
                    '<span class="team-attend-card__name">' + escapeHtmlSafe(name) + '</span>' +
                    (region ? '<span class="team-attend-card__region">' + escapeHtmlSafe(region) + '</span>' : '') +
                    '</div>';
            }).join('');
        }
    }

    const formatsText = tournament.formats_description || '';
    const formatsEl = document.getElementById('formatsDescription');
    if (formatsEl) {
        formatsEl.innerHTML = formatsText
            ? ('<div class="formats-content__inner">' + escapeHtmlSafe(formatsText).replace(/\n/g, '<br>') + '</div>')
            : '<p class="tournament-empty">Не указаны</p>';
    }

    const mapPool = tournament.map_pool || [];
    const mapPoolEl = document.getElementById('mapPool');
    if (mapPoolEl) {
        if (mapPool.length === 0) {
            mapPoolEl.innerHTML = '<p class="tournament-empty">Не добавлены</p>';
        } else {
            mapPoolEl.innerHTML = mapPool.map(m => {
                const name = typeof m === 'string' ? m : (m.name || '—');
                const img = typeof m === 'object' && m && m.image ? m.image : '';
                return '<div class="map-pool-item"' + (img ? ' style="background-image: url(' + escapeHtmlSafe(img) + ')"' : '') + '><span class="map-pool-item__name">' + escapeHtmlSafe(name) + '</span></div>';
            }).join('');
        }
    }
}

function formatEventDate(str) {
    if (!str) return '—';
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatToLabel(format) {
    const f = format || 'single_elim';
    if (f === 'double_elim') return 'Double Elimination';
    if (f === 'swiss') return 'Swiss System';
    return 'Single Elimination';
}

// Сетка и список команд под сеткой отключены
function renderBracket(container, format, tournament, refreshCallback) {
    container.innerHTML = '';
}

function renderTeamsListBelowBracket(tournament) {}

function renderBracketFromData(bracket, tournament, refreshCallback) {
    const hasResultUI = tournament && tournament.id && typeof refreshCallback === 'function';

    function renderRound(round, roundIndex) {
        const matchesHtml = (round.matches || []).map(match => {
            const t1 = match.team1 || { name: 'TBD', score: '-' };
            const t2 = match.team2 || { name: 'TBD', score: '-' };
            const mid = match.id != null ? String(match.id) : '';
            const s1 = match.score1 != null ? match.score1 : '';
            const s2 = match.score2 != null ? match.score2 : '';
            const displayScore1 = match.score1 != null ? match.score1 : (t1.score != null ? t1.score : '-');
            const displayScore2 = match.score2 != null ? match.score2 : (t2.score != null ? t2.score : '-');
            const resultRow = hasResultUI && mid ? `
                <div class="bracket__match-result">
                    <input type="number" min="0" class="bracket__score-input" data-side="1" value="${escapeHtmlSafe(String(s1))}" placeholder="0">
                    <span class="bracket__score-sep">—</span>
                    <input type="number" min="0" class="bracket__score-input" data-side="2" value="${escapeHtmlSafe(String(s2))}" placeholder="0">
                    <button type="button" class="bracket__result-btn" data-match-id="${escapeHtmlSafe(mid)}">Ввести счёт</button>
                </div>
            ` : '';
            return `
                <div class="bracket__match" data-match-id="${escapeHtmlSafe(mid)}">
                    <div class="bracket__team">
                        <span class="bracket__seed">${typeof t1.seed === 'number' ? t1.seed : '—'}</span>
                        <span class="bracket__name">${escapeHtmlSafe(t1.name || 'TBD')}</span>
                        <span class="bracket__score">${displayScore1}</span>
                    </div>
                    <div class="bracket__team">
                        <span class="bracket__seed">${typeof t2.seed === 'number' ? t2.seed : '—'}</span>
                        <span class="bracket__name">${escapeHtmlSafe(t2.name || 'TBD')}</span>
                        <span class="bracket__score">${displayScore2}</span>
                    </div>
                    ${resultRow}
                </div>
            `;
        }).join('');

        return `
            <div class="bracket__round">
                <h3 class="bracket__round-title">${escapeHtmlSafe(round.name || `Раунд ${roundIndex + 1}`)}</h3>
                <div class="bracket__matches">
                    ${matchesHtml}
                </div>
            </div>
        `;
    }

    // Для double elimination визуально разделяем верхнюю и нижнюю сетку + грандфинал
    if (bracket.format === 'double_elim') {
        const upperRounds = [];
        const lowerRounds = [];
        const grandRounds = [];
        (bracket.rounds || []).forEach((r, idx) => {
            const name = (r.name || '').toLowerCase();
            if (name.includes('grand')) grandRounds.push({ round: r, idx });
            else if (name.includes('lower') || name.includes('ниж')) lowerRounds.push({ round: r, idx });
            else upperRounds.push({ round: r, idx });
        });
        const upperHtml = upperRounds.map(({ round, idx }) => renderRound(round, idx)).join('');
        const lowerHtml = lowerRounds.map(({ round, idx }) => renderRound(round, idx)).join('');
        const grandHtml = grandRounds.map(({ round, idx }) => renderRound(round, idx)).join('');
        return `<div class="bracket bracket--double">
            <div class="bracket__section">
                <h3 class="bracket__section-title">Upper Bracket</h3>
                <div class="bracket__section-sub">Победители идут вверх, проигравшие падают в Lower Bracket.</div>
                <div class="bracket__rounds">
                    ${upperHtml}
                </div>
            </div>
            <div class="bracket__section bracket__section--lower">
                <h3 class="bracket__section-title">Lower Bracket</h3>
                <div class="bracket__section-sub">Здесь играют команды после первого поражения. Проиграл — вылет.</div>
                <div class="bracket__rounds">
                    ${lowerHtml}
                </div>
            </div>
            <div class="bracket__section bracket__section--grand">
                <h3 class="bracket__section-title">Grand Final</h3>
                <div class="bracket__section-sub">Победитель Upper Bracket vs победитель Lower Bracket.</div>
                <div class="bracket__rounds">
                    ${grandHtml}
                </div>
            </div>
        </div>`;
    }

    const roundsHtml = (bracket.rounds || []).map((round, roundIndex) =>
        renderRound(round, roundIndex)
    ).join('');

    return `<div class="bracket bracket--generic">${roundsHtml}</div>`;
}

function attachBracketResultHandlers(container, tournament, refreshCallback) {
    if (!container || !tournament || !tournament.id || typeof refreshCallback !== 'function') return;
    container.querySelectorAll('.bracket__result-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const matchId = btn.getAttribute('data-match-id');
            const matchEl = btn.closest('.bracket__match');
            if (!matchEl || !matchId) return;
            const inp1 = matchEl.querySelector('.bracket__score-input[data-side="1"]');
            const inp2 = matchEl.querySelector('.bracket__score-input[data-side="2"]');
            const score1 = inp1 ? parseInt(inp1.value, 10) : 0;
            const score2 = inp2 ? parseInt(inp2.value, 10) : 0;
            if (isNaN(score1) || isNaN(score2)) {
                alert('Введите счёт (числа 0 и выше)');
                return;
            }
            btn.disabled = true;
            try {
                await tournamentsAPI.setMatchResult(tournament.id, matchId, score1, score2);
                refreshCallback();
            } catch (e) {
                alert('Ошибка: ' + (e.message || 'не удалось сохранить результат'));
                btn.disabled = false;
            }
        });
    });
}

function renderPlaceholderSingleElim() {
    // 8-командная single elimination: четвертьфинал, полуфинал, финал
    return `
        <div class="bracket bracket--single">
            <div class="bracket__round">
                <h3 class="bracket__round-title">Quarter-finals</h3>
                <div class="bracket__matches">
                    ${placeholderMatch(1, 2)}
                    ${placeholderMatch(3, 4)}
                    ${placeholderMatch(5, 6)}
                    ${placeholderMatch(7, 8)}
                </div>
            </div>
            <div class="bracket__round">
                <h3 class="bracket__round-title">Semi-finals</h3>
                <div class="bracket__matches">
                    ${placeholderMatch('QF1', 'QF2')}
                    ${placeholderMatch('QF3', 'QF4')}
                </div>
            </div>
            <div class="bracket__round">
                <h3 class="bracket__round-title">Grand final</h3>
                <div class="bracket__matches">
                    ${placeholderMatch('SF1', 'SF2')}
                </div>
            </div>
        </div>
    `;
}

function renderPlaceholderDoubleElim() {
    return `
        <div class="bracket bracket--double">
            <div class="bracket__section">
                <h3 class="bracket__section-title">Upper Bracket</h3>
                <div class="bracket__rounds">
                    <div class="bracket__round">
                        <h4 class="bracket__round-title">Opening round</h4>
                        <div class="bracket__matches">
                            ${placeholderMatch(1, 2)}
                            ${placeholderMatch(3, 4)}
                            ${placeholderMatch(5, 6)}
                            ${placeholderMatch(7, 8)}
                        </div>
                    </div>
                    <div class="bracket__round">
                        <h4 class="bracket__round-title">Upper semi-finals</h4>
                        <div class="bracket__matches">
                            ${placeholderMatch('UB1', 'UB2')}
                            ${placeholderMatch('UB3', 'UB4')}
                        </div>
                    </div>
                    <div class="bracket__round">
                        <h4 class="bracket__round-title">Upper final</h4>
                        <div class="bracket__matches">
                            ${placeholderMatch('USF1', 'USF2')}
                        </div>
                    </div>
                </div>
            </div>
            <div class="bracket__section">
                <h3 class="bracket__section-title">Lower Bracket</h3>
                <div class="bracket__rounds">
                    <div class="bracket__round">
                        <h4 class="bracket__round-title">Lower round 1</h4>
                        <div class="bracket__matches">
                            ${placeholderMatch('UB1L', 'UB2L')}
                            ${placeholderMatch('UB3L', 'UB4L')}
                        </div>
                    </div>
                    <div class="bracket__round">
                        <h4 class="bracket__round-title">Lower semi-finals</h4>
                        <div class="bracket__matches">
                            ${placeholderMatch('LR1', 'LR2')}
                        </div>
                    </div>
                    <div class="bracket__round">
                        <h4 class="bracket__round-title">Lower final</h4>
                        <div class="bracket__matches">
                            ${placeholderMatch('LSF', 'LSF')}
                        </div>
                    </div>
                    <div class="bracket__round">
                        <h4 class="bracket__round-title">Grand final</h4>
                        <div class="bracket__matches">
                            ${placeholderMatch('UBF', 'LBF')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderPlaceholderSwiss() {
    return `
        <div class="bracket bracket--swiss">
            <div class="bracket__swiss-rounds">
                ${['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5'].map((name, idx) => `
                    <div class="bracket__round">
                        <h3 class="bracket__round-title">${name}</h3>
                        <div class="bracket__matches">
                            ${placeholderMatch(idx * 2 + 1, idx * 2 + 2)}
                            ${placeholderMatch(idx * 2 + 3, idx * 2 + 4)}
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="bracket__swiss-standings">
                <h3 class="bracket__round-title">Standings</h3>
                <table class="bracket__standings-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Команда</th>
                            <th>W</th>
                            <th>L</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[1,2,3,4,5,6,7,8].map((i) => `
                            <tr>
                                <td>${i}</td>
                                <td>? Team ${i}</td>
                                <td>0</td>
                                <td>0</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function placeholderMatch(a, b) {
    return `
        <div class="bracket__match">
            <div class="bracket__team">
                <span class="bracket__seed">${a}</span>
                <span class="bracket__name">TBD</span>
                <span class="bracket__score">-</span>
            </div>
            <div class="bracket__team">
                <span class="bracket__seed">${b}</span>
                <span class="bracket__name">TBD</span>
                <span class="bracket__score">-</span>
            </div>
        </div>
    `;
}

function escapeHtmlSafe(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

