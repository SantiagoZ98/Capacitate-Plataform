import express from 'express';
import db from '../db.js';
import { authenticateAdminProceso, getProcesosFromToken } from '../middlewares/adminProcesoAuth.js';

const router = express.Router();

// ================================================================
// RUTAS ESTÁTICAS (deben ir ANTES de las rutas con parámetros :id)
// ================================================================

/**
 * GET /api/evaluaciones/resultados/mis-cursos
 * Admin de proceso: resultados de evaluaciones de SUS cursos (autenticado)
 */
router.get('/resultados/mis-cursos', authenticateAdminProceso, async (req, res) => {
    try {
        const { proceso_name } = req.user;

        const [resultados] = await db.query(
            `SELECT
                ie.id,
                ie.usuario_id,
                p.nombre AS usuario_nombre,
                p.cedula_identidad,
                c.nombre AS curso_nombre,
                e.titulo AS evaluacion_titulo,
                e.calificacion_minima,
                ie.puntaje,
                ie.aprobado,
                ie.intento_numero,
                ie.fecha_intento,
                ue.bloqueado,
                ue.intentos_usados,
                ue.rehabilitado_en,
                ie.evaluacion_id,
                ie.curso_id
             FROM intentos_evaluacion ie
             JOIN evaluacion_user_estado ue
               ON ie.usuario_id = ue.usuario_id AND ie.evaluacion_id = ue.evaluacion_id
             JOIN evaluaciones e ON ie.evaluacion_id = e.id
             JOIN cursos c ON ie.curso_id = c.id
             JOIN procesos pr ON c.proceso_id = pr.id
             JOIN personal p ON ie.usuario_id = p.id
             WHERE LOWER(TRIM(pr.nombre)) = LOWER(TRIM($1))
             ORDER BY ie.fecha_intento DESC`,
            [proceso_name]
        );

        res.json({ success: true, data: resultados });
    } catch (error) {
        console.error('Error obteniendo mis resultados:', error);
        res.status(500).json({ success: false, message: 'Error al obtener resultados' });
    }
});

/**
 * GET /api/evaluaciones/resultados/proceso/:proceso
 * Para Talento Humano: resultados de evaluaciones de un proceso
 */
router.get('/resultados/proceso/:proceso', async (req, res) => {
    try {
        const { proceso } = req.params;

        const [resultados] = await db.query(
            `SELECT
                ie.id,
                ie.usuario_id,
                p.nombre AS usuario_nombre,
                p.cedula_identidad,
                c.nombre AS curso_nombre,
                e.titulo AS evaluacion_titulo,
                e.calificacion_minima,
                ie.puntaje,
                ie.aprobado,
                ie.intento_numero,
                ie.fecha_intento,
                ue.bloqueado,
                ue.intentos_usados,
                ue.rehabilitado_en,
                ie.evaluacion_id,
                ie.curso_id
             FROM intentos_evaluacion ie
             JOIN evaluacion_user_estado ue
               ON ie.usuario_id = ue.usuario_id AND ie.evaluacion_id = ue.evaluacion_id
             JOIN evaluaciones e ON ie.evaluacion_id = e.id
             JOIN cursos c ON ie.curso_id = c.id
             JOIN procesos pr ON c.proceso_id = pr.id
             JOIN personal p ON ie.usuario_id = p.id
             WHERE LOWER(TRIM(pr.nombre)) = LOWER(TRIM($1))
             ORDER BY ie.fecha_intento DESC`,
            [proceso]
        );

        res.json({ success: true, data: resultados });
    } catch (error) {
        console.error('Error obteniendo resultados:', error);
        res.status(500).json({ success: false, message: 'Error al obtener resultados' });
    }
});

/**
 * GET /api/evaluaciones/resultados/curso/:cursoId
 * Resultados de evaluaciones de un curso (para admin proceso)
 */
