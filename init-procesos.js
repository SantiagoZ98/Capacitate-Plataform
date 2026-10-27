/**
 * Script para inicializar procesos en la BD
 * Ejecutar: node init-procesos.js
 */

import db from './db.js';

const procesos = [
    'Talento Humano',
    'Dirección',
    'Seguridad Industrial'
];

async function inicializarProcesos() {
    console.log("🚀 Inicializando procesos...\n");

    try {
        // Primero, verificar qué procesos ya existen
        const [procesosExistentes] = await db.query("SELECT nombre FROM procesos");
        console.log("✅ Procesos actuales:", procesosExistentes.map(p => p.nombre));

        // Insertar procesos que no existen
        for (const nombre of procesos) {
            const [existe] = await db.query(
                "SELECT id FROM procesos WHERE nombre = $1",
                [nombre]
            );

            if (existe.length === 0) {
                const [resultado] = await db.query(
                    "INSERT INTO procesos (nombre) VALUES ($1) RETURNING id, nombre",
                    [nombre]
                );
                console.log(`✨ Proceso creado: "${resultado[0].nombre}" (ID: ${resultado[0].id})`);
            } else {
                console.log(`⏭️  Proceso ya existe: "${nombre}"`);
            }
        }

        console.log("\n✅ Inicialización completada");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

inicializarProcesos();
