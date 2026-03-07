const { getDB, initDatabase } = require('./database');

async function resetTeamRatings() {
    await initDatabase();
    const db = getDB();

    await new Promise((resolve, reject) => {
        db.run(
            "UPDATE ranking_teams SET rating = 500, points = 500, matches = 0, wins = 0, form = ''",
            (err) => (err ? reject(err) : resolve())
        );
    });

    console.log('Все рейтинги команд сброшены до 500, матчи/победы/форма очищены.');
}

resetTeamRatings().catch((err) => {
    console.error('Ошибка при сбросе рейтингов команд:', err);
    process.exit(1);
});

