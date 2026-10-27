import dotenv from 'dotenv'; 
import pg from 'pg';

// Cargar .env
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    /*ssl: {
        require: true,
        rejectUnauthorized: false
    }*/
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Probar conexión
pool.query("SELECT NOW()")
    .then(() => console.log("Conectado a PostgreSQL en Railway."))
    .catch(err => console.error("Error conectando a PostgreSQL:", err));

// Wrapper para convertir placeholders
function convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

// API tipo mysql2
async function query(sql, params = []) {
    const text = convertPlaceholders(sql);
    const res = await pool.query(text, params);
    return [res.rows, res];
}

export default { query, pool };
