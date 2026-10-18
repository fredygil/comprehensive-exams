// Every piece of UI text, in Spanish. Components never hard-code copy; they
// read it from here, so an English UI later is a translation of this file.
// Vocabulary follows GLOSSARY.md.
import type { GatewayErrorKind } from './gateway/errors.ts'
import type { Job } from './settings/models.ts'
import type { ExamPartKind, Language, PeriodDraft, Quarter } from './store/store.ts'

function formatUsd(usd: number) {
  return `$${usd.toFixed(2)}`
}

const schoolYear = (start: number) => `${start}–${start + 1}`
const quarter = (q: Quarter) => `Q${q}`

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
    subjects: 'Materias',
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

  languages: {
    es: 'Español',
    en: 'English',
  } satisfies Record<Language, string>,

  subjects: {
    title: 'Materias',
    name: 'Nombre',
    language: 'Idioma',
    chooseLanguage: 'Elige el idioma',
    save: 'Guardar',
    new: {
      title: 'Nueva materia',
      create: 'Crear materia',
    },
    empty: 'Aún no tienes materias.',
  },

  periods: {
    schoolYear,
    quarter,
    /** "2026–2027 · Q1" */
    label: (period: PeriodDraft) => `${schoolYear(period.schoolYearStart)} · ${quarter(period.quarter)}`,
  },

  exams: {
    date: {
      title: 'Fecha del examen',
      label: 'Fecha del examen',
      optionalLabel: 'Fecha del examen (opcional)',
      save: 'Guardar fecha',
      clear: 'Quitar fecha',
      none: 'Sin fecha',
      /** "Miércoles, 21 de octubre" for '2026-10-21'. */
      day: (isoDate: string) => {
        const [year, month, day] = isoDate.split('-').map(Number)
        const text = new Date(year, month - 1, day).toLocaleDateString('es', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
        return text.charAt(0).toUpperCase() + text.slice(1)
      },
      /** Days from today until the Exam Date: 3 → "en 3 días", -2 → "hace 2 días". */
      countdown: (days: number) => {
        if (days === 0) return 'hoy'
        if (days === 1) return 'mañana'
        if (days === -1) return 'ayer'
        return days > 0 ? `en ${days} días` : `hace ${-days} días`
      },
    },
    new: {
      title: 'Nuevo examen',
      subject: 'Materia',
      chooseSubject: 'Elige la materia',
      noSubjects: 'Primero crea una materia.',
      createSubject: 'Crear una materia',
      period: 'Periodo',
      newPeriod: 'Nuevo periodo…',
      schoolYear: 'Año escolar',
      quarter: 'Trimestre',
      create: 'Crear examen',
      duplicate: (subject: string, period: string) =>
        `Ya tienes un examen de ${subject} en ${period}. Solo puede haber uno por materia y periodo.`,
    },
  },

  material: {
    title: 'Material',
    add: 'Agregar material',
    addHint: 'Elige fotos de tu cuaderno (JPG o PNG). Puedes elegir varias a la vez.',
    empty: 'Aún no hay material para este examen.',
    unsupported: (fileName: string) =>
      `No se pudo agregar «${fileName}»: solo se pueden agregar fotos JPG o PNG.`,
    backToExam: (subject: string) => `Volver a ${subject}`,
    /** Renaming and deleting one Material. */
    manage: {
      title: 'Este material',
      name: 'Nombre',
      rename: 'Cambiar nombre',
    },
    page: {
      /** The alt text of a Page's original scan: "Página 1: original". */
      original: (number: number) => `Página ${number}: original`,
      recognizedText: 'Texto reconocido',
      reading: 'Leyendo la página…',
      edit: 'Corregir texto',
      /** The label of a Page's text editor: "Texto reconocido de la página 1". */
      editor: (number: number) => `Texto reconocido de la página ${number}`,
      save: 'Guardar texto',
      cancel: 'Cancelar',
      edited: 'Editado por ti.',
    },
  },

  summary: {
    title: 'Resumen',
    help: 'Una guía de estudio de todo tu material, organizada por temas.',
    generate: 'Generar resumen',
    generating: 'Escribiendo el resumen…',
    regenerate: 'Regenerar',
    open: 'Leer el resumen',
    /** The Summary screen's heading: "Resumen de Matemáticas". */
    heading: (subject: string) => `Resumen de ${subject}`,
    backToExam: (subject: string) => `Volver a ${subject}`,
    outdated: 'Desactualizado: tu material o el idioma de la materia cambiaron desde que se hizo este resumen.',
    needsReadPage: 'Agrega material y espera a que se lea al menos una página.',
    /** Pages the Summary leaves out because they are unread or failed. */
    notIncluded: (pages: number) =>
      pages === 1 ? '1 página aún no se incluye.' : `${pages} páginas aún no se incluyen.`,
  },

  /** Delete confirmations: they name everything that will be lost. */
  deletion: {
    willLose: 'Se borrará para siempre:',
    cannotUndo: 'Esto no se puede deshacer.',
    confirm: 'Sí, eliminar',
    cancel: 'Cancelar',
    exam: {
      action: 'Eliminar examen',
      title: '¿Eliminar este examen?',
      item: (subject: string, period: string) => `El examen de ${subject} de ${period}`,
    },
    subject: {
      action: 'Eliminar materia',
      title: (subject: string) => `¿Eliminar la materia ${subject}?`,
      item: (subject: string) => `La materia ${subject}`,
      noExams: 'No tiene exámenes.',
    },
    material: {
      action: 'Eliminar material',
      title: '¿Eliminar este material?',
      item: (name: string) => `El material «${name}»`,
      pages: (n: number) => (n === 1 ? '1 página' : `${n} páginas`),
    },
    /** One line per kind of data under an Exam. */
    examParts: {
      materials: (n: number) => (n === 1 ? '1 material' : `${n} materiales`),
      summary: () => 'El resumen',
    } satisfies Record<ExamPartKind, (count: number) => string>,
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
    newExam: 'Nuevo examen',
    noExams: 'Aún no tienes exámenes. Crea el primero.',
    noExamsInPeriod: 'Este periodo aún no tiene exámenes.',
    earlierPeriods: 'Periodos anteriores',
  },
}
