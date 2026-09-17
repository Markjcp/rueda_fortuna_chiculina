# La Chicu Rueda de la Buena Onda

Juego estático en `docs/`, con persistencia en Supabase y sin inicio de sesión. Una sola colección compartida para la familia, disponible desde cualquier dispositivo. No necesita compilación ni servidor propio.

## Probar localmente

Desde este directorio:

```sh
python3 -m http.server 8080 --directory docs
```

Abrir http://localhost:8080. Usar un servidor HTTP: abrir `index.html` directamente como archivo no permite cargar el JSON.

## Completar las sorpresas

Editar **`docs/data/prizes.json`**. Hay una entrada por cada número (1–83); no cambiar ni repetir los identificadores.

- `type: "prize"`: editar `title` y `text`. Aparece como diploma.
- `type: "meme"`: editar `title`, `image` y `alt`. Cada entrada apunta a su propio SVG de ejemplo en `docs/assets/memes/`. Podés reemplazarlo por JPG, PNG, WebP o GIF; actualizá `image` con la ruta relativa, por ejemplo `./assets/memes/002.jpg`. `alt` describe la imagen para lectores de pantalla.
- Podés cambiar libremente un número de premio a meme o viceversa, incluyendo los campos correspondientes.

Los textos y las imágenes actuales son ejemplos, no premios definitivos. Las imágenes están en el repositorio. Los giros se guardan en Supabase; las fuentes de Google son opcionales y tienen alternativas locales.

## Reglas implementadas

- Del 16/09/2026 al 21/12/2026 inclusive: 69 días de lunes a viernes, más 14 bonos de lunes = **83 números**. No se excluyen feriados.
- Un giro por día hábil. Cada lunes, un segundo giro disponible desde las 12:00 de `America/Argentina/Buenos_Aires`. Si no se usó el primero, quedan dos desde el mediodía.
- Los giros no usados no se acumulan. No hay giros reales fuera del período ni los fines de semana. La base de datos valida la fecha y la hora de Argentina con su propio reloj; cambiar la hora del dispositivo no permite ganar giros.
- Cada giro real elige al azar entre los números que todavía no salieron y desbloquea su tarjeta. La punta de la rueda coincide con el número obtenido.
- La confirmación obligatoria dice “Ya estoy despierta y con buena onda”.
- El botón del parlante activa el sonido de la rueda. Empieza silenciado y acompaña tanto los giros reales como los de prueba.
- Las pruebas están siempre disponibles, no gastan giros y no desbloquean tarjetas. El mismo número puede aparecer después en un giro real.
- **La colección y los límites son compartidos y se guardan en Supabase.** Recargar no los reinicia. Cualquier persona con acceso al sitio puede ver la colección y gastar los giros disponibles; no hay cuentas ni autenticación. La app actualiza la colección cada 30 segundos y al volver a la pestaña. También hay un botón para actualizarla manualmente.
- Un giro real se guarda antes de animar la rueda. Si se corta la conexión, se puede reintentar con el mismo identificador sin gastar otro giro. Solo ese identificador pendiente se conserva en localStorage; la base de datos es la fuente de verdad. Si localStorage está deshabilitado, la colección sigue guardada pero no se conserva el identificador pendiente al cerrar la página.
- Sin conexión no se permiten giros reales. Las pruebas siguen disponibles si la página ya cargó.

## Activar Supabase (una sola vez)

El proyecto y la clave pública ya están configurados en `docs/supabase-config.js`.

