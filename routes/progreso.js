import express from "express";
import db from "../db.js";

const router = express.Router();

// ============================================
// SOLO CURSOS ESTÁTICOS TALENTO HUMANO
// ============================================

// Mapeo de IDs a nombres de cursos completos (para mostrar)
const CURSOS_MAP = {
  "derechos_laborales": "La base de la Justicia Laboral Igualdad y Cero Discriminación",
  "igualdad_genero": "Equidad por Ley",
  "erradicacion_Violencia": "Derechos Laborales",
  "otrosRelacionados": "Igualdad Salarial"
};

const CURSOS_IDS = Object.keys(CURSOS_MAP); // ["derechos_laborales", "igualdad_genero", ...]

// 1️⃣ OBTENER PROGRESO DEL USUARIO (lo crea si no existe)
router.post("/get", async (req, res) => {
  try {
    const { nombre } = req.body;

    if (!nombre) {
      return res.status(400).json({ message: "Nombre requerido" });
    }

    // Buscar usuario en usuariosprogreso
    const [rows] = await db.query(
      `SELECT progreso, prueba_aprobada FROM usuariosprogreso WHERE nombre = $1 AND proceso = $2`,
      [nombre, "talento_humano"]
    );

    // Si NO existe, crearlo
    if (!rows || rows.length === 0) {
      console.log(`✅ Creando progreso inicial para: ${nombre}`);
      await db.query(
        `INSERT INTO usuariosprogreso (nombre, proceso, progreso, prueba_aprobada)
         VALUES ($1, $2, 0, FALSE)
         ON CONFLICT DO NOTHING`,
        [nombre, "talento_humano"]
      );

      return res.json({
        ok: true,
        progreso: 0,
        pruebaAprobada: false
      });
    }

    // Si existe, devolver datos
    res.json({
      ok: true,
      progreso: rows[0].progreso ?? 0,
      pruebaAprobada: rows[0].prueba_aprobada ?? false
    });

  } catch (err) {
    console.error("❌ Error en /progreso/get:", err);
    res.status(500).json({ ok: false, message: "Error en el servidor" });
  }
});

