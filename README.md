# PokéWish — Pokémon GO Wishlist

Web app para que un grupo de amigos pueda coordinar qué Pokémon quieren intercambiar en Pokémon GO, y quién ya tiene cada uno en hundo (100 IV) o shiny.

## Características

- **Instalable en Android (PWA)** — se puede añadir a la pantalla de inicio como app nativa
- **Vista tabla y tarjetas** — alterna entre los dos modos, se recuerda la preferencia
- **Tres flags por Pokémon y usuario** — ❤️ Quiero · 💎 100 IV · ✨ Shiny
- **Solo editas los tuyos** — los flags de otros usuarios se muestran como solo lectura
- **Filtros con intersección** — filtra por flag y por usuario simultáneamente para ver quién quiere/tiene qué
- **Shiny solo si existe** — la opción ✨ solo aparece para Pokémon que tienen shiny disponible en el juego
- **Nombres localizados** — cada usuario elige su idioma (15 disponibles)
- **Sistema de invitaciones** — el admin genera links; quien tiene el link elige usuario y contraseña
- **Panel de admin** — gestión de usuarios, roles y actualización de datos externos

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.12 + FastAPI |
| Frontend | Vanilla JS + HTML + CSS + [Lit](https://lit.dev) Web Components |
| Base de datos | PostgreSQL 16 |
| Datos de referencia | JSON en disco (game_master procesado, traducciones) |
| Despliegue | Docker Compose |
| Reverse proxy | Nginx |

## Fuentes de datos externas

| Fuente | Repositorio | Qué aporta |
|--------|-------------|-----------|
| Game Master | [alexelgt/game_masters](https://github.com/alexelgt/game_masters) | Stats, tipos, movimientos de cada Pokémon |
| Traducciones | [sora10pls/holoholo-text](https://github.com/sora10pls/holoholo-text) | Nombres en 15 idiomas |
| Assets | [pokemon-go-api/assets](https://github.com/pokemon-go-api/assets) | Detección de shinies disponibles + imágenes |

Las imágenes se sirven directamente desde GitHub (no se descargan al servidor). El admin puede actualizar cada fuente de forma independiente desde el panel de administración.

## Inicio rápido

### Requisitos

- Docker y Docker Compose

### 1. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con al menos:

```env
SECRET_KEY=una-clave-secreta-larga-y-aleatoria
ADMIN_PASSWORD=contraseña-del-admin-inicial
```

### 2. Arrancar

```bash
docker compose up -d
```

La app estará disponible en **http://localhost:8080** (o el puerto configurado con `APP_PORT`).

### 3. Primera vez: cargar datos

1. Entra con el usuario `admin` y la contraseña definida en `ADMIN_PASSWORD`
2. Ve a **Admin → Fuentes de datos**
3. Pulsa **Actualizar** en este orden:
   - **Game Master** — descarga y parsea ~18 MB, puede tardar 1-2 minutos
   - **Assets** — detecta qué Pokémon tienen shiny disponible
   - **Traducciones** — descarga los nombres en todos los idiomas
4. Una vez cargado el Game Master, la lista de Pokémon ya es visible

### 4. Invitar usuarios

> **Nota:** El usuario `admin` (o el configurado en `ADMIN_USERNAME`) es un usuario de gestión exclusivo. **No aparece en las listas de usuarios** ni en la tabla de flags — no puede marcar Pokémon propios. Su único propósito es administrar el sistema: crear invitaciones, gestionar usuarios y actualizar fuentes de datos.



1. Ve a **Admin → Invitaciones** y pulsa **Nueva invitación**
2. Copia el link generado y compártelo
3. El invitado abre el link, elige su nombre de usuario y contraseña

## Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Clave para firmar los JWT — **cámbiala en producción** | `change-me-in-production-please` |
| `ADMIN_USERNAME` | Nombre del admin inicial | `admin` |
| `ADMIN_PASSWORD` | Contraseña del admin inicial. Si está vacía, no se crea | _(vacío)_ |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Duración de la sesión en minutos | `10080` (7 días) |
| `INVITE_EXPIRE_DAYS` | Días de validez de las invitaciones | `7` |
| `APP_PORT` | Puerto del host al que se expone la app | `8080` |

## Estructura del proyecto

```
pokemon-go-wishlist/
├── backend/
│   ├── app/
│   │   ├── api/           # Endpoints: auth, pokemon, flags, admin
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # game_master, translations, assets
│   │   ├── auth.py        # JWT + bcrypt
│   │   ├── config.py      # Settings desde variables de entorno
│   │   ├── db.py          # Engine y sesión SQLAlchemy
│   │   └── main.py        # App FastAPI + lifespan
│   ├── alembic/           # Migraciones de base de datos
│   ├── data/              # Generado en runtime (no en git)
│   │   ├── pokemon_forms.json
│   │   └── translations/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── css/main.css
│   ├── index.html
│   └── js/
│       ├── api.js              # Fetch wrapper con JWT
│       ├── app.js              # Router SPA + estado global
│       └── components/
│           ├── login-page.js
│           ├── register-page.js
│           ├── pokemon-list.js  # Contenedor principal
│           ├── pokemon-table.js # Vista tabla
│           ├── pokemon-card.js  # Vista tarjetas
│           ├── pokemon-filters.js
│           ├── flag-toggle.js
│           ├── admin-panel.js
│           ├── user-manager.js
│           ├── invite-creator.js
│           └── source-updater.js
├── nginx/nginx.conf
├── docker-compose.yml
└── .env.example
```

## API

La documentación interactiva está disponible en `http://localhost:8080/api/docs` (Swagger UI) mientras los contenedores están corriendo.

### Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Registro con token de invitación |
| `POST` | `/api/auth/login` | Login → JWT |
| `GET` | `/api/auth/me` | Usuario actual |
| `GET` | `/api/pokemon` | Lista de Pokémon (con filtros opcionales) |
| `PUT` | `/api/flags/{form_id}/{flag}` | Activar un flag propio |
| `DELETE` | `/api/flags/{form_id}/{flag}` | Desactivar un flag propio |
| `GET` | `/api/flags` | Todos los flags de todos los usuarios |
| `GET` | `/api/admin/users` | Lista de usuarios _(admin)_ |
| `POST` | `/api/admin/invites` | Crear invitación _(admin)_ |
| `GET` | `/api/admin/sources/status` | Estado de las fuentes de datos _(admin)_ |
| `POST` | `/api/admin/sources/update/{source}` | Actualizar una fuente _(admin)_ |

Flags disponibles: `quiero`, `tengo_100`, `tengo_shiny`

## Esquema de base de datos

```
users          — id, username, password_hash, role, language, is_system
invites        — id, token (UUID), created_by, used_by, expires_at
pokemon_forms  — id (templateId), pokedex_number, tipos, stats, has_shiny, ...
user_flags     — (user_id, pokemon_form_id, flag_name) → valor
source_versions — versión local y remota de cada fuente de datos
```

Los flags usan un esquema flexible `(user_id, form_id, flag_name)` — añadir un nuevo tipo de flag no requiere cambios en la base de datos.

## Instalación en Android (PWA)

La app está preparada como Progressive Web App. Para instalarla en Android:

1. Abre la app en **Chrome** (debe estar servida por HTTPS en producción, o en `localhost` en desarrollo)
2. Chrome mostrará automáticamente un banner de **"Añadir a pantalla de inicio"**, o puedes hacerlo manualmente:
   - Pulsa el menú ⋮ → **Añadir a pantalla de inicio** (o "Instalar app")
3. La app se instala como una aplicación independiente sin barra de navegador

> En desarrollo con `docker compose` sobre `localhost`, Chrome también muestra el prompt de instalación.

### ¿Cómo funciona offline?

El Service Worker precarga el app shell (HTML, CSS, JS) para que la interfaz cargue aunque no haya red. Las llamadas a la API siempre requieren conexión — sin ella la app carga pero no puede obtener datos frescos.

### Actualizar la versión instalada

Cuando se despliega una nueva versión, el Service Worker se actualiza automáticamente en la próxima visita. Si quieres forzar la actualización inmediata:

1. En Chrome Android: Menú ⋮ → **Actualizar**
2. O bien cierra y vuelve a abrir la app

Para los desarrolladores: al cambiar el app shell, incrementar `CACHE_VERSION` en `frontend/sw.js` fuerza la invalidación del caché en todos los clientes.

## Operaciones comunes

### Actualizar datos del juego

Desde **Admin → Fuentes de datos**, cada fuente se actualiza de forma independiente. El panel muestra la versión local vs la remota disponible.

También puedes pulsar **Comprobar versiones** para comparar sin actualizar.

### Añadir un nuevo flag

El esquema ya lo soporta. Solo hace falta:

1. Añadir el flag a `VALID_FLAGS` en `backend/app/api/flags.py`
2. Añadir la etiqueta visual en `FLAG_LABELS` en `frontend/js/components/flag-toggle.js`
3. Mostrarlo en `pokemon-table.js` y `pokemon-card.js` si procede

No se necesitan migraciones de base de datos.

### Aplicar migraciones de base de datos

Cuando se actualiza la aplicación (por ejemplo tras un `git pull`) puede haber nuevas migraciones que hay que aplicar para que el esquema de la base de datos esté al día.

```bash
docker compose exec backend alembic upgrade head
```

Esto aplica todas las migraciones pendientes hasta la última versión. Es seguro ejecutarlo aunque no haya nada nuevo — si el esquema ya está actualizado, no hace nada.

**¿Cuándo es necesario?** Siempre que el directorio `backend/alembic/versions/` tenga archivos nuevos respecto a la versión que tenías antes. Puedes comprobarlo con:

```bash
git log --oneline backend/alembic/versions/
```

Si quieres ver qué migraciones están pendientes sin aplicarlas:

```bash
docker compose exec backend alembic current   # revisión actual de la BD
docker compose exec backend alembic history   # historial de migraciones
```

### Cambiar el puerto

```bash
APP_PORT=9000 docker compose up -d
```

O definirlo permanentemente en `.env`.

## Desarrollo

El backend tiene hot-reload habilitado: los cambios en `backend/app/` se aplican automáticamente sin reconstruir la imagen.

```bash
# Logs en tiempo real
docker compose logs -f backend

# Reconstruir imagen (solo necesario si cambias requirements.txt o el Dockerfile)
docker compose build backend
docker compose up -d --force-recreate backend

# Acceder a la base de datos
docker exec -it pokemongolist-db-1 psql -U pokemon pokemondb
```

## Despliegue en producción

1. Asegúrate de cambiar `SECRET_KEY` por una cadena larga y aleatoria
2. Cambia las credenciales de PostgreSQL en `docker-compose.yml` y actualiza `DATABASE_URL`
3. Configura un proxy inverso (Caddy, Traefik, etc.) con HTTPS delante del puerto de la app
4. Considera poner `ACCESS_TOKEN_EXPIRE_MINUTES` a un valor más bajo si la seguridad es prioritaria
