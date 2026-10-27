/**
 * routes/versionCursos.js
 * ─────────────────────────────────────────────────────────────
 * Gestión del versionado anual de cursos.
 *
 * Endpoints:
 *  POST  /api/version-cursos/:cursoId/clonar          → Clonar curso al año siguiente
 *  GET   /api/version-cursos/:cursoBaseId/versiones   → Ver todas las versiones de un curso
 *  GET   /api/version-cursos/historial-usuario/:id    → Historial completo del usuario (todos los años)
 *  GET   /api/version-cursos/reporte/anio/:anio       → Reporte administrativo por año
 * ─────────────────────────────────────────────────────────────
 */

import express from 'express';
import db from '../db.js';
import { esProcesoTH } from '../middlewares/esProcesoTH.js';
import { authenticateAdminProceso, getProcesosFromToken } from '../middlewares/adminProcesoAuth.js';

const router = express.Router();

// ================================================================
// RUTAS ESTÁTICAS (antes de rutas con :params)
// ================================================================

/**
 * GET /api/version-cursos/historial-usuario/:usuarioId
 * Historial completo de un usuario: todos los cursos de todos los años
 * con módulos completados y resultados de evaluaciones de cada versión.
 */
router.get('/historial-usuario/:usuarioId', getProcesosFromToken, async (req, res) => {
    try {
        const { usuarioId } = req.params;
        const { userId, role } = req.user;

        // Solo el propio usuario o un admin puede ver el historial
        if (parseInt(usuarioId) !== userId && role !== 'admin_proceso') {
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para ver este historial'
            });
        }

        // Inscripciones con datos del curso (incluyendo año y versión base)
        const [inscripciones] = await db.query(
            `SELECT
                i.id                  AS inscripcion_id,
                i.curso_id,
                i.fecha_inscripcion,
                i.estado,
                i.inicio_en,
                i.fin_en,
                c.nombre              AS curso_nombre,
                c.descripcion,
                c.anio,
                c.cursos_base_id,
                p.nombre              AS proceso,
                -- Mejor puntaje de evaluación en esta versión
                (
                    SELECT ie.puntaje
                    FROM intentos_evaluacion ie
                    WHERE ie.usuario_id = i.usuario_id
                      AND ie.curso_id   = i.curso_id
                    ORDER BY ie.puntaje DESC
                    LIMIT 1
                ) AS mejor_puntaje,
                (
                    SELECT ie.aprobado
                    FROM intentos_evaluacion ie
                    WHERE ie.usuario_id = i.usuario_id
                      AND ie.curso_id   = i.curso_id
                    ORDER BY ie.puntaje DESC
                    LIMIT 1
                ) AS evaluacion_aprobada,
                -- Total de módulos del curso
                (SELECT COUNT(*) FROM modulos m WHERE m.curso_id = c.id) AS total_modulos,
                -- Módulos completados por el usuario en esa versión
                (
                    SELECT COUNT(*)
                    FROM progreso_modulos pm
                    WHERE pm.usuario_id = i.usuario_id
                      AND pm.curso_id   = i.curso_id
                ) AS modulos_completados
             FROM inscripciones i
             JOIN cursos  c ON i.curso_id   = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE i.usuario_id = $1
             ORDER BY c.anio DESC, i.fecha_inscripcion DESC`,
            [usuarioId]
        );

        // Agrupar por curso_base_id para mostrar el historial evolutivo
        const historialAgrupado = {};
        for (const row of inscripciones) {
            const baseId = row.cursos_base_id || row.curso_id;
            if (!historialAgrupado[baseId]) {
                historialAgrupado[baseId] = {
                    cursos_base_id: baseId,
                    curso_nombre: row.curso_nombre,
                    proceso: row.proceso,
                    versiones: []
                };
            }
            historialAgrupado[baseId].versiones.push({
                inscripcion_id:    row.inscripcion_id,
                curso_id:          row.curso_id,
                anio:              row.anio,
                estado:            row.estado,
                fecha_inscripcion: row.fecha_inscripcion,
                inicio_en:         row.inicio_en,
                fin_en:            row.fin_en,
                mejor_puntaje:     row.mejor_puntaje,
                evaluacion_aprobada: row.evaluacion_aprobada,
                total_modulos:     parseInt(row.total_modulos),
                modulos_completados: parseInt(row.modulos_completados)
            });
        }

        res.json({
            success: true,
            data: Object.values(historialAgrupado)
        });

    } catch (error) {
        console.error('❌ Error obteniendo historial de usuario:', error);
        res.status(500).json({ success: false, message: 'Error al obtener historial' });
    }
});

/**
 * GET /api/version-cursos/reporte/anio/:anio
 * Reporte administrativo por año: todos los cursos + inscripciones + aprobaciones
 * Solo Talento Humano o admin proceso del proceso solicitado.
 */
