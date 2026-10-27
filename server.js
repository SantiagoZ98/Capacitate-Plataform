import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import './db.js'; 

import authRoutes from './routes/auth.js';
import usuarioRoutes from './routes/usuarios.js';
import progresoRoutes from './routes/progreso.js';
import resultadosRoutes from "./routes/resultados.js";

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

app.listen(process.env.PORT, () => {
    console.log(`Servidor backend corriendo en puerto ${PORT}`);
});