router.get('/resultados/curso/:cursoId', authenticateAdminProceso, async (req, res) => {
    try {
        const { cursoId } = req.params;
        const { proceso_name } = req.user;

        const [cursoCheck] = await db.query(
            `SELECT c.id FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             WHERE c.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [cursoId, proceso_name]
        );
        if (cursoCheck.length === 0) {
            return res.status(403).json({ success: false, message: 'Sin permiso para este curso' });
        }

        const [resultados] = await db.query(
            `SELECT
                ie.id,
                ie.usuario_id,
                p.nombre AS usuario_nombre,
                p.cedula_identidad,
                e.titulo AS evaluacion_titulo,
                e.calificacion_minima,
                ie.puntaje,
                ie.aprobado,
                ie.intento_numero,
                ie.fecha_intento,
                ue.bloqueado,
                ue.intentos_usados,
                ie.evaluacion_id
             FROM intentos_evaluacion ie
             JOIN evaluacion_user_estado ue
               ON ie.usuario_id = ue.usuario_id AND ie.evaluacion_id = ue.evaluacion_id
             JOIN evaluaciones e ON ie.evaluacion_id = e.id
             JOIN personal p ON ie.usuario_id = p.id
             WHERE ie.curso_id = $1
             ORDER BY ie.fecha_intento DESC`,
            [cursoId]
        );

        res.json({ success: true, data: resultados });
    } catch (error) {
        console.error('Error obteniendo resultados del curso:', error);
        res.status(500).json({ success: false, message: 'Error al obtener resultados' });
    }
});

/**
 * GET /api/evaluaciones/curso/:cursoId
 * Obtener todas las evaluaciones de un curso
 */
router.get('/curso/:cursoId', async (req, res) => {
    try {
        const { cursoId } = req.params;

        const [evaluaciones] = await db.query(
            `SELECT id, curso_id, titulo, num_preguntas, calificacion_minima, tipo, creado_en
             FROM evaluaciones
             WHERE curso_id = $1
             ORDER BY creado_en DESC`,
            [cursoId]
        );

        res.json({
            success: true,
            data: evaluaciones
        });

    } catch (error) {
        console.error("Error obteniendo evaluaciones:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener evaluaciones"
        });
    }
});

/**
 * GET /api/evaluaciones/:id/completa
 * Evaluación con preguntas y opciones (SIN indicar cuál es correcta) — para usuario
 */
router.get('/:id/completa', getProcesosFromToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.user;

        const [evalRows] = await db.query(
            `SELECT id, curso_id, titulo, num_preguntas, calificacion_minima, tipo
             FROM evaluaciones WHERE id = $1`,
            [id]
        );
        if (evalRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
        }
        const evalData = evalRows[0];

        const [estadoRows] = await db.query(
            `SELECT intentos_usados, bloqueado, aprobado, rehabilitado_en
             FROM evaluacion_user_estado
             WHERE usuario_id = $1 AND evaluacion_id = $2`,
            [userId, id]
        );
        const estado = estadoRows[0] || { intentos_usados: 0, bloqueado: false, aprobado: false };

        // Si es crucigrama, devolver pistas sin respuestas
        if (evalData.tipo === 'crucigrama') {
            const [pistas] = await db.query(
                `SELECT id, numero, pista, direccion, fila, columna,
                        LENGTH(respuesta) AS longitud
                 FROM crucigrama_pistas
                 WHERE evaluacion_id = $1
                 ORDER BY numero ASC`,
                [id]
            );
            return res.json({
                success: true,
                data: { evaluacion: evalData, pistas, estado }
            });
        }

        const [preguntas] = await db.query(
            `SELECT id, texto, orden FROM preguntas_evaluacion
             WHERE evaluacion_id = $1 ORDER BY orden ASC`,
            [id]
        );

        const preguntaIds = preguntas.map(p => p.id);
        let opciones = [];
        if (preguntaIds.length > 0) {
            [opciones] = await db.query(
                `SELECT id, pregunta_id, texto FROM opciones_pregunta
                 WHERE pregunta_id = ANY($1::int[]) ORDER BY id ASC`,
                [preguntaIds]
            );
        }

        res.json({
            success: true,
            data: {
                evaluacion: evalData,
                preguntas: preguntas.map(p => ({
                    ...p,
                    opciones: opciones.filter(o => o.pregunta_id === p.id)
                })),
                estado
            }
        });
    } catch (error) {
        console.error('Error obteniendo evaluación completa:', error);
        res.status(500).json({ success: false, message: 'Error al obtener evaluación' });
    }
});

/**
 * GET /api/evaluaciones/:id/para-editar
 * Evaluación con preguntas + opciones incluyendo cuál es correcta (solo admin)
 */
router.get('/:id/para-editar', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { proceso_name } = req.user;

        const [check] = await db.query(
            `SELECT e.id FROM evaluaciones e
             JOIN cursos c ON e.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE e.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [id, proceso_name]
        );
        if (check.length === 0) {
            return res.status(403).json({ success: false, message: 'Sin permiso para esta evaluación' });
        }

        const [evalRows] = await db.query(
            `SELECT id, curso_id, titulo, num_preguntas, calificacion_minima, tipo, creado_en
             FROM evaluaciones WHERE id = $1`,
            [id]
        );

        // Para crucigrama, devolver pistas con respuestas (admin puede ver todo)
        if (evalRows[0]?.tipo === 'crucigrama') {
            const [pistas] = await db.query(
                `SELECT id, numero, pista, respuesta, direccion, fila, columna
                 FROM crucigrama_pistas
                 WHERE evaluacion_id = $1 ORDER BY numero ASC`,
                [id]
            );
            return res.json({
                success: true,
                data: { evaluacion: evalRows[0], pistas }
            });
        }

        const [preguntas] = await db.query(
            `SELECT id, texto, orden FROM preguntas_evaluacion
             WHERE evaluacion_id = $1 ORDER BY orden ASC`,
            [id]
        );

        const preguntaIds = preguntas.map(p => p.id);
        let opciones = [];
        if (preguntaIds.length > 0) {
            [opciones] = await db.query(
                `SELECT id, pregunta_id, texto, es_correcta FROM opciones_pregunta
                 WHERE pregunta_id = ANY($1::int[]) ORDER BY id ASC`,
                [preguntaIds]
            );
        }

        res.json({
            success: true,
            data: {
                evaluacion: evalRows[0],
                preguntas: preguntas.map(p => ({
                    ...p,
                    opciones: opciones.filter(o => o.pregunta_id === p.id)
                }))
            }
        });
    } catch (error) {
        console.error('Error obteniendo evaluación para editar:', error);
        res.status(500).json({ success: false, message: 'Error al obtener evaluación' });
    }
});

