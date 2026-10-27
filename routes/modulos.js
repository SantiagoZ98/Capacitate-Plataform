import express from 'express';
import db from '../db.js';
import { authenticateAdminProceso } from '../middlewares/adminProcesoAuth.js';

const router = express.Router();

/**
 * GET /api/modulos/curso/:cursoId
 * Obtener todos los módulos de un curso
 */
router.get('/curso/:cursoId', async (req, res) => {
    try {
        const { cursoId } = req.params;

        const [modulos] = await db.query(
            `SELECT id, curso_id, titulo, tipo, url, orden, contenido, creado_en
             FROM modulos
             WHERE curso_id = $1
             ORDER BY orden ASC`,
            [cursoId]
        );

        res.json({
            success: true,
            data: modulos
        });

    } catch (error) {
        console.error("Error obteniendo módulos:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener módulos"
        });
    }
});

/**
 * GET /api/modulos/:id
 * Obtener detalle de un módulo específico
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [modulos] = await db.query(
            "SELECT * FROM modulos WHERE id = $1",
            [id]
        );

        if (modulos.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Módulo no encontrado"
            });
        }

        res.json({
            success: true,
            data: modulos[0]
        });

    } catch (error) {
        console.error("Error obteniendo módulo:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener módulo"
        });
    }
});

/**
 * POST /api/modulos
 * Crear un nuevo módulo en un curso (solo admin de proceso)
 */
router.post('/', authenticateAdminProceso, async (req, res) => {
    try {
        const { curso_id, titulo, tipo, url, orden, contenido } = req.body;
        const { proceso_name } = req.user;

        // Validar datos
        if (!curso_id || !titulo) {
            return res.status(400).json({
                success: false,
                message: "curso_id y titulo son requeridos"
            });
        }

        // Validar que el curso pertenezca al proceso del admin
        const [cursoValidacion] = await db.query(
            `SELECT c.id FROM cursos c
             JOIN procesos p ON c.proceso_id = p.id
             WHERE c.id = $1 AND p.nombre = $2`,
            [curso_id, proceso_name]
        );

        if (cursoValidacion.length === 0) {
            return res.status(403).json({
                success: false,
                message: "No tienes permiso para agregar módulos a este curso"
            });
        }

        // Obtener el siguiente orden si no se proporciona
        let proximoOrden = orden;
        if (proximoOrden === undefined || proximoOrden === null) {
            const [maxOrden] = await db.query(
                "SELECT COALESCE(MAX(orden), 0) + 1 as next_orden FROM modulos WHERE curso_id = $1",
                [curso_id]
            );
            proximoOrden = maxOrden[0].next_orden;
        }

        // Crear módulo
        const [resultado] = await db.query(
            `INSERT INTO modulos (curso_id, titulo, tipo, url, orden, contenido)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, curso_id, titulo, tipo, url, orden, contenido, creado_en`,
            [curso_id, titulo.trim(), tipo || null, url || null, proximoOrden, contenido || null]
        );

        res.status(201).json({
            success: true,
            message: "Módulo creado exitosamente",
            data: resultado[0]
        });

    } catch (error) {
        console.error("Error creando módulo:", error);
        res.status(500).json({
            success: false,
            message: "Error al crear módulo"
        });
    }
});

/**
 * PUT /api/modulos/:id
 * Editar un módulo (solo admin de proceso)
 */
router.put('/:id', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, tipo, url, orden, contenido } = req.body;
        const { proceso_name } = req.user;

        // Validar que el módulo pertenezca a un curso del proceso del admin
        const [moduloValidacion] = await db.query(
            `SELECT m.id FROM modulos m
             JOIN cursos c ON m.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE m.id = $1 AND p.nombre = $2`,
            [id, proceso_name]
        );

        if (moduloValidacion.length === 0) {
            return res.status(403).json({
                success: false,
                message: "No tienes permiso para editar este módulo"
            });
        }

        // Actualizar módulo
        const [resultado] = await db.query(
            `UPDATE modulos
             SET titulo = COALESCE($1, titulo),
                 tipo = COALESCE($2, tipo),
                 url = COALESCE($3, url),
                 orden = COALESCE($4, orden),
                 contenido = COALESCE($5, contenido)
             WHERE id = $6
             RETURNING id, curso_id, titulo, tipo, url, orden, contenido, creado_en`,
            [titulo, tipo, url, orden, contenido, id]
        );

        res.json({
            success: true,
            message: "Módulo actualizado exitosamente",
            data: resultado[0]
        });

    } catch (error) {
        console.error("Error actualizando módulo:", error);
        res.status(500).json({
            success: false,
            message: "Error al actualizar módulo"
        });
    }
});

/**
 * DELETE /api/modulos/:id
 * Eliminar un módulo (solo admin de proceso)
 */
router.delete('/:id', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { proceso_name } = req.user;

        // Validar que el módulo pertenezca a un curso del proceso del admin
        const [moduloValidacion] = await db.query(
            `SELECT m.id FROM modulos m
             JOIN cursos c ON m.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE m.id = $1 AND p.nombre = $2`,
            [id, proceso_name]
        );

        if (moduloValidacion.length === 0) {
            return res.status(403).json({
                success: false,
                message: "No tienes permiso para eliminar este módulo"
            });
        }

        // Eliminar módulo
        await db.query("DELETE FROM modulos WHERE id = $1", [id]);

        res.json({
            success: true,
            message: "Módulo eliminado exitosamente"
        });

    } catch (error) {
        console.error("Error eliminando módulo:", error);
        res.status(500).json({
            success: false,
            message: "Error al eliminar módulo"
        });
    }
});

export default router;
