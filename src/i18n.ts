/**
 * Every text of the interface, in English and Spanish, and a `t()` to read them.
 *
 * Spanish is typed as Record<MessageKey, string>: a text missing in Spanish is a type
 * error, found before the app runs. The question catalog carries its own translations.
 */
import { Locale } from './inspection/model';

const en = {
  'app.name': 'Quartermaster',
  'app.tagline': 'Container inspections at the gate',

  'signIn.title': 'Sign in',
  'signIn.email': 'Email',
  'signIn.password': 'Password',
  'signIn.show': 'Show',
  'signIn.hide': 'Hide',
  'signIn.submit': 'Sign in',
  'signIn.busy': 'Signing in…',
  'signIn.offline': 'No connection. The first sign-in needs one; after that the app also works offline.',
  'signIn.noServer': 'This copy of the app has no server set up. You can still try the demo.',
  'signIn.tryDemo': 'Try the demo',

  'error.emailMissing': 'Enter your email.',
  'error.emailInvalid': 'That does not look like an email address.',
  'error.passwordMissing': 'Enter your password.',
  'error.wrongCredentials': 'The email or the password is wrong.',
  'error.tooManyTries': 'Too many tries. Wait a minute and try again.',
  'error.offline': 'Could not reach the server. Check the connection and try again.',
  'error.noProfile': 'This account has no profile yet. Ask a supervisor.',
  'error.unknown': 'Something went wrong. Try again.',

  'demo.title': 'Try the demo',
  'demo.body': 'Invented data, kept only on this phone. Nothing is sent anywhere. Choose who you want to be:',
  'demo.inspector': 'Inspector',
  'demo.inspectorHint': '{name} sees only their own inspections.',
  'demo.supervisor': 'Supervisor',
  'demo.supervisorHint': '{name} sees every inspection and manages the directory.',
  'demo.back': 'Back',
  'demo.marker': 'DEMO',

  'role.inspector': 'Inspector',
  'role.supervisor': 'Supervisor',

  'home.greeting': 'Ready for the next quest, {name}?',
  'home.comingSoon': 'The home screen, the form and the history arrive in the next stages of the build.',
  'home.formVersion': 'Form version {version} · {questions} questions in {steps} steps',
  'home.signOut': 'Sign out',
  'home.leaveDemo': 'Leave demo',
};

export type MessageKey = keyof typeof en;

const es: Record<MessageKey, string> = {
  'app.name': 'Quartermaster',
  'app.tagline': 'Inspección de contenedores en portería',

  'signIn.title': 'Iniciar sesión',
  'signIn.email': 'Correo',
  'signIn.password': 'Contraseña',
  'signIn.show': 'Mostrar',
  'signIn.hide': 'Ocultar',
  'signIn.submit': 'Entrar',
  'signIn.busy': 'Entrando…',
  'signIn.offline': 'Sin conexión. El primer inicio de sesión la necesita; después la app también funciona sin ella.',
  'signIn.noServer': 'Esta copia de la app no tiene un servidor configurado. Igual puedes probar la demo.',
  'signIn.tryDemo': 'Probar la demo',

  'error.emailMissing': 'Escribe tu correo.',
  'error.emailInvalid': 'Eso no parece una dirección de correo.',
  'error.passwordMissing': 'Escribe tu contraseña.',
  'error.wrongCredentials': 'El correo o la contraseña no son correctos.',
  'error.tooManyTries': 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',
  'error.offline': 'No se pudo llegar al servidor. Revisa la conexión e inténtalo de nuevo.',
  'error.noProfile': 'Esta cuenta todavía no tiene perfil. Pídeselo a un supervisor.',
  'error.unknown': 'Algo salió mal. Inténtalo de nuevo.',

  'demo.title': 'Probar la demo',
  'demo.body': 'Datos inventados que se guardan solo en este teléfono. No se envía nada. Elige quién quieres ser:',
  'demo.inspector': 'Inspector',
  'demo.inspectorHint': '{name} ve solo sus propias inspecciones.',
  'demo.supervisor': 'Supervisor',
  'demo.supervisorHint': '{name} ve todas las inspecciones y administra el directorio.',
  'demo.back': 'Volver',
  'demo.marker': 'DEMO',

  'role.inspector': 'Inspector',
  'role.supervisor': 'Supervisor',

  'home.greeting': '{name}, ¿vamos por la próxima misión?',
  'home.comingSoon': 'La pantalla de inicio, el formulario y el historial llegan en las próximas etapas.',
  'home.formVersion': 'Formulario versión {version} · {questions} preguntas en {steps} pasos',
  'home.signOut': 'Cerrar sesión',
  'home.leaveDemo': 'Salir de la demo',
};

const messages: Record<Locale, Record<MessageKey, string>> = { en, es };

/** The text for `key` in `locale`, with each {name} replaced by its value. */
export function t(locale: Locale, key: MessageKey, values: Record<string, string | number> = {}): string {
  return messages[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** Spanish when the phone is set to any Spanish variant, English otherwise. */
export function localeFrom(deviceLocale: string): Locale {
  return deviceLocale.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function deviceLocale(): Locale {
  return localeFrom(Intl.DateTimeFormat().resolvedOptions().locale);
}
