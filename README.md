# Pelota — Gestión de Campeonatos de Béisbol

Sistema para administrar ligas de béisbol de barrio: múltiples ligas, reparto
aleatorio de equipos en grupos, generación de calendario justo (round-robin),
captura de boxscore por juego con actualización automática de estadísticas,
tabla de posiciones con reglas de desempate estilo MLB, página de líderes y
nóminas por equipo.

## Stack

- **Backend:** Node.js + Express + MySQL (`mysql2`), JWT para autenticación.
- **Frontend:** React + Vite + React Router.

## Estructura

```
code/
  server/   # API REST + lógica (calendario, posiciones, líderes)
  client/   # SPA React (vista pública + panel admin)
```

## Puesta en marcha

### 1. Base de datos (MySQL)

Necesitas MySQL instalado y corriendo. Copia `server/.env.example` a
`server/.env` y pon tus credenciales:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=pelota
JWT_SECRET=pon-un-secreto-largo-aqui
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
```

### 2. Backend

```bash
cd server
npm install
npm run db:init     # crea la base de datos, tablas y el usuario admin
npm run db:seed     # (opcional) datos de ejemplo
npm run dev         # arranca la API en http://localhost:4000
```

### 3. Frontend

```bash
cd client
npm install
npm run dev         # abre http://localhost:5173
```

Inicia sesión con el usuario/clave de `ADMIN_USER`/`ADMIN_PASSWORD`.

## Flujo de uso

1. **Crear liga** (nombre, temporada, formato grupos/única, nº de grupos, vueltas).
2. **Agregar equipos** (individual o en lote por cantidad).
3. **Reparto aleatorio** de equipos en grupos (botón "Sortear grupos").
4. **Generar calendario** (round-robin justo, todos juegan la misma cantidad).
5. **Capturar boxscore** de cada juego → posiciones, líderes y nóminas se
   actualizan solos.
6. Ver **posiciones**, **líderes** y **equipos/nóminas** en la vista pública.
