# Power Rangers Mundial

Polla mundialista responsive para un grupo cerrado, pronosticar marcadores,
calcular puntos, administrar resultados y compartir el ranking por WhatsApp.

## Configurar

Copia `.env.example` como `.env.local` y configura:

- `DATABASE_URL`: URI **Session pooler** de Supabase.
- `SESSION_SECRET`: cadena privada larga para cifrado y sesiones.

Instala dependencias y crea las tablas:

```powershell
npm install
npm run migrate
node server.mjs
```

La aplicación queda disponible en `http://localhost:4200`.

También puede abrirse `index.html` directamente, aunque algunas funciones del
navegador funcionan mejor desde `http://localhost`.

## Acceso privado

Copia `users.example.js` como `users.local.js`, configura los usuarios y ejecuta
`npm run migrate`. El archivo local está ignorado por Git para impedir la
publicación de celulares y documentos de identidad.

Celulares y cédulas se cifran antes de guardarse en PostgreSQL. La autenticación
usa hashes de búsqueda y cookies de sesión `HttpOnly`.

Desde **Administración de usuarios**, el administrador puede agregar y editar
nombre, apodo, celular y cédula. El apodo es el nombre público del ranking.

## Puntuación

- Marcador exacto: 2 puntos.
- Ganador o empate correcto: 1 punto.
- Resultado incorrecto: 0 puntos.
- Cada pronóstico cierra 30 minutos antes del partido.
- Si un participante no pronostica antes del cierre, recibe automáticamente 0-0.
- Desempate: más exactos, luego el pronóstico registrado primero.
- En eliminatorias se usa el marcador al finalizar la prórroga, sin penaltis.

## Resultados

El panel admite una URL compatible con la respuesta de Football-Data.org y un
`X-Auth-Token`. URL predeterminada:

```text
https://api.football-data.org/v4/competitions/WC/matches
```

Usuarios, sesiones, pronósticos y resultados se guardan en Supabase PostgreSQL.
Las claves y la conexión permanecen exclusivamente en el servidor.