/**
 * GET /api/evaluaciones/:id/estado/:usuarioId
 * Estado de la evaluación para un usuario
 */
router.get('/:id/estado/:usuarioId', getProcesosFromToken, async (req, res) => {
    try {
        const { id, usuarioId } = req.params;
        const { userId, role } = req.user;

        if (parseInt(usuarioId) !== userId && role !== 'admin_proceso') {
            return res.status(403).json({ success: false, message: 'Sin permiso' });
        }

        const [estadoRows] = await db.query(
            `SELECT intentos_usados, bloqueado, aprobado, rehabilitado_en
             FROM evaluacion_user_estado
             WHERE usuario_id = $1 AND evaluacion_id = $2`,
            [usuarioId, id]
        );

        res.json({
            success: true,
            data: estadoRows[0] || { intentos_usados: 0, bloqueado: false, aprobado: false }
        });
    } catch (error) {
        console.error('Error obteniendo estado:', error);
        res.status(500).json({ success: false, message: 'Error al obtener estado' });
    }
});

/**
 * GET /api/evaluaciones/:id
 * Obtener detalle básico de una evaluación
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [evaluaciones] = await db.query(
            'SELECT * FROM evaluaciones WHERE id = $1',
            [id]
        );

        if (evaluaciones.length === 0) {
            return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
        }

        res.json({ success: true, data: evaluaciones[0] });
    } catch (error) {
        console.error('Error obteniendo evaluación:', error);
        res.status(500).json({ success: false, message: 'Error al obtener evaluación' });
    }
});

// ================================================================
// CRUD DE EVALUACIÓN (admin proceso)
// ================================================================

/**
 * POST /api/evaluaciones
 * Crear evaluación base para un curso
 */
