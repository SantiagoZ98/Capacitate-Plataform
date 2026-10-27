import express from "express";
import db from "../db.js";

const router = express.Router();

// Obtener cliente Supabase directo
const supabase = db.supabase;

// ============================================
// SOLO CURSOS ESTÁTICOS TALENTO HUMANO
// ============================================

const CURSOS_MAP = {
  "derechos_laborales": "La base de la Justicia Laboral Igualdad y Cero Discriminación",
  "igualdad_genero": "Equidad por Ley",
  "erradicacion_Violencia": "Derechos Laborales",
  "otrosRelacionados": "Igualdad Salarial"
};

const CURSOS_IDS = ["derechos_laborales", "igualdad_genero", "erradicacion_Violencia", "otrosRelacionados"];

// 1️⃣ OBTENER PROGRESO DEL USUARIO (lo crea si no existe)
router.post("/get", async (req, res) => {
  try {
    const { nombre } = req.body;

    if (!nombre) {
      return res.status(400).json({ ok: false, message: "Nombre requerido" });
    }

    // Buscar usuario en usuariosprogreso
    const { data: rows, error: selectError } = await supabase
      .from("usuariosprogreso")
      .select("progreso, prueba_aprobada")
      .eq("nombre", nombre)
      .eq("proceso", "talento_humano");

    if (selectError) throw selectError;

    // Si NO existe, crearlo
    if (!rows || rows.length === 0) {
      console.log(`✅ Creando progreso inicial para: ${nombre}`);
      const { error: insertError } = await supabase
        .from("usuariosprogreso")
        .insert([{
          nombre,
          proceso: "talento_humano",
          progreso: 0,
          prueba_aprobada: false
        }]);

      if (insertError) {
        console.error("⚠️ Error al crear:", insertError.message);
        // No es crítico si ya existe
      }

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
    res.status(500).json({ ok: false, message: err.message });
  }
});

// 2️⃣ MARCAR NIVEL COMO COMPLETADO
router.post("/item", async (req, res) => {
  try {
    const { nombre, curso, item_id } = req.body;

    if (!nombre || !curso || item_id === undefined) {
      return res.status(400).json({ ok: false, message: "Datos incompletos" });
    }

    console.log(`📝 Marcando nivel ${item_id} completado en ${curso} para ${nombre}`);

    // Guardar en progreso_cursos usando Supabase
    const { error: upsertError } = await supabase
      .from("progreso_cursos")
      .upsert([{
        nombre,
        curso,
        item_id,
        completado: true
      }], { onConflict: "nombre,curso,item_id" });

    if (upsertError) throw upsertError;

    console.log(`✅ Nivel ${item_id} guardado`);
    res.json({ ok: true, message: "Nivel guardado" });

  } catch (err) {
    console.error("❌ Error en /progreso/item:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// 3️⃣ OBTENER NIVELES COMPLETADOS DE UN CURSO
router.get("/items/:nombre/:curso", async (req, res) => {
  try {
    const { nombre, curso } = req.params;

    if (!nombre || !curso) {
      return res.status(400).json({ ok: false, message: "Parámetros incompletos" });
    }

    console.log(`📖 Leyendo items completados para ${nombre} en ${curso}`);

    const { data: items, error: selectError } = await supabase
      .from("progreso_cursos")
      .select("item_id")
      .eq("nombre", nombre)
      .eq("curso", curso)
      .eq("completado", true);

    if (selectError) {
      console.error("❌ Error al leer progreso_cursos:", selectError);
      throw selectError;
    }

    console.log(`✅ Items encontrados:`, items);

    // Convertir item_id a número para que coincida con frontend
    const completados = items ? items.map(i => Number(i.item_id)) : [];

    console.log(`✅ Devolviendo completados (números):`, completados);

    res.json({
      ok: true,
      completados
    });

  } catch (err) {
    console.error("❌ Error en /progreso/items:", err);
    res.status(500).json({ ok: false, message: err.message });
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

    // 1. Guardar en cursos_completados usando Supabase directo
    const { data: insertData, error: insertError } = await supabase
      .from("cursos_completados")
      .upsert([{
        nombre,
        curso,
        fecha_completado: new Date().toISOString(),
        progreso: 100
      }], { onConflict: "nombre,curso" })
      .select();

    if (insertError) {
      console.error("❌ Error al insertar en cursos_completados:", insertError);
      throw insertError;
    }

    console.log(`✅ Insertado en cursos_completados:`, insertData);

    // 2. Contar cuántos de los 4 cursos ha completado
    const { data: countData, error: countError } = await supabase
      .from("cursos_completados")
      .select("curso", { count: "exact" })
      .eq("nombre", nombre)
      .in("curso", CURSOS_IDS);

    if (countError) {
      console.error("❌ Error al contar cursos:", countError);
      throw countError;
    }

    const cursoCompletados = countData?.length ?? 0;
    const nuevoProgreso = Math.min(100, (cursoCompletados / 4) * 100);

    console.log(`✅ Cursos completados: ${cursoCompletados}/4 = ${nuevoProgreso}% progreso`);

    // 3. ACTUALIZAR usuariosprogreso
    const { data: updateData, error: updateError } = await supabase
      .from("usuariosprogreso")
      .update({
        progreso: nuevoProgreso,
        updated_at: new Date().toISOString()
      })
      .eq("nombre", nombre)
      .eq("proceso", "talento_humano")
      .select();

    if (updateError) {
      console.error("❌ Error al actualizar usuariosprogreso:", updateError);
      throw updateError;
    }

    if (!updateData || updateData.length === 0) {
      // Si no existe, crear
      console.log(`📝 Creando usuariosprogreso para ${nombre} con progreso ${nuevoProgreso}%`);
      const { data: insertProgreso, error: insertError2 } = await supabase
        .from("usuariosprogreso")
        .insert([{
          nombre,
          proceso: "talento_humano",
          progreso: nuevoProgreso,
          prueba_aprobada: false
        }])
        .select();

      if (insertError2) {
        console.error("❌ Error creando usuariosprogreso:", insertError2);
        throw insertError2;
      }

      console.log(`✅ Creado usuariosprogreso:`, insertProgreso);
    } else {
      console.log(`✅ Actualizado usuariosprogreso:`, updateData);
    }

    res.json({
      ok: true,
      message: "Curso completado",
      progreso: nuevoProgreso,
      cursos_completados: cursoCompletados
    });

  } catch (err) {
    console.error("❌ Error en /progreso/marcar-curso-completado:", err);
    res.status(500).json({ ok: false, message: err.message || "Error en el servidor" });
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

    const { data: updateData, error: updateError } = await supabase
      .from("usuariosprogreso")
      .update({
        prueba_aprobada,
        updated_at: new Date().toISOString()
      })
      .eq("nombre", nombre)
      .eq("proceso", "talento_humano")
      .select();

    if (updateError) throw updateError;

    if (!updateData || updateData.length === 0) {
      // Crear si no existe
      console.log(`📝 Creando usuariosprogreso para ${nombre} con prueba=${prueba_aprobada}`);
      const { error: insertError } = await supabase
        .from("usuariosprogreso")
        .insert([{
          nombre,
          proceso: "talento_humano",
          progreso: 0,
          prueba_aprobada
        }]);

      if (insertError) throw insertError;
    }

    res.json({
      ok: true,
      prueba_aprobada: updateData?.[0]?.prueba_aprobada ?? prueba_aprobada
    });

  } catch (err) {
    console.error("❌ Error en /progreso/update:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// 6️⃣ OBTENER CURSOS COMPLETADOS DEL USUARIO
router.get("/cursos-completados/:nombre", async (req, res) => {
  try {
    const { nombre } = req.params;

    const { data: rows, error: selectError } = await supabase
      .from("cursos_completados")
      .select("curso, fecha_completado")
      .eq("nombre", nombre)
      .order("fecha_completado", { ascending: false });

    if (selectError) throw selectError;

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
    res.status(500).json({ ok: false, message: err.message });
  }
});

// 7️⃣ VERIFICAR SI UN CURSO ESTÁ COMPLETADO
router.post("/curso-completado", async (req, res) => {
  try {
    const { nombre, curso } = req.body;

    if (!nombre || !curso) {
      return res.status(400).json({ ok: false, message: "Datos incompletos" });
    }

    const { data: rows, error: selectError } = await supabase
      .from("cursos_completados")
      .select("curso")
      .eq("nombre", nombre)
      .eq("curso", curso);

    if (selectError) throw selectError;

    const completado = rows && rows.length > 0;

    res.json({
      ok: true,
      completado
    });

  } catch (err) {
    console.error("❌ Error en /progreso/curso-completado:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

export default router;
