import express from 'express';
import db from '../db.js';
import { authenticateAdminProceso } from '../middlewares/adminProcesoAuth.js';
import { esProcesoTH } from '../middlewares/esProcesoTH.js';

const router = express.Router();

/**
 * GET /api/debug/procesos
 * Endpoint temporal para ver todos los procesos (DEBUG ONLY - Sin autenticación)
 */
router.get('/debug/procesos', async (req, res) => {
    try {
        console.log('🔍 GET /api/debug/procesos - Obteniendo procesos...');
        const [procesos] = await db.query(
            "SELECT id, nombre FROM procesos ORDER BY nombre"
        );
        console.log('✅ Procesos obtenidos:', procesos.length);
        res.json({
            success: true,
            data: procesos
        });
    } catch (error) {
        console.error('❌ Error en /api/debug/procesos:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/debug/usuarios
 * Endpoint temporal para ver todos los usuarios (DEBUG ONLY - Sin autenticación)
 */
router.get('/debug/usuarios', async (req, res) => {
    try {
        console.log('🔍 GET /api/debug/usuarios - Obteniendo usuarios...');
        const [usuarios] = await db.query(
            "SELECT id, nombre, cedula_identidad, proceso, cargo FROM personal ORDER BY nombre"
        );
        console.log('✅ Usuarios obtenidos:', usuarios.length);
        res.json({
            success: true,
            data: usuarios
        });
    } catch (error) {
        console.error('❌ Error en /api/debug/usuarios:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/cursos/pendientes
 * Obtener todos los cursos pendientes de aprobación (solo para Talento Humano)
 */
router.get('/pendientes', authenticateAdminProceso, async (req, res) => {
    try {
        const { proceso_name } = req.user;

        // Validar que sea TALENTO HUMANO
        if (!esProcesoTH(proceso_name)) {
            return res.status(403).json({
                success: false,
                message: "Solo Talento Humano puede ver cursos pendientes de aprobación"
            });
        }

        console.log('🔍 GET /api/cursos/pendientes - Obteniendo cursos pendientes de aprobación');

        const [cursos] = await db.query(
            `SELECT c.id, c.nombre, c.descripcion, c.razon_curso, c.dirigido_a, c.duracion, c.proceso_id, 
                    c.creado_por, c.estado, c.creado_en, p.nombre as proceso_name,
                    a.nombre as creado_por_nombre
             FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             JOIN adminprocesos a ON c.creado_por = a.id
             WHERE c.estado = 'pendiente'
             ORDER BY c.creado_en DESC`
        );

        console.log('✅ Cursos pendientes obtenidos:', cursos.length);

        res.json({
            success: true,
            data: cursos
        });
    } catch (error) {
        console.error('❌ Error en GET /api/cursos/pendientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener cursos pendientes'
        });
    }
});

/**
 * GET /api/cursos/disponibles
 * Obtener todos los cursos activos y aprobados (para estudiantes - sin autenticación requerida)
 */
router.get('/disponibles', async (req, res) => {
    try {
        console.log('🔍 GET /api/cursos/disponibles - Obteniendo cursos disponibles para estudiantes');
        
        const [cursos] = await db.query(
            `SELECT c.id, c.nombre, c.descripcion, c.duracion, c.proceso_id, c.activo, c.creado_en,
                    c.habilitado_manual, c.fecha_inicio, c.fecha_fin,
                    c.anio, c.cursos_base_id,
                    p.nombre as proceso_name
             FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             WHERE c.activo = true AND c.estado = 'aprobado'
               AND c.habilitado_manual = true
               AND c.anio = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/Guayaquil')::INTEGER
             ORDER BY p.nombre, c.creado_en DESC`
        );

        console.log('✅ Cursos disponibles obtenidos:', cursos.length);

        res.json({
            success: true,
            data: cursos
        });
    } catch (error) {
        console.error('❌ Error en GET /api/cursos/disponibles:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener cursos disponibles'
        });
    }
});

/**
 * GET /api/cursos
 * Obtener cursos de un proceso (filtrado por proceso_id del admin autenticado, solo aprobados)
 */
router.get('/', authenticateAdminProceso, async (req, res) => {
    try {
        const { proceso_name } = req.user;

        console.log("🔍 DEBUG - GET /api/cursos");
        console.log("   Buscando proceso:", proceso_name);

        // Ver todos los procesos que existen
        const [todosLosProcesos] = await db.query("SELECT id, nombre FROM procesos");
        console.log("   Procesos en BD:", todosLosProcesos);

        // Primero, obtener el ID del proceso por nombre (búsqueda flexible)
        const [procesosResult] = await db.query(
            "SELECT id FROM procesos WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))",
            [proceso_name]
        );

        console.log("   Resultado de búsqueda:", procesosResult);

        if (procesosResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Proceso no encontrado",
                debug: {
                    buscado: proceso_name,
                    procesosDisponibles: todosLosProcesos.map(p => p.nombre)
                }
            });
        }

        const procesoId = procesosResult[0].id;

        // Obtener cursos del proceso (solo aprobados)
        // Filtrar por año si se pasa ?anio= en la query
        const anioParam = req.query.anio ? parseInt(req.query.anio) : null;
        const whereAnio = anioParam ? `AND anio = ${anioParam}` : '';

        const [cursos] = await db.query(
            `SELECT id, nombre, descripcion, razon_curso, dirigido_a, duracion, proceso_id, creado_por,
                    activo, estado, creado_en, fecha_inicio, fecha_fin, habilitado_manual,
                    anio, cursos_base_id
             FROM cursos
             WHERE proceso_id = $1 AND estado = 'aprobado'
             ${whereAnio}
             ORDER BY anio DESC, creado_en DESC`,
            [procesoId]
        );

        res.json({
            success: true,
            data: cursos
        });

    } catch (error) {
        console.error("Error obteniendo cursos:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener cursos"
        });
    }
});

/**
 * GET /api/cursos/publicos
 * Obtener todos los cursos disponibles para usuarios (solo los activos y aprobados)
 */
router.get('/publicos', async (req, res) => {
    try {
        const [cursos] = await db.query(
            `SELECT c.id, c.nombre, c.descripcion, c.dirigido_a, c.duracion, p.nombre as proceso, c.creado_en,
                    c.anio, c.cursos_base_id
             FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             WHERE c.activo = true AND c.estado = 'aprobado'
               AND c.habilitado_manual = true
               AND c.anio = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/Guayaquil')::INTEGER
               AND (c.fecha_inicio IS NULL OR NOW() AT TIME ZONE 'America/Guayaquil' >= c.fecha_inicio)
               AND (c.fecha_fin IS NULL OR NOW() AT TIME ZONE 'America/Guayaquil' <= c.fecha_fin)
             ORDER BY c.creado_en DESC`
        );

        res.json({
            success: true,
            data: cursos
        });

    } catch (error) {
        console.error("Error obteniendo cursos públicos:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener cursos"
        });
    }
});

/**
 * GET /api/cursos/panel-control
 * Panel de control de cursos - todos los aprobados con info de programación (solo TALENTO HUMANO)
 */
router.get('/panel-control', authenticateAdminProceso, async (req, res) => {
    try {
        const { proceso_name } = req.user;

        if (!esProcesoTH(proceso_name)) {
            return res.status(403).json({
                success: false,
                message: "Solo Talento Humano puede acceder al panel de control"
            });
        }

        // Filtrar por año si se pasa ?anio= en la query
        const anioFiltro = req.query.anio ? parseInt(req.query.anio) : null;
        const panelParams = anioFiltro ? [anioFiltro] : [];
        const panelWhere  = anioFiltro ? 'AND c.anio = $1' : '';

        const [cursos] = await db.query(
            `SELECT c.id, c.nombre, c.descripcion, c.duracion, c.proceso_id,
                    c.habilitado_manual, c.fecha_inicio, c.fecha_fin,
                    c.estado, c.activo, c.creado_en,
                    c.anio, c.cursos_base_id,
                    p.nombre as proceso_name,
                    a.nombre as creado_por_nombre
             FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             LEFT JOIN adminprocesos a ON c.creado_por = a.id
             WHERE c.estado = 'aprobado'
             ${panelWhere}
             ORDER BY c.anio DESC, p.nombre, c.nombre`,
            panelParams
        );

        res.json({
            success: true,
            data: cursos
        });
    } catch (error) {
        console.error('❌ Error en GET /api/cursos/panel-control:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener panel de control'
        });
    }
});

/**
 * GET /api/cursos/:id
 * Obtener detalle de un curso específico
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [cursos] = await db.query(
            `SELECT c.*, p.nombre as proceso
             FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             WHERE c.id = $1`,
            [id]
        );

        if (cursos.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Curso no encontrado"
            });
        }

        res.json({
            success: true,
            data: cursos[0]
        });

    } catch (error) {
        console.error("Error obteniendo curso:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener curso"
        });
    }
});

/**
 * POST /api/cursos
 * Crear un nuevo curso (solo admin de proceso) - Inicia en estado PENDIENTE
 */
router.post('/', authenticateAdminProceso, async (req, res) => {
    try {
        const { nombre, descripcion, razon_curso, dirigido_a, duracion, fecha_inicio, fecha_fin } = req.body;
        const { id: creado_por, proceso_name } = req.user;

        // Validar datos
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({
                success: false,
                message: "El nombre del curso es requerido"
            });
        }

        if (!razon_curso || !razon_curso.trim()) {
            return res.status(400).json({
                success: false,
                message: "La razón del curso es requerida"
            });
        }

        if (!dirigido_a || !dirigido_a.trim()) {
            return res.status(400).json({
                success: false,
                message: "El campo 'Dirigido a' es requerido"
            });
        }

        // Obtener ID del proceso
        const [procesosResult] = await db.query(
            "SELECT id FROM procesos WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))",
            [proceso_name]
        );

        if (procesosResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Proceso no encontrado",
                debug: { buscado: proceso_name }
            });
        }

        const proceso_id = procesosResult[0].id;

        // Validar fechas si se proveen
        if (fecha_inicio && fecha_fin && new Date(fecha_fin) <= new Date(fecha_inicio)) {
            return res.status(400).json({
                success: false,
                message: "La fecha de fin debe ser posterior a la fecha de inicio"
            });
        }

        // Año del curso (por defecto el año actual)
        const anio = new Date().getFullYear();

        // Crear curso con estado PENDIENTE
        const [resultado] = await db.query(
            `INSERT INTO cursos (nombre, descripcion, razon_curso, dirigido_a, duracion, proceso_id, creado_por,
                                 activo, estado, fecha_inicio, fecha_fin, habilitado_manual, anio)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'pendiente', $8, $9, true, $10)
             RETURNING id, nombre, descripcion, razon_curso, dirigido_a, duracion, proceso_id, creado_por,
                       activo, estado, fecha_inicio, fecha_fin, habilitado_manual, anio, creado_en`,
            [nombre.trim(), descripcion || null, razon_curso.trim(), dirigido_a.trim(),
             duracion?.trim() || null, proceso_id, creado_por, fecha_inicio || null, fecha_fin || null, anio]
        );

        // Actualizar cursos_base_id = id (es la primera versión)
        await db.query(
            'UPDATE cursos SET cursos_base_id = id WHERE id = $1',
            [resultado[0].id]
        );

        res.status(201).json({
            success: true,
            message: "Curso creado exitosamente en estado PENDIENTE de aprobación",
            data: { ...resultado[0], cursos_base_id: resultado[0].id }
        });

    } catch (error) {
        console.error("Error creando curso:", error);
        res.status(500).json({
            success: false,
            message: "Error al crear curso"
        });
    }
});

