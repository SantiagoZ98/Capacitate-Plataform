import express from 'express';
import db from '../db.js';
import { authenticateAdminProceso } from '../middlewares/adminProcesoAuth.js';

const router = express.Router();
const supabase = db.supabase;

// 4 cursos estáticos
const CURSOS_ESTATICOS = [
  'derechos_laborales',
  'igualdad_genero',
  'erradicacion_Violencia',
  'otrosRelacionados'
];

// GET ASISTENCIA DEL PROCESO - Solo usuarios que completaron 4 cursos + aprobaron
router.get('/asistencia/proceso', authenticateAdminProceso, async (req, res) => {
  try {
    console.log('📖 Obteniendo asistencia: usuarios que completaron 4 cursos + aprobaron prueba');

    // 1. Obtener usuarios que completaron TODOS los 4 cursos
    const { data: cursosCompletados, error: errorCursos } = await supabase
      .from('cursos_completados')
      .select('nombre, curso, fecha_completado')
      .in('curso', CURSOS_ESTATICOS);

    if (errorCursos) {
      console.error('❌ Error consultando cursos completados:', errorCursos);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener cursos completados',
        error: errorCursos.message
      });
    }

    // Agrupar por usuario y contar cuántos cursos completó
    const usuariosCursos = {};
    (cursosCompletados || []).forEach(r => {
      if (!usuariosCursos[r.nombre]) {
        usuariosCursos[r.nombre] = { nombre: r.nombre, cursosCompletados: 0, ultimaFecha: r.fecha_completado };
      }
      usuariosCursos[r.nombre].cursosCompletados += 1;
      if (new Date(r.fecha_completado) > new Date(usuariosCursos[r.nombre].ultimaFecha)) {
        usuariosCursos[r.nombre].ultimaFecha = r.fecha_completado;
      }
    });

    // Filtrar solo usuarios que completaron los 4 cursos
    const usuariosQue4Cursos = Object.values(usuariosCursos)
      .filter(u => u.cursosCompletados === 4)
      .map(u => u.nombre);

    console.log(`✅ ${usuariosQue4Cursos.length} usuarios completaron los 4 cursos`);

    if (usuariosQue4Cursos.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // 2. Obtener resultados de prueba (aprobados)
    const { data: resultados, error: errorResultados } = await supabase
      .from('resultados')
      .select('nombre, puntaje, aprobado, fecha_registro')
      .eq('aprobado', true)
      .eq('proceso', 'Talento Humano');

    if (errorResultados) {
      console.error('❌ Error consultando resultados:', errorResultados);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener resultados',
        error: errorResultados.message
      });
    }

    // Mapear aprobados
    const usuariosAprobados = new Set();
    (resultados || []).forEach(r => {
      usuariosAprobados.add(r.nombre);
    });

    console.log(`✅ ${usuariosAprobados.size} usuarios aprobaron`);

    // 3. Obtener datos personales
    const { data: personal, error: errorPersonal } = await supabase
      .from('personal')
      .select('nombre, cedula_identidad, cargo, proceso');

    if (errorPersonal) {
      console.error('❌ Error consultando personal:', errorPersonal);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener datos personales',
        error: errorPersonal.message
      });
    }

    // Mapear personal
    const personalMap = {};
    (personal || []).forEach(p => {
      personalMap[p.nombre] = {
        cedula_identidad: p.cedula_identidad,
        cargo: p.cargo,
        proceso: p.proceso
      };
    });

    // 4. Combinar: solo usuarios que hicieron 4 cursos + aprobaron
    const registrosFiltrados = usuariosQue4Cursos
      .filter(nombre => usuariosAprobados.has(nombre))
      .map(nombre => ({
        id: personalMap[nombre]?.cedula_identidad || nombre,
        usuario_nombre: nombre,
        cedula_identidad: personalMap[nombre]?.cedula_identidad || '—',
        usuario_cargo: personalMap[nombre]?.cargo || '—',
        usuario_proceso: personalMap[nombre]?.proceso || '—',
        curso_id: 'tthh',
        curso_nombre: 'Igualdad Laboral y No Discriminación',
        curso_descripcion: '1. Derechos laborales de mujeres y hombres\n2. Igualdad de género\n3. Erradicación de violencia y no discriminación en un centro de trabajo\n4. Otros relacionados para establecer el trabajo de igual valor',
        curso_fecha_inicio: '28/10/2026',
        curso_duracion: '40 horas',
        curso_dirigido_a: 'Todo el personal',
        curso_proceso: 'Igualdad Laboral y No Discriminación',
        inicio_en: usuariosCursos[nombre]?.ultimaFecha,
        fin_en: usuariosCursos[nombre]?.ultimaFecha,
        estado: 'completado'
      }));

    console.log(`✅ ${registrosFiltrados.length} usuarios completaron 4 cursos + aprobaron prueba`);

    res.json({
      success: true,
      data: registrosFiltrados
    });

  } catch (err) {
    console.error('❌ Error en /asistencia/proceso:', err);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

export default router;