router.get('/reporte/anio/:anio', authenticateAdminProceso, async (req, res) => {
    try {
        const { anio } = req.params;
        const { proceso_name } = req.user;

        const anioNum = parseInt(anio);
        if (isNaN(anioNum) || anioNum < 2000 || anioNum > 2100) {
            return res.status(400).json({ success: false, message: 'Año inválido' });
        }

        // Talento Humano ve todos los procesos; otros solo el suyo
        const esTH = esProcesoTH(proceso_name);
        const filtroProcesso = esTH
            ? ''
            : `AND LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))`;
        const params = esTH ? [anioNum] : [anioNum, proceso_name];

        const [cursos] = await db.query(
            `SELECT
                c.id              AS curso_id,
                c.nombre          AS curso_nombre,
                c.anio,
                c.estado,
                c.activo,
                c.habilitado_manual,
                c.fecha_inicio,
                c.fecha_fin,
                p.nombre          AS proceso,
                a.nombre          AS creado_por,
                COUNT(DISTINCT i.id)                                    AS total_inscritos,
                COUNT(DISTINCT i.id) FILTER (WHERE i.estado = 'completado') AS completados,
                COUNT(DISTINCT ie.usuario_id) FILTER (WHERE ie.aprobado = true) AS aprobaron_evaluacion
             FROM cursos c
             JOIN procesos p     ON c.proceso_id  = p.id
             LEFT JOIN adminprocesos a ON c.creado_por  = a.id
             LEFT JOIN inscripciones i ON i.curso_id = c.id
             LEFT JOIN intentos_evaluacion ie ON ie.curso_id = c.id
             WHERE c.anio = $1
               AND c.estado = 'aprobado'
               ${filtroProcesso}
             GROUP BY c.id, c.nombre, c.anio, c.estado, c.activo,
                      c.habilitado_manual, c.fecha_inicio, c.fecha_fin,
                      p.nombre, a.nombre
             ORDER BY p.nombre, c.nombre`,
            params
        );

        // Años disponibles para el selector del frontend
        const [aniosDisponibles] = await db.query(
            `SELECT DISTINCT anio FROM cursos WHERE estado = 'aprobado' ORDER BY anio DESC`
        );

        res.json({
            success: true,
            anio: anioNum,
            data: cursos,
            anios_disponibles: aniosDisponibles.map(r => r.anio)
        });

    } catch (error) {
        console.error('❌ Error en reporte por año:', error);
        res.status(500).json({ success: false, message: 'Error al generar reporte' });
    }
});

// ================================================================
// RUTAS CON PARÁMETROS
// ================================================================

/**
 * GET /api/version-cursos/:cursoBaseId/versiones
 * Lista todas las versiones (años) de un curso base.
 * Incluye número de inscritos y estado por versión.
 */
router.get('/:cursoBaseId/versiones', authenticateAdminProceso, async (req, res) => {
    try {
        const { cursoBaseId } = req.params;
        const { proceso_name } = req.user;

        const [versiones] = await db.query(
            `SELECT
                c.id,
                c.nombre,
                c.anio,
                c.estado,
                c.activo,
                c.habilitado_manual,
                c.fecha_inicio,
                c.fecha_fin,
                c.creado_en,
                COUNT(DISTINCT m.id)  AS total_modulos,
                COUNT(DISTINCT e.id)  AS total_evaluaciones,
                COUNT(DISTINCT i.id)  AS total_inscritos
             FROM cursos c
             JOIN procesos p       ON c.proceso_id = p.id
             LEFT JOIN modulos m   ON m.curso_id   = c.id
             LEFT JOIN evaluaciones e ON e.curso_id = c.id
             LEFT JOIN inscripciones i ON i.curso_id = c.id
             WHERE c.cursos_base_id = $1
               AND (
                   $2 IN ('Talento Humano', 'Administrador')
                   OR LOWER(TRIM(p.nombre)) = LOWER(TRIM($2))
               )
             GROUP BY c.id, c.nombre, c.anio, c.estado, c.activo,
                      c.habilitado_manual, c.fecha_inicio, c.fecha_fin, c.creado_en
             ORDER BY c.anio DESC`,
            [cursoBaseId, proceso_name]
        );

        if (versiones.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Curso base no encontrado o sin permiso'
            });
        }

        res.json({ success: true, data: versiones });

    } catch (error) {
        console.error('❌ Error obteniendo versiones del curso:', error);
        res.status(500).json({ success: false, message: 'Error al obtener versiones' });
    }
});

/**
 * POST /api/version-cursos/:cursoId/clonar
 * Clona un curso al año siguiente (o al año indicado).
 * Copia: curso → módulos → evaluaciones → preguntas → opciones.
 * La nueva versión queda en estado 'borrador', inactiva.
 *
 * Body: { anio_destino?: number }  (opcional; por defecto añoActual + 1)
 */
