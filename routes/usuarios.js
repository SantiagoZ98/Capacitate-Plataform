import express from "express";
import db from "../db.js";
import jwt from "jsonwebtoken";
import { authenticateAdminProceso, getProcesosFromToken } from '../middlewares/adminProcesoAuth.js';

const router = express.Router();

// Asegúrate de tener una clave secreta en tus variables de entorno
const JWT_SECRET = process.env.JWT_SECRET || "tu_clave_secreta_para_desarrollo";

// LOGIN por cédula
// Requisito: la contraseña debe ser igual a la cédula (password === cedula)
router.post("/login", async (req, res) => {
  try {
    const cedula = req.body.cedula || req.body.cedula_identidad;
    const password = req.body.password;

    if (!cedula || !password) {
      return res.status(400).json({ message: "Cedula y password son requeridos" });
    }

    // En este sistema la política actual es que el password sea la misma cédula
    if (String(password) !== String(cedula)) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    // Buscar usuario por cédula
    const [rows] = await db.query(
      "SELECT * FROM personal WHERE cedula_identidad = $1",
      [cedula]
    );

    let usuario;

    if (rows.length > 0) {
      usuario = rows[0];
    } else {
      // Si no existe, crear usuario mínimo y devolverlo
      await db.query(
        "INSERT INTO personal (nombre, cedula_identidad) VALUES ($1, $2)",
        [cedula, cedula]
      );

      const [newRows] = await db.query(
        "SELECT * FROM personal WHERE cedula_identidad = $1",
        [cedula]
      );
      
      usuario = newRows[0];
    }

    // 🟦 GENERAR JWT TOKEN
    const token = jwt.sign(
      { 
        userId: usuario.id, // o el campo que uses como ID único
        cedula: usuario.cedula_identidad,
        tipo: "usuario" 
      }, 
      JWT_SECRET,
      { expiresIn: '7d' } // Token expira en 7 días
    );

    // 🟦 RESPONDER CON TOKEN Y DATOS DEL USUARIO
    return res.json({
      status: rows.length > 0 ? "usuario_existente" : "usuario_nuevo",
      token, // 🔐 Enviamos el token al frontend
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        cedula: usuario.cedula_identidad,
        progreso: usuario.progreso || 0,
        prueba_aprobada: usuario.prueba_aprobada || 0
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// 🟦 MIDDLEWARE PARA VERIFICAR JWT (para usar en otras rutas)
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ message: "Token de acceso requerido" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Token inválido o expirado" });
    }
    
    req.user = user; // Guardamos los datos del usuario en la request
    next();
  });
};

// 🟦 EJEMPLO DE RUTA PROTEGIDA
router.get("/perfil", authenticateToken, async (req, res) => {
  try {
    // req.user contiene los datos del token (userId, cedula, etc.)
    const [rows] = await db.query(
      "SELECT id, nombre, cedula_identidad FROM personal WHERE id = $1",
      [req.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({ usuario: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// 🟦 RUTA PARA VERIFICAR TOKEN (útil para el frontend)
router.post("/verify-token", authenticateToken, (req, res) => {
  // Si llegamos aquí, el token es válido
  res.json({ 
    valid: true, 
    user: req.user,
    message: "Token válido" 
  });
});

/**
 * GET /api/usuarios/mi-info
 * Usuario autenticado: devuelve nombre, cédula, proceso y cargo del usuario actual
 */
router.get('/mi-info', getProcesosFromToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const [rows] = await db.query(
      `SELECT id, nombre, cedula_identidad, proceso, cargo FROM personal WHERE id = $1`,
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('❌ Error en /mi-info:', err);
    res.status(500).json({ success: false, message: 'Error al obtener datos del usuario' });
  }
});

/**
 * GET /api/usuarios/buscar-reporte?q=nombre
 * Buscar usuarios por nombre o cédula para el módulo de reportes (solo admin proceso)
 */
router.get('/buscar-reporte', authenticateAdminProceso, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Ingrese al menos 2 caracteres para buscar' });
    }

    const [rows] = await db.query(
      `SELECT id, nombre, cedula_identidad, proceso, cargo
       FROM personal
       WHERE LOWER(nombre) ILIKE LOWER($1) OR cedula_identidad ILIKE $1
       ORDER BY nombre
       LIMIT 30`,
      [`%${q.trim()}%`]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('❌ Error en buscar-reporte:', err);
    res.status(500).json({ success: false, message: 'Error al buscar usuarios' });
  }
});

/**
 * GET /api/usuarios/:id/reporte-cursos
 * Obtener todos los cursos de un usuario con su estado, progreso y resultado de evaluación
 */
router.get('/:id/reporte-cursos', authenticateAdminProceso, async (req, res) => {
  try {
    const { id } = req.params;

    const [userRows] = await db.query(
      `SELECT id, nombre, cedula_identidad, proceso, cargo FROM personal WHERE id = $1`,
      [id]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const [inscripciones] = await db.query(
      `SELECT
         i.id,
         i.usuario_id,
         i.curso_id,
         i.fecha_inscripcion,
         i.estado,
         c.nombre                AS curso_nombre,
         c.descripcion,
         c.fecha_fin,
         p.nombre                AS proceso,
         (SELECT COUNT(*)
          FROM modulos m
          WHERE m.curso_id = c.id AND m.activo = true)                           AS total_modulos,
         (SELECT COUNT(*)
          FROM progreso_modulos pm
          WHERE pm.usuario_id = i.usuario_id AND pm.curso_id = c.id)             AS modulos_completados,
         (SELECT ie2.puntaje
          FROM intentos_evaluacion ie2
          WHERE ie2.usuario_id = i.usuario_id AND ie2.curso_id = i.curso_id
          ORDER BY ie2.puntaje DESC
          LIMIT 1)                                                                AS mejor_puntaje,
         (SELECT ie2.aprobado
          FROM intentos_evaluacion ie2
          WHERE ie2.usuario_id = i.usuario_id AND ie2.curso_id = i.curso_id
          ORDER BY ie2.puntaje DESC
          LIMIT 1)                                                                AS evaluacion_aprobada
       FROM inscripciones i
       JOIN cursos  c ON i.curso_id    = c.id
       JOIN procesos p ON c.proceso_id = p.id
       WHERE i.usuario_id = $1
       ORDER BY p.nombre, i.fecha_inscripcion DESC`,
      [id]
    );

    res.json({ success: true, usuario: userRows[0], data: inscripciones });
  } catch (err) {
    console.error('❌ Error en reporte-cursos:', err);
    res.status(500).json({ success: false, message: 'Error al obtener reporte de cursos' });
  }
});

export default router;

// RUTA PARA LISTAR LOS USUARIOS
router.get("/load", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM personal");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error en el servidor" });
  } 
}); 

// RUTA PPARA MODIFICAR USUARIO
router.put("/update/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const { nombre, cedula_identidad } = req.body;
    await db.query(
      "UPDATE personal SET nombre = $1, cedula_identidad = $2 WHERE id = $3",
      [nombre, cedula_identidad, userId]
    );
    res.json({ message: "Usuario actualizado correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error en el servidor" });
  }     
});

// RUTA PARA ELIMINAR USUARIO
router.delete("/delete/:id", async (req, res) => {
  try { 
    const userId = req.params.id;
    await db.query("DELETE FROM personal WHERE id = $1", [userId]);
    res.json({ message: "Usuario eliminado correctamente" });
  }
  catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error en el servidor" });
  } 
});