router.post('/', authenticateAdminProceso, async (req, res) => {
    try {
        const { curso_id, titulo, calificacion_minima } = req.body;
        const { proceso_name } = req.user;

        if (!curso_id || !titulo) {
            return res.status(400).json({ success: false, message: 'curso_id y titulo son requeridos' });
        }

        const [cursoValidacion] = await db.query(
            `SELECT c.id FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             WHERE c.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [curso_id, proceso_name]
        );
        if (cursoValidacion.length === 0) {
            return res.status(403).json({ success: false, message: 'Sin permiso para este curso' });
        }

        const [existente] = await db.query(
            'SELECT id FROM evaluaciones WHERE curso_id = $1',
            [curso_id]
        );
        if (existente.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Ya existe una evaluación para este curso. Edítala en lugar de crear una nueva.'
            });
        }

        const [resultado] = await db.query(
            `INSERT INTO evaluaciones (curso_id, titulo, calificacion_minima, tipo)
             VALUES ($1, $2, $3, $4)
             RETURNING id, curso_id, titulo, calificacion_minima, tipo, creado_en`,
            [curso_id, titulo.trim(), calificacion_minima || 70, req.body.tipo || 'opcion_multiple']
        );

        res.status(201).json({ success: true, message: 'Evaluación creada', data: resultado[0] });
    } catch (error) {
        console.error('Error creando evaluación:', error);
        res.status(500).json({ success: false, message: 'Error al crear evaluación' });
    }
});

/**
 * PUT /api/evaluaciones/:id/rehabilitar/:usuarioId
 * Talento Humano rehabilita los intentos de un usuario
 */
router.put('/:id/rehabilitar/:usuarioId', async (req, res) => {
    try {
        const { id, usuarioId } = req.params;
        const { rehabilitado_por } = req.body;

        const [estadoRows] = await db.query(
            `SELECT intentos_usados FROM evaluacion_user_estado
             WHERE usuario_id = $1 AND evaluacion_id = $2`,
            [usuarioId, id]
        );

        if (estadoRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No se encontró registro de esta evaluación para el usuario'
            });
        }

        await db.query(
            `UPDATE evaluacion_user_estado
             SET intentos_usados = 0,
                 bloqueado = FALSE,
                 aprobado = FALSE,
                 rehabilitado_por = $1,
                 rehabilitado_en = (NOW() AT TIME ZONE 'America/Guayaquil')
             WHERE usuario_id = $2 AND evaluacion_id = $3`,
            [rehabilitado_por || null, usuarioId, id]
        );

        res.json({ success: true, message: 'Evaluación rehabilitada. El usuario puede volver a intentarla.' });
    } catch (error) {
        console.error('Error rehabilitando evaluación:', error);
        res.status(500).json({ success: false, message: 'Error al rehabilitar evaluación' });
    }
});

/**
 * PUT /api/evaluaciones/:id
 * Actualizar evaluación base
 */
router.put('/:id', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, calificacion_minima } = req.body;
        const { proceso_name } = req.user;

        const [check] = await db.query(
            `SELECT e.id FROM evaluaciones e
             JOIN cursos c ON e.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE e.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [id, proceso_name]
        );
        if (check.length === 0) {
            return res.status(403).json({ success: false, message: 'Sin permiso para esta evaluación' });
        }

        const { tipo } = req.body;
        const [resultado] = await db.query(
            `UPDATE evaluaciones
             SET titulo = COALESCE($1, titulo),
                 calificacion_minima = COALESCE($2, calificacion_minima),
                 tipo = COALESCE($4, tipo)
             WHERE id = $3
             RETURNING id, curso_id, titulo, calificacion_minima, tipo, creado_en`,
            [titulo, calificacion_minima, id, tipo || null]
        );

        res.json({ success: true, message: 'Evaluación actualizada', data: resultado[0] });
    } catch (error) {
        console.error('Error actualizando evaluación:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar evaluación' });
    }
});

/**
 * DELETE /api/evaluaciones/:id
 * Eliminar evaluación y todo su contenido
 */
