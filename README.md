# QR Control App

Aplicación web para gestión operativa por usuario con flujo QR, administración de componentes y auditoría básica.

Este repositorio está preparado para uso open source: sin secretos versionados, con datos de ejemplo genéricos y documentación de contribución.

## Características

- Autenticación por usuario/contraseña.
- Sesión segura con JWT en cookie HttpOnly.
- Dashboard de usuario con QR personal y estado de componentes.
- Panel de administración para:
  - Alta y edición de usuarios.
  - Gestión de componentes y límites diarios.
  - Escaneo QR por cámara y aplicación de modos.
  - Auditoría de acciones y métricas de seguridad.
  - Carga de imagen por URL o upload local para componentes.

## Stack

- Next.js (App Router)
- React + TypeScript
- SQLite (`better-sqlite3`)
- Zod
- ZXing (`@zxing/browser`)
- Sonner

## Requisitos

- Node.js 20+
- npm 10+

## Variables de entorno

Copia `.env.example` a `.env.local` y ajusta valores:

```env
JWT_SECRET=replace_with_a_random_secret_min_32_chars
ADMIN_USERNAME=admin@example.local
ADMIN_PASSWORD=replace_with_strong_password
```

Notas:

- En una instalación limpia se crean dos componentes activos por defecto: `componente1` y `componente2`.
- `JWT_SECRET` debe tener al menos 32 caracteres en entornos persistentes.
- No compartas `.env.local` ni bases SQLite reales.

## Desarrollo

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## Producción

```bash
npm run build
npm run start
```

## Anonimizar datos locales

Para convertir datos locales a una demo genérica (usuarios, tokens, saldos y trazas):

```bash
npm run anonymize:db
```

Opcionalmente puedes indicar otra ruta SQLite:

```bash
node scripts/anonymize-local-db.mjs data/app.db
```

El script crea un backup automático `*.bak` antes de modificar la base.

## Publicar En GitHub (Checklist)

- Revisar que no exista `.env.local` en staging.
- Revisar que no existan bases reales bajo `data/*.db*`.
- Revisar que no existan uploads locales sensibles en `public/uploads/components`.
- Ejecutar `npm run anonymize:db` para dejar la demo con datos genéricos.
- Ejecutar `npm run lint` y `npm run build`.
- Confirmar que el contenido de la demo es genérico (usuarios/componentes no sensibles).

## Seguridad

- Hash de contraseñas con bcrypt.
- Validación de payloads con Zod.
- Control de permisos por scope admin.
- Cabeceras HTTP de seguridad en producción.

Reporte responsable de vulnerabilidades: ver [SECURITY.md](SECURITY.md).

## Contribuir

Las contribuciones son bienvenidas. Revisa [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

Este proyecto se distribuye bajo licencia MIT. Ver [LICENSE](LICENSE).
