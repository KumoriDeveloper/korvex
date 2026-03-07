// Korvex - Tournament Site Scripts

document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initSmoothScroll();
    initRankingsTabs();
    loadBanners();
    loadNews();
    loadTeams();
    await Promise.all([loadMatches(), loadTournaments(), loadHeroMatch()]);
    initTabs();
    initMatchCards();
});

// Active nav link on scroll
function initNavigation() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav__link');

    const observerOptions = {
        rootMargin: '-20% 0px -70% 0px',
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                
                // Обновить обычные ссылки
                navLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href && href.startsWith('#')) {
                        link.classList.toggle('active', href === `#${id}`);
                    }
                });
            }
        });
    }, observerOptions);

    sections.forEach(section => observer.observe(section));
}

// Match tabs filtering
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const matchCards = document.querySelectorAll('.match-card');

    if (tabs.length === 0) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const filter = tab.textContent.trim();
            matchCards.forEach(card => {
                let show = true;
                if (filter === 'LIVE') {
                    show = card.classList.contains('match-card--live');
                } else if (filter === 'Предстоящие') {
                    show = card.querySelector('.match-card__status--upcoming');
                } else if (filter === 'Завершённые') {
                    show = card.classList.contains('match-card--finished');
                }
                card.style.display = show ? 'block' : 'none';
            });
        });
    });
}

