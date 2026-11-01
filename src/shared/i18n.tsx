"use client";

import { useEffect, useSyncExternalStore } from "react";

export type Language = "en" | "es";
const STORAGE_KEY = "simply-habits.language";
let language: Language = "en";
let initialized = false;
const listeners = new Set<() => void>();

const spanish: Record<string, string> = {
  "Skip to content": "Saltar al contenido",
  "My habits": "Mis hábitos", "My progress": "Mi progreso", "Settings": "Ajustes",
  "Little by little.": "Poco a poco.", "YOUR LITTLE CORNER": "TU PEQUEÑO RINCÓN",
  "Good things take\na little tending.": "Las cosas buenas necesitan\nun poco de cuidado.",
  "One day. One habit. One you.": "Un día. Un hábito. Tú.",
  "Your cloud is connected": "Tu nube está conectada", "Your habits stay yours": "Tus hábitos son tuyos",
  "Offline · saved locally": "Sin conexión · guardado localmente",
  "Syncing your habits...": "Sincronizando tus hábitos...",
  "{count} habits waiting to sync": "{count} hábitos pendientes de sincronización",
  "Everything is synced": "Todo está sincronizado", "Cloud connected": "Nube conectada",
  "Saved on this device": "Guardado en este dispositivo",
  "You’re offline. Keep going — your check-ins are saved on this device.{sync}": "Estás sin conexión. Sigue adelante: tus registros se guardan en este dispositivo.{sync}",
  " They’ll sync when you’re back.": " Se sincronizarán cuando vuelvas a conectarte.",
  "Dismiss error": "Cerrar error", "A fresh version is ready. Your saved habits will stay safe.": "Hay una nueva versión. Tus hábitos guardados están a salvo.",
  "Refresh app": "Actualizar la aplicación",
  "Your space": "Tu espacio", "Open account settings": "Abrir ajustes de la cuenta",
  "Small steps. Good days.": "Pequeños pasos. Buenos días.",
  "A little better, {name}.": "Un poquito mejor, {name}.",
  "You don’t have to do it all. Just a little, every day.": "No tienes que hacerlo todo. Solo un poquito cada día.",
  "New habit": "Nuevo hábito", "A FRESH LITTLE START": "UN PEQUEÑO NUEVO COMIENZO",
  "Look at you growing.": "Mira cuánto estás creciendo.",
  "A little effort today.\nA little more you tomorrow.": "Un pequeño esfuerzo hoy.\nMañana, un poco más de ti.",
  "You made time for every habit today. Take a breath and enjoy the little wins.": "Hoy dedicaste tiempo a todos tus hábitos. Respira y disfruta de esos pequeños logros.",
  "Build habits that feel like care, not a chore.\nYour future self is already cheering you on.": "Crea hábitos que te cuiden, no que te agobien.\nTu yo del futuro ya te está animando.",
  "No perfect streaks required.": "No hacen falta rachas perfectas.",
  "A look back": "Una mirada atrás", "Your daily little things": "Tus pequeñas cosas de cada día",
  "Habit check-ins": "Registros de hábitos", "Previous week": "Semana anterior", "Next week": "Semana siguiente",
  "{date}: {completed} of {total} habits complete": "{date}: {completed} de {total} hábitos completados",
  "{completed} of {total} habits completed": "{completed} de {total} hábitos completados",
  "Checking in for {date}": "Registro del {date}", "Back to today": "Volver a hoy",
  "All habits": "Todos los hábitos", "Search habits": "Buscar hábitos",
  "Find a little habit...": "Busca un pequeño hábito...", "Filter by completion": "Filtrar por progreso",
  "All progress": "Todo el progreso", "Still to do": "Pendientes", "Completed": "Completados",
  "Making room for your habits...": "Haciendo espacio para tus hábitos...",
  "Good things start small.": "Las cosas buenas empiezan de a poco.",
  "A little room to breathe.": "Un pequeño respiro.",
  "Nothing here just yet.": "Todavía no hay nada aquí.",
  "Choose one small thing you’d like to make time for.\nWe’ll help you keep showing up.": "Elige algo pequeño a lo que quieras dedicar tiempo.\nTe ayudaremos a mantener el ritmo.",
  "No habits scheduled for this day. Enjoy the pause,\nor make space for a new little ritual.": "No hay hábitos programados para hoy. Disfruta la pausa\no haz espacio para un nuevo ritual.",
  "Try a different filter or search to find your habits.": "Prueba otro filtro o busca tus hábitos.",
  "Create your first habit": "Crea tu primer hábito", "Clear filters": "Quitar filtros",
  "A little inspiration": "Un poco de inspiración", "Yours to make your own": "Adáptalo a tu manera",
  "Add habit": "Añadir hábito", "Your progress at a glance": "Tu progreso de un vistazo",
  "That day’s rhythm": "El ritmo de ese día", "Today’s rhythm": "El ritmo de hoy",
  "a little closer": "un poquito más cerca", "Your next chapter starts with one little habit.": "Tu próximo capítulo empieza con un pequeño hábito.",
  "You did your little things. That’s a big deal.": "Cumpliste con tus pequeños hábitos. ¡Eso es mucho!",
  "Every check-in counts. You’re doing good.": "Cada registro cuenta. Lo estás haciendo muy bien.",
  "No rush. Your first little win is waiting.": "Sin prisa. Tu primer pequeño logro te espera.",
  "Your week in bloom": "Tu semana florece", "of scheduled habits completed\nover the last 7 days": "de los hábitos programados completados\nen los últimos 7 días",
  "See your progress": "Ver tu progreso", "day": "día", "days": "días",
  "Your longest current streak": "Tu racha actual más larga",
  "A GENTLE REMINDER": "UN RECORDATORIO AMABLE",
  "You’re allowed to be both\na masterpiece and a\nwork in progress.": "Puedes ser una obra maestra\ny también estar\nen proceso.",
  "Made for real life. And the little things in it.": "Hecho para la vida real y sus pequeñas cosas.",
  "YOUR HABITS, YOUR WAY": "TUS HÁBITOS, A TU MANERA",
  "A space that feels like you.": "Un espacio que se siente como tú.",
  "Keep your little things safe, close, and ready for wherever life goes.": "Guarda tus pequeñas cosas y tenlas a mano, vayas donde vayas.",
  "Language": "Idioma", "Choose the language for Simply Habits.": "Elige el idioma de Simply Habits.",
  "English": "Inglés", "Spanish": "Español",
  "Appearance": "Apariencia", "Light": "Claro", "Dark": "Oscuro", "System": "Sistema",
  "System follows your device’s appearance setting.": "El modo sistema sigue el ajuste de apariencia de tu dispositivo.",
  "of": "de", "habits complete": "hábitos completados",
  "YOUR HABITS, YOUR TRUST": "TUS HÁBITOS, TU CONFIANZA",
  "Back to habits": "Volver a los hábitos",
  "Effective date: {date}": "Fecha de entrada en vigor: {date}",
  "Draft prepared November 1, 2026 · Effective date not yet set": "Borrador preparado el 1 de noviembre de 2026 · Fecha de entrada en vigor pendiente",
  "Pre-launch draft — not a finalized policy": "Borrador previo al lanzamiento — política no definitiva",
  "The operator, public contact email, and effective date must be configured before launch. The operator must review these pages for its actual deployment, business practices, and applicable law.": "Antes del lanzamiento, configura el operador, el correo público de contacto y la fecha de entrada en vigor. El operador debe revisar estas páginas según el despliegue, las prácticas y las leyes aplicables.",
  "The policy text is currently available in English. Spanish policy translations are not available yet.": "El texto de estas políticas solo está disponible en inglés por ahora. Aún no hay traducciones al español.",
  "Simple expectations for using a little tool that supports your everyday habits.": "Condiciones sencillas para usar una herramienta que acompaña tus hábitos cotidianos.",
  "A clear look at what stays on your device, what reaches the cloud, and the choices you control.": "Una explicación clara de qué datos permanecen en tu dispositivo, cuáles llegan a la nube y qué opciones tienes.",
  "A gentle overview of the information Simply Habits stores and how optional features use it.": "Un resumen claro de la información que guarda Simply Habits y del uso que hacen de ella las funciones opcionales.",
  "A little peace of mind": "Un poco de tranquilidad",
  "Optional cloud sync. Always local-first.": "Sincronización en la nube opcional. Siempre primero en tu dispositivo.",
  "Connected as": "Conectado como", "Last synced {time}": "Última sincronización: {time}",
  "Sync now": "Sincronizar ahora", "Sign out": "Cerrar sesión",
  "Signing out returns to this device’s guest space. This account’s saved habits stay in its separate local vault.": "Al cerrar sesión volverás al espacio local de este dispositivo. Los hábitos de esta cuenta permanecerán en su almacenamiento separado.",
  "Sign in with Google to bring your habits across devices. Your current device habits will be added to your account when you connect.": "Inicia sesión con Google para usar tus hábitos en varios dispositivos. Al conectarte, los hábitos de este dispositivo se añadirán a tu cuenta.",
  "Connect with Google": "Conectar con Google",
  "Local mode is ready. To enable cloud sync, add your Firebase configuration as described in the project README.": "El modo local está listo. Para activar la sincronización en la nube, configura Firebase como se indica en el README del proyecto.",
  "Your trust matters": "Tu confianza importa",
  "Read how your data is handled and the terms for using Simply Habits.": "Infórmate sobre el uso de tus datos y las condiciones de Simply Habits.",
  "Always within reach": "Siempre a mano", "Your companion, right on your home screen.": "Tu compañero, en la pantalla de inicio.",
  "Simply Habits is installed. Your little rituals have a home.": "Simply Habits está instalada. Tus pequeños rituales ya tienen su espacio.",
  "Install Simply Habits for a focused, app-like experience. No app store needed.": "Instala Simply Habits para disfrutar de una experiencia enfocada, como una aplicación. No necesitas una tienda de apps.",
  "Install app": "Instalar aplicación", "Ready for offline use": "Lista para usar sin conexión",
  "Preparing offline access...": "Preparando el acceso sin conexión...",
  "Offline shell enabled in production": "Versión sin conexión activada en producción",
  "Close installation instructions": "Cerrar instrucciones de instalación",
  "A home for your habits": "Un hogar para tus hábitos",
  "On iPhone or iPad, open this app in Safari, tap Share, then Add to Home Screen. On desktop or Android, use your browser’s Install app or Add to home screen menu. Installation requires HTTPS (or localhost).": "En iPhone o iPad, abre esta aplicación en Safari, pulsa Compartir y luego Añadir a pantalla de inicio. En ordenadores o Android, usa la opción Instalar aplicación o Añadir a pantalla de inicio del navegador. La instalación requiere HTTPS (o localhost).",
  "Your story belongs to you": "Tu historia te pertenece", "A copy of every little win.": "Una copia de cada pequeño logro.",
  "Download all your habits and check-in history as JSON. Your data stays in your browser until you choose to connect cloud sync.": "Descarga tus hábitos y su historial en formato JSON. Tus datos permanecen en el navegador hasta que decidas activar la sincronización en la nube.",
  "Export my habits": "Exportar mis hábitos",
  "Browser storage can be cleared by your browser or device. Export regularly, or connect cloud sync for a second copy.": "El navegador o el dispositivo pueden borrar el almacenamiento. Exporta tus datos con frecuencia o activa la sincronización en la nube para tener otra copia.",
  "Taking a little pause": "Tomarse una pausa", "archived": "archivados",
  "Archived habits keep their history. Bring them back whenever you’re ready.": "Los hábitos archivados conservan su historial. Puedes restaurarlos cuando quieras.",
  "Restore": "Restaurar", "No habits on pause. You can archive a habit from its edit menu.": "No hay hábitos en pausa. Puedes archivar un hábito desde su menú de edición.",
  "PROGRESS, NOT PERFECTION": "PROGRESO, NO PERFECCIÓN",
  "Look how far you’ve come.": "Mira todo lo que has avanzado.",
  "Every little check-in is a vote for the person you’re becoming.": "Cada pequeño registro es un voto por la persona en la que te estás convirtiendo.",
  "Days completed, all time": "Días completados en total", "Longest current streak": "Racha actual más larga",
  "Last 7 days, scheduled habits": "Últimos 7 días, hábitos programados",
  "THE BIGGER PICTURE": "UNA VISIÓN MÁS AMPLIA", "Your consistency garden": "El jardín de tu constancia",
  "Last 12 weeks": "Últimas 12 semanas", "A little green, a little growth. Blank days are a chance to begin again.": "Un poco de verde, un poco de crecimiento. Cada día vacío es una oportunidad para volver a empezar.",
  "Less": "Menos", "More": "Más", "This week, in small steps": "Esta semana, paso a paso",
  "Your growing habits": "Tus hábitos en crecimiento", "Create your first habit to start growing your story.": "Crea tu primer hábito para empezar tu historia.",
  "{count} days completed": "{count} días completados",
  "You showed up today. That’s something to be proud of.": "Hoy estuviste presente. Eso es motivo de orgullo.",
  "A gentle nudge": "Un pequeño empujón", "Opt-in reminders, even when the app is closed.": "Recordatorios opcionales, incluso con la aplicación cerrada.",
  "Filter by category": "Filtrar por categoría", "a day": "al día",
  "A gentle, offline-first habit tracker for daily goals, check-ins, streaks, and progress. Keep your habits on this device, or connect optional cloud sync.": "Un rastreador de hábitos sencillo y sin conexión para tus objetivos diarios, registros, rachas y progreso. Guarda tus hábitos en este dispositivo o activa la sincronización opcional en la nube.",
  "Main navigation": "Navegación principal",
  "Sun": "dom", "Mon": "lun", "Tue": "mar", "Wed": "mié", "Thu": "jue", "Fri": "vie", "Sat": "sáb",
  "time": "veces", "glasses": "vasos", "pages": "páginas", "moment": "momento",
  "Drink more water": "Beber más agua", "A little hydration, a lot more energy.": "Un poco de hidratación, mucha más energía.",
  "Make time to read": "Dedicar tiempo a leer", "Trade a little scrolling for a new perspective.": "Cambia un rato de pantalla por una nueva perspectiva.",
  "A moment of calm": "Un momento de calma", "Pause. Breathe. Come back to yourself.": "Pausa. Respira. Vuelve a ti.",
  "Choose one reminder time per habit and an optional daily encouragement. Notifications keep habit names private on your lock screen.": "Elige una hora para cada hábito y, si quieres, un mensaje diario de ánimo. Las notificaciones no muestran los nombres de tus hábitos en la pantalla bloqueada.",
  "Connect with Google above to schedule Web Push reminders.": "Conéctate con Google arriba para programar recordatorios Web Push.",
  "Web Push needs VAPID keys and a server scheduler. See the project README for deployment setup.": "Web Push necesita claves VAPID y un programador en el servidor. Consulta el README del proyecto para configurar el despliegue.",
  "Web Push is unavailable in this browser. On iPhone/iPad, use an installed home-screen app on iOS 16.4 or newer. HTTPS is required on deployed sites.": "Web Push no está disponible en este navegador. En iPhone o iPad, instala la aplicación en la pantalla de inicio y usa iOS 16.4 o posterior. Los sitios publicados requieren HTTPS.",
  "Reminder timezone": "Zona horaria de los recordatorios",
  "Reminder time for {name}": "Hora del recordatorio para {name}",
  "Daily encouragement": "Mensaje diario de ánimo", "Daily encouragement time": "Hora del mensaje diario de ánimo",
  "Sync your pending habits before saving reminders. Offline check-ins cannot suppress a reminder until they sync.": "Sincroniza tus hábitos pendientes antes de guardar los recordatorios. Los registros sin conexión no pueden evitar un recordatorio hasta que se sincronicen.",
  "Save reminder settings": "Guardar ajustes de recordatorios", "Enable notifications": "Activar notificaciones",
  "Send test": "Enviar prueba", "Turn off on this device": "Desactivar en este dispositivo",
  "Reminders run on scheduled weekdays and skip completed or archived habits. Delivery is usually within five minutes, not exact-time guaranteed. Each device has separate preferences. Signing out unsubscribes this device.": "Los recordatorios se envían en los días programados y se omiten para hábitos completados o archivados. Suelen llegar en cinco minutos, pero no se garantiza la hora exacta. Cada dispositivo tiene sus propios ajustes. Al cerrar sesión, se desactiva la suscripción de este dispositivo.",
  "Notifications are off on this device.": "Las notificaciones están desactivadas en este dispositivo.",
  "Enable notifications first.": "Activa primero las notificaciones.",
  "Your push service accepted the test. Delivery depends on browser and system notification settings.": "El servicio de notificaciones aceptó la prueba. La entrega depende de los ajustes del navegador y del sistema.",
  "Notification permission was not granted. You can change it in your browser settings.": "No se concedió el permiso para notificaciones. Puedes cambiarlo en los ajustes del navegador.",
  "Saved for this device. Reminders use your selected timezone and the latest cloud-synced progress.": "Guardado para este dispositivo. Los recordatorios usan la zona horaria elegida y el progreso sincronizado más reciente.",
  "IANA timezone, such as America/Denver. Daylight saving is handled automatically. Update this when you travel.": "Zona horaria IANA, como Europe/Madrid. El cambio de hora se gestiona automáticamente. Actualízala cuando viajes.",
  "Privacy Policy": "Política de privacidad", "Terms of Service": "Condiciones del servicio",
  "Save reminder settings to update the language used by push notifications.": "Guarda los ajustes de recordatorios para actualizar el idioma de las notificaciones.",
  "Legal information": "Información legal", "Mobile navigation": "Navegación móvil",
  "Loading habits": "Cargando hábitos", "Habit editor": "Editor de hábitos",
  "This habit has no scheduled days": "Este hábito no tiene días programados",
  "Original habit details are in English.": "Los detalles originales del hábito están en inglés.",
  "Weekday: {date}": "Día de la semana: {date}",
  "A small win, just for you. Nicely done!": "Un pequeño logro para ti. ¡Muy bien!",
  "Local storage is still starting. Please wait.": "El almacenamiento local todavía está iniciándose. Espera un momento.",
  "Habit updated. Make it work for you.": "Hábito actualizado. Adáptalo a ti.",
  "A new beginning. You've got this.": "Un nuevo comienzo. ¡Tú puedes!",
  "{name} is ready. Start small!": "{name} está listo. ¡Empieza poco a poco!",
  "Welcome back, little habit.": "Qué bueno tenerte de vuelta, pequeño hábito.",
  "Your habit history, to keep.": "Tu historial de hábitos, para conservarlo.",
  "Taking a pause. Your history stays safe.": "Tomarte una pausa está bien. Tu historial sigue a salvo.",
  "No habit selected.": "No se ha seleccionado ningún hábito.",
  "complete": "completado", "not complete": "sin completar", "not scheduled": "no programado",
  "Edit {name}": "Editar {name}", "Undo one {unit} for {name}": "Deshacer una unidad ({unit}) de {name}",
  "Undo check-in for {name}": "Deshacer registro de {name}", "Check in {name}": "Registrar {name}",
  "{target} {unit} of something good.": "{target} {unit} de algo bueno.",
  "All done": "Todo listo", "Done": "Listo", "Check in": "Registrar",
  "{count} scheduled-day streak": "Racha de {count} días programados", "· Keep your spark going": "· Mantén viva tu chispa",
  "Last seven days": "Últimos siete días",
  "MAKE ROOM FOR GOOD": "HAZ ESPACIO PARA LO BUENO",
  "A little fine-tuning": "Unos pequeños ajustes", "Your next small step": "Tu próximo pequeño paso",
  "Close habit editor": "Cerrar editor de hábitos", "Keep it small. Make it yours. Show up again tomorrow.": "Empieza poco a poco. Hazlo tuyo. Vuelve mañana.",
  "Habit name": "Nombre del hábito", "A little why": "Un pequeño motivo", "(optional)": "(opcional)",
  "e.g. Take a mindful walk": "p. ej., dar un paseo consciente",
  "What will this make space for?": "¿Qué espacio abrirá en tu vida?",
  "Category": "Categoría", "Time of day": "Momento del día", "Daily target": "Objetivo diario",
  "Unit": "Unidad", "glasses, pages, minutes...": "vasos, páginas, minutos...",
  "Repeat on": "Repetir los días", "A splash of color": "Un toque de color", "Cancel": "Cancelar",
  "Saving...": "Guardando...", "Save changes": "Guardar cambios", "Create habit": "Crear hábito",
  "Your history stays safe. You can restore this habit in Settings.": "Tu historial está a salvo. Puedes restaurar este hábito desde Ajustes.",
  "Yes, archive this habit": "Sí, archivar este hábito", "Keep it": "Conservarlo", "Archive habit": "Archivar hábito",
  "Sunday": "domingo", "Monday": "lunes", "Tuesday": "martes", "Wednesday": "miércoles", "Thursday": "jueves", "Friday": "viernes", "Saturday": "sábado",
  "Wellbeing": "Bienestar", "Movement": "Movimiento", "Learning": "Aprendizaje", "Focus": "Concentración", "Everyday": "Vida diaria",
  "Morning": "Mañana", "Afternoon": "Tarde", "Evening": "Noche", "Anytime": "En cualquier momento",
  "blue color": "color azul", "sage color": "color salvia", "peach color": "color melocotón", "lavender color": "color lavanda", "sand color": "color arena",
  "Give your habit a name between 1 and 80 characters.": "Escribe un nombre para tu hábito de entre 1 y 80 caracteres.",
  "Keep the description under 240 characters.": "La descripción debe tener menos de 240 caracteres.",
  "Choose a valid category, color, and time of day.": "Elige una categoría, un color y un momento del día válidos.",
  "The daily target must be a whole number from 1 to 1,000.": "El objetivo diario debe ser un número entero entre 1 y 1000.",
  "Add a unit, such as glasses or minutes (up to 24 characters).": "Añade una unidad, como vasos o minutos (hasta 24 caracteres).",
  "Choose at least one day of the week.": "Elige al menos un día de la semana.",
  "Invalid habit data.": "Los datos del hábito no son válidos.",
  "This habit isn't scheduled for that day.": "Este hábito no está programado para ese día.",
  "Your progress is already at its limit.": "Tu progreso ya ha llegado al límite.",
};

function notify() { for (const listener of listeners) listener(); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  language = event.newValue === "es" ? "es" : "en";
  notify();
}
function getSnapshot() { return language; }
function getServerSnapshot(): Language { return "en"; }
function initialize() {
  if (initialized) return;
  initialized = true;
  const saved = localStorage.getItem(STORAGE_KEY);
  language = saved === "es" || saved === "en"
    ? saved
    : navigator.languages.some(value => value.toLowerCase().startsWith("es")) ? "es" : "en";
  document.documentElement.lang = language;
  notify();
}

export function useI18n() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    initialize();
    document.documentElement.lang = language;
  }, [current]);
  function setLanguage(next: Language) {
    language = next;
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
    notify();
  }
  function t(message: string, values: Record<string, string | number> = {}): string {
    const translated = current === "es" ? spanish[message] ?? message : message;
    return translated.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
  }
  return { language: current, setLanguage, t, locale: current === "es" ? "es-ES" : "en-US" };
}