// 2️⃣ MARCAR NIVEL COMO COMPLETADO
router.post("/item", async (req, res) => {
  try {
    const { nombre, curso, item_id } = req.body;

    if (!nombre || !curso || item_id === undefined) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    // Guardar en progreso_cursos
    await db.query(
      `INSERT INTO progreso_cursos (nombre, curso, item_id, completado)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (nombre, curso, item_id) DO UPDATE SET completado = TRUE`,
      [nombre, curso, item_id]
    );

    res.json({ ok: true, message: "Ítem guardado" });

  } catch (err) {
    console.error("❌ Error en /progreso/item:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// 3️⃣ OBTENER ÍTEMS COMPLETADOS DE UN CURSO
router.get("/items/:nombre/:curso", async (req, res) => {
  try {
    const { nombre, curso } = req.params;

    const [rows] = await db.query(
      `SELECT item_id FROM progreso_cursos
       WHERE nombre = $1 AND curso = $2 AND completado = TRUE`,
      [nombre, curso]
    );

    res.json({ ok: true, completados: rows.map(r => r.item_id) });

  } catch (err) {
    console.error("❌ Error en /progreso/items:", err);
    res.status(500).json({ ok: false, message: "Error" });
  }
});

// 4️⃣ MARCAR CURSO COMO COMPLETADO (IMPORTANTE: Actualiza usuariosprogreso)
router.post("/marcar-curso-completado", async (req, res) => {
  try {
    const { nombre, curso } = req.body;

    if (!nombre || !curso) {
      return res.status(400).json({ ok: false, message: "Datos incompletos" });
    }

    console.log(`📚 Completando curso: ${curso} para ${nombre}`);

    // Validar que curso sea uno de los 4 IDs válidos
    if (!CURSOS_IDS.includes(curso)) {
      return res.status(400).json({ ok: false, message: "Curso no válido" });
    }

    // 1. Guardar en cursos_completados (usar el ID del curso)
    await db.query(
      `INSERT INTO cursos_completados (nombre, curso, fecha_completado, progreso)
       VALUES ($1, $2, NOW(), 100)
       ON CONFLICT (nombre, curso) DO UPDATE SET fecha_completado = NOW()`,
      [nombre, curso]
    );

    // 2. Contar cuántos de los 4 cursos ha completado
    const [cursosResult] = await db.query(
      `SELECT COUNT(*) as total FROM cursos_completados 
       WHERE nombre = $1 AND curso = ANY($2)`,
      [nombre, CURSOS_IDS]
    );

    const cursoCompletados = cursosResult[0]?.total ?? 0;
    const nuevoProgreso = Math.min(100, (cursoCompletados / 4) * 100);

    console.log(`✅ Cursos completados: ${cursoCompletados}/4 = ${nuevoProgreso}% progreso`);

    // 3. ACTUALIZAR usuariosprogreso
    const updateResult = await db.query(
      `UPDATE usuariosprogreso 
       SET progreso = $1, updated_at = NOW()
       WHERE nombre = $2 AND proceso = $3
       RETURNING progreso, prueba_aprobada`,
      [nuevoProgreso, nombre, "talento_humano"]
    );

    const [updated] = updateResult;

    if (!updated || updated.length === 0) {
      // Si no existe, crear
      console.log(`📝 Creando usuariosprogreso para ${nombre} con progreso ${nuevoProgreso}%`);
      await db.query(
        `INSERT INTO usuariosprogreso (nombre, proceso, progreso, prueba_aprobada)
         VALUES ($1, $2, $3, FALSE)`,
        [nombre, "talento_humano", nuevoProgreso]
      );
    }

    res.json({
      ok: true,
      message: "Curso completado",
      progreso: nuevoProgreso,
      cursos_completados: cursoCompletados
    });

  } catch (err) {
    console.error("❌ Error en /progreso/marcar-curso-completado:", err);
    res.status(500).json({ ok: false, message: "Error en el servidor" });
  }
});

// 5️⃣ ACTUALIZAR ESTADO DE PRUEBA
router.put("/update", async (req, res) => {
  try {
    const { nombre, prueba_aprobada = true } = req.body;

    if (!nombre) {
      return res.status(400).json({ ok: false, message: "Nombre requerido" });
    }

    console.log(`📝 Actualizando prueba para ${nombre}: aprobada=${prueba_aprobada}`);

    const result = await db.query(
      `UPDATE usuariosprogreso 
       SET prueba_aprobada = $1, updated_at = NOW()
       WHERE nombre = $2 AND proceso = $3
       RETURNING progreso, prueba_aprobada`,
      [prueba_aprobada, nombre, "talento_humano"]
    );

    const [rows] = result;

    if (!rows || rows.length === 0) {
      // Crear si no existe
      console.log(`📝 Creando usuariosprogreso para ${nombre} con prueba=${prueba_aprobada}`);
      await db.query(
        `INSERT INTO usuariosprogreso (nombre, proceso, progreso, prueba_aprobada)
         VALUES ($1, $2, 0, $3)`,
        [nombre, "talento_humano", prueba_aprobada]
      );

      return res.json({
        ok: true,
        message: "Usuario creado y prueba actualizada",
        prueba_aprobada
      });
    }

    res.json({
      ok: true,
      message: "Prueba actualizada",
      progreso: rows[0].progreso,
      prueba_aprobada: rows[0].prueba_aprobada
    });

  } catch (err) {
    console.error("❌ Error en /progreso/update:", err);
    res.status(500).json({ ok: false, message: "Error en el servidor" });
  }
});

// 6️⃣ OBTENER CURSOS COMPLETADOS DEL USUARIO
router.get("/cursos-completados/:nombre", async (req, res) => {
  try {
    const { nombre } = req.params;

    const [rows] = await db.query(
      `SELECT curso, fecha_completado FROM cursos_completados 
       WHERE nombre = $1 
       ORDER BY fecha_completado DESC`,
      [nombre]
    );

    // Devolver array de IDs de cursos (para que el frontend pueda hacer .includes())
    const cursosIds = rows.map(r => r.curso);

    res.json({
      ok: true,
      cursosCompletados: cursosIds, // Array de IDs: ["derechos_laborales", "igualdad_genero", ...]
      detalles: rows.map(r => ({
        curso: r.curso,
        nombre_completo: CURSOS_MAP[r.curso] || r.curso,
        fecha: r.fecha_completado
      }))
    });

  } catch (err) {
    console.error("❌ Error en /progreso/cursos-completados:", err);
    res.status(500).json({ ok: false, message: "Error" });
  }
});

// 7️⃣ VERIFICAR SI UN CURSO ESTÁ COMPLETADO
router.post("/curso-completado", async (req, res) => {
  try {
    const { nombre, curso } = req.body;

    if (!nombre || !curso) {
      return res.status(400).json({ ok: false, message: "Datos incompletos" });
    }

    const [rows] = await db.query(
      `SELECT curso, fecha_completado FROM cursos_completados
       WHERE nombre = $1 AND curso = $2`,
      [nombre, curso]
    );

    const estaCompletado = rows.length > 0;

    res.json({
      ok: true,
      completado: estaCompletado,
      fecha_completado: estaCompletado ? rows[0].fecha_completado : null
    });

  } catch (err) {
    console.error("❌ Error en /progreso/curso-completado:", err);
    res.status(500).json({ ok: false, message: "Error" });
  }
});

export default router;

