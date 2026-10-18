# Despliegue en cPanel con Node.js (Hosting del Caribe)

La app es **Node.js + MySQL**. En producción **un solo proceso Node** sirve el
API (`/api/...`) y el frontend ya compilado (`client/dist`), todo en el mismo
dominio. No hace falta configurar CORS ni URLs: el cliente llama a `/api` en
ruta relativa.

## Resumen

1. Crear base de datos MySQL y usuario en cPanel.
2. Subir el código al servidor (Git o File Manager).
3. Compilar el frontend (`client/dist`).
4. Crear la app Node en cPanel apuntando a `server/`.
5. Configurar variables de entorno (en vez de `.env`).
6. Instalar dependencias, inicializar la BD y arrancar.

---

## 1. Base de datos (cPanel → "MySQL® Databases")

1. **Create New Database** → nombre, p. ej. `pelota`. cPanel lo guarda con un
   prefijo: queda algo como `cpaneluser_pelota`. **Anota el nombre completo.**
2. **Add New User** → usuario y contraseña fuerte. Queda `cpaneluser_pelotauser`.
3. **Add User To Database** → selecciona el usuario y la BD y marca
   **ALL PRIVILEGES**.

> En hosting compartido el usuario MySQL no puede ejecutar `CREATE DATABASE`.
> Por eso la BD se crea aquí, desde el panel. `npm run db:init` ya está
> preparado para ese caso: si no puede crear la BD, la usa tal cual.

## 2. Código en el servidor

**Opción A — Git (recomendada):** cPanel → "Git™ Version Control" → **Create**,
pega la URL del repo de GitHub y define la carpeta destino (p. ej.
`/home/cpaneluser/pelota`). Para repos privados añade antes tu clave SSH o usa
la URL HTTPS con token.

**Opción B — Subida manual:** comprime el proyecto **sin** `node_modules` ni
`client/dist`, súbelo por File Manager y descomprímelo.

## 3. Compilar el frontend

El build (`client/dist`) **no** está en el repo. Genéralo en el servidor:

```bash
cd ~/pelota/client
npm install            # incluye devDependencies (vite)
npm run build          # crea client/dist
```

Si prefieres no compilar en el servidor, ejecuta `npm run build` en tu PC y sube
la carpeta `client/dist` por File Manager a `~/pelota/client/dist`.

## 4. Crear la app Node (cPanel → "Setup Node.js App")

- **Create Application**
- **Node.js version:** 18 o superior.
- **Application mode:** Production.
- **Application root:** `pelota/server`  ← la carpeta del backend.
- **Application URL:** el dominio o subdominio donde vivirá la app.
- **Application startup file:** `src/index.js`

Guarda. cPanel crea un entorno virtual de Node para esa app.

## 5. Variables de entorno

En la misma pantalla de la app Node, sección **Environment variables**, añade
(equivalen al `.env`, que **no** se sube):

| Variable       | Valor                                             |
|----------------|---------------------------------------------------|
| `DB_HOST`      | `localhost`                                       |
| `DB_PORT`      | `3306`                                            |
| `DB_USER`      | `cpaneluser_pelotauser`                           |
| `DB_PASSWORD`  | (la contraseña del usuario MySQL)                 |
| `DB_NAME`      | `cpaneluser_pelota`                               |
| `JWT_SECRET`   | una cadena larga y aleatoria (¡cámbiala!)         |
| `ADMIN_USER`   | `admin`                                           |
| `ADMIN_PASSWORD` | una contraseña fuerte para el admin             |

> **No** definas `PORT`: Passenger (el motor de cPanel) lo asigna solo y el
> servidor ya lo lee de `process.env.PORT`.

## 6. Instalar, inicializar y arrancar

En la pantalla de la app Node, usa **Run NPM Install** (instala `server/`), o
abre la terminal del entorno virtual (el panel muestra el comando
`source /home/.../bin/activate`) y ejecuta:

```bash
cd ~/pelota/server
npm install
npm run db:init        # aplica el esquema y crea el usuario admin
# npm run db:seed      # opcional: datos de ejemplo (NO usar si vas a migrar los reales)
```

Luego **Restart** en la app Node. Visita tu dominio: debería cargar la app, y
`tudominio/api/health` debe responder `{"ok":true,...}`.

---

## Migrar tus datos reales (liga Ciénaga)

Para llevar los datos de tu máquina local al servidor:

1. En tu PC, exporta la BD local (solo datos + esquema de la liga que quieres):
   ```bash
   mysqldump -u root pelota > pelota.sql
   ```
2. En cPanel → **phpMyAdmin**, selecciona la BD `cpaneluser_pelota` y usa
   **Importar** para subir `pelota.sql`.
3. Si ya corriste `db:init` en el servidor y hay choque de tablas, importa en
   una BD vacía o borra las tablas antes de importar.

> El usuario admin y las contraseñas viven en la tabla `users`; si migras la BD
> completa, se conservan los de tu entorno local.

## Notas

- **OCR (tesseract.js):** corre en el navegador y descarga sus datos desde un
  CDN la primera vez; necesita conexión del lado del cliente, nada en el server.
- **Logs:** si la app no arranca, revisa los logs en "Setup Node.js App" o el
  `stderr.log` del dominio.
- **Actualizar:** `git pull` en el servidor → `npm install` si cambió algo →
  recompilar el cliente si cambió el frontend → **Restart** en la app Node.