// Rankings tabs switching
function initRankingsTabs() {
    const tabs = document.querySelectorAll('.rankings-tab');
    const contents = document.querySelectorAll('.rankings-content');

    if (tabs.length === 0) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            
            // Убрать активность со всех вкладок
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            // Активировать выбранную вкладку
            tab.classList.add('active');
            const targetContent = document.getElementById(`rankings-${targetTab}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

// Smooth scroll for anchor links
function initSmoothScroll() {
    // Используем делегирование событий для обработки динамически созданных ссылок
    document.addEventListener('click', function(e) {
        const anchor = e.target.closest('a');
        if (!anchor) return;
        
        const href = anchor.getAttribute('href');
        // Обрабатываем только якорные ссылки (начинающиеся с #)
        if (!href || href === '#' || !href.startsWith('#')) return;
        
        // Проверяем, что это валидный CSS селектор (не внешняя ссылка)
        try {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (err) {
            // Если href не является валидным селектором, просто разрешаем стандартное поведение
            console.warn('Invalid selector for smooth scroll:', href);
        }
    });
}

// Match card hover effects & click
function initMatchCards() {
    const matchCards = document.querySelectorAll('.match-card');
    
    if (matchCards.length === 0) return;
    
    matchCards.forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            // Could open match details modal
            console.log('Match clicked');
        });
    });
}

// Загрузка баннеров
async function loadBanners() {
    try {
        const banners = await bannersAPI.getAll();
        const isAbsHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim());
        const proxiedImg = (u) => {
            const s = (u || '').toString().trim();
            if (!s) return s;
            return isAbsHttp(s) ? `${API_BASE_URL}/image-proxy?url=${encodeURIComponent(s)}` : s;
        };
        
        const leftBanner = document.getElementById('banner-left');
        const rightBanner = document.getElementById('banner-right');
        const bottomBanner = document.getElementById('footerBottomBanners');
        
        if (leftBanner && banners.left) {
            leftBanner.innerHTML = banners.left.map(banner => 
                `<div class="banner__item">
                    <a href="${banner.link_url || '#'}" target="_blank">
                        <img src="${proxiedImg(banner.image_url) || 'https://via.placeholder.com/160x600?text=Реклама'}"
                             alt="Реклама"
                             onerror="this.onerror=null;this.src='https://via.placeholder.com/160x600?text=Реклама';">
                    </a>
                </div>`
            ).join('');
        }
        
        if (rightBanner && banners.right) {
            rightBanner.innerHTML = banners.right.map(banner => 
                `<div class="banner__item">
                    <a href="${banner.link_url || '#'}" target="_blank">
                        <img src="${proxiedImg(banner.image_url) || 'https://via.placeholder.com/160x600?text=Реклама'}"
                             alt="Реклама"
                             onerror="this.onerror=null;this.src='https://via.placeholder.com/160x600?text=Реклама';">
                    </a>
                </div>`
            ).join('');
        }

        if (bottomBanner && banners.bottom) {
            bottomBanner.innerHTML = banners.bottom.map(banner =>
                `<a class="footer-banner-item" href="${banner.link_url || '#'}" target="_blank">
                    <img src="${proxiedImg(banner.image_url) || 'https://via.placeholder.com/728x90?text=Реклама'}"
                         alt="Реклама"
                         onerror="this.onerror=null;this.src='https://via.placeholder.com/728x90?text=Реклама';">
                </a>`
            ).join('');
        }
    } catch (error) {
        console.error('Ошибка загрузки баннеров:', error);
        // Fallback к пустым баннерам
    }
}

// Загрузка новостей — все блоки генерируются динамически
async function loadNews() {
    try {
        const news = await newsAPI.getAll();
        const newsGrid = document.getElementById('newsGrid');
        
        if (!newsGrid) return;
        
        const defaultImage = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=300&fit=crop';
        
        if (news.length === 0) {
            // Плейсхолдеры при отсутствии новостей
            newsGrid.innerHTML = `
                <article class="news-card">
                    <div class="news-card__image">
                        <img src="${defaultImage}" alt="">
                        <span class="news-card__tag">Главное</span>
                    </div>
                    <div class="news-card__content">
                        <h3>Нет новостей</h3>
                        <p>Добавьте новости  </p>
                        <div class="news-card__meta">—</div>
                    </div>
                </article>
                <article class="news-card">
                    <div class="news-card__image">
                        <img src="${defaultImage}" alt="">
                        <span class="news-card__tag">—</span>
                    </div>
                    <div class="news-card__content">
                        <h3>Ожидание новостей</h3>
                        <div class="news-card__meta">—</div>
                    </div>
                </article>
            `;
            return;
        }
        
        // Все новости — одинаковые карточки с фото
        const newsCards = news.slice(0, 8).map(item => `
            <article class="news-card" data-id="${item.id}">
                <div class="news-card__image">
                    <img src="${item.image || defaultImage}" alt="${escapeHtml(item.title)}">
                    <span class="news-card__tag">${item.tag || 'Новость'}</span>
                </div>
                <div class="news-card__content">
                    <h3>${escapeHtml(item.title)}</h3>
                    ${item.content ? `<p>${escapeHtml(item.content.substring(0, 100) + (item.content.length > 100 ? '...' : ''))}</p>` : ''}
                    <div class="news-card__meta">${formatNewsDate(item.date)}</div>
                </div>
            </article>
        `).join('');
        
        newsGrid.innerHTML = newsCards;
        
        // Клик по карточке — показать полный текст (опционально)
        newsGrid.querySelectorAll('.news-card').forEach(card => {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.id);
                const newsItem = news.find(n => n.id === id);
                if (newsItem) {
                    showNewsModal(newsItem);
                }
            });
        });
    } catch (error) {
        console.error('Ошибка загрузки новостей:', error);
        const newsGrid = document.getElementById('newsGrid');
        if (newsGrid) {
            newsGrid.innerHTML = '<p style="color: var(--text-secondary);">Ошибка загрузки новостей. Убедитесь, что сервер запущен.</p>';
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNewsDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return `${diffMins} мин. назад`;
    if (diffHours < 24) return `${diffHours} ч. назад`;
    if (diffDays < 7) return `${diffDays} дн. назад`;
    return date.toLocaleDateString('ru-RU');
}

function showNewsModal(newsItem) {
    const existing = document.getElementById('newsModal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'newsModal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content news-modal">
            <div class="modal-header">
                <h2>${escapeHtml(newsItem.title)}</h2>
                <button class="close-modal" onclick="document.getElementById('newsModal').remove()">&times;</button>
            </div>
            <div class="news-modal__body">
                ${newsItem.image ? `<img src="${newsItem.image}" alt="" class="news-modal__image">` : ''}
                <p class="news-modal__text">${escapeHtml(newsItem.content || '')}</p>
                <div class="news-modal__meta">${formatNewsDate(newsItem.date)}${newsItem.tag ? ` • ${escapeHtml(newsItem.tag)}` : ''}</div>
            </div>
        </div>
    `;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
}

// Загрузка команд (для главной страницы — рейтинг подгружается на rankings.html)
async function loadTeams() {
    try {
        await rankingTeamsAPI.getAll();
        // На index.html рейтинг не отображается; данные для рейтинга на rankings.html
    } catch (e) {
        console.error('Ошибка загрузки команд:', e);
    }
}

const DEFAULT_LOGO = 'img/avatar/avatar.png';

function formatMatchTime(dateTimeStr) {
    if (!dateTimeStr) return '—';
    const d = new Date(dateTimeStr);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// Загрузка матчей на главную
async function loadMatches() {
    const grid = document.getElementById('matchesGrid');
    if (!grid) return;
    try {
        const list = await matchesAPI.getAll();
        const matches = Array.isArray(list) ? list : (list.matches || list.data || []);
        if (matches.length === 0) {
            grid.innerHTML = '<p style="color: var(--text-muted); padding: 2rem;">Матчей пока нет.  </p>';
            return;
        }
        grid.innerHTML = matches.map(m => {
            const status = (m.status || '').toLowerCase();
            const isLive = status === 'live';
            const isFinished = status === 'finished' || status === 'завершён';
            const isUpcoming = status === 'upcoming' || status === 'предстоящий' || (!isLive && !isFinished);

            const nScore1 = m.score1 != null ? Number(m.score1) : null;
            const nScore2 = m.score2 != null ? Number(m.score2) : null;
            const score1 = nScore1 != null && !isNaN(nScore1) ? nScore1 : '—';
            const score2 = nScore2 != null && !isNaN(nScore2) ? nScore2 : '—';

            const logo1 = m.team1_logo || DEFAULT_LOGO;
            const logo2 = m.team2_logo || DEFAULT_LOGO;

            let statusLabel = '—';
            let statusClass = '';
            if (isLive) {
                statusLabel = 'LIVE';
            } else if (isUpcoming) {
                statusLabel = formatMatchTime(m.date_time);
                statusClass = ' match-card__status--upcoming';
            } else {
                statusLabel = 'FT';
                statusClass = ' match-card__status--finished';
            }

            const cardClass = 'match-card' + (isLive ? ' match-card--live' : '') + (isFinished ? ' match-card--finished' : '');
            const meta = [m.map_name, m.tournament_name].filter(Boolean).join(' • ') || '—';
            const streamAttr = m.stream_url ? ` data-stream="${escapeHtml(m.stream_url)}"` : '';

            const team1Winner = isFinished && nScore1 != null && nScore2 != null && nScore1 > nScore2;
            const team2Winner = isFinished && nScore1 != null && nScore2 != null && nScore2 > nScore1;

            return `<article class="${cardClass}" data-match-id="${m.id || ''}"${streamAttr}>
                <div class="match-card__header">
                    <span class="match-card__status${statusClass}">${escapeHtml(statusLabel)}</span>
                    <span class="match-card__header-meta">${escapeHtml(meta)}</span>
                </div>
                <div class="match-card__body">
                    <div class="match-card__team ${team1Winner ? 'match-card__team--winner' : ''}">
                        <img src="${escapeHtml(logo1)}" alt="" class="match-card__logo" onerror="this.src='${DEFAULT_LOGO}'">
                        <span class="match-card__team-name">${escapeHtml(m.team1_name || '—')}</span>
                    </div>
                    <div class="match-card__score">
                        <span>${escapeHtml(String(score1))}</span>
                        <span>:</span>
                        <span>${escapeHtml(String(score2))}</span>
                    </div>
                    <div class="match-card__team match-card__team--right ${team2Winner ? 'match-card__team--winner' : ''}">
                        <span class="match-card__team-name">${escapeHtml(m.team2_name || '—')}</span>
                        <img src="${escapeHtml(logo2)}" alt="" class="match-card__logo" onerror="this.src='${DEFAULT_LOGO}'">
                    </div>
                </div>
                <div class="match-card__footer">
                    <a href="match-stats.html?id=${escapeHtml(String(m.id || ''))}" class="match-card__stats-link">Статистика →</a>
                </div>
            </article>`;
        }).join('');
    } catch (e) {
        console.error('Ошибка загрузки матчей:', e);
        grid.innerHTML = '<p style="color: var(--text-muted); padding: 2rem;">Не удалось загрузить матчи. Проверьте, что сервер запущен.</p>';
    }
}

// Загрузка турниров на главную
async function loadTournaments() {
    const grid = document.getElementById('tournamentsGrid');
    if (!grid) return;
    try {
        const list = await tournamentsAPI.getAll();
        const tournaments = Array.isArray(list) ? list : (list.tournaments || list.data || []);
        if (tournaments.length === 0) {
            grid.innerHTML = '<p style="color: var(--text-muted); padding: 2rem;">Турниров пока нет.  </p>';
            return;
        }
        // Кэш турниров для страницы турнира (чтобы переход с главной всегда открывал страницу)
        try {
            tournaments.forEach(t => {
                if (t && t.id != null) {
                    const key = 'tournament_cache_' + t.id;
                    sessionStorage.setItem(key, JSON.stringify({ ...t, format: t.format || 'single_elim' }));
                }
            });
        } catch (e) {}

        grid.innerHTML = tournaments.map(t => {
            const percent = t.progress_percent != null ? Math.min(100, Math.max(0, Number(t.progress_percent))) : 0;

            let start = '—';
            if (t.date_start) {
                const d = new Date(t.date_start);
                start = isNaN(d.getTime())
                    ? String(t.date_start)
                    : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            }

            let end = '—';
            if (t.date_end) {
                const d2 = new Date(t.date_end);
                end = isNaN(d2.getTime())
                    ? String(t.date_end)
                    : d2.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
            }

            const dates = [start, end].filter(Boolean).join(' — ');
            const teams = t.teams_count != null ? `${t.teams_count} команд` : '—';
            const stage = t.stage || 'Ожидание';
            const formatLabel = (() => {
                const f = (t.format || 'single_elim');
                if (f === 'double_elim') return 'Double Elimination';
                if (f === 'swiss') return 'Swiss System';
                return 'Single Elimination';
            })();
            return `<a class="tournament-card" href="tournament.html?id=${encodeURIComponent(String(t.id || ''))}">
                <div class="tournament-card__header">
                    <div>
                        <div class="tournament-card__prize">${escapeHtml(t.prize || '—')}</div>
                        <h3 class="tournament-card__title">${escapeHtml(t.title || 'Турнир')}</h3>
                    </div>
                    <div class="tournament-card__badge">${escapeHtml(teams)}</div>
                </div>
                <div class="tournament-card__body">
                    <p class="tournament-card__dates">${escapeHtml(dates)}</p>
                </div>
                <div class="tournament-card__footer">
                    <span class="tournament-card__footer-pill">${escapeHtml(stage)}</span>
                    <span class="tournament-card__footer-pill tournament-card__footer-pill--accent">${escapeHtml(formatLabel)}</span>
                </div>
            </a>`;
        }).join('');
    } catch (e) {
        console.error('Ошибка загрузки турниров:', e);
        grid.innerHTML = '<p style="color: var(--text-muted); padding: 2rem;">Не удалось загрузить турниры. Проверьте, что сервер запущен.</p>';
    }
}

// Герой: первый live или первый предстоящий матч
async function loadHeroMatch() {
    const heroMatch = document.getElementById('heroMatch');
    const heroContent = document.getElementById('heroContent');
    const heroSection = document.getElementById('heroSection');
    if (!heroMatch || !heroContent) return;
    try {
        const list = await matchesAPI.getAll();
        const matches = Array.isArray(list) ? list : (list.matches || list.data || []);
        const live = matches.find(m => (m.status || '').toLowerCase() === 'live');
        const upcoming = matches.find(m => {
            const s = (m.status || '').toLowerCase();
            return s === 'upcoming' || s === 'предстоящий' || (s !== 'live' && s !== 'finished' && s !== 'завершён');
        });
        const pick = live || upcoming;
        if (!pick) {
            heroMatch.innerHTML = '<p style="color: var(--text-muted);">Ближайших матчей пока нет</p>';
            const badge = heroContent.querySelector('.hero__badge');
            if (badge) badge.textContent = 'Скоро';
            return;
        }
        const isLive = (pick.status || '').toLowerCase() === 'live';
        const logo1 = pick.team1_logo || DEFAULT_LOGO;
        const logo2 = pick.team2_logo || DEFAULT_LOGO;
        const badge = heroContent.querySelector('.hero__badge');
        if (badge) badge.textContent = isLive ? 'LIVE' : 'Скоро';
        if (heroSection) heroSection.classList.toggle('hero--live', isLive);
        const titleEl = heroContent.querySelector('.hero__title');
        if (titleEl) titleEl.textContent = pick.tournament_name || 'Матч';
        const subEl = heroContent.querySelector('.hero__subtitle');
        if (subEl) subEl.textContent = pick.map_name ? `Карта: ${pick.map_name}` : 'Гранд-финал';
        heroMatch.innerHTML = `
            <div class="team team--left">
                <img src="${escapeHtml(logo1)}" alt="" class="team__logo" onerror="this.src='${DEFAULT_LOGO}'">
                <span class="team__name">${escapeHtml(pick.team1_name || '—')}</span>
                <span class="team__score">${pick.score1 != null ? pick.score1 : '0'}</span>
            </div>
            <span class="hero__vs">VS</span>
            <div class="team team--right">
                <span class="team__score">${pick.score2 != null ? pick.score2 : '0'}</span>
                <span class="team__name">${escapeHtml(pick.team2_name || '—')}</span>
                <img src="${escapeHtml(logo2)}" alt="" class="team__logo" onerror="this.src='${DEFAULT_LOGO}'">
            </div>
        `;
        const btn = heroContent.querySelector('.btn');
        if (btn && pick.stream_url) {
            btn.href = pick.stream_url;
            btn.target = '_blank';
            btn.textContent = 'Смотреть трансляцию';
        } else if (btn) {
            btn.href = '#matches';
            btn.textContent = 'Смотреть матчи';
        }
    } catch (e) {
        console.error('Ошибка загрузки героя:', e);
        heroMatch.innerHTML = '<p style="color: var(--text-muted);">Не удалось загрузить матч</p>';
    }
}

