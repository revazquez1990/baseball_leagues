// Validación del carné de identidad (11 dígitos; los primeros 6 son la fecha
// de nacimiento en formato aammdd).

function daysInMonth(month) {
  // Lenientes con el año bisiesto (aceptamos 29 de febrero siempre, porque el
  // siglo no se deduce de forma fiable de 2 dígitos).
  const dim = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dim[month - 1];
}

/**
 * Valida un carné. Devuelve { ok, error?, carnet?, birth? }.
 * birth es la fecha legible dd/mm/aa.
 */
export function validateCarnet(value) {
  if (value == null || String(value).trim() === '') {
    return { ok: false, error: 'El carné es obligatorio' };
  }
  const carnet = String(value).trim();
  if (!/^\d{11}$/.test(carnet)) {
    return { ok: false, error: 'El carné debe tener exactamente 11 dígitos' };
  }
  const yy = Number(carnet.slice(0, 2));
  const mm = Number(carnet.slice(2, 4));
  const dd = Number(carnet.slice(4, 6));
  if (mm < 1 || mm > 12) {
    return { ok: false, error: 'El mes en el carné (dígitos 3-4) debe estar entre 01 y 12' };
  }
  if (dd < 1 || dd > daysInMonth(mm)) {
    return { ok: false, error: `El día en el carné (dígitos 5-6) no es válido para el mes ${String(mm).padStart(2, '0')}` };
  }
  return {
    ok: true,
    carnet,
    birth: `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${String(yy).padStart(2, '0')}`,
  };
}
