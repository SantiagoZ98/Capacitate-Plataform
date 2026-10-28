import express from "express";
import db from "../db.js";
import { authenticateAdminProceso } from "../middlewares/adminProcesoAuth.js";

const router = express.Router();
const supabase = db.supabase;

//    GUARDAR RESULTADO
router.post("/", async (req, res) => {
  try {
    const { nombre, puntaje, aprobado, proceso, fecha_registro } = req.body;

    if (!nombre || puntaje === undefined || aprobado === undefined || !proceso || !fecha_registro) {
      return res.status(400).json({ message: "Datos incompletos." });
    }

    console.log(`📝 Guardando resultado: nombre=${nombre}, puntaje=${puntaje}, aprobado=${aprobado}, proceso=${proceso}`);

    // Usar Supabase SDK directo
    const { data, error } = await supabase
      .from("resultados")
      .insert([
        {
          nombre,
          puntaje,
          aprobado,
          proceso,
          fecha_registro
        }
      ])
      .select();

    if (error) {
      console.error("❌ Error guardando resultado:", error);
      return res.status(500).json({
        success: false,
        message: "Error guardando intento",
        error: error.message
      });
    }

    console.log(`✅ Resultado guardado exitosamente`);

    res.json({
      success: true,
      message: "Intento guardado correctamente",
      data: data
    });

  } catch (err) {
    console.error("❌ Error guardando intento:", err);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET RESULTADOS DE EVALUACIONES - mis cursos (para ResultadosEvaluacionesProceso)
// Este endpoint obtiene todos los resultados de pruebas del usuario
router.get("/resultados/mis-cursos", authenticateAdminProceso, async (req, res) => {
  try {
    console.log("📖 Obteniendo resultados de evaluaciones para admin");

    // Usar Supabase SDK para consultar la tabla resultados
    const { data, error } = await supabase
      .from("resultados")
      .select("*")
      .order("fecha_registro", { ascending: false });

    if (error) {
      console.error("❌ Error consultando resultados:", error);
      return res.status(500).json({
        success: false,
        message: "Error al obtener resultados",
        error: error.message
      });
    }

    console.log(`✅ ${data?.length || 0} resultados obtenidos`);

    res.json({
      success: true,
      data: data || []
    });

  } catch (err) {
    console.error("❌ Error en /resultados/resultados/mis-cursos:", err);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET RESUMEN PRUEBA TTHH - mejor resultado por usuario (solo admin proceso)
router.get("/tthh/resumen", authenticateAdminProceso, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         r.nombre                                     AS usuario,
         COALESCE(p.nombre, r.nombre)                AS nombre_completo,
         COALESCE(p.cedula_identidad, r.nombre)      AS cedula,
         COALESCE(p.cargo, '')                       AS cargo,
         MAX(r.puntaje)                              AS mejor_puntaje,
         COUNT(r.id)::int                            AS total_intentos,
         BOOL_OR(r.aprobado)                         AS aprobado,
         MAX(r.fecha_registro)                       AS ultima_fecha
       FROM resultados r
       LEFT JOIN personal p ON p.nombre = r.nombre
       WHERE r.proceso = 'Talento Humano'
       GROUP BY r.nombre, p.nombre, p.cedula_identidad, p.cargo
       ORDER BY aprobado DESC, mejor_puntaje DESC`,
      []
    );

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("❌ Error en /resultados/tthh/resumen:", err);
    res.status(500).json({ ok: false, message: "Error en el servidor" });
  }
});

// GET HISTORIAL DE INTENTOS DEL USUARIO ACTUAL (para miPerfil)
router.get("/mis-intentos/:proceso", async (req, res) => {
  try {
    const { proceso } = req.params;
    const { nombre } = req.query;

    if (!nombre) {
      return res.status(400).json({ ok: false, message: "Parámetro nombre requerido." });
    }

    const [rows] = await db.query(
      `SELECT id, puntaje, aprobado, fecha_registro
       FROM resultados
       WHERE nombre = ? AND proceso = ?
       ORDER BY fecha_registro DESC`,
      [nombre, proceso]
    );

    const mejor = rows.reduce((max, r) => (r.puntaje > max ? r.puntaje : max), 0);
    const aprobado = rows.some((r) => r.aprobado);

    res.json({ ok: true, intentos: rows, mejor_puntaje: mejor, aprobado });
  } catch (err) {
    console.error("❌ Error en /resultados/mis-intentos:", err);
    res.status(500).json({ ok: false, message: "Error en el servidor" });
  }
});

//    GET POR PROCESO
router.get("/:proceso", async (req, res) => {
  try {
    const { proceso } = req.params;

    const [rows] = await db.query(
      "SELECT * FROM resultados WHERE proceso = $1 ORDER BY id DESC",
      [proceso]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Error cargando resultados:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

//    GET TODOS
router.get("/", async (_, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM resultados ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

export default router;
