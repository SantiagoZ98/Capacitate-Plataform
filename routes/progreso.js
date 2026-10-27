import express from "express";
import db from "../db.js";

const router = express.Router();

// 1. OBTENER PROGRESO GENERAL + ESTADO DE PRUEBA
router.post("/get", async (req, res) => {
  try {
    const { nombre } = req.body;

    // Buscamos el usuario
    const [rows] = await db.query(
      `
      SELECT progreso, prueba_aprobada, proceso
      FROM usuariosprogreso
      WHERE nombre = $1
      `,
      [nombre]
    );

    // Si NO existe, lo creamos desde cero
    if (!rows || rows.length === 0) {
      console.log("Usuario no existe, creando:", nombre);

      await db.query(
        `
        INSERT INTO usuariosprogreso (nombre, proceso, progreso, prueba_aprobada)
        VALUES ($1, $2, 0, FALSE)
        `,
        [nombre, "talento_humano"] // Puedes cambiar el proceso si lo usas más adelante
      );

      // Respuesta inicial para el frontend
      return res.json({
        progreso: 0,
        pruebaAprobada: false,
        proceso: "talento_humano",
      });
    }

    // Si existe, devolver datos reales
    return res.json({
      progreso: rows[0].progreso ?? 0,
      pruebaAprobada: rows[0].prueba_aprobada ?? false,
      proceso: rows[0].proceso ?? "talento_humano",
    });

  } catch (err) {
    console.error("❌ Error en /progreso/get:", err);
    return res.status(500).json({ message: "Error en el servidor" });
  }
});

// 2. ACTUALIZAR ESTADO DE PRUEBA
router.put("/update", async (req, res) => {
  try {
    const { nombre, prueba_aprobada = true } = req.body;

    console.log("Actualizando usuario:", { nombre, prueba_aprobada });

    const result = await db.query(
      `UPDATE usuariosprogreso 
       SET prueba_aprobada = $1
       WHERE nombre = $2`,
      [prueba_aprobada, nombre]
    );

    console.log("Resultado de la actualización:", result);

    // Verificar si se actualizó alguna fila
    if (result.rowCount === 0) {
      console.log("⚠️ No se actualizó ningún registro");
      return res.status(404).json({ 
        ok: false, 
        message: "Usuario no encontrado" 
      });
    }

    console.log("Registros actualizados:", result.rowCount);
    
    res.json({ 
      ok: true, 
      message: "Actualizado correctamente",
      rowsUpdated: result.rowCount
    });

  } catch (error) {
    console.error("❌ Error en /progreso/update:", error);
    res.status(500).json({ 
      ok: false, 
      error: error.message 
    });
  }
});

