import express from 'express';
import db from '../db.js';
import { esProcesoTH } from '../middlewares/esProcesoTH.js';
import { authenticateAdminProceso, getProcesosFromToken } from '../middlewares/adminProcesoAuth.js';

const router = express.Router();

/**
 * GET /api/inscripciones/curso/:cursoId
 * Obtener todas las inscripciones de un curso (solo admin de proceso)
 */
router.get('/curso/:cursoId', authenticateAdminProceso, async (req, res) => {
    try {
        const { cursoId } = req.params;
        const { proceso_name } = req.user;

        console.log('🔍 GET /api/inscripciones/curso/:cursoId');
        console.log('  cursoId:', cursoId);
        console.log('  proceso_name:', proceso_name);

        // Validar que el curso pertenezca al proceso del admin
        const [cursoValidacion] = await db.query(
            `SELECT c.id FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             WHERE c.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [cursoId, proceso_name]
        );

        console.log('  Validación de curso:', cursoValidacion.length > 0 ? '✅' : '❌');

        if (cursoValidacion.length === 0) {
            console.log('  ❌ Curso no pertenece al proceso:', proceso_name);
            return res.status(403).json({
                success: false,
                message: "No tienes permiso para ver las inscripciones de este curso"
            });
        }

        // Obtener inscripciones
        const [inscripciones] = await db.query(
            `SELECT i.id, i.usuario_id, i.curso_id, i.fecha_inscripcion, i.estado,
                    p.nombre as usuario_nombre, p.cedula_identidad, p.proceso
             FROM inscripciones i
             JOIN personal p ON i.usuario_id = p.id
             WHERE i.curso_id = $1
             ORDER BY i.fecha_inscripcion DESC`,
            [cursoId]
        );

        console.log('  ✅ Inscripciones obtenidas:', inscripciones.length);

        res.json({
            success: true,
            data: inscripciones
        });

    } catch (error) {
        console.error("❌ Error obteniendo inscripciones:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener inscripciones"
        });
    }
});

/**
 * GET /api/inscripciones/usuario/:usuarioId
 * Obtener todas las inscripciones de un usuario
 */
router.get('/usuario/:usuarioId', getProcesosFromToken, async (req, res) => {
    try {
        const { usuarioId } = req.params;
        const { userId } = req.user;

        // Validar que el usuario vea solo sus propias inscripciones
        if (parseInt(usuarioId) !== userId && req.user.role !== 'admin_proceso') {
            return res.status(403).json({
                success: false,
                message: "No tienes permiso para ver estas inscripciones"
            });
        }

        const [inscripciones] = await db.query(
            `SELECT i.id, i.usuario_id, i.curso_id, i.fecha_inscripcion, i.estado,
                    c.nombre as curso_nombre, c.descripcion, c.fecha_fin, p.nombre as proceso
             FROM inscripciones i
             JOIN cursos c ON i.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE i.usuario_id = $1
             ORDER BY i.fecha_inscripcion DESC`,
            [usuarioId]
        );

        res.json({
            success: true,
            data: inscripciones
        });

    } catch (error) {
        console.error("Error obteniendo inscripciones del usuario:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener inscripciones"
        });
    }
});

/**
 * GET /api/inscripciones/mis-capacitaciones
 * Usuario autenticado: sus cursos con estado + mejor nota de evaluación
 */
router.get('/mis-capacitaciones', getProcesosFromToken, async (req, res) => {
    try {
        const { userId } = req.user;

        const [inscripciones] = await db.query(
            `SELECT
                i.id,
                i.usuario_id,
                i.curso_id,
                i.fecha_inscripcion,
                i.estado,
                c.nombre          AS curso_nombre,
                c.descripcion,
                c.fecha_inicio,
                c.fecha_fin,
                c.habilitado_manual,
                c.anio,
                c.cursos_base_id,
                p.nombre          AS proceso,
                (
                    SELECT ie2.puntaje
                    FROM intentos_evaluacion ie2
                    WHERE ie2.usuario_id = i.usuario_id
                      AND ie2.curso_id   = i.curso_id
                    ORDER BY ie2.puntaje DESC
                    LIMIT 1
                ) AS mejor_puntaje,
                (
                    SELECT ie2.aprobado
                    FROM intentos_evaluacion ie2
                    WHERE ie2.usuario_id = i.usuario_id
                      AND ie2.curso_id   = i.curso_id
                    ORDER BY ie2.puntaje DESC
                    LIMIT 1
                ) AS evaluacion_aprobada
             FROM inscripciones i
             JOIN cursos c  ON i.curso_id   = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE i.usuario_id = $1
             ORDER BY i.fecha_inscripcion DESC`,
            [userId]
        );

        res.json({ success: true, data: inscripciones });
    } catch (error) {
        console.error('Error obteniendo mis capacitaciones:', error);
        res.status(500).json({ success: false, message: 'Error al obtener capacitaciones' });
    }
});

/**
 * GET /api/inscripciones/asistencia/proceso
 * Admin proceso: tabla de asistencia de todos los usuarios inscritos en cursos de su proceso
 */
router.get('/asistencia/proceso', authenticateAdminProceso, async (req, res) => {
    try {
        const { proceso_name } = req.user;

        const [asistencia] = await db.query(
            `SELECT
                i.id,
                i.estado,
                i.fecha_inscripcion,
                i.inicio_en,
                i.fin_en,
                p.nombre            AS usuario_nombre,
                COALESCE(p.cargo, '—') AS usuario_cargo,
                p.cedula_identidad,
                p.proceso           AS usuario_proceso,
                c.nombre            AS curso_nombre,
                c.id                AS curso_id,
                c.descripcion       AS curso_descripcion,
                c.fecha_inicio      AS curso_fecha_inicio,
                c.dirigido_a        AS curso_dirigido_a,
                c.duracion          AS curso_duracion,
                pr.nombre           AS curso_proceso,
                                c.anio              AS curso_anio,
                                EXISTS (
                                        SELECT 1
                                        FROM intentos_evaluacion ie
                                        WHERE ie.usuario_id = i.usuario_id
                                            AND ie.curso_id = i.curso_id
                                            AND ie.aprobado = true
                                ) AS evaluacion_aprobada
             FROM inscripciones i
             JOIN personal p  ON i.usuario_id  = p.id
             JOIN cursos c           ON i.curso_id    = c.id
             JOIN procesos pr        ON c.proceso_id  = pr.id
             WHERE LOWER(TRIM(pr.nombre)) = LOWER(TRIM($1))
             ORDER BY i.inicio_en DESC NULLS LAST, i.fecha_inscripcion DESC`,
            [proceso_name]
        );

        res.json({ success: true, data: asistencia });
    } catch (error) {
        console.error('Error obteniendo asistencia:', error);
        res.status(500).json({ success: false, message: 'Error al obtener asistencia' });
    }
});

/**
 * GET /api/inscripciones/asistencia/cursos-estaticos
 * Admin de Talento Humano: una sola asistencia para los 4 cursos estáticos;
 * lista a los usuarios que completaron los 4.
 */
router.get('/asistencia/cursos-estaticos', authenticateAdminProceso, async (req, res) => {
    try {
        const { proceso_name } = req.user;

        if (!esProcesoTH(proceso_name)) {
            return res.status(403).json({
                success: false,
                message: 'Esta asistencia solo está disponible para Talento Humano'
            });
        }

        const [asistencia] = await db.query(
            `SELECT
                MIN(pc.nombre)                 AS usuario_nombre,
                COALESCE(MIN(p.cargo), '—')    AS usuario_cargo,
                COALESCE(MIN(p.cedula_identidad), '—') AS cedula_identidad,
                'Talento Humano'               AS usuario_proceso,
                'tthh-estaticos'               AS curso_id,
                'Igualdad, Equidad y Derechos Laborales en el Entorno de Trabajo' AS curso_nombre,
                DATE '2026-05-11'               AS curso_fecha_inicio,
                '40 horas'                      AS curso_duracion,
                '1. Derechos laborales de mujeres y hombres \n2. Igualdad de Género \n3. Erradicación de violencia y No discriminación en un centro de trabajo \n4. Otros relacionados para establecer el trabajo de igual valor' AS curso_descripcion,
                'Todo el personal'              AS curso_dirigido_a,
                'Talento Humano'                AS curso_proceso,
                MAX(pc.fecha_completado)        AS inicio_en,
                'completado'                    AS estado,
                TRUE                            AS evaluacion_aprobada
             FROM cursos_completados pc
             LEFT JOIN personal p ON LOWER(TRIM(p.nombre)) = LOWER(TRIM(pc.nombre))
             WHERE pc.curso IN ('derechos_laborales', 'igualdad_genero',
                               'erradicacion_Violencia', 'otrosRelacionados')
             GROUP BY LOWER(TRIM(pc.nombre))
             HAVING COUNT(DISTINCT pc.curso) = 4
             ORDER BY MAX(pc.fecha_completado) DESC`,
            []
        );

        res.json({ success: true, data: asistencia });
    } catch (error) {
        console.error('Error obteniendo asistencia de cursos estáticos:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo asistencia' });
    }
});

/**
 * POST /api/inscripciones
 * Inscribir un usuario en un curso (por usuario o admin)
 */
router.post('/', async (req, res) => {
    try {
        const { usuario_id, curso_id, estado } = req.body;
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        console.log('📝 POST /api/inscripciones');
        console.log('  Body recibido:', req.body);
        console.log('  usuario_id:', usuario_id, 'tipo:', typeof usuario_id);
        console.log('  curso_id:', curso_id, 'tipo:', typeof curso_id);
        console.log('  estado:', estado);

        // Validar datos
        if (!usuario_id || !curso_id) {
            console.log('❌ Validación fallida - faltan usuario_id o curso_id');
            return res.status(400).json({
                success: false,
                message: "usuario_id y curso_id son requeridos",
                debug: { usuario_id, curso_id }
            });
        }

        // Verificar que el usuario exista
        const [usuarioExiste] = await db.query(
            "SELECT id FROM personal WHERE id = $1",
            [usuario_id]
        );

        if (usuarioExiste.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Usuario no encontrado"
            });
        }

        // Verificar que el curso exista y esté activo
        const [cursoExiste] = await db.query(
            "SELECT id FROM cursos WHERE id = $1 AND activo = true",
            [curso_id]
        );

        if (cursoExiste.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Curso no encontrado o está inactivo"
            });
        }

        // Verificar si ya está inscrito
        const [yaInscrito] = await db.query(
            "SELECT id FROM inscripciones WHERE usuario_id = $1 AND curso_id = $2",
            [usuario_id, curso_id]
        );

        if (yaInscrito.length > 0) {
            return res.status(409).json({
                success: false,
                message: "El usuario ya está inscrito en este curso"
            });
        }

        // Determinar el estado inicial (permitir que admin especifique)
        let estadoInicial = 'no iniciado';
        if (estado && ['no iniciado', 'en progreso', 'completado'].includes(estado)) {
            estadoInicial = estado;
        }

        // Crear inscripción
        const [resultado] = await db.query(
            `INSERT INTO inscripciones (usuario_id, curso_id, estado)
             VALUES ($1, $2, $3)
             RETURNING id, usuario_id, curso_id, fecha_inscripcion, estado`,
            [usuario_id, curso_id, estadoInicial]
        );

        res.status(201).json({
            success: true,
            message: "Usuario inscrito exitosamente",
            data: resultado[0]
        });

    } catch (error) {
        console.error("Error inscribiendo usuario:", error);
        res.status(500).json({
            success: false,
            message: "Error al inscribir usuario"
        });
    }
});

/**
 * PUT /api/inscripciones/:id
 * Actualizar estado de inscripción (usuarios o admin)
 */
router.put('/:id', getProcesosFromToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const { userId, role } = req.user;

        console.log('🔄 PUT /api/inscripciones/:id');
        console.log('  inscripción ID:', id);
        console.log('  nuevo estado:', estado);
        console.log('  usuario role:', role);
        console.log('  userId:', userId);

        // Validar estado
        const estadosValidos = ['no iniciado', 'en progreso', 'completado'];
        if (!estadosValidos.includes(estado)) {
            return res.status(400).json({
                success: false,
                message: `Estado inválido. Debe ser: ${estadosValidos.join(', ')}`
            });
        }

        // Obtener datos de la inscripción
        const [inscripcionData] = await db.query(
            `SELECT i.id, i.usuario_id, i.curso_id FROM inscripciones i WHERE i.id = $1`,
            [id]
        );

        if (inscripcionData.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Inscripción no encontrada"
            });
        }

        const inscripcion = inscripcionData[0];
        const esAdmin = role === 'admin_proceso';
        const esUsuarioPropio = inscripcion.usuario_id === userId;

        console.log('  inscripción usuario_id:', inscripcion.usuario_id);
        console.log('  ¿es admin?:', esAdmin);
        console.log('  ¿es usuario propio?:', esUsuarioPropio);

        // Validar permiso: admin puede cambiar cualquier inscripción, usuario solo la propia
        if (!esAdmin && !esUsuarioPropio) {
            console.log('  ❌ Permiso denegado');
            return res.status(403).json({
                success: false,
                message: "No tienes permiso para actualizar esta inscripción"
            });
        }

        // Si es usuario, solo puede cambiar a 'en progreso' o 'completado'
        if (!esAdmin && estado === 'no iniciado') {
            return res.status(400).json({
                success: false,
                message: "Los usuarios no pueden cambiar el estado a 'No iniciado'"
            });
        }

        // Actualizar inscripción y registrar timestamps según el estado
        const [resultado] = await db.query(
            `UPDATE inscripciones
             SET estado    = $1::varchar,
                 inicio_en = CASE
                               WHEN $1::varchar = 'en progreso'
                               THEN COALESCE(inicio_en, NOW() AT TIME ZONE 'America/Guayaquil')
                               ELSE inicio_en
                             END,
                 fin_en    = CASE
                               WHEN $1::varchar = 'completado'
                               THEN NOW() AT TIME ZONE 'America/Guayaquil'
                               ELSE fin_en
                             END
             WHERE id = $2
             RETURNING id, usuario_id, curso_id, fecha_inscripcion, estado, inicio_en, fin_en`,
            [estado, id]
        );

        console.log('  ✅ Inscripción actualizada exitosamente');

        res.json({
            success: true,
            message: "Inscripción actualizada exitosamente",
            data: resultado[0]
        });

    } catch (error) {
        console.error("Error actualizando inscripción:", error);
        res.status(500).json({
            success: false,
            message: "Error al actualizar inscripción"
        });
    }
});

/**
 * DELETE /api/inscripciones/:id
 * Eliminar inscripción (cancela la inscripción)
 */
router.delete('/:id', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { proceso_name } = req.user;

        // Validar que la inscripción pertenezca a un curso del proceso del admin
        const [inscripcionValidacion] = await db.query(
            `SELECT i.id FROM inscripciones i
             JOIN cursos c ON i.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE i.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [id, proceso_name]
        );

        if (inscripcionValidacion.length === 0) {
            return res.status(403).json({
                success: false,
                message: "No tienes permiso para eliminar esta inscripción"
            });
        }

        // Eliminar inscripción
        await db.query("DELETE FROM inscripciones WHERE id = $1", [id]);

        res.json({
            success: true,
            message: "Inscripción eliminada exitosamente"
        });

    } catch (error) {
        console.error("Error eliminando inscripción:", error);
        res.status(500).json({
            success: false,
            message: "Error al eliminar inscripción"
        });
    }
});

export default router;
