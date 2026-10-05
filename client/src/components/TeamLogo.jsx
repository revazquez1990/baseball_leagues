import { useState } from 'react';

// Muestra el logo del equipo si hay URL; si no (o si la imagen falla),
// cae a un círculo con el color del equipo y su inicial.
export default function TeamLogo({ logoUrl, color = '#1e5aa8', name = '', size = 22 }) {
  const [failed, setFailed] = useState(false);
  const showImg = logoUrl && !failed;

  if (showImg) {
    return (
      <img
        src={logoUrl}
        alt={name}
        onError={() => setFailed(true)}
        style={{
          width: size, height: size, borderRadius: 5, objectFit: 'cover',
          verticalAlign: 'middle', marginRight: 8, background: '#fff',
        }}
      />
    );
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%', background: color,
        color: '#fff', fontSize: size * 0.5, fontWeight: 700,
        verticalAlign: 'middle', marginRight: 8, flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}