router.delete('/:id', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { proceso_name } = req.user;

        const [check] = await db.query(
            `SELECT e.id FROM evaluaciones e
             JOIN cursos c ON e.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE e.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [id, proceso_name]
        );
        if (check.length === 0) {
            return res.status(403).json({ success: false, message: 'Sin permiso para esta evaluación' });
        }

        await db.query('DELETE FROM evaluaciones WHERE id = $1', [id]);
        res.json({ success: true, message: 'Evaluación eliminada' });
    } catch (error) {
        console.error('Error eliminando evaluación:', error);
        res.status(500).json({ success: false, message: 'Error al eliminar evaluación' });
    }
});

// ================================================================
// CRUD DE PREGUNTAS (sub-recurso de evaluación)
// ================================================================

/**
 * POST /api/evaluaciones/:id/preguntas
 * Agregar pregunta con opciones
 * Body: { texto, orden?, opciones: [{texto, es_correcta}] }
 */
router.post('/:id/preguntas', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { texto, orden, opciones } = req.body;
        const { proceso_name } = req.user;

        if (!texto || !opciones || opciones.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere texto y al menos 2 opciones de respuesta'
            });
        }

        const correctas = opciones.filter(o => o.es_correcta);
        if (correctas.length !== 1) {
            return res.status(400).json({
                success: false,
                message: 'Debe haber exactamente 1 opción correcta'
            });
        }

        const [check] = await db.query(
            `SELECT e.id FROM evaluaciones e
             JOIN cursos c ON e.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE e.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [id, proceso_name]
        );
        if (check.length === 0) {
            return res.status(403).json({ success: false, message: 'Sin permiso para esta evaluación' });
        }

        let ordenFinal = orden;
        if (ordenFinal === undefined || ordenFinal === null) {
            const [maxOrden] = await db.query(
                `SELECT COALESCE(MAX(orden), -1) + 1 AS siguiente
                 FROM preguntas_evaluacion WHERE evaluacion_id = $1`,
                [id]
            );
            ordenFinal = maxOrden[0].siguiente;
        }

        const [preguntaResult] = await db.query(
            `INSERT INTO preguntas_evaluacion (evaluacion_id, texto, orden)
             VALUES ($1, $2, $3) RETURNING id, evaluacion_id, texto, orden`,
            [id, texto.trim(), ordenFinal]
        );
        const pregunta = preguntaResult[0];

        const opcionesInsertadas = [];
        for (const opcion of opciones) {
            const [opResult] = await db.query(
                `INSERT INTO opciones_pregunta (pregunta_id, texto, es_correcta)
                 VALUES ($1, $2, $3) RETURNING id, pregunta_id, texto, es_correcta`,
                [pregunta.id, opcion.texto.trim(), opcion.es_correcta === true]
            );
            opcionesInsertadas.push(opResult[0]);
        }

        // Actualizar num_preguntas
        await db.query(
            `UPDATE evaluaciones SET num_preguntas = (
                SELECT COUNT(*) FROM preguntas_evaluacion WHERE evaluacion_id = $1
             ) WHERE id = $1`,
            [id]
        );

        res.status(201).json({
            success: true,
            message: 'Pregunta agregada',
            data: { ...pregunta, opciones: opcionesInsertadas }
        });
    } catch (error) {
        console.error('Error agregando pregunta:', error);
        res.status(500).json({ success: false, message: 'Error al agregar pregunta' });
    }
});

/**
 * PUT /api/evaluaciones/:id/preguntas/:preguntaId
 * Actualizar pregunta y sus opciones
 */
router.put('/:id/preguntas/:preguntaId', authenticateAdminProceso, async (req, res) => {
    try {
        const { id, preguntaId } = req.params;
        const { texto, opciones } = req.body;
        const { proceso_name } = req.user;

        const [check] = await db.query(
            `SELECT pe.id FROM preguntas_evaluacion pe
             JOIN evaluaciones e ON pe.evaluacion_id = e.id
             JOIN cursos c ON e.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE pe.id = $1 AND e.id = $2 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($3))`,
            [preguntaId, id, proceso_name]
        );
        if (check.length === 0) {
            return res.status(403).json({ success: false, message: 'Sin permiso o pregunta no encontrada' });
        }

        if (opciones) {
            const correctas = opciones.filter(o => o.es_correcta);
            if (correctas.length !== 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Debe haber exactamente 1 opción correcta'
                });
            }
        }

        if (texto) {
            await db.query(
                'UPDATE preguntas_evaluacion SET texto = $1 WHERE id = $2',
                [texto.trim(), preguntaId]
            );
        }

        if (opciones && opciones.length >= 2) {
            await db.query('DELETE FROM opciones_pregunta WHERE pregunta_id = $1', [preguntaId]);
            for (const opcion of opciones) {
                await db.query(
                    `INSERT INTO opciones_pregunta (pregunta_id, texto, es_correcta)
                     VALUES ($1, $2, $3)`,
                    [preguntaId, opcion.texto.trim(), opcion.es_correcta === true]
                );
            }
        }

        const [preguntaActualizada] = await db.query(
            'SELECT id, evaluacion_id, texto, orden FROM preguntas_evaluacion WHERE id = $1',
            [preguntaId]
        );
        const [opcionesActualizadas] = await db.query(
            'SELECT id, pregunta_id, texto, es_correcta FROM opciones_pregunta WHERE pregunta_id = $1 ORDER BY id ASC',
            [preguntaId]
        );

        res.json({
            success: true,
            message: 'Pregunta actualizada',
            data: { ...preguntaActualizada[0], opciones: opcionesActualizadas }
        });
    } catch (error) {
        console.error('Error actualizando pregunta:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar pregunta' });
    }
});

