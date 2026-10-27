import express from 'express';
import db from '../db.js';
import { getProcesosFromToken } from '../middlewares/adminProcesoAuth.js';

const router = express.Router();

/**
 * POST /api/progreso-modulos
 * Guardar un módulo como completado
 */
router.post('/', getProcesosFromToken, async (req, res) => {
    try {
        const { modulo_id, curso_id } = req.body;
        const { userId } = req.user;

        console.log('📝 POST /api/progreso-modulos');
        console.log('  usuario_id:', userId);
        console.log('  modulo_id:', modulo_id);
        console.log('  curso_id:', curso_id);

        // Validar datos
        if (!modulo_id || !curso_id) {
            return res.status(400).json({
                success: false,
                message: "modulo_id y curso_id son requeridos"
            });
        }

        // Verificar que el módulo pertenezca al curso
        const [moduloValidacion] = await db.query(
            "SELECT id FROM modulos WHERE id = $1 AND curso_id = $2",
            [modulo_id, curso_id]
        );

        if (moduloValidacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Módulo no encontrado o no pertenece a este curso"
            });
        }

        // Guardar o actualizar progreso (insert with on conflict do nothing para evitar duplicados)
        const [resultado] = await db.query(
            `INSERT INTO progreso_modulos (usuario_id, modulo_id, curso_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (usuario_id, modulo_id) DO UPDATE
             SET completado_en = NOW() AT TIME ZONE 'America/Guayaquil'::text
             RETURNING id, usuario_id, modulo_id, curso_id, completado_en`,
            [userId, modulo_id, curso_id]
        );

        console.log('✅ Progreso guardado:', resultado[0]);

        res.status(201).json({
            success: true,
            message: "Módulo marcado como completado",
            data: resultado[0]
        });

    } catch (error) {
        console.error("Error guardando progreso de módulo:", error);
        res.status(500).json({
            success: false,
            message: "Error al guardar progreso"
        });
    }
});

/**
 * DELETE /api/progreso-modulos
 * Desmarcar un módulo como completado
 */
router.delete('/', getProcesosFromToken, async (req, res) => {
    try {
        const { modulo_id } = req.body;
        const { userId } = req.user;

        console.log('🗑️ DELETE /api/progreso-modulos');
        console.log('  usuario_id:', userId);
        console.log('  modulo_id:', modulo_id);

        // Validar datos
        if (!modulo_id) {
            return res.status(400).json({
                success: false,
                message: "modulo_id es requerido"
            });
        }

        // Eliminar progreso
        const [resultado] = await db.query(
            "DELETE FROM progreso_modulos WHERE usuario_id = $1 AND modulo_id = $2 RETURNING id",
            [userId, modulo_id]
        );

        if (resultado.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Progreso no encontrado"
            });
        }

        console.log('✅ Progreso eliminado');

        res.json({
            success: true,
            message: "Módulo desmarcado como completado"
        });

    } catch (error) {
        console.error("Error eliminando progreso de módulo:", error);
        res.status(500).json({
            success: false,
            message: "Error al eliminar progreso"
        });
    }
});

/**
 * GET /api/progreso-modulos/usuario/:usuarioId/curso/:cursoId
 * Obtener módulos completados por un usuario en un curso específico
 */
router.get('/usuario/:usuarioId/curso/:cursoId', getProcesosFromToken, async (req, res) => {
    try {
        const { usuarioId, cursoId } = req.params;
        const { userId, role } = req.user;

        console.log('🔍 GET /api/progreso-modulos/usuario/:usuarioId/curso/:cursoId');
        console.log('  usuarioId:', usuarioId);
        console.log('  cursoId:', cursoId);
        console.log('  userId:', userId);
        console.log('  role:', role);

        // Validar que el usuario vea solo su propio progreso (o sea admin)
        if (parseInt(usuarioId) !== userId && role !== 'admin_proceso') {
            return res.status(403).json({
                success: false,
                message: "No tienes permiso para ver este progreso"
            });
        }

        // Obtener módulos completados
        const [modulosCompletados] = await db.query(
            `SELECT pm.id, pm.usuario_id, pm.modulo_id, pm.curso_id, pm.completado_en,
                    m.titulo as modulo_titulo, m.orden
             FROM progreso_modulos pm
             JOIN modulos m ON pm.modulo_id = m.id
             WHERE pm.usuario_id = $1 AND pm.curso_id = $2
             ORDER BY m.orden ASC`,
            [usuarioId, cursoId]
        );

        console.log('✅ Módulos completados obtenidos:', modulosCompletados.length);

        res.json({
            success: true,
            data: modulosCompletados
        });

    } catch (error) {
        console.error("Error obteniendo progreso de módulos:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener progreso"
        });
    }
});

/**
 * GET /api/progreso-modulos/modulos-completados/:usuarioId/:cursoId
 * Obtener solo los IDs de módulos completados (para uso en frontend)
 */
router.get('/modulos-completados/:usuarioId/:cursoId', getProcesosFromToken, async (req, res) => {
    try {
        const { usuarioId, cursoId } = req.params;
        const { userId, role } = req.user;

        // Validar permisos
        if (parseInt(usuarioId) !== userId && role !== 'admin_proceso') {
            return res.status(403).json({
                success: false,
                message: "No tienes permiso"
            });
        }

        // Obtener solo IDs
        const [resultado] = await db.query(
            `SELECT modulo_id FROM progreso_modulos
             WHERE usuario_id = $1 AND curso_id = $2`,
            [usuarioId, cursoId]
        );

        const modulosCompletados = resultado.map(r => r.modulo_id);

        res.json({
            success: true,
            data: modulosCompletados
        });

    } catch (error) {
        console.error("Error obteniendo módulos completados:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener datos"
        });
    }
});

export default router;
