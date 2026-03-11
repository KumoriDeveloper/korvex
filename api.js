// API функции для работы с сервером
// Локально (127.0.0.1 / localhost) — используем текущий origin.
// Во всех остальных случаях обращаемся напрямую к боевому API на 95.81.122.36.
const API_BASE_URL = (() => {
    try {
        if (typeof window !== 'undefined' && window.location) {
            const { protocol, hostname, host } = window.location;
            if (protocol !== 'file:' && (hostname === '95.81.122.36')) {
                return `${protocol}//${host}/api`;
            }
        }
    } catch (_) {}
    return 'http://95.81.122.36:3000/api';
})();

// Общая функция для запросов
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            let msg = `HTTP error! status: ${response.status}`;
            try {
                const body = await response.json();
                if (body && (body.error || body.message)) msg = body.error || body.message;
            } catch (_) {}
            throw new Error(msg);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        // Fallback к localStorage при ошибке подключения
        throw error;
    }
}

// НОВОСТИ
const newsAPI = {
    getAll: () => apiRequest('/news'),
    create: (news) => apiRequest('/news', {
        method: 'POST',
        body: JSON.stringify(news)
    }),
    update: (id, news) => apiRequest(`/news/${id}`, {
        method: 'PUT',
        body: JSON.stringify(news)
    }),
    delete: (id) => apiRequest(`/news/${id}`, {
        method: 'DELETE'
    })
};

// КОМАНДЫ
const teamsAPI = {
    getAll: () => apiRequest('/teams'),
    create: (team) => apiRequest('/teams', {
        method: 'POST',
        body: JSON.stringify(team)
    }),
    update: (id, team) => apiRequest(`/teams/${id}`, {
        method: 'PUT',
        body: JSON.stringify(team)
    }),
    delete: (id) => apiRequest(`/teams/${id}`, {
        method: 'DELETE'
    })
};

// РЕЙТИНГ КОМАНД
const rankingTeamsAPI = {
    getAll: () => apiRequest('/ranking/teams'),
    create: (team) => apiRequest('/ranking/teams', {
        method: 'POST',
        body: JSON.stringify(team)
    }),
    update: (id, team) => apiRequest(`/ranking/teams/${id}`, {
        method: 'PUT',
        body: JSON.stringify(team)
    }),
    delete: (id) => apiRequest(`/ranking/teams/${id}`, {
        method: 'DELETE'
    })
};

// РЕЙТИНГ ИГРОКОВ
const rankingPlayersAPI = {
    getAll: () => apiRequest('/ranking/players'),
    create: (player) => apiRequest('/ranking/players', {
        method: 'POST',
        body: JSON.stringify(player)
    }),
    update: (id, player) => apiRequest(`/ranking/players/${id}`, {
        method: 'PUT',
        body: JSON.stringify(player)
    }),
    delete: (id) => apiRequest(`/ranking/players/${id}`, {
        method: 'DELETE'
    })
};

// БАННЕРЫ
const bannersAPI = {
    getAll: () => apiRequest('/banners'),
    create: (banner) => apiRequest('/banners', {
        method: 'POST',
        body: JSON.stringify(banner)
    }),
    uploadFile: async (side, file, linkUrl) => {
        const fd = new FormData();
        fd.append('side', side || 'left');
        fd.append('file', file);
        if (linkUrl) fd.append('linkUrl', linkUrl);

        const response = await fetch(`${API_BASE_URL}/banners/upload`, {
            method: 'POST',
            body: fd
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    },
    delete: (id) => apiRequest(`/banners/${id}`, {
        method: 'DELETE'
    })
};



// ДЕТАЛИ КОМАНД
const teamDetailsAPI = {
    get: (teamId) => apiRequest(`/team-details/${teamId}`),
    save: (teamId, details) => apiRequest(`/team-details/${teamId}`, {
        method: 'POST',
        body: JSON.stringify(details)
    })
};

// ОРГАНИЗАТОРЫ
const organizersAPI = {
    getAll: () => apiRequest('/organizers'),
    getOne: (id) => apiRequest(`/organizers/${id}`),
    create: (org) => apiRequest('/organizers', {
        method: 'POST',
        body: JSON.stringify(org)
    }),
    update: (id, org) => apiRequest(`/organizers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(org)
    }),
    delete: (id) => apiRequest(`/organizers/${id}`, {
        method: 'DELETE'
    }),
    uploadLogo: async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        // Для загрузки файла жёстко привязываемся к текущему origin,
        // чтобы всегда идти на тот же хост, откуда открыта админка.
        let base;
        try {
            if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') {
                base = window.location.origin;
            }
        } catch (_) {}
        if (!base) {
            // Fallback: вырезаем "/api" из API_BASE_URL, если оно там есть
            base = API_BASE_URL.replace(/\/api$/, '');
        }
        const response = await fetch(`${base}/api/organizers/upload-logo`, {
            method: 'POST',
            body: fd
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }
};

// МАТЧИ (главная страница)
const matchesAPI = {
    getAll: () => apiRequest('/matches'),
    getOne: (id) => apiRequest(`/matches/${id}`),
    create: (match) => apiRequest('/matches', {
        method: 'POST',
        body: JSON.stringify(match)
    }),
    update: (id, match) => apiRequest(`/matches/${id}`, {
        method: 'PUT',
        body: JSON.stringify(match)
    }),
    delete: (id) => apiRequest(`/matches/${id}`, {
        method: 'DELETE'
    }),
    getStats: (id) => apiRequest(`/matches/${id}/stats`),
    getRatingChanges: (id) => apiRequest(`/matches/${id}/rating-changes`),
    saveStats: (id, stats) => apiRequest(`/matches/${id}/stats`, {
        method: 'POST',
        body: JSON.stringify(stats)
    }),
    syncProfileStats: (id) => apiRequest(`/matches/${id}/sync-profile-stats`, { method: 'POST' })
};

// ТУРНИРЫ (главная страница)
const tournamentsAPI = {
    getAll: () => apiRequest('/tournaments'),
    getOne: (id) => apiRequest(`/tournaments/${id}`),
    create: (tournament) => apiRequest('/tournaments', {
        method: 'POST',
        body: JSON.stringify(tournament)
    }),
    update: (id, tournament) => apiRequest(`/tournaments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(tournament)
    }),
    delete: (id) => apiRequest(`/tournaments/${id}`, {
        method: 'DELETE'
    }),
    saveBracket: (id, bracket) => apiRequest(`/tournaments/${id}/bracket`, {
        method: 'POST',
        body: JSON.stringify({ bracket })
    }),
    setMatchResult: (id, matchId, score1, score2) => apiRequest(`/tournaments/${id}/bracket/result`, {
        method: 'POST',
        body: JSON.stringify({ matchId, score1, score2 })
    })
};

// АДМИНИСТРАТОРЫ
const adminAPI = {
    login: (username, password) => apiRequest('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    })
};