router.post('/:cursoId/clonar', authenticateAdminProceso, async (req, res) => {
    const { cursoId } = req.params;
    const { id: adminId, proceso_name } = req.user;

    const anioActual = new Date().getFullYear();
    const anioDestino = parseInt(req.body.anio_destino) || anioActual + 1;

    if (anioDestino < anioActual || anioDestino > anioActual + 5) {
        return res.status(400).json({
            success: false,
            message: `El año destino debe estar entre ${anioActual} y ${anioActual + 5}`
        });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener curso original y validar permiso de proceso
        const { rows: cursos } = await client.query(
            `SELECT c.*, p.nombre AS proceso_nombre
             FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             WHERE c.id = $1`,
            [cursoId]
        );

        if (cursos.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Curso no encontrado' });
        }

        const original = cursos[0];

        // Validar que el admin sea del mismo proceso (excepto TH)
        if (!esProcesoTH(proceso_name) &&
            original.proceso_nombre.toLowerCase().trim() !== proceso_name.toLowerCase().trim()) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'No tienes permiso sobre este curso' });
        }

        // 2. El curso_base_id para la nueva versión (cadena de versiones)
        const cursoBaseId = original.cursos_base_id || original.id;

        // 3. Verificar que no exista ya una versión para ese año
        const { rows: yaExiste } = await client.query(
            'SELECT id FROM cursos WHERE cursos_base_id = $1 AND anio = $2',
            [cursoBaseId, anioDestino]
        );

        if (yaExiste.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                message: `Ya existe una versión del año ${anioDestino} para este curso (id: ${yaExiste[0].id})`
            });
        }

        // 4. Crear nueva versión del curso
        const { rows: [nuevoCurso] } = await client.query(
            `INSERT INTO cursos
                   (nombre, descripcion, razon_curso, dirigido_a, duracion, proceso_id, creado_por,
                estado, activo, habilitado_manual, anio, cursos_base_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7,
                     'borrador', false, false, $8, $9)
             RETURNING id`,
            [
                original.nombre,
                original.descripcion,
                original.razon_curso,
                original.dirigido_a,
                original.duracion,
                original.proceso_id,
                adminId,
                anioDestino,
                cursoBaseId
            ]
        );
        const nuevoCursoId = nuevoCurso.id;

        // 5. Copiar módulos
        const { rows: modulos } = await client.query(
            'SELECT titulo, tipo, url, orden, contenido FROM modulos WHERE curso_id = $1 ORDER BY orden',
            [cursoId]
        );

        for (const mod of modulos) {
            await client.query(
                `INSERT INTO modulos (curso_id, titulo, tipo, url, orden, contenido)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [nuevoCursoId, mod.titulo, mod.tipo, mod.url, mod.orden, mod.contenido]
            );
        }

        // 6. Copiar evaluaciones con sus preguntas y opciones
        const { rows: evaluaciones } = await client.query(
            'SELECT id, titulo, num_preguntas, calificacion_minima, tipo FROM evaluaciones WHERE curso_id = $1',
            [cursoId]
        );

        for (const evalOriginal of evaluaciones) {
            const { rows: [nuevaEval] } = await client.query(
                `INSERT INTO evaluaciones (curso_id, titulo, num_preguntas, calificacion_minima, tipo)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [
                    nuevoCursoId,
                    evalOriginal.titulo,
                    evalOriginal.num_preguntas,
                    evalOriginal.calificacion_minima,
                    evalOriginal.tipo
                ]
            );

            // Copiar preguntas
            const { rows: preguntas } = await client.query(
                'SELECT id, texto, orden FROM preguntas_evaluacion WHERE evaluacion_id = $1 ORDER BY orden',
                [evalOriginal.id]
            );

            for (const pregunta of preguntas) {
                const { rows: [nuevaPregunta] } = await client.query(
                    `INSERT INTO preguntas_evaluacion (evaluacion_id, texto, orden)
                     VALUES ($1, $2, $3)
                     RETURNING id`,
                    [nuevaEval.id, pregunta.texto, pregunta.orden]
                );

                // Copiar opciones de respuesta
                const { rows: opciones } = await client.query(
                    'SELECT texto, es_correcta FROM opciones_pregunta WHERE pregunta_id = $1',
                    [pregunta.id]
                );

                for (const opcion of opciones) {
                    await client.query(
                        `INSERT INTO opciones_pregunta (pregunta_id, texto, es_correcta)
                         VALUES ($1, $2, $3)`,
                        [nuevaPregunta.id, opcion.texto, opcion.es_correcta]
                    );
                }
            }
        }

        await client.query('COMMIT');

        console.log(`✅ Curso ${cursoId} clonado → nuevo id ${nuevoCursoId} (año ${anioDestino})`);

        res.status(201).json({
            success: true,
            message: `Curso clonado al año ${anioDestino} exitosamente`,
            data: {
                nuevo_curso_id:  nuevoCursoId,
                cursos_base_id:   cursoBaseId,
                anio:            anioDestino,
                modulos_copiados: modulos.length,
                evaluaciones_copiadas: evaluaciones.length
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error clonando curso:', error);
        res.status(500).json({ success: false, message: 'Error al clonar curso: ' + error.message });
    } finally {
        client.release();
    }
});

export default router;