/**
 * PUT /api/cursos/:id
 * Editar un curso (solo admin de proceso)
 */
router.put('/:id', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, activo, duracion, fecha_inicio, fecha_fin } = req.body;
        const { proceso_name } = req.user;

        // Validar que el curso pertenezca al proceso del admin
        const [cursoExistente] = await db.query(
            `SELECT c.id FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             WHERE c.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [id, proceso_name]
        );

        if (cursoExistente.length === 0) {
            return res.status(403).json({
                success: false,
                message: "No tienes permiso para editar este curso"
            });
        }

        // Validar fechas si se proveen
        if (fecha_inicio && fecha_fin && new Date(fecha_fin) <= new Date(fecha_inicio)) {
            return res.status(400).json({
                success: false,
                message: "La fecha de fin debe ser posterior a la fecha de inicio"
            });
        }

        // Actualizar curso
        const [resultado] = await db.query(
            `UPDATE cursos
             SET nombre = COALESCE($1, nombre),
                 descripcion = COALESCE($2, descripcion),
                 activo = COALESCE($3, activo),
                 duracion = COALESCE($4, duracion),
                 fecha_inicio = $5,
                 fecha_fin = $6
             WHERE id = $7
             RETURNING id, nombre, descripcion, duracion, proceso_id, creado_por, activo, fecha_inicio, fecha_fin, creado_en`,
            [nombre, descripcion, activo, duracion?.trim() || null, fecha_inicio || null, fecha_fin || null, id]
        );

        res.json({
            success: true,
            message: "Curso actualizado exitosamente",
            data: resultado[0]
        });

    } catch (error) {
        console.error("Error actualizando curso:", error);
        res.status(500).json({
            success: false,
            message: "Error al actualizar curso"
        });
    }
});

/**
 * DELETE /api/cursos/:id
 * Eliminar un curso (solo admin de proceso)
 */
router.delete('/:id', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { proceso_name } = req.user;

        // Validar que el curso pertenezca al proceso del admin
        const [cursoExistente] = await db.query(
            `SELECT c.id FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             WHERE c.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [id, proceso_name]
        );

        if (cursoExistente.length === 0) {
            return res.status(403).json({
                success: false,
                message: "No tienes permiso para eliminar este curso"
            });
        }

        // Eliminar curso (cascade elimina módulos, evaluaciones, inscripciones)
        await db.query("DELETE FROM cursos WHERE id = $1", [id]);

        res.json({
            success: true,
            message: "Curso eliminado exitosamente"
        });

    } catch (error) {
        console.error("Error eliminando curso:", error);
        res.status(500).json({
            success: false,
            message: "Error al eliminar curso"
        });
    }
});

