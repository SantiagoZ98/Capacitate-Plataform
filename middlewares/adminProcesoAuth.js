import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware para validar que el usuario sea admin de proceso
 * Verifica que el token sea válido y que tenga rol 'admin_proceso'
 */
export const authenticateAdminProceso = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ 
            success: false,
            message: "Token de acceso requerido" 
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false,
                message: "Token inválido o expirado" 
            });
        }

        // Verificar que sea admin_proceso
        if (user.role !== 'admin_proceso') {
            return res.status(403).json({ 
                success: false,
                message: "No tienes permisos para acceder a este recurso" 
            });
        }

        req.user = user; // Guardamos el usuario decodificado
        next();
    });
};

/**
 * Middleware para obtener el ID del proceso desde el token
 * Útil para validar que solo acceda a sus propios cursos
 */
export const getProcesosFromToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false,
            message: "Token requerido" 
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false,
                message: "Token inválido" 
            });
        }

        req.user = user;
        next();
    });
};

export default { authenticateAdminProceso, getProcesosFromToken };
