import express from 'express';
import db from '../db.js';
import { authenticateAdminProceso } from '../middlewares/adminProcesoAuth.js';

const router = express.Router();

/**
 * GET /api/notificaciones
 * Obtener todas las notificaciones del admin autenticado
 */
router.get('/', authenticateAdminProceso, async (req, res) => {
    try {
        const { id: admin_id } = req.user;

        console.log('🔍 GET /api/notificaciones - Obteniendo notificaciones para admin:', admin_id);

        const [notificaciones] = await db.query(
            `SELECT n.id, n.admin_id, n.curso_id, n.tipo, n.mensaje, n.razon_rechazo, 
                    n.leida, n.creada_en, c.nombre as curso_nombre, c.proceso_id,
                    p.nombre as proceso_nombre
             FROM notificaciones n
             JOIN cursos c ON n.curso_id = c.id
             JOIN procesos p ON c.proceso_id = p.id
             WHERE n.admin_id = $1
             ORDER BY n.creada_en DESC`,
            [admin_id]
        );

        res.json({
            success: true,
            data: notificaciones
        });

    } catch (error) {
        console.error('❌ Error en GET /api/notificaciones:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener notificaciones'
        });
    }
});

/**
 * GET /api/notificaciones/no-leidas/count
 * Obtener cantidad de notificaciones no leídas del admin autenticado
 */
router.get('/no-leidas/count', authenticateAdminProceso, async (req, res) => {
    try {
        const { id: admin_id } = req.user;

        const [resultado] = await db.query(
            `SELECT COUNT(*) as count FROM notificaciones WHERE admin_id = $1 AND leida = false`,
            [admin_id]
        );

        res.json({
            success: true,
            data: resultado[0]
        });

    } catch (error) {
        console.error('❌ Error en GET /api/notificaciones/no-leidas/count:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener cantidad de notificaciones'
        });
    }
});

/**
 * PUT /api/notificaciones/:id/marcar-leida
 * Marcar una notificación como leída
 */
router.put('/:id/marcar-leida', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { id: admin_id } = req.user;

        // Verificar que la notificación pertenece al admin
        const [notificacion] = await db.query(
            `SELECT id FROM notificaciones WHERE id = $1 AND admin_id = $2`,
            [id, admin_id]
        );

        if (notificacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Notificación no encontrada'
            });
        }

        const [resultado] = await db.query(
            `UPDATE notificaciones SET leida = true WHERE id = $1 RETURNING id, leida`,
            [id]
        );

        res.json({
            success: true,
            message: 'Notificación marcada como leída',
            data: resultado[0]
        });

    } catch (error) {
        console.error('❌ Error en PUT /api/notificaciones/:id/marcar-leida:', error);
        res.status(500).json({
            success: false,
            message: 'Error al marcar notificación como leída'
        });
    }
});

/**
 * PUT /api/notificaciones/marcar-todas-leidas
 * Marcar todas las notificaciones como leídas
 */
router.put('/marcar-todas-leidas/todas', authenticateAdminProceso, async (req, res) => {
    try {
        const { id: admin_id } = req.user;

        const [resultado] = await db.query(
            `UPDATE notificaciones SET leida = true WHERE admin_id = $1 AND leida = false RETURNING id`,
            [admin_id]
        );

        res.json({
            success: true,
            message: `${resultado.length} notificaciones marcadas como leídas`,
            data: resultado
        });

    } catch (error) {
        console.error('❌ Error en PUT /api/notificaciones/marcar-todas-leidas/todas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al marcar notificaciones como leídas'
        });
    }
});

/**
 * DELETE /api/notificaciones/:id
 * Eliminar una notificación
 */
router.delete('/:id', authenticateAdminProceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { id: admin_id } = req.user;

        // Verificar que la notificación pertenece al admin
        const [notificacion] = await db.query(
            `SELECT id FROM notificaciones WHERE id = $1 AND admin_id = $2`,
            [id, admin_id]
        );

        if (notificacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Notificación no encontrada'
            });
        }

        await db.query(`DELETE FROM notificaciones WHERE id = $1`, [id]);

        res.json({
            success: true,
            message: 'Notificación eliminada exitosamente'
        });

    } catch (error) {
        console.error('❌ Error en DELETE /api/notificaciones/:id:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar notificación'
        });
    }
});

/**
 * DELETE /api/notificaciones/eliminar-todas/todas
 * Eliminar todas las notificaciones del admin
 */
router.delete('/eliminar-todas/todas', authenticateAdminProceso, async (req, res) => {
    try {
        const { id: admin_id } = req.user;

        const [resultado] = await db.query(
            `DELETE FROM notificaciones WHERE admin_id = $1 RETURNING id`,
            [admin_id]
        );

        res.json({
            success: true,
            message: `${resultado.length} notificaciones eliminadas`,
            data: resultado
        });

    } catch (error) {
        console.error('❌ Error en DELETE /api/notificaciones/eliminar-todas/todas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar notificaciones'
        });
    }
});

export default router;
