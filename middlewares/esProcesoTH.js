// Procesos con los mismos permisos que Talento Humano
const PROCESOS_TH = ['talento humano', 'administrador'];

export const esProcesoTH = (nombre) =>
    PROCESOS_TH.includes(String(nombre ?? '').trim().toLowerCase());