/**
 * DELETE /api/evaluaciones/:id/preguntas/:preguntaId
 * Eliminar pregunta
 */
router.delete('/:id/preguntas/:preguntaId', authenticateAdminProceso, async (req, res) => {
    try {
        const { id, preguntaId } = req.params;
        const { proceso_name } = req.user;

        const [check] = await db.query(
            `SELECT pe.id FROM preguntas_evaluacion pe
             JOIN evaluaciones e ON pe.evaluacion_id = e.id
             JOIN cursos c ON e.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE pe.id = $1 AND e.id = $2 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($3))`,
            [preguntaId, id, proceso_name]
        );
        if (check.length === 0) {
            return res.status(403).json({ success: false, message: 'Sin permiso o pregunta no encontrada' });
        }

        await db.query('DELETE FROM preguntas_evaluacion WHERE id = $1', [preguntaId]);

        await db.query(
            `UPDATE evaluaciones SET num_preguntas = (
                SELECT COUNT(*) FROM preguntas_evaluacion WHERE evaluacion_id = $1
             ) WHERE id = $1`,
            [id]
        );

        res.json({ success: true, message: 'Pregunta eliminada' });
    } catch (error) {
        console.error('Error eliminando pregunta:', error);
        res.status(500).json({ success: false, message: 'Error al eliminar pregunta' });
    }
});

// ================================================================
// SUBMIT DE EVALUACIÓN (usuario)
// ================================================================

/**
 * POST /api/evaluaciones/:id/submit
 * Enviar respuestas de evaluación
 * Body: { curso_id, respuestas: { [preguntaId]: opcionId } }
 */
