// Saber si una carpeta vive en un volumen montado o en el disco temporal del contenedor.
// Se separa del servidor para poder probarlo con contenidos de /proc/self/mountinfo de mentira.

// Cada línea de mountinfo tiene el punto de montaje en la 5ª columna:
// 36 35 98:0 /mnt1 /data rw,noatime master:1 - ext3 /dev/sda1 rw,errors=continue
export function puntosDeMontaje(mountinfo) {
  return String(mountinfo || '')
    .split('\n')
    .map((linea) => linea.split(' ')[4])
    .filter(Boolean);
}

// true  → la carpeta está dentro de un montaje (volumen persistente)
// false → sólo cuelga de "/", es decir, del disco efímero del contenedor
export function rutaEnMontaje(mountinfo, dir) {
  const norm = String(dir || '').replace(/\/+$/, '');
  if (!norm) return false;
  return puntosDeMontaje(mountinfo).some((p) => p === norm || (p !== '/' && norm.startsWith(p + '/')));
}