/**
 * PUT /api/cursos/:id/aprobar
 * Aprobar un curso (solo TALENTO HUMANO)
 */
router.put('/:id/aprobar', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { proceso_name, id: admin_id } = req.user;

        // Validar que sea TALENTO HUMANO
        if (!esProcesoTH(proceso_name)) {
            return res.status(403).json({
                success: false,
                message: "Solo TALENTO HUMANO puede aprobar cursos"
            });
        }

        // Validar que el curso exista y esté pendiente
        const [cursoExistente] = await db.query(
            `SELECT c.id, c.estado FROM cursos c WHERE c.id = $1`,
            [id]
        );

        if (cursoExistente.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Curso no encontrado"
            });
        }

        if (cursoExistente[0].estado !== 'pendiente') {
            return res.status(400).json({
                success: false,
                message: `El curso ya ha sido ${cursoExistente[0].estado}. No se puede cambiar su estado.`
            });
        }

        // Aprobar curso
        const [resultado] = await db.query(
            `UPDATE cursos
             SET estado = 'aprobado', 
                 aprobado_por = $1,
                 fecha_aprobacion = NOW() AT TIME ZONE 'America/Guayaquil'
             WHERE id = $2
             RETURNING id, nombre, descripcion, razon_curso, dirigido_a, proceso_id, creado_por, 
                       activo, estado, aprobado_por, fecha_aprobacion, creado_en`,
            [admin_id, id]
        );

        // Crear notificación para el admin que creó el curso
        const cursoData = resultado[0];
        try {
            await db.query(
                `INSERT INTO notificaciones (admin_id, curso_id, tipo, mensaje, creada_en)
                 VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'America/Guayaquil')`,
                [
                    cursoData.creado_por,
                    id,
                    'aprobado',
                    `Tu curso "${cursoData.nombre}" ha sido APROBADO por Talento Humano`
                ]
            );
            console.log('✅ Notificación de aprobación creada para admin:', cursoData.creado_por);
        } catch (notifError) {
            console.error('⚠️ Error creando notificación:', notifError);
            // No fallar la aprobación si hay error en la notificación
        }

        res.json({
            success: true,
            message: "Curso aprobado exitosamente",
            data: resultado[0]
        });

    } catch (error) {
        console.error("Error aprobando curso:", error);
        res.status(500).json({
            success: false,
            message: "Error al aprobar curso"
        });
    }
});