router.post('/:id/submit', getProcesosFromToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { curso_id, respuestas } = req.body;
        const { userId } = req.user;

        if (!curso_id || !respuestas) {
            return res.status(400).json({ success: false, message: 'curso_id y respuestas son requeridos' });
        }

        // Verificar estado actual
        const [estadoRows] = await db.query(
            `SELECT intentos_usados, bloqueado, aprobado
             FROM evaluacion_user_estado
             WHERE usuario_id = $1 AND evaluacion_id = $2`,
            [userId, id]
        );
        const estadoActual = estadoRows[0] || { intentos_usados: 0, bloqueado: false, aprobado: false };

        if (estadoActual.bloqueado) {
            return res.status(403).json({
                success: false,
                bloqueado: true,
                message: 'Has agotado tus intentos. Solicita a Talento Humano que rehabilite tu evaluación.'
            });
        }
        if (estadoActual.aprobado) {
            return res.status(400).json({ success: false, message: 'Ya aprobaste esta evaluación.' });
        }

        // Obtener preguntas con opciones correctas
        const [preguntas] = await db.query(
            `SELECT pe.id AS pregunta_id, op.id AS opcion_id, op.es_correcta
             FROM preguntas_evaluacion pe
             JOIN opciones_pregunta op ON op.pregunta_id = pe.id
             WHERE pe.evaluacion_id = $1`,
            [id]
        );

        if (preguntas.length === 0) {
            return res.status(400).json({ success: false, message: 'La evaluación no tiene preguntas' });
        }

        // Calcular puntaje
        const preguntaIds = [...new Set(preguntas.map(p => p.pregunta_id))];
        const totalPreguntas = preguntaIds.length;
        let correctas = 0;

        for (const preguntaId of preguntaIds) {
            const opcionSeleccionadaId = parseInt(respuestas[preguntaId]);
            const opcionCorrecta = preguntas.find(
                p => p.pregunta_id === preguntaId && p.es_correcta === true
            );
            if (opcionCorrecta && opcionSeleccionadaId === opcionCorrecta.opcion_id) {
                correctas++;
            }
        }

        const puntaje = totalPreguntas > 0
            ? Math.round((correctas / totalPreguntas) * 100 * 100) / 100
            : 0;

        const [evalRows] = await db.query(
            'SELECT calificacion_minima FROM evaluaciones WHERE id = $1',
            [id]
        );
        const calMinima = evalRows[0]?.calificacion_minima || 70;
        const aprobado = puntaje >= calMinima;

        const intentoNumero = estadoActual.intentos_usados + 1;
        const nuevosIntentosUsados = intentoNumero;
        const nuevoBloqueado = !aprobado && nuevosIntentosUsados >= 2;

        // Guardar intento
        await db.query(
            `INSERT INTO intentos_evaluacion
             (usuario_id, evaluacion_id, curso_id, puntaje, aprobado, intento_numero, respuestas)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, id, curso_id, puntaje, aprobado, intentoNumero, JSON.stringify(respuestas)]
        );

        // Actualizar o crear estado
        await db.query(
            `INSERT INTO evaluacion_user_estado
             (usuario_id, evaluacion_id, intentos_usados, bloqueado, aprobado)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (usuario_id, evaluacion_id) DO UPDATE
             SET intentos_usados = $3, bloqueado = $4, aprobado = $5`,
            [userId, id, nuevosIntentosUsados, nuevoBloqueado, aprobado]
        );

        res.json({
            success: true,
            data: {
                puntaje,
                aprobado,
                correctas,
                totalPreguntas,
                calificacion_minima: calMinima,
                intentos_usados: nuevosIntentosUsados,
                bloqueado: nuevoBloqueado,
                intentos_restantes: aprobado || nuevoBloqueado ? 0 : Math.max(0, 2 - nuevosIntentosUsados)
            }
        });
    } catch (error) {
        console.error('Error al enviar evaluación:', error);
        res.status(500).json({ success: false, message: 'Error al procesar evaluación' });
    }
});

// ================================================================
// CRUD DE PISTAS DE CRUCIGRAMA (admin proceso)
// ================================================================

/**
 * GET /api/evaluaciones/:id/crucigrama-pistas
 * Obtener todas las pistas con respuestas (solo admin)
 */
router.get('/:id/crucigrama-pistas', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { proceso_name } = req.user;

        const [check] = await db.query(
            `SELECT e.id FROM evaluaciones e
             JOIN cursos c ON e.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE e.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [id, proceso_name]
        );
        if (check.length === 0) {
            return res.status(403).json({ success: false, message: 'Sin permiso para esta evaluación' });
        }

        const [pistas] = await db.query(
            `SELECT id, numero, pista, respuesta, direccion, fila, columna
             FROM crucigrama_pistas WHERE evaluacion_id = $1 ORDER BY numero ASC`,
            [id]
        );
        res.json({ success: true, data: pistas });
    } catch (error) {
        console.error('Error obteniendo pistas:', error);
        res.status(500).json({ success: false, message: 'Error al obtener pistas' });
    }
});

/**
 * POST /api/evaluaciones/:id/crucigrama-pistas/guardar
 * Guardar (reemplazar) todas las pistas del crucigrama (admin)
 * Body: { pistas: [{numero, pista, respuesta, direccion, fila, columna}] }
 */
