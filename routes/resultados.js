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
    console.log("📖 Obteniendo resumen de resultados TTHH");

    // Obtener todos los resultados de TTHH usando Supabase SDK
    const { data: resultados, error: errorResultados } = await supabase
      .from("resultados")
      .select("nombre, puntaje, aprobado, fecha_registro")
      .eq("proceso", "Talento Humano")
      .order("fecha_registro", { ascending: false });

    if (errorResultados) {
      console.error("❌ Error consultando resultados:", errorResultados);
      return res.status(500).json({
        success: false,
        message: "Error al obtener resultados",
        error: errorResultados.message
      });
    }

    // Obtener datos de personal (nombre completo, cédula, cargo)
    const { data: personal, error: errorPersonal } = await supabase
      .from("personal")
      .select("nombre, cedula_identidad, cargo");

    if (errorPersonal) {
      console.error("❌ Error consultando personal:", errorPersonal);
      return res.status(500).json({
        success: false,
        message: "Error al obtener datos personales",
        error: errorPersonal.message
      });
    }

    // Mapear personal por nombre para búsqueda rápida
    const personalMap = {};
    (personal || []).forEach(p => {
      personalMap[p.nombre] = { cedula_identidad: p.cedula_identidad, cargo: p.cargo };
    });

    // Agrupar por usuario y calcular: mejor puntaje, total intentos, si aprobó, última fecha
    const resumenPorUsuario = {};
    (resultados || []).forEach(r => {
      if (!resumenPorUsuario[r.nombre]) {
        resumenPorUsuario[r.nombre] = {
          usuario: r.nombre,
          nombre_completo: personalMap[r.nombre]?.nombre_completo || r.nombre,
          cedula: personalMap[r.nombre]?.cedula_identidad || r.nombre,
          cargo: personalMap[r.nombre]?.cargo || '',
          mejor_puntaje: r.puntaje,
          total_intentos: 0,
          aprobado: false,
          ultima_fecha: r.fecha_registro
        };
      }

      resumenPorUsuario[r.nombre].total_intentos += 1;
      resumenPorUsuario[r.nombre].mejor_puntaje = Math.max(resumenPorUsuario[r.nombre].mejor_puntaje, r.puntaje);
      resumenPorUsuario[r.nombre].aprobado = resumenPorUsuario[r.nombre].aprobado || r.aprobado;
      
      // Mantener la fecha más reciente
      if (new Date(r.fecha_registro) > new Date(resumenPorUsuario[r.nombre].ultima_fecha)) {
        resumenPorUsuario[r.nombre].ultima_fecha = r.fecha_registro;
      }
    });

    // Convertir a array y ordenar: aprobados primero, luego por puntaje
    const datos = Object.values(resumenPorUsuario).sort((a, b) => {
      if (a.aprobado !== b.aprobado) return b.aprobado ? 1 : -1;
      return b.mejor_puntaje - a.mejor_puntaje;
    });

    console.log(`✅ ${datos.length} usuarios con resultados TTHH`);

    res.json({ ok: true, data: datos });

  } catch (err) {
    console.error("❌ Error en /resultados/tthh/resumen:", err);
    res.status(500).json({
      ok: false,
      message: "Error en el servidor",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
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
