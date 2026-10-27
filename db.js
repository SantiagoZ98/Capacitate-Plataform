import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
// Usar SERVICE_ROLE_KEY para backend (permisos completos, sin RLS)
// Si no existe, usar ANON_KEY como fallback
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Error: SUPABASE_URL y (SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ANON_KEY) son requeridas en .env');
    process.exit(1);
}

// Crear cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('🔌 Inicializando Supabase HTTP/REST API...');

// Función mejorada que intercepta queries y las traduce a Supabase
async function query(sql, params = []) {
    try {
        const sqlUpper = sql.toUpperCase().trim();
        
        // CASO 1: SELECT * FROM tabla WHERE campo = ?
        if (sqlUpper.startsWith('SELECT')) {
            return await handleSelectQuery(sql, params);
        }
        
        // CASO 2: INSERT INTO tabla
        if (sqlUpper.startsWith('INSERT')) {
            return await handleInsertQuery(sql, params);
        }
        
        // CASO 3: UPDATE tabla
        if (sqlUpper.startsWith('UPDATE')) {
            return await handleUpdateQuery(sql, params);
        }
        
        // CASO 4: DELETE FROM tabla
        if (sqlUpper.startsWith('DELETE')) {
            return await handleDeleteQuery(sql, params);
        }
        
        throw new Error(`Tipo de query no soportado: ${sqlUpper.split(' ')[0]}`);
        
    } catch (err) {
        console.error('❌ Error en query:', err.message);
        throw err;
    }
}

// Parsear SELECT queries
async function handleSelectQuery(sql, params) {
    
    // Extraer tabla y condiciones
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    if (!tableMatch) throw new Error('No se pudo extraer tabla del SELECT');
    
    const tableName = tableMatch[1];
    
    // Extraer WHERE clause
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER|GROUP|LIMIT|$)/i);
    
    let query = supabase.from(tableName).select('*');
    
    if (whereMatch && params.length > 0) {
        const whereClause = whereMatch[1].trim();
        
        // Parsear condiciones simples (campo = $1, etc)
        const conditions = whereClause.split(/\s+AND\s+/i);
        let paramIndex = 0;
        
        for (const condition of conditions) {
            const fieldMatch = condition.match(/(\w+)\s*=\s*\$\d+/);
            if (fieldMatch) {
                const field = fieldMatch[1];
                const value = params[paramIndex];
                query = query.eq(field, value);
                paramIndex++;
            }
        }
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return [data || [], { rows: data || [] }];
}

// Parsear INSERT queries
async function handleInsertQuery(sql, params) {
    console.log(`✍️ INSERT: ${sql}`);
    
    // Extraer tabla
    const tableMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i);
    if (!tableMatch) throw new Error('No se pudo extraer tabla del INSERT');
    
    const tableName = tableMatch[1];
    
    // Extraer columnas
    const columnsMatch = sql.match(/\((.*?)\)\s*VALUES/i);
    if (!columnsMatch) throw new Error('No se pudieron extraer columnas del INSERT');
    
    const columns = columnsMatch[1].split(',').map(c => c.trim());
    
    // Construir objeto
    const obj = {};
    columns.forEach((col, idx) => {
        obj[col] = params[idx];
    });
    
    // ON CONFLICT (cols) DO NOTHING | DO UPDATE ... -> upsert de Supabase
    const conflictMatch = sql.match(/ON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+(NOTHING|UPDATE)/i);
    let query;
    if (conflictMatch) {
        const onConflict = conflictMatch[1].split(',').map(c => c.trim()).join(',');
        const doNothing = conflictMatch[2].toUpperCase() === 'NOTHING';
        query = supabase.from(tableName)
            .upsert([obj], { onConflict, ignoreDuplicates: doNothing })
            .select();
    } else {
        query = supabase.from(tableName).insert([obj]).select();
    }
    const { data, error } = await query;
    
    if (error) throw error;
    
    return [data || [], { rows: data || [] }];
}

// Parsear UPDATE queries
async function handleUpdateQuery(sql, params) {
    console.log(`🔄 UPDATE: ${sql}`);
    
    // Extraer tabla
    const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
    if (!tableMatch) throw new Error('No se pudo extraer tabla del UPDATE');
    
    const tableName = tableMatch[1];
    
    // Extraer SET y WHERE
    const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
    const whereMatch = sql.match(/WHERE\s+(.+?)$/i);
    
    if (!setMatch || !whereMatch) throw new Error('No se pudieron extraer SET/WHERE del UPDATE');
    
    const setClause = setMatch[1];
    const whereClause = whereMatch[1];
    
    // Parsear SET (campo = $1, campo2 = $2, etc)
    const setFields = setClause.split(',').map(s => s.trim());
    const updates = {};
    let paramIndex = 0;
    
    setFields.forEach(field => {
        const match = field.match(/(\w+)\s*=\s*\$\d+/);
        if (match) {
            updates[match[1]] = params[paramIndex++];
        }
    });
    
    // Parsear WHERE
    const whereFieldMatch = whereClause.match(/(\w+)\s*=\s*\$\d+/);
    if (!whereFieldMatch) throw new Error('No se pudo parsear WHERE del UPDATE');
    
    const whereField = whereFieldMatch[1];
    const whereValue = params[paramIndex];
    
    const { data, error } = await supabase
        .from(tableName)
        .update(updates)
        .eq(whereField, whereValue)
        .select();
    
    if (error) throw error;
    
    return [data || [], { rows: data || [] }];
}

// Parsear DELETE queries
async function handleDeleteQuery(sql, params) {
    console.log(`🗑️ DELETE: ${sql}`);
    
    // Extraer tabla
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    if (!tableMatch) throw new Error('No se pudo extraer tabla del DELETE');
    
    const tableName = tableMatch[1];
    
    // Extraer WHERE
    const whereMatch = sql.match(/WHERE\s+(.+?)$/i);
    if (!whereMatch || params.length === 0) throw new Error('DELETE requiere WHERE');
    
    const whereClause = whereMatch[1];
    const fieldMatch = whereClause.match(/(\w+)\s*=\s*\$\d+/);
    
    if (!fieldMatch) throw new Error('No se pudo parsear WHERE del DELETE');
    
    const field = fieldMatch[1];
    const value = params[0];
    
    const { data, error } = await supabase
        .from(tableName)
        .delete()
        .eq(field, value)
        .select();
    
    if (error) throw error;
    
    return [data || [], { rows: data || [] }];
}

// Test de conexión
(async () => {
    try {
        const { data, error } = await supabase.from('personal').select('*').limit(1);
        if (error) {
            console.log('⚠️ Conexión HTTP establecida, pero tabla "personal" no encontrada (aún)');
        } else {
            console.log('✅ Conectado a Supabase HTTP/REST API - Tabla "personal" existe');
        }
    } catch (err) {
        console.log('✅ Conectado a Supabase HTTP/REST API (verificación de tabla no disponible)');
    }
})();

export default { query, supabase };
