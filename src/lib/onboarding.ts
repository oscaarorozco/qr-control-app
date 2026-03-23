export function buildMailtoLink(email: string, temporaryPassword: string) {
  const subject = "Acceso inicial al sistema";
  const body = [
    "Hola,",
    "",
    "Se ha creado tu acceso al sistema.",
    `Correo: ${email}`,
    `Contrasena temporal: ${temporaryPassword}`,
    "",
    "Abre la app e inicia sesion con estos datos.",
  ].join("\n");

  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
