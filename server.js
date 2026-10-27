import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import './db.js'; 

import authRoutes from './routes/auth.js';
import usuarioRoutes from './routes/usuarios.js';
import progresoRoutes from './routes/progreso.js';
import resultadosRoutes from "./routes/resultados.js";
import documentosRoutes from './routes/documentos.js';
import cursosRoutes from './routes/cursos.js';
import modulosRoutes from './routes/modulos.js';
import evaluacionesRoutes from './routes/evaluaciones.js';
import inscripcionesRoutes from './routes/inscripciones.js';
import progresoModulosRoutes from './routes/progresoModulos.js';
import notificacionesRoutes from './routes/notificaciones.js';
import versionCursosRoutes from './routes/versionCursos.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

// Rutas existentes
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/progreso', progresoRoutes);
app.use('/api/resultados', resultadosRoutes);
app.use('/api/documentos', documentosRoutes);

// Nuevas rutas para gestión de cursos (Moodle)
app.use('/api/cursos', cursosRoutes);
app.use('/api/modulos', modulosRoutes);
app.use('/api/evaluaciones', evaluacionesRoutes);
app.use('/api/inscripciones', inscripcionesRoutes);
app.use('/api/progreso-modulos', progresoModulosRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api/version-cursos', versionCursosRoutes);

app.listen(process.env.PORT, () => {
    console.log(`Servidor backend corriendo en puerto ${PORT}`);
});
