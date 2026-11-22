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
  'home.comingSoon': 'The full home screen, the history and the directory arrive in the next stages of the build.',
  'home.formVersion': 'Form version {version} · {questions} questions in {steps} steps',
  'home.signOut': 'Sign out',
  'home.leaveDemo': 'Leave demo',
  'home.newInspection': 'New inspection',
  'home.inspections': 'Inspections on this phone',
  'home.empty': 'No inspections yet. Start the first quest!',
  'home.noReference': 'No reference yet',

  'status.draft': 'Draft',
  'status.completed': 'Completed',

  'form.back': 'Back',
  'form.next': 'Next',
  'form.complete': 'Complete',
  'form.saveExit': 'Save and exit',
  'form.progress': '{answered} of {total} answered',
  'form.savedOnPhone': 'Saved on this phone',
  'form.required': 'Required',
  'form.addNote': 'Add a note',
  'form.note': 'Note',
  'form.noteForFail': 'What failed? (needed)',
  'form.chooseDate': 'Choose date',
  'form.today': 'Today',
  'form.less': 'Less',
  'form.more': 'More',
  'form.containerHint': 'This container number fails its check digit. Read it again from the unit.',
  'form.nextRefused': 'Solve the marked questions to continue.',
  'form.notFound': 'This inspection is not on this phone.',
  'form.completedBanner': 'Completed',
  'form.correctUntil': 'You can correct it until {time}.',
  'form.readOnly': 'Completed more than 24 hours ago: only a supervisor can change it.',
  'form.correctionBlocked': 'Solve the marked questions to save this correction.',
  'form.pendingTitle': 'Before completing',
  'form.pendingBlocking': 'These must be solved first:',
  'form.pendingWarnings': 'Still unanswered. You can complete anyway:',
  'form.goBack': 'Go back',
  'form.completeAnyway': 'Complete anyway',
  'form.verdictReview': 'You chose Fit, but some checks failed. Complete it as Fit?',
  'form.verdictConfirm': 'Yes, complete',
  'form.verdictRevise': 'Review',
  'form.cleared': 'Quest cleared!',
  'form.clearedBody': 'Inspection {code} is completed.',
  'form.backHome': 'Back to home',

  'media.takePhoto': 'Take photo',
  'media.choosePhoto': 'Choose photo',
  'media.view': 'View',
  'media.replace': 'Replace',
  'media.remove': 'Remove',
  'media.close': 'Close',
  'media.cameraDenied': 'The camera is not allowed. Allow it in the phone settings, or choose a photo instead.',
  'media.failed': 'The photo could not be saved. Try again.',
  'media.sign': 'Sign',
  'media.signAgain': 'Sign again',
  'media.signHere': 'Sign with your finger inside the box.',
  'media.clear': 'Clear',
  'media.done': 'Done',
  'media.cancel': 'Cancel',
  'media.useSaved': 'Use my saved signature',
  'media.keepAsMine': 'Also keep it as my saved signature',

  'problem.required': 'Required: answer this question.',
  'problem.recommended': 'Recommended: not answered yet.',
  'problem.note_needed': 'A failed check needs a note.',
  'problem.digits_only': 'Only the digits 0 to 9.',
  'problem.not_a_number': 'Write a number, like 3750 or 12.5.',

  'stage.label': 'Step {number}: {title}. {state}',
  'stage.done': 'Answered',
  'stage.current': 'Current step',
  'stage.todo': 'To do',
  'stage.skip': 'Does not apply',
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
  'home.comingSoon': 'La pantalla de inicio completa, el historial y el directorio llegan en las próximas etapas.',
  'home.formVersion': 'Formulario versión {version} · {questions} preguntas en {steps} pasos',
  'home.signOut': 'Cerrar sesión',
  'home.leaveDemo': 'Salir de la demo',
  'home.newInspection': 'Nueva inspección',
  'home.inspections': 'Inspecciones en este teléfono',
  'home.empty': 'Todavía no hay inspecciones. ¡Empieza la primera misión!',
  'home.noReference': 'Sin referencia todavía',

  'status.draft': 'Borrador',
  'status.completed': 'Completada',

  'form.back': 'Atrás',
  'form.next': 'Siguiente',
  'form.complete': 'Completar',
  'form.saveExit': 'Guardar y salir',
  'form.progress': '{answered} de {total} respondidas',
  'form.savedOnPhone': 'Guardado en el teléfono',
  'form.required': 'Obligatoria',
  'form.addNote': 'Agregar una nota',
  'form.note': 'Nota',
  'form.noteForFail': '¿Qué falló? (obligatorio)',
  'form.chooseDate': 'Elegir fecha',
  'form.today': 'Hoy',
  'form.less': 'Menos',
  'form.more': 'Más',
  'form.containerHint': 'Este número de contenedor no pasa su dígito de control. Vuelve a leerlo en la unidad.',
  'form.nextRefused': 'Resuelve las preguntas marcadas para seguir.',
  'form.notFound': 'Esta inspección no está en este teléfono.',
  'form.completedBanner': 'Completada',
  'form.correctUntil': 'Puedes corregirla hasta {time}.',
  'form.readOnly': 'Se completó hace más de 24 horas: solo un supervisor puede cambiarla.',
  'form.correctionBlocked': 'Resuelve las preguntas marcadas para guardar esta corrección.',
  'form.pendingTitle': 'Antes de completar',
  'form.pendingBlocking': 'Primero hay que resolver:',
  'form.pendingWarnings': 'Siguen sin responder. Puedes completar igual:',
  'form.goBack': 'Volver',
  'form.completeAnyway': 'Completar igual',
  'form.verdictReview': 'Elegiste Apta, pero algunas verificaciones no cumplen. ¿Completar como Apta?',
  'form.verdictConfirm': 'Sí, completar',
  'form.verdictRevise': 'Revisar',
  'form.cleared': '¡Misión cumplida!',
  'form.clearedBody': 'La inspección {code} quedó completada.',
  'form.backHome': 'Volver al inicio',

  'media.takePhoto': 'Tomar foto',
  'media.choosePhoto': 'Elegir foto',
  'media.view': 'Ver',
  'media.replace': 'Reemplazar',
  'media.remove': 'Quitar',
  'media.close': 'Cerrar',
  'media.cameraDenied': 'La cámara no tiene permiso. Actívalo en los ajustes del teléfono o elige una foto.',
  'media.failed': 'No se pudo guardar la foto. Inténtalo de nuevo.',
  'media.sign': 'Firmar',
  'media.signAgain': 'Firmar de nuevo',
  'media.signHere': 'Firma con el dedo dentro del recuadro.',
  'media.clear': 'Borrar',
  'media.done': 'Listo',
  'media.cancel': 'Cancelar',
  'media.useSaved': 'Usar mi firma guardada',
  'media.keepAsMine': 'Guardarla también como mi firma',

  'problem.required': 'Obligatoria: responde esta pregunta.',
  'problem.recommended': 'Recomendada: todavía sin responder.',
  'problem.note_needed': 'Un "no cumple" necesita una nota.',
  'problem.digits_only': 'Solo los dígitos del 0 al 9.',
  'problem.not_a_number': 'Escribe un número, como 3750 o 12.5.',

  'stage.label': 'Paso {number}: {title}. {state}',
  'stage.done': 'Respondido',
  'stage.current': 'Paso actual',
  'stage.todo': 'Pendiente',
  'stage.skip': 'No aplica',
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

/** YYYY-MM-DD of the phone's calendar day (not UTC: "today" is the day the inspector sees). */
export function localDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A moment as people read it: "12 Mar, 14:05". */
export function formatMoment(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}