router.post('/:id/crucigrama-pistas/guardar', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { pistas } = req.body;
        const { proceso_name } = req.user;

        if (!pistas || !Array.isArray(pistas) || pistas.length === 0) {
            return res.status(400).json({ success: false, message: 'Se requiere al menos una pista' });
        }

        const [check] = await db.query(
            `SELECT e.id FROM evaluaciones e
             JOIN cursos c ON e.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE e.id = $1 AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`,
            [id, proceso_name]
        );
        if (check.length === 0) {
            return res.status(403).json({ success: false, message: 'Sin permiso para esta evaluación' });
        }

        // Eliminar pistas anteriores y reinsertar
        await db.query('DELETE FROM crucigrama_pistas WHERE evaluacion_id = $1', [id]);

        for (const p of pistas) {
            await db.query(
                `INSERT INTO crucigrama_pistas (evaluacion_id, numero, pista, respuesta, direccion, fila, columna)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, p.numero, p.pista.trim(), p.respuesta.toUpperCase().trim(),
                 p.direccion, p.fila, p.columna]
            );
        }

        // Actualizar num_preguntas con el conteo de pistas
        await db.query(
            `UPDATE evaluaciones SET num_preguntas = $1, tipo = 'crucigrama' WHERE id = $2`,
            [pistas.length, id]
        );

        const [nuevasPistas] = await db.query(
            `SELECT id, numero, pista, respuesta, direccion, fila, columna
             FROM crucigrama_pistas WHERE evaluacion_id = $1 ORDER BY numero ASC`,
            [id]
        );
        res.json({ success: true, message: 'Crucigrama guardado', data: nuevasPistas });
    } catch (error) {
        console.error('Error guardando crucigrama:', error);
        res.status(500).json({ success: false, message: 'Error al guardar crucigrama' });
    }
});

/**
 * POST /api/evaluaciones/:id/submit-crucigrama
 * Enviar respuestas del crucigrama (usuario)
 * Body: { curso_id, respuestas: { [pistaId]: "PALABRA" } }
 */
router.post('/:id/submit-crucigrama', getProcesosFromToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { curso_id, respuestas } = req.body;
        const { userId } = req.user;

        if (!curso_id || !respuestas) {
            return res.status(400).json({ success: false, message: 'curso_id y respuestas son requeridos' });
        }

        // Verificar estado actual
        const [estadoRows] = await db.query(
            `SELECT intentos_usados, bloqueado, aprobado
             FROM evaluacion_user_estado
             WHERE usuario_id = $1 AND evaluacion_id = $2`,
            [userId, id]
        );
        const estadoActual = estadoRows[0] || { intentos_usados: 0, bloqueado: false, aprobado: false };

        if (estadoActual.bloqueado) {
            return res.status(403).json({
                success: false, bloqueado: true,
                message: 'Has agotado tus intentos.'
            });
        }
        if (estadoActual.aprobado) {
            return res.status(400).json({ success: false, message: 'Ya aprobaste esta evaluación.' });
        }

        // Obtener pistas con respuestas correctas
        const [pistas] = await db.query(
            `SELECT id, respuesta FROM crucigrama_pistas WHERE evaluacion_id = $1`,
            [id]
        );
        if (pistas.length === 0) {
            return res.status(400).json({ success: false, message: 'El crucigrama no tiene pistas' });
        }

        const totalPistas = pistas.length;
        let correctas = 0;

        for (const pista of pistas) {
            const respuestaUsuario = (respuestas[pista.id] || '').toUpperCase().trim();
            if (respuestaUsuario === pista.respuesta.toUpperCase().trim()) {
                correctas++;
            }
        }

        const puntaje = Math.round((correctas / totalPistas) * 100 * 100) / 100;

        const [evalRows] = await db.query(
            'SELECT calificacion_minima FROM evaluaciones WHERE id = $1', [id]
        );
        const calMinima = evalRows[0]?.calificacion_minima || 70;
        const aprobado = puntaje >= calMinima;

        const intentoNumero = estadoActual.intentos_usados + 1;
        const nuevosIntentosUsados = intentoNumero;
        const nuevoBloqueado = !aprobado && nuevosIntentosUsados >= 2;

        await db.query(
            `INSERT INTO intentos_evaluacion
             (usuario_id, evaluacion_id, curso_id, puntaje, aprobado, intento_numero, respuestas)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, id, curso_id, puntaje, aprobado, intentoNumero, JSON.stringify(respuestas)]
        );

        await db.query(
            `INSERT INTO evaluacion_user_estado
             (usuario_id, evaluacion_id, intentos_usados, bloqueado, aprobado)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (usuario_id, evaluacion_id) DO UPDATE
             SET intentos_usados = $3, bloqueado = $4, aprobado = $5`,
            [userId, id, nuevosIntentosUsados, nuevoBloqueado, aprobado]
        );

        res.json({
            success: true,
            data: {
                puntaje,
                aprobado,
                correctas,
                totalPreguntas: totalPistas,
                calificacion_minima: calMinima,
                intentos_usados: nuevosIntentosUsados,
                bloqueado: nuevoBloqueado,
                intentos_restantes: aprobado || nuevoBloqueado ? 0 : Math.max(0, 2 - nuevosIntentosUsados)
            }
        });
    } catch (error) {
        console.error('Error al enviar crucigrama:', error);
        res.status(500).json({ success: false, message: 'Error al procesar crucigrama' });
    }
});

export default router;
