# QR Control App

Aplicación web para gestión operativa por usuario con flujo QR, administración de componentes y auditoría básica.

---

## ✨ Características

* 🔐 Autenticación por usuario/contraseña.
* 🍪 Sesión segura con JWT en cookie HttpOnly.
* 📊 Dashboard de usuario con QR personal y estado de componentes.

### 🛠️ Panel de administración

* 👤 Alta y edición de usuarios.
* 📦 Gestión de componentes y límites diarios.
* 📷 Escaneo QR por cámara y aplicación de modos.
* 🧾 Auditoría de acciones y métricas de seguridad.
* 🖼️ Carga de imagen por URL o upload local para componentes.

---

## 🧱 Stack

* ⚡ Next.js (App Router)
* ⚛️ React + TypeScript
* 🗄️ SQLite (`better-sqlite3`)
* ✅ Zod
* 📡 ZXing (`@zxing/browser`)
* 🔔 Sonner

---

## 📋 Requisitos

* 🟢 Node.js 20+
* 📦 npm 10+

---

## 🔑 Variables de entorno

Copia `.env.example` a `.env.local` y ajusta valores:

```env
JWT_SECRET=replace_with_a_random_secret_min_32_chars
ADMIN_USERNAME=admin@example.local
ADMIN_PASSWORD=replace_with_strong_password
```

---

## 🚀 Desarrollo

```bash
npm install
npm run dev
```

🌐 Abrir: [http://localhost:3000](http://localhost:3000)

---

## 🏗️ Producción

```bash
npm run build
npm run start
```

---

## 🧹 Anonimizar datos locales

Para convertir datos locales a una demo genérica (usuarios, tokens, saldos y trazas):

```bash
npm run anonymize:db
```

---

## 🔐 Seguridad

* 🔑 Hash de contraseñas con bcrypt.
* 🛡️ Validación de payloads con Zod.
* 👮 Control de permisos por scope admin.
* 🌐 Cabeceras HTTP de seguridad en producción.

📢 Reporte responsable de vulnerabilidades: ver [SECURITY.md](SECURITY.md)

---

## 📄 Licencia

Este proyecto se distribuye bajo licencia MIT.
Ver [LICENSE](LICENSE)
