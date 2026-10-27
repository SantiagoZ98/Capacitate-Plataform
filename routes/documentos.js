import express from 'express';
import db from '../db.js';  // ← Importa el objeto completo

const router = express.Router();

// Guardar documento
router.post('/guardar', async (req, res) => {
  const { usuario, curso, apellidosNombres, ciPasaporte, proceso, cargo, fechaRecepcion } = req.body;
  
  console.log("Datos recibidos:", { usuario, curso, apellidosNombres, ciPasaporte, proceso, cargo, fechaRecepcion });
  
  try {
    // 1. Verificar si el usuario existe en personal
    const [checkRows] = await db.query(
      'SELECT cedula_identidad FROM personal WHERE cedula_identidad = ?',
      [ciPasaporte]
    );
    
    // 2. Si no existe, crearlo
    if (checkRows.length === 0) {
      console.log("Usuario no encontrado, creando...");
      await db.query(
        `INSERT INTO personal (nombre, cedula_identidad, proceso, cargo, empresa_socio) 
         VALUES (?, ?, ?, ?, ?)`,
        [apellidosNombres, ciPasaporte, proceso, cargo, 'Plataforma Capacitate']
      );
      console.log("Usuario creado en personal");
    }
    
    // 3. Guardar el documento
    const [rows] = await db.query(
      `INSERT INTO documentos_conformidad 
       (usuario, cedula_identidad, curso, apellidos_nombres, proceso, cargo, fecha_recepcion, fecha_envio) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       RETURNING id`,
      [usuario, ciPasaporte, curso, apellidosNombres, proceso, cargo, fechaRecepcion]
    );
    
    // Con PostgreSQL, RETURNING id devuelve el id en rows[0].id
    const insertedId = rows[0]?.id;
    console.log("Documento guardado, ID:", insertedId);
    res.json({ success: true, id: insertedId });
    
  } catch (error) {
    console.error('Error detallado en PostgreSQL:', error);
    console.error('Mensaje:', error.message);
    
    // Enviar error específico
    if (error.code === '23503') {
      res.status(500).json({ error: `La cédula ${ciPasaporte} no existe en la base de datos de personal` });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Verificar si ya envió documento
router.get('/verificar/:usuario/:curso', async (req, res) => {
  const { usuario, curso } = req.params;
  
  try {
    const [rows] = await db.query(
      'SELECT * FROM documentos_conformidad WHERE usuario = ? AND curso = ?',
      [usuario, curso]
    );
    
    res.json({ enviado: rows.length > 0, documento: rows[0] });
  } catch (error) {
    console.error('Error verificando:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener todos los documentos (para admin)
router.get('/todos', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        d.*,
        p.nombre,
        p.empresa_socio
      FROM documentos_conformidad d
      LEFT JOIN personal p ON d.cedula_identidad = p.cedula_identidad
      ORDER BY d.fecha_envio DESC
    `);
    console.log("Documentos encontrados:", rows.length);
    res.json(rows);
  } catch (error) {
    console.error('Error obteniendo documentos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener documento específico
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const [rows] = await db.query(
      'SELECT * FROM documentos_conformidad WHERE id = ?',
      [id]
    );
    
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ error: 'Documento no encontrado' });
    }
  } catch (error) {
    console.error('Error obteniendo documento:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;