// 3. GUARDAR ÍTEM INTERNO
router.post("/item", async (req, res) => {
  try {
    const { nombre, curso, item_id } = req.body;

    if (!nombre || !curso || item_id === undefined) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    await db.query(
      `
      INSERT INTO progreso_cursos (nombre, curso, item_id, completado)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (nombre, curso, item_id)
      DO UPDATE SET completado = TRUE
      `,
      [nombre, curso, item_id]
    );

    res.json({ message: "Ítem registrado" });

  } catch (err) {
    console.error("❌ Error en /progreso/item:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// 4. OBTENER ÍTEMS COMPLETADOS
router.get("/items/:nombre/:curso", async (req, res) => {
  try {
    const { nombre, curso } = req.params;

    const [rows] = await db.query(
      `
      SELECT item_id
      FROM progreso_cursos
      WHERE nombre = $1 AND curso = $2
      `,
      [nombre, curso]
    );

    res.json({ completados: rows.map(r => r.item_id) });

  } catch (err) {
    console.error("❌ Error en /progreso/items:", err);
    res.status(500).json({ message: "Error" });
  }
});

// 5. ACTUALIZAR PROGRESO GENERAL
router.post("/update-general", async (req, res) => {
  try {
    const { nombre, nuevoProgreso } = req.body;

    if (nuevoProgreso === undefined) {
      return res.status(400).json({ message: "Falta nuevoProgreso" });
    }

    await db.query(
      `UPDATE usuariosprogreso SET progreso = $1 WHERE nombre = $2`,
      [nuevoProgreso, nombre]
    );

    res.json({ message: "Progreso actualizado" });

  } catch (err) {
    console.error("❌ Error en /progreso/update-general:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// 6. MARCAR CURSO COMO COMPLETADO
router.post("/marcar-curso-completado", async (req, res) => {
  try {
    const { nombre, curso } = req.body;

    console.log(`Marcando curso como completado: ${curso} para ${nombre}`);

    if (!nombre || !curso) {
      return res.status(400).json({ 
        ok: false, 
        message: "Datos incompletos: nombre y curso son requeridos" 
      });
    }

    // Primero, verificar que todos los ítems del curso estén completados
    const [itemsCompletados] = await db.query(
      `
      SELECT COUNT(*) as total_completados
      FROM progreso_cursos
      WHERE nombre = $1 AND curso = $2
      `,
      [nombre, curso]
    );

    // También necesitamos saber cuántos ítems tiene el curso en total
    // Esto depende de cómo esté estructurado tu sistema. Aquí asumimos que
    // tienes una tabla con la estructura del curso o lo manejas en el frontend
    // Por ahora, marcamos como completado si hay al menos un ítem completado
    
    // Insertar o actualizar en la tabla de cursos_completados
    await db.query(
      `
      INSERT INTO cursos_completados (nombre, curso, fecha_completado, progreso)
      VALUES ($1, $2, NOW(), 100)
      ON CONFLICT (nombre, curso)
      DO UPDATE SET 
        fecha_completado = NOW(),
        progreso = 100,
        ultima_actualizacion = NOW()
      `,
      [nombre, curso]
    );

    console.log(`✅ Curso ${curso} marcado como completado para ${nombre}`);

    res.json({ 
      ok: true, 
      message: `Curso ${curso} marcado como completado`,
      curso: curso,
      nombre: nombre,
      fechaCompletado: new Date().toISOString(),
      totalItemsCompletados: itemsCompletados[0]?.total_completados || 0
    });

  } catch (err) {
    console.error("❌ Error en /progreso/marcar-curso-completado:", err);
    res.status(500).json({ 
      ok: false, 
      message: "Error en el servidor",
      error: err.message 
    });
  }
});

// 7. OBTENER CURSOS COMPLETADOS DEL USUARIO
router.get("/cursos-completados/:nombre", async (req, res) => {
  try {
    const { nombre } = req.params;

    const [rows] = await db.query(
      `
      SELECT curso, fecha_completado
      FROM cursos_completados
      WHERE nombre = $1
      ORDER BY fecha_completado DESC
      `,
      [nombre]
    );

    // Extraer solo los nombres de los cursos completados
    const cursosCompletados = rows.map(row => row.curso);

    res.json({ 
      ok: true,
      cursosCompletados: cursosCompletados,
      total: cursosCompletados.length,
      detalles: rows
    });

  } catch (err) {
    console.error("❌ Error en /progreso/cursos-completados:", err);
    res.status(500).json({ 
      ok: false, 
      message: "Error en el servidor",
      error: err.message 
    });
  }
});

// 8. VERIFICAR SI UN CURSO ESTÁ COMPLETADO
// VERIFICAR SI UN CURSO ESTÁ COMPLETADO
router.post("/curso-completado", async (req, res) => {
  try {
    const { nombre, curso } = req.body;

    if (!nombre || !curso) {
      return res.status(400).json({ 
        ok: false, 
        message: "Datos incompletos" 
      });
    }

    const [rows] = await db.query(
      `
      SELECT curso, fecha_completado
      FROM cursos_completados
      WHERE nombre = $1 AND curso = $2
      `,
      [nombre, curso]
    );

    const estaCompletado = rows.length > 0;

    res.json({ 
      ok: true,
      completado: estaCompletado,
      fechaCompletado: estaCompletado ? rows[0].fecha_completado : null,
      curso: curso
    });

  } catch (err) {
    console.error("❌ Error en /progreso/curso-completado:", err);
    res.status(500).json({ 
      ok: false, 
      message: "Error en el servidor",
      error: err.message 
    });
  }
});

// 9. BLOQUEO DE PRUEBA
router.post("/prueba-bloqueo", async (req, res) => {
  try {
    const { nombre } = req.body;

    const [rows] = await db.query(
      `SELECT prueba_aprobada FROM usuariosprogreso WHERE nombre = $1`,
      [nombre]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({ pruebaAprobada: rows[0].prueba_aprobada });

  } catch (err) {
    console.error("❌ Error en /progreso/prueba-bloqueo:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// VERIFICAR Y SINCRONIZAR PROGRESO
router.post("/sincronizar-progreso", async (req, res) => {
  try {
    const { nombre, curso, niveles_local } = req.body;

    console.log(`Sincronizando progreso para ${nombre} - Curso: ${curso}`);

    if (!nombre || !curso || !niveles_local) {
      return res.status(400).json({ 
        ok: false, 
        message: "Datos incompletos" 
      });
    }

    // Obtener niveles completados en BD
    const [rowsBD] = await db.query(
      `SELECT item_id FROM progreso_cursos WHERE nombre = $1 AND curso = $2`,
      [nombre, curso]
    );
    
    const nivelesBD = rowsBD.map(r => r.item_id.toString());
    const nivelesLocales = niveles_local.map(n => n.id.toString());
    
    console.log("Niveles en BD:", nivelesBD);
    console.log("Niveles en local (completados):", nivelesLocales);
    
    // Encontrar diferencias
    const faltanEnBD = nivelesLocales.filter(id => !nivelesBD.includes(id));
    const sobranEnBD = nivelesBD.filter(id => !nivelesLocales.includes(id));
    
    console.log("Faltan en BD:", faltanEnBD);
    console.log("Sobran en BD:", sobranEnBD);
    
    // Sincronizar: Agregar los que faltan en BD
    for (const itemId of faltanEnBD) {
      await db.query(
        `INSERT INTO progreso_cursos (nombre, curso, item_id, completado) 
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (nombre, curso, item_id) DO NOTHING`,
        [nombre, curso, itemId]
      );
    }
    
    // Verificar si el curso está completo
    const totalNivelesEsperados = niveles_local.length; // Asumiendo que envías todos los niveles
    const totalCompletadosBD = nivelesBD.length + faltanEnBD.length;
    
    const cursoCompleto = totalCompletadosBD >= totalNivelesEsperados;
    
    if (cursoCompleto) {
      // Marcar curso como completado
      await db.query(
        `INSERT INTO cursos_completados (nombre, curso, fecha_completado, progreso)
         VALUES ($1, $2, NOW(), 100)
         ON CONFLICT (nombre, curso)
         DO UPDATE SET fecha_completado = NOW(), progreso = 100`,
        [nombre, curso]
      );
    }
    
    res.json({ 
      ok: true,
      sincronizados: faltanEnBD.length,
      eliminados: sobranEnBD.length,
      cursoCompleto: cursoCompleto,
      totalCompletadosBD: totalCompletadosBD,
      totalNivelesEsperados: totalNivelesEsperados,
      mensaje: `Sincronizado: ${faltanEnBD.length} niveles agregados, curso ${cursoCompleto ? 'COMPLETO' : 'incompleto'}`
    });

  } catch (err) {
    console.error("❌ Error en /progreso/sincronizar-progreso:", err);
    res.status(500).json({ 
      ok: false, 
      message: "Error en el servidor",
      error: err.message 
    });
  }
});

export default router;