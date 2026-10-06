// Validación del carné (misma lógica que el backend) para feedback inmediato.
function daysInMonth(month) {
  const dim = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dim[month - 1];
}

export function validateCarnet(value) {
  if (value == null || String(value).trim() === '') {
    return { ok: false, error: 'El carné es obligatorio' };
  }
  const carnet = String(value).trim();
  if (!/^\d{11}$/.test(carnet)) {
    return { ok: false, error: 'Debe tener exactamente 11 dígitos' };
  }
  const yy = carnet.slice(0, 2);
  const mm = Number(carnet.slice(2, 4));
  const dd = Number(carnet.slice(4, 6));
  if (mm < 1 || mm > 12) return { ok: false, error: 'Mes inválido (dígitos 3-4)' };
  if (dd < 1 || dd > daysInMonth(mm)) return { ok: false, error: 'Día inválido (dígitos 5-6)' };
  return {
    ok: true,
    carnet,
    birth: `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yy}`,
  };
}