1. Abrir el [SQL Editor del proyecto](https://supabase.com/dashboard/project/bvkboyprslioypocmcia/sql/new).
2. Copiar **todo** `supabase/setup.sql`, pegarlo y pulsar **Run**. El script crea la tabla y las dos funciones públicas; se puede volver a ejecutar sin borrar los giros.
3. Subir los cambios del repositorio a GitHub y abrir la página publicada. No hay que activar Auth, crear usuarios ni configurar correos o URLs de redirección.
4. Probar con “Probar sin gastar mi giro”. Para comprobar la persistencia, hacer un giro real y recargar o abrir la página en otro dispositivo: debe verse la misma tarjeta y el giro consumido.

La clave `sb_publishable_...` es pública por diseño. No agregar contraseñas, claves secretas o `service_role` al repositorio.

La tabla `chicu_spins` tiene RLS habilitado y no admite acceso directo desde el navegador. Solo se exponen `chicu_state()` (lee la colección) y `chicu_spin(p_request_id)` (elige y guarda un giro válido). No hay una función pública para borrar, editar premios ni reiniciar la colección. La función de giro usa una transacción y un bloqueo común para evitar que dos dispositivos superen el límite diario.

Si aparece “La colección todavía no está preparada”, falta ejecutar el SQL. Si falla la conexión, revisar que el proyecto de Supabase esté activo y pulsar “Actualizar colección”.

## GitHub Pages

El sitio se publica directamente desde `docs/`, sin compilación ni workflow propio.

El remoto `origin` ya apunta a `git@github.com:Markjcp/rueda_fortuna_chiculina.git` y la rama es `main`. Desde la raíz del proyecto:

```sh
git add .gitignore .gitattributes README.md REQ.md package.json docs supabase tests
git diff --cached --stat
git commit -m "Add Chicu wheel with Supabase persistence and sound"
git push -u origin main
```

La configuración del editor, los archivos `.env`, las dependencias y los logs quedan excluidos. `docs/`, su archivo `.nojekyll` y la configuración pública de Supabase deben incluirse en el commit.

1. Subir estos archivos al repositorio (commit y push).
2. En GitHub, abrir **Settings → Pages**.
3. En **Build and deployment → Source**, elegir **Deploy from a branch**.
4. Elegir la rama donde subiste los archivos (por ejemplo, `main`), seleccionar **`/docs`** y guardar.
5. Esperar a que termine la publicación y abrir la URL que muestra GitHub Pages.

GitHub sirve `docs/index.html` como página inicial. No agregar `/docs/` a la URL pública. Todas las rutas son relativas y funcionan bajo `/nombre-del-repositorio/`. El archivo `docs/.nojekyll` indica que los archivos se sirven tal como están.

Los cambios posteriores dentro de `docs/` se publican al hacer push a la rama elegida. Esta entrega prepara los archivos; no hace push ni modifica la configuración del repositorio en GitHub.

Con ese repositorio y sin dominio personalizado, la dirección prevista es **https://markjcp.github.io/rueda_fortuna_chiculina/**. Después de publicar, comprobar que carga la colección, probar el sonido con un giro de prueba y abrir “Mis sorpresas”.

### Limpiar los giros de prueba antes del lanzamiento

Si querés comenzar con la colección vacía, ejecutar manualmente en el SQL Editor de Supabase:

```sql
delete from public.chicu_spins where campaign = 'chicu-2026';
```

Esto elimina todos los giros de esa edición, incluidos los reales. No es necesario volver a ejecutar `setup.sql`. Recargar la página después de limpiar. Los premios y memes siguen en `docs/data/prizes.json` y `docs/assets/memes/`; completar los ejemplos que quieras cambiar antes de compartir el sitio.

## Verificación

Con Node.js 18 o superior:

```sh
node --test tests/*.test.mjs
```

Las pruebas cubren el calendario, el límite diario, los lunes al mediodía, fines de semana, extremos del período, el catálogo y el contrato de lectura/escritura con Supabase. No escriben en el proyecto real.

`supabase/verify.mjs` permite verificar también el SQL en una instancia aislada de PostgreSQL mediante PGlite. Con una copia local de `@electric-sql/pglite`, ejecutar `node supabase/verify.mjs /ruta/al/paquete/dist/index.js`. Comprueba permisos, límites, reintentos y fechas simuladas sin conectarse al proyecto real.
