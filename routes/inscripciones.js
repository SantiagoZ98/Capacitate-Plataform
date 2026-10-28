import express from 'express';
import db from '../db.js';
import { authenticateAdminProceso } from '../middlewares/adminProcesoAuth.js';

const router = express.Router();
const supabase = db.supabase;

// 4 cursos estáticos
const CURSOS_ESTATICOS = [
  'derechos_laborales',
  'igualdad_genero',
  'talento_humano',
  'otrosRelacionados'
];

// GET ASISTENCIA DEL PROCESO - Solo los 4 cursos estáticos
router.get('/asistencia/proceso', authenticateAdminProceso, async (req, res) => {
  try {
    console.log('📖 Obteniendo asistencia de los 4 cursos estáticos');

    // Usar Supabase SDK para traer datos de procesos_curso
    const { data, error } = await supabase
      .from('procesos_curso')
      .select(`
        id,
        usuario:personal(nombre, cedula_identidad, cargo, proceso),
        curso:cursos(nombre, descripcion, fecha_inicio, duracion, dirigido_a, proceso),
        fecha_inicio,
        fecha_fin,
        estado
      `)
      .in('curso_nombre', CURSOS_ESTATICOS)
      .order('fecha_inicio', { ascending: false });

    if (error) {
      console.error('❌ Error consultando asistencia:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener asistencia',
        error: error.message
      });
    }

    // Transformar datos para que coincida con lo que espera el frontend
    const registrosFormateados = (data || []).map(r => ({
      id: r.id,
      usuario_nombre: r.usuario?.nombre || '—',
      cedula_identidad: r.usuario?.cedula_identidad || '—',
      usuario_cargo: r.usuario?.cargo || '—',
      usuario_proceso: r.usuario?.proceso || '—',
      curso_id: r.curso?.id,
      curso_nombre: r.curso?.nombre || '—',
      curso_descripcion: r.curso?.descripcion || '—',
      curso_fecha_inicio: r.curso?.fecha_inicio,
      curso_duracion: r.curso?.duracion || '—',
      curso_dirigido_a: r.curso?.dirigido_a || '—',
      curso_proceso: r.curso?.proceso || '—',
      inicio_en: r.fecha_inicio,
      fin_en: r.fecha_fin,
      estado: r.estado || 'sin iniciar'
    }));

    console.log(`✅ ${registrosFormateados.length} registros de asistencia obtenidos`);

    res.json({
      success: true,
      data: registrosFormateados
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
