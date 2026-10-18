// Every piece of UI text, in Spanish. Components never hard-code copy; they
// read it from here, so an English UI later is a translation of this file.
// Vocabulary follows GLOSSARY.md.
import type { GatewayErrorKind } from './gateway/errors'
import type { Job } from './settings/models'

function formatUsd(usd: number) {
  return `$${usd.toFixed(2)}`
}

export const strings = {
  app: {
    name: 'Mis Exámenes',
    shortName: 'Exámenes',
    description: 'Prepara tus exámenes comprensivos con tus propios cuadernos.',
  },

  firstRun: {
    title: '¡Hola! Vamos a empezar',
    nameLabel: '¿Cómo te llamas?',
    gradeLabel: '¿En qué grado estás?',
    start: 'Empezar',
  },

  gradeLevel: (grade: number) => `${grade}.º grado`,
  gradeLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],

  nav: {
    home: 'Inicio',
    settings: 'Ajustes',
  },

  settings: {
    title: 'Ajustes',
    student: {
      title: 'Estudiante',
      name: 'Nombre',
      grade: 'Grado',
      save: 'Guardar',
      saved: 'Guardado.',
    },
    key: {
      title: 'Clave de OpenRouter',
      label: 'Clave',
      help: 'La clave se guarda solo en este dispositivo.',
      save: 'Guardar clave',
      saved: 'Clave guardada.',
      removed: 'Clave borrada.',
      check: 'Probar clave',
      checking: 'Probando la clave…',
      valid: 'La clave funciona.',
      invalid: 'La clave no es válida.',
      noLimit: 'Sin límite de gasto.',
      limit: (usd: number) => `Límite de gasto: ${formatUsd(usd)}.`,
      remaining: (usd: number) => `Disponible: ${formatUsd(usd)}.`,
    },
    models: {
      title: 'Modelos',
      help: 'El modelo de OpenRouter que se usa para cada tarea.',
      jobs: {
        readPages: 'Leer páginas',
        summary: 'Resumen',
        practiceQuiz: 'Quiz de práctica',
        explainer: 'Explicaciones',
      } satisfies Record<Job, string>,
      defaultHint: (model: string) => `Predeterminado: ${model}`,
      save: 'Guardar modelos',
      saved: 'Modelos guardados.',
      reset: 'Usar los predeterminados',
    },
  },

  needsKey: {
    message:
      'Configura la clave de OpenRouter en Ajustes para usar las funciones con IA (leer páginas, resúmenes, quizzes y explicaciones).',
    action: 'Configurar la clave',
  },

  /** One message per Model Gateway error kind (src/gateway/errors.ts). */
  errors: {
    NoKey: 'Falta la clave de OpenRouter. Pídele a un adulto que la configure en Ajustes.',
    InvalidKey: 'La clave de OpenRouter no es válida. Pídele a un adulto que la revise en Ajustes.',
    NoCredit: 'Se acabó el saldo de la clave de OpenRouter. Pídele a un adulto que lo recargue.',
    Offline: 'No hay conexión a internet. Conéctate e inténtalo de nuevo.',
    RateLimited: 'El modelo está ocupado. Espera un momento e inténtalo de nuevo.',
    Unavailable: 'El servicio no está disponible ahora. Inténtalo de nuevo en un rato.',
    BadResponse: 'La respuesta del modelo no se pudo usar. Inténtalo de nuevo.',
  } satisfies Record<GatewayErrorKind, string>,

  home: {
    greeting: (name: string, hour: number) => {
      if (hour >= 5 && hour < 12) return `Buenos días, ${name}`
      if (hour >= 12 && hour < 19) return `Buenas tardes, ${name}`
      return `Buenas noches, ${name}`
    },
  },
}