/**
 * PUT /api/cursos/:id/rechazar
 * Rechazar un curso (solo TALENTO HUMANO)
 */
router.put('/:id/rechazar', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { razon_rechazo } = req.body;
        const { proceso_name, id: admin_id } = req.user;

        // Validar que sea TALENTO HUMANO
        if (!esProcesoTH(proceso_name)) {
            return res.status(403).json({
                success: false,
                message: "Solo TALENTO HUMANO puede rechazar cursos"
            });
        }

        if (!razon_rechazo || !razon_rechazo.trim()) {
            return res.status(400).json({
                success: false,
                message: "La razón del rechazo es requerida"
            });
        }

        // Validar que el curso exista y esté pendiente
        const [cursoExistente] = await db.query(
            `SELECT c.id, c.estado FROM cursos c WHERE c.id = $1`,
            [id]
        );

        if (cursoExistente.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Curso no encontrado"
            });
        }

        if (cursoExistente[0].estado !== 'pendiente') {
            return res.status(400).json({
                success: false,
                message: `El curso ya ha sido ${cursoExistente[0].estado}. No se puede cambiar su estado.`
            });
        }

        // Rechazar curso
        const [resultado] = await db.query(
            `UPDATE cursos
             SET estado = 'rechazado', 
                 aprobado_por = $1,
                 fecha_aprobacion = NOW() AT TIME ZONE 'America/Guayaquil',
                 razon_rechazo = $2
             WHERE id = $3
             RETURNING id, nombre, descripcion, razon_curso, dirigido_a, proceso_id, creado_por, 
                       activo, estado, aprobado_por, fecha_aprobacion, razon_rechazo, creado_en`,
            [admin_id, razon_rechazo.trim(), id]
        );

        // Crear notificación para el admin que creó el curso
        const cursoData = resultado[0];
        try {
            await db.query(
                `INSERT INTO notificaciones (admin_id, curso_id, tipo, mensaje, razon_rechazo, creada_en)
                 VALUES ($1, $2, $3, $4, $5, NOW() AT TIME ZONE 'America/Guayaquil')`,
                [
                    cursoData.creado_por,
                    id,
                    'rechazado',
                    `Tu curso "${cursoData.nombre}" ha sido RECHAZADO por Talento Humano`,
                    razon_rechazo.trim()
                ]
            );
            console.log('✅ Notificación de rechazo creada para admin:', cursoData.creado_por);
        } catch (notifError) {
            console.error('⚠️ Error creando notificación:', notifError);
            // No fallar el rechazo si hay error en la notificación
        }

        res.json({
            success: true,
            message: "Curso rechazado exitosamente",
            data: resultado[0]
        });

    } catch (error) {
        console.error("Error rechazando curso:", error);
        res.status(500).json({
            success: false,
            message: "Error al rechazar curso"
        });
    }
});

