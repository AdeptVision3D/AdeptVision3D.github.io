// Ежедневный бэкап базы Decard Studio.
// Выгружает все таблицы Supabase в JSON-файлы, по одной папке на день.
// Запускается автоматически через .github/workflows/backup.yml (GitHub Actions),
// но можно запустить и вручную: SUPABASE_SERVICE_ROLE_KEY=... OUTPUT_DIR=./out node scripts/backup-supabase.js
//
// Использует SERVICE ROLE ключ (не anon!) — он обходит RLS и видит все строки
// во всех таблицах, что и нужно для полного бэкапа. Хранится только как секрет
// GitHub Actions, в код не попадает.

const fs = require('fs');

const SUPABASE_URL = 'https://mcpsnmcvzxzdgllhbrib.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUTPUT_DIR = process.env.OUTPUT_DIR || '.';
const KEEP_DAYS = 30; // сколько последних снимков хранить, чтобы репозиторий не рос бесконечно

const TABLES = [
    'profiles',
    'projects',
    'frames',
    'frame_stages',
    'frame_tasks',
    'frame_comments',
    'frame_activity_log',
];

async function fetchTable(table) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
    });
    if (!res.ok) {
        throw new Error(`Не удалось выгрузить таблицу "${table}": ${res.status} ${await res.text()}`);
    }
    return res.json();
}

function pruneOldBackups() {
    const entries = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map(e => e.name)
        .sort();
    if (entries.length <= KEEP_DAYS) return;
    const toDelete = entries.slice(0, entries.length - KEEP_DAYS);
    for (const name of toDelete) {
        fs.rmSync(`${OUTPUT_DIR}/${name}`, { recursive: true, force: true });
        console.log(`Удалён старый бэкап: ${name}`);
    }
}

async function main() {
    if (!SERVICE_ROLE_KEY) {
        console.error('Не задан SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }

    const today = new Date().toISOString().slice(0, 10);
    const dir = `${OUTPUT_DIR}/${today}`;
    fs.mkdirSync(dir, { recursive: true });

    for (const table of TABLES) {
        console.log(`Выгружаю ${table}...`);
        const data = await fetchTable(table);
        fs.writeFileSync(`${dir}/${table}.json`, JSON.stringify(data, null, 2));
        console.log(`  ${table}: ${data.length} строк`);
    }

    pruneOldBackups();
    console.log('Бэкап завершён:', today);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
