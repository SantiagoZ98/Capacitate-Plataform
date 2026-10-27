import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// Credenciales de Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Error: SUPABASE_URL y SUPABASE_ANON_KEY son requeridas en .env');
    process.exit(1);
}

// Crear cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Wrapper para mantener compatibilidad con código existente
// que espera formato [rows, result]
async function query(sql, params = []) {
    try {
        // Convertir SQL de estilo MySQL a PostgreSQL
        let processedSql = sql.replace(/\?/g, () => {
            let paramIndex = 0;
            return () => `$${++paramIndex}`;
        });
        
        // Re-hacer esto correctamente
        let paramIndex = 0;
        processedSql = sql.replace(/\?/g, () => `$${++paramIndex}`);
        
        console.log(`📝 Query: ${processedSql}`);
        console.log(`📦 Params:`, params);
        
        // Ejecutar query directamente via SQL
        const { data, error } = await supabase.rpc('exec_raw_sql', {
            sql: processedSql,
            params: params
        });
        
        if (error) {
            throw new Error(`Query error: ${error.message}`);
        }
        
        return [data || [], { rows: data || [] }];
    } catch (err) {
        console.error('❌ Error en query:', err.message);
        throw err;
    }
}

// Prueba de conexión
console.log('🔌 Conectando a Supabase...');
console.log(`📍 URL: ${SUPABASE_URL}`);

// Test: Usar auth para verificar conexión
supabase.auth.getSession().then(({ data }) => {
    if (data) {
        console.log('✅ Conectado a Supabase HTTP API');
    } else {
        console.log('✅ Conexión a Supabase HTTP API establecida (sin sesión de auth)');
    }
}).catch(err => {
    console.error('❌ Error conectando a Supabase:', err.message);
});

export default { query, supabase };