/**
 * PUT /api/cursos/:id/toggle-habilitado
 * Habilitar/Deshabilitar manualmente un curso (solo TALENTO HUMANO)
 */
router.put('/:id/toggle-habilitado', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { proceso_name } = req.user;

        if (!esProcesoTH(proceso_name)) {
            return res.status(403).json({
                success: false,
                message: "Solo Talento Humano puede habilitar/deshabilitar cursos"
            });
        }

        const [cursoActual] = await db.query(
            `SELECT id, nombre, habilitado_manual FROM cursos WHERE id = $1 AND estado = 'aprobado'`,
            [id]
        );

        if (cursoActual.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Curso no encontrado o no está aprobado"
            });
        }

        const nuevoEstado = !cursoActual[0].habilitado_manual;

        const [resultado] = await db.query(
            `UPDATE cursos SET habilitado_manual = $1 WHERE id = $2
             RETURNING id, nombre, habilitado_manual, fecha_inicio, fecha_fin`,
            [nuevoEstado, id]
        );

        res.json({
            success: true,
            message: `Curso ${nuevoEstado ? 'habilitado' : 'deshabilitado'} exitosamente`,
            data: resultado[0]
        });
    } catch (error) {
        console.error('❌ Error en toggle-habilitado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cambiar estado del curso'
        });
    }
});

/**
 * PUT /api/cursos/:id/programar
 * Programar fechas de inicio/fin de un curso (solo TALENTO HUMANO)
 */
router.put('/:id/programar', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha_inicio, fecha_fin, habilitado_manual } = req.body;
        const { proceso_name } = req.user;

        if (!esProcesoTH(proceso_name)) {
            return res.status(403).json({
                success: false,
                message: "Solo Talento Humano puede programar cursos"
            });
        }

        const [cursoExistente] = await db.query(
            `SELECT id FROM cursos WHERE id = $1 AND estado = 'aprobado'`,
            [id]
        );

        if (cursoExistente.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Curso no encontrado o no está aprobado"
            });
        }

        if (fecha_inicio && fecha_fin && new Date(fecha_fin) <= new Date(fecha_inicio)) {
            return res.status(400).json({
                success: false,
                message: "La fecha de fin debe ser posterior a la fecha de inicio"
            });
        }

        const [resultado] = await db.query(
            `UPDATE cursos
             SET fecha_inicio = $1,
                 fecha_fin = $2,
                 habilitado_manual = COALESCE($3, habilitado_manual)
             WHERE id = $4
             RETURNING id, nombre, fecha_inicio, fecha_fin, habilitado_manual`,
            [fecha_inicio || null, fecha_fin || null, habilitado_manual !== undefined ? habilitado_manual : null, id]
        );

        res.json({
            success: true,
            message: "Programación del curso actualizada exitosamente",
            data: resultado[0]
        });
    } catch (error) {
        console.error('❌ Error en programar curso:', error);
        res.status(500).json({
            success: false,
            message: 'Error al programar curso'
        });
    }
});

export default router;