import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../db.js';

const router = express.Router();
const SECRET = process.env.JWT_SECRET;

const getRowsFromResult = (result) => {
    if (!result) {
        console.warn('⚠️ Resultado de db.query es undefined o null');
        return [];
    }
    
    // PARA PostgreSQL con tu configuración actual - devuelve [rows, resultObject]
    if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) {
        console.log('Formato PostgreSQL detectado [rows, result]');
        return result[0];
    }
    
    // Si ya tiene propiedad rows (PostgreSQL estándar)
    if (result.rows && Array.isArray(result.rows)) {
        console.log('Formato PostgreSQL estándar (con propiedad rows)');
        return result.rows;
    }
    
    // Si es directamente un array de filas
    if (Array.isArray(result)) {
        console.log('Formato array directo');
        return result;
    }
    
    console.warn('Formato de resultado no reconocido:', typeof result);
    return [];
};

// LOGIN PARA EL PERSONAL (cédula)
router.post('/login', async (req, res) => {
    const { username, password, cedula } = req.body || {};

    try {
        const identifier = username || cedula;
        if (!identifier || !password) return res.status(400).json({ message: 'Credenciales incompletas' });

        const [rows] = await db.query(
            "SELECT * FROM personal WHERE cedula_identidad = ?",
            [identifier]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: "Usuario no encontrado" });
        }

        const user = rows[0];

        // Si existe password hasheado, comparar con bcrypt
        if (user.password && String(user.password).length > 0) {
            const match = await bcrypt.compare(String(password), String(user.password));
            if (!match) return res.status(401).json({ message: "Contraseña incorrecta" });
        } else {
            // fallback: si no hay password almacenado, aceptar cuando password === cedula
            if (String(password) !== String(user.cedula_identidad)) return res.status(401).json({ message: "Contraseña incorrecta" });
        }

        const token = jwt.sign({ id: user.id, cedula: user.cedula_identidad }, SECRET, { expiresIn: '2h' });
        res.json({ message: "Inicio de sesión exitoso", token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

// LOGIN DEL ADMINISTRADOR (ruta separada)
router.post('/admin/login', async (req, res) => {
    const { username, password } = req.body || {};

    try {
        if (!username || !password) return res.status(400).json({ message: 'Credenciales incompletas' });

        const [rows] = await db.query("SELECT * FROM administrador_principal WHERE username = ?", [username]);
        if (rows.length === 0) return res.status(401).json({ message: "Usuario no encontrado" });

        const admin = rows[0];

        if (!admin.password || String(admin.password).length === 0) {
            return res.status(401).json({ message: "Contraseña no configurada" });
        }

        const match = await bcrypt.compare(String(password), String(admin.password));
        if (!match) return res.status(401).json({ message: "Usuario o Contraseña son incorrectas" });

        const token = jwt.sign({ id: admin.id, username: admin.username }, SECRET, { expiresIn: '2h' });
        res.json({ message: "Inicio de sesión exitoso", token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

// Registrar administrador (crear cuenta con password hasheado)
router.post('/admin/register', async (req, res) => {
    const { username, password } = req.body || {};
    try {
        if (!username || !password) return res.status(400).json({ message: 'username y password requeridos' });

        const hashed = await bcrypt.hash(String(password), 10);
        const [rows] = await db.query(
            "INSERT INTO administrador_principal (username, password) VALUES (?, ?) RETURNING id, username",
            [username, hashed]
        );

        // Postgres RETURNING devuelve rows
        const created = rows && rows[0] ? rows[0] : null;
        res.status(201).json({ message: 'Admin creado', admin: created });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear admin' });
    }
});

// =============================================
// RUTAS PARA ADMINISTRADORES DE PROCESOS (CORREGIDAS - SIN /api/ duplicado)
// =============================================

// LOGIN PARA ADMINISTRADORES DE PROCESOS
router.post('/login/procesos', async (req, res) => {
    const { cedula, password, proceso_name } = req.body;
    console.log('🔐 Login de proceso solicitado:', { cedula, proceso_name });

    if (!cedula || !password || !proceso_name) {
        return res.status(400).json({
            success: false, 
            message: 'Cédula, contraseña y proceso son requeridos'
        });
    }

    try {
        const query = `
            SELECT id, nombre, cedula, password, proceso_name, primer_login, activo
            FROM adminProcesos
            WHERE cedula = $1
            AND password IS NOT NULL
            AND proceso_name = $2
            AND activo = true
        `;
        
        const result = await db.query(query, [cedula, proceso_name]);
        
        // USAR EL HELPER para extraer filas
        const rows = getRowsFromResult(result);
        console.log('Filas extraídas:', rows.length, 'registros');
        
        if (rows.length === 0) {
            console.log('No se encontró usuario o acceso denegado');
            return res.status(401).json({
                success: false,
                message: 'Credenciales incorrectas o no tienes acceso a este proceso'
            });
        }

        const user = rows[0];
        console.log('👤 Usuario encontrado:', { 
            id: user.id, 
            cedula: user.cedula,
            proceso_name: user.proceso_name,
            primer_login: user.primer_login
        });
        
        // Verificar contraseña
        console.log('Comparando contraseña...');
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            console.log('Contraseña incorrecta');
            return res.status(401).json({
                success: false,
                message: 'Contraseña incorrecta'
            });
        }

        // Crear token JWT específico para administrador de procesos
        const token = jwt.sign(
            {
                id: user.id,
                cedula: user.cedula,
                proceso_name: user.proceso_name,
                role: 'admin_proceso'
            },
            SECRET,
            { expiresIn: '8h' }
        );

        console.log('Login exitoso para:', user.cedula);
        
        // Respuesta exitosa
        res.json({
            success: true,
            message: 'Login exitoso',
            token,
            user: {
                id: user.id,
                nombre: user.nombre,
                cedula: user.cedula,
                proceso_name: user.proceso_name,
                primer_login: user.primer_login,
                rol: 'ADMIN_PROCESO'
            }
        });

    } catch (error) {
        console.error('Error en login de procesos:', error.message);
        console.error('Stack:', error.stack);
        
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// OBTENER PROCESOS DISPONIBLES PARA EL DROPDOWN
router.get('/procesos', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT proceso_name 
            FROM adminProcesos 
            WHERE activo = true 
            ORDER BY proceso_name
        `;

        const result = await db.query(query);
        
        // USAR EL HELPER para extraer filas
        const rows = getRowsFromResult(result);
        console.log('Procesos encontrados:', rows.length);
        
        let procesos = rows.map(row => row.proceso_name);
        
        // Si no hay procesos en la BD, usar lista por defecto
        if (procesos.length === 0) {
            procesos = [
                "Administrador"
            ];
        }
        
        res.json({
            success: true,
            data: procesos
        });

    } catch (error) {
        console.error('Error obteniendo procesos:', error);
        // En caso de error, devolver lista por defecto
        const procesosDefault = [
            "Almacenamiento y Logística",
                "Aseguramiento de la Calidad y Seguridad",
                "Asuntos Regulatorios y Control de Calidad",
                "Compras",
                "Gerencia",
                "Gestión Comercial",
                "Infraestructura y Mantenimiento",
                "Investigación y Desarrollo",
                "Marketing",
                "Operaciones - Produccion",
                "Salud Ocupacional",
                "Seguridad Industrial",
                "Seguridad Informática",
                "Talento Humano",
                "Ventas"
        ];
        res.json({
            success: true,
            data: procesosDefault
        });
    }
});

// REGISTRAR NUEVO ADMINISTRADOR DE PROCESO
router.post('/procesos/register', async (req, res) => {
    const { nombre, cedula, password, proceso_name } = req.body;

    console.log('Registrando admin de proceso:', { nombre, cedula, proceso_name });
    
    // Validación básica
    if (!nombre || !cedula || !password || !proceso_name) {
        return res.status(400).json({
            success: false,
            message: 'Nombre, cédula, contraseña y proceso son requeridos'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'La contraseña debe tener al menos 6 caracteres'
        });
    }

    try {
        // 1. Verificar si el usuario ya existe
        const checkQuery = `SELECT id FROM adminProcesos WHERE cedula = $1`;
        console.log('Verificando usuario...');
        const checkResult = await db.query(checkQuery, [cedula]);
        
        // USAR EL HELPER para extraer filas
        const checkRows = getRowsFromResult(checkResult);
        console.log('Resultado verificación:', checkRows.length, 'registros');
        
        if (checkRows.length > 0) {
            console.log('Usuario ya existe');
            return res.status(400).json({
                success: false,
                message: 'La cédula ya está en uso'
            });
        }

        // 2. Hashear la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('Contraseña hasheada correctamente');

        // 3. Insertar nuevo administrador
        const insertQuery = `
            INSERT INTO adminProcesos (nombre, cedula, password, proceso_name, activo, primer_login)
            VALUES ($1, $2, $3, $4, true, true)
            RETURNING id, nombre, cedula, proceso_name, primer_login
        `;
        
        console.log('Insertando nuevo admin...');
        
        const insertResult = await db.query(insertQuery, [
            nombre,
            cedula,
            hashedPassword,
            proceso_name
        ]);
        
        // USAR EL HELPER para extraer filas
        const insertRows = getRowsFromResult(insertResult);
        console.log('Resultado inserción:', insertRows.length, 'registros');
        
        if (insertRows.length === 0) {
            throw new Error('No se recibieron datos del registro');
        }
        
        const newAdmin = insertRows[0];
        console.log('Administrador de Proceso creado exitosamente:', newAdmin);

        // 4. Respuesta exitosa
        res.status(201).json({
            success: true,
            message: 'Administrador de proceso creado exitosamente',
            admin: {
                id: newAdmin.id,
                nombre: newAdmin.nombre,
                cedula: newAdmin.cedula,
                proceso_name: newAdmin.proceso_name,
                primer_login: newAdmin.primer_login
            }
        });

    } catch (error) {
        console.error('Error en registro:', error.message);
        console.error('Stack:', error.stack);
        
        // Manejar errores específicos de PostgreSQL
        let userMessage = 'Error al crear administrador de proceso';
        
        if (error.code === '23505') { // Violación de unicidad
            userMessage = 'La cédula ya existe';
        } else if (error.code === '42P01') { // Tabla no existe
            userMessage = 'Error en la base de datos: tabla no encontrada';
        } else if (error.message.includes('adminProcesos')) {
            userMessage = 'Error con la tabla de administradores de procesos';
        }
        
        res.status(500).json({
            success: false,
            message: userMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =============================================
// MIDDLEWARE DE AUTENTICACIÓN PARA ADMINISTRADORES DE PROCESOS
// =============================================
const authenticateProceso = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token de acceso requerido'
        });
    }

    jwt.verify(token, SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Token inválido o expirado'
            });
        }
        
        // Verificar que sea un token de administrador de procesos
        if (decoded.role !== 'admin_proceso') {
            return res.status(403).json({
                success: false,
                message: 'Acceso no autorizado para esta ruta'
            });
        }
        
        req.user = decoded;
        next();
    });
};

// RUTA PROTEGIDA PARA DASHBOARD DE PROCESOS
router.get('/dashboard/:proceso_name', authenticateProceso, async (req, res) => {
    try {
        // Verificar que el usuario tenga acceso a ESTE proceso específico
        if (req.user.proceso_name !== req.params.proceso_name) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para acceder a este proceso'
            });
        }

        // Respuesta con datos del dashboard
        res.json({
            success: true,
            message: `Bienvenido al dashboard de ${req.user.proceso_name}`,
            user: req.user,
            fecha: new Date().toLocaleDateString('es-ES'),
            stats: {
                total_tareas: 0,
                completadas: 0,
                pendientes: 0
            }
        });

    } catch (error) {
        console.error('Error en dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar el dashboard'
        });
    }
});

// VERIFICAR TOKEN DE ADMINISTRADOR DE PROCESOS
router.get('/procesos/verify', authenticateProceso, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// =============================================
// CAMBIAR CONTRASEÑA - ADMINISTRADOR DE PROCESOS
// =============================================
router.post('/procesos/cambiar-password', authenticateProceso, async (req, res) => {
    const { newPassword } = req.body;
    const userId = req.user.id; // Del token JWT

    try {
        // Validar que la contraseña tenga al menos 6 caracteres
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 6 caracteres'
            });
        }

        // Encriptar la nueva contraseña
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Actualizar contraseña y marcar primer_login como false
        const updateQuery = `
            UPDATE adminProcesos 
            SET password = $1, 
                primer_login = false, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = $2 
            RETURNING id, cedula, proceso_name
        `;

        const result = await db.query(updateQuery, [hashedPassword, userId]);
        const rows = getRowsFromResult(result);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        const updatedUser = rows[0];

        res.json({
            success: true,
            message: 'Contraseña cambiada exitosamente',
            user: {
                id: updatedUser.id,
                cedula: updatedUser.cedula,
                proceso_name: updatedUser.proceso_name
            }
        });

    } catch (error) {
        console.error('Error cambiando contraseña:', error.message);
        console.error('Stack:', error.stack);
        
        res.status(500).json({
            success: false,
            message: 'Error al cambiar la contraseña',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =============================================
// MIDDLEWARE ADMIN PRINCIPAL
// =============================================
const authenticateAdminPrincipal = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token requerido' });
    jwt.verify(token, SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, message: 'Token inválido' });
        if (!decoded.username) return res.status(403).json({ success: false, message: 'No autorizado' });
        req.user = decoded;
        next();
    });
};

// GET /api/auth/admin/admin-procesos — Listar todos los adminProcesos
router.get('/admin/admin-procesos', authenticateAdminPrincipal, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, nombre, cedula, proceso_name, activo, primer_login
             FROM adminProcesos
             ORDER BY proceso_name, nombre`
        );
        const rows = getRowsFromResult(result);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error listando adminProcesos:', error);
        res.status(500).json({ success: false, message: 'Error al obtener administradores' });
    }
});

// PUT /api/auth/admin/admin-procesos/:id/reset-password — Resetear contraseña provisional
router.put('/admin/admin-procesos/:id/reset-password', authenticateAdminPrincipal, async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const result = await db.query(
            `UPDATE adminProcesos
             SET password = $1, primer_login = true
             WHERE id = $2
             RETURNING id, nombre, cedula, proceso_name`,
            [hashedPassword, id]
        );
        const rows = getRowsFromResult(result);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Administrador no encontrado' });
        }
        res.json({ success: true, message: 'Contraseña provisional establecida', admin: rows[0] });
    } catch (error) {
        console.error('Error reseteando contraseña:', error);
        res.status(500).json({ success: false, message: 'Error al resetear contraseña' });
    }
});

export default router